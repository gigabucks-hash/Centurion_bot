"use client";
/**
 * Browser-side data helpers. They talk only to this app's own mock BFF, which speaks the contract wire
 * format under /api/v1/workspaces/{ws}/… (API_ENDPOINTS.md v1.1). No wallet, RPC or chain access.
 * - Every response's `server_now` feeds lib/clock.ts (countdowns never trust the device clock alone).
 * - Errors become typed ApiError (lib/errors.ts) with contract codes → i18n `apiError.<CODE>`.
 * - Writes carry an Idempotency-Key; retries reuse the same key.
 */
import { pctToFractionBps } from "@centurion/i18n/format";
import type { ConflictError, GuardChangeProposed, MarkMessage, ProposalUpdated, ApprovalDecisionRequest, ApprovalDecisionResponse, ClosePositionResponse, ConfirmationProof } from "@centurion/contracts/wire";
import { observeServerNow } from "./clock";
import { readMigrated } from "./legacy-storage";
import { approvalFromWire, coinSummaryFromWire, type CoinWireWithMcap, payloadHash, positionFromWire, type PositionWireView, settingsFromWire, settingsPatch, settingsToWire, type ApprovalItemWire, type ApprovalRejectReason, type WireSettings } from "./contracts";
import { ApiError, toApiError } from "./errors";
import type { Approval, CoinSummary, ConnectionState, OpenPosition, PublishResult, StrategySettings, TradeEvent, TradingMode } from "./types";
import { createRealtime } from "./realtime";

/** Window event fired after an approval change so other UI (nav badge) can refresh. */
export const APPROVALS_CHANGED = "centurion:approvals-changed";
export const WS = "ws_mock";
const base = `/api/v1/workspaces/${WS}`;

export const idempotencyKey = () => crypto.randomUUID();

export async function request<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string; headers?: Record<string, string>; retried?: boolean } = {}): Promise<{ data: T; raw: Record<string, unknown> }> {
  let res: Response;
  const idem = init.idempotencyKey ?? idempotencyKey(); // reused on the post-refresh retry
  try {
    res = await fetch(path.startsWith("/api/") ? path : `${base}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      cache: "no-store",
      headers: { "content-type": "application/json", ...(init.body !== undefined || init.method === "POST" ? { "idempotency-key": idem } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("OFFLINE", 0);
  }
  // Silent refresh: one retry after a 401 on a non-auth call (tokens rotate server-side in httpOnly cookies).
  if (res.status === 401 && !path.startsWith("/api/v1/auth/") && !init.retried && typeof window !== "undefined") {
    const { refreshSession, toLogin } = await import("@/lib/auth/session-client");
    if (await refreshSession()) return request<T>(path, { ...init, retried: true, idempotencyKey: init.idempotencyKey ?? idem });
    toLogin();
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  observeServerNow(json.server_now as string | undefined);
  if (!res.ok) throw toApiError(res.status, json);
  return { data: (json.data ?? json) as T, raw: json };
}

// --- Approvals ---------------------------------------------------------------

export async function fetchApprovals(mode: TradingMode): Promise<Approval[]> {
  // 1.1.4 keyset paging: follow next_cursor (pending pages soonest expires_at first); restart once on CURSOR_INVALID.
  const out: ApprovalItemWire[] = [];
  let cursor: string | null = null;
  for (let i = 0, restarted = false; i < 20; i++) {
    try {
      const res: { raw: Record<string, unknown> } = await request<unknown>(`/approvals?mode=${mode}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      out.push(...(res.raw.items as ApprovalItemWire[]));
      cursor = (res.raw.next_cursor as string | null | undefined) ?? null;
      if (!cursor) break;
    } catch (e) {
      if (restarted || !(e instanceof ApiError && e.code === "CURSOR_INVALID")) throw e;
      restarted = true;
      out.length = 0;
      cursor = null;
    }
  }
  return out.map(approvalFromWire);
}

/** GET /approvals/{id}: fresh item + single-use decision token. */
export async function fetchApproval(id: string): Promise<Approval> {
  return approvalFromWire((await request<ApprovalItemWire>(`/approvals/${id}`)).data);
}

/** Confirmation challenge (2 min, single use) bound to sha256 of the exact change. */
export async function requestChallenge(action: string, target: string, change: unknown, extra: { mode: TradingMode; typed_name?: string }) {
  return (await request<{ challenge_id: string; challenge: string; expires_at: string }>(`/confirmations/challenge`, { body: { action, target, payload_hash: await payloadHash(change), ...extra } })).data;
}

export interface DecideOptions {
  decision: "approve" | "reject";
  reason?: string | null;
  /** 1.1.3: sent with decision=reject only (the server answers 422 otherwise). Default on the server: user_declined. */
  rejectReason?: ApprovalRejectReason;
  /** Hold / typed name / passkey collected by the dialog; turned into a ConfirmationProof here. */
  confirmation?: { holdMs: number; typedName?: string; passkey?: boolean };
  /** Rev the user reviewed (review sheet). A newer server rev → VERSION_CONFLICT, nothing sent. */
  reviewedRev?: number;
  /** contracts 1.1.5: quote_id shown in the review sheet → expected_quote_id (server 409 reason "mismatch" if newer). */
  reviewedQuoteId?: string;
}

/**
 * Contract decision: GET item (token + rev) → [challenge] → POST decision with If-Match: "<rev>" + Idempotency-Key.
 * Throws ApiError; 409 VERSION_CONFLICT / APPROVAL_ALREADY_DECIDED / APPROVAL_EXPIRED are for the caller to show.
 */
export async function decideApprovalClient(a: Approval, o: DecideOptions): Promise<{ status: string; rev: number; replayed: boolean }> {
  const fresh = await fetchApproval(a.id);
  // 1.1.4: the user reviewed rev N; if the proposal moved on (e.g. proposal.updated re-quoted it) the decision is
  // stale → surface as VERSION_CONFLICT with the fresh item instead of silently approving values not reviewed.
  if (o.reviewedRev != null && fresh.rev !== o.reviewedRev) throw new ApiError("VERSION_CONFLICT", 409, { error: { code: "VERSION_CONFLICT", current_rev: fresh.rev, base_rev: o.reviewedRev, current: fresh } });
  if (!fresh.decisionToken) throw new ApiError(fresh.status === "expired" ? "APPROVAL_EXPIRED" : "APPROVAL_ALREADY_DECIDED", 409);
  let confirmation: ConfirmationProof | undefined;
  if (o.confirmation) {
    const ch = await requestChallenge(`approval.${o.decision}`, a.id, { id: a.id, decision: o.decision, rev: fresh.rev, diff: a.diff ?? null }, { mode: a.mode, typed_name: a.strategyName });
    confirmation = {
      challenge_id: ch.challenge_id,
      challenge: ch.challenge,
      // Mock passkey: no authenticator is contacted in this build.
      webauthn: o.confirmation.passkey ? { credential_id: "mock", client_data_json: "mock", authenticator_data: "mock", signature: "mock", user_handle: null } : null,
      typed_confirmation: o.confirmation.typedName ?? null,
      hold_duration_ms: Math.round(o.confirmation.holdMs),
      device: { platform: "web", app_version: "0.3.0-mock", model: null, attestation: null },
    } as unknown as ConfirmationProof;
  }
  // 1.1.2: approval rev via If-Match (expected_rev mirrors it for RPC parity); no `client` field (channel comes from the JWT).
  const body: ApprovalDecisionRequest = { decision: o.decision, token: fresh.decisionToken, expected_rev: fresh.rev, reason: o.reason ?? null, ...(o.decision === "reject" ? { reject_reason: o.rejectReason ?? "user_declined" } : {}), ...(confirmation ? { confirmation } : {}), ...(o.decision === "approve" && o.reviewedQuoteId ? { expected_quote_id: o.reviewedQuoteId } : {}) } as ApprovalDecisionRequest;
  const { data } = await request<ApprovalDecisionResponse>(`/approvals/${a.id}/decision`, { body, headers: { "If-Match": `"${fresh.rev}"` } });
  window.dispatchEvent(new Event(APPROVALS_CHANGED));
  return data;
}

export async function cancelGuardChangeClient(id: string): Promise<Approval> {
  const { data } = await request<ApprovalItemWire>(`/guard-changes/${id}/cancel`, { body: {} });
  window.dispatchEvent(new Event(APPROVALS_CHANGED));
  return approvalFromWire(data);
}

// --- Positions -----------------------------------------------------------------

/**
 * Manual sell (contracts 1.1.2): POST /positions/{id}/close?mode= with `If-Match: "<position rev>"`, `Idempotency-Key`
 * and `{fraction_bps}` (UI percent of the remaining quantity × 100). `sell_pct` is gone. Practice only on the server
 * (Real → 403 MODE_NOT_ALLOWED). The hold-to-confirm gesture stays client-side; it is not sent.
 */
export async function closePositionClient(p: OpenPosition, sellPct: number): Promise<{ position: OpenPosition; status: string }> {
  const { data } = await request<ClosePositionResponse & { position_after?: PositionWireView }>(`/positions/${encodeURIComponent(p.key)}/close?mode=${p.mode}`, {
    body: { fraction_bps: pctToFractionBps(sellPct) }, // @centurion/i18n 0.4.3 helper; UI stays in percent
    headers: { "If-Match": `"${p.rev}"` },
  });
  const after = data.position_after ? positionFromWire(data.position_after) : { ...p, rev: p.rev + 1 };
  return { position: after, status: data.status };
}

// --- Mode, strategies (app routes) ------------------------------------------------------

async function post<T>(url: string, body: unknown): Promise<T> {
  return (await request<T>(url, { body })).data;
}

/**
 * Per-strategy Paper/Real switch (replaces the global workspace toggle). MOCK-ONLY route: contracts 1.1.6 has no
 * switch endpoint yet. If-Match rev + Idempotency-Key; 403 MODE_NOT_ALLOWED while the strategy is not approved for Real.
 */
export async function setStrategyModeClient(strategyId: string, mode: TradingMode, rev: number, holdMs = 0): Promise<{ mode: TradingMode; rev: number }> {
  const { data } = await request<{ mode: TradingMode; rev: number }>(`/api/mock/strategies/${encodeURIComponent(strategyId)}/mode`, {
    method: "POST", body: { mode, ...(holdMs ? { hold_ms: Math.round(holdMs) } : {}) }, headers: { "If-Match": `"${rev}"` },
  });
  return { mode: data.mode, rev: data.rev };
}

export interface StrategyWire {
  id: string;
  rev: number;
  name: string;
  status: string;
  mode: TradingMode;
  settings: WireSettings;
  updated_at: string;
}

/**
 * 409 STRATEGY_REV_CONFLICT / CONFIRMATION_RESTART_REQUIRED (contracts 1.1.3 `ConflictError<StrategyWire>`).
 * `current` is REQUIRED by the contract, so the merge view always has "theirs"; a 409 without it is a contract
 * violation and is shown as a plain error (asRevConflict → null), never as an empty merge.
 */
export type RevConflict = Omit<ConflictError<StrategyWire>["error"], "code" | "message" | "request_id" | "server_now"> & {
  code: "STRATEGY_REV_CONFLICT" | "CONFIRMATION_RESTART_REQUIRED";
};

export function asRevConflict(e: unknown): RevConflict | null {
  if (!(e instanceof ApiError) || (e.code !== "STRATEGY_REV_CONFLICT" && e.code !== "CONFIRMATION_RESTART_REQUIRED")) return null;
  // Conflict data lives inside `error` ({error: {code, message, current_rev, base_rev, current, ...}}).
  const b = e.details as Partial<RevConflict>;
  if (!b.current || typeof b.current_rev !== "number" || typeof b.base_rev !== "number") return null;
  return { ...(b as RevConflict), code: e.code };
}

export async function fetchRevision(id: string, rev: number): Promise<WireSettings> {
  return (await request<{ settings: WireSettings }>(`/strategies/${id}/revisions/${rev}`)).data.settings;
}

/**
 * Save a strategy (v1.1): new → POST /strategies `{mode, name, settings}`; existing → PATCH /strategies/{id} with
 * `If-Match: "<baseRev>"` and a flat `settings_patch` (only changed keys vs. the base the user started from).
 * 200 → published; 202 → guard change proposal; 409 → throws ApiError (use asRevConflict for the merge view).
 */
export async function publishStrategyClient(id: string | null, settings: StrategySettings, base?: { rev: number; settings: StrategySettings }): Promise<PublishResult> {
  if (!id || !base) {
    const { data } = await request<StrategyWire>(`/strategies?mode=${settings.mode}`, { body: { mode: settings.mode, name: settings.name, settings: settingsToWire(settings) } });
    return { strategyId: data.id, outcome: "published", rev: data.rev };
  }
  const patch = settingsPatch(settingsToWire(base.settings), settingsToWire(settings));
  const res = await request<StrategyWire | GuardChangeProposed>(`/strategies/${id}?mode=${settings.mode}`, {
    method: "PATCH",
    body: { settings_patch: patch },
    headers: { "If-Match": `"${base.rev}"` },
  });
  const d = res.data;
  if ("proposal" in d) {
    window.dispatchEvent(new Event(APPROVALS_CHANGED));
    // 1.1.4: 202 {proposal, guard_change}; nothing applied, the strategy stays on guard_change.from_rev.
    return { strategyId: id, outcome: "needs_approval", rev: d.guard_change.from_rev, approvalId: d.proposal.id, weakenedFields: d.guard_change.weakened_fields, expiresAt: Date.parse(d.proposal.expires_at) || undefined };
  }
  return { strategyId: id, outcome: "published", rev: d.rev };
}

export const wireToForm = settingsFromWire;

/** Mock-only demo trigger: a teammate saves the same strategy from mobile. */
export async function simulateTeammateEditClient(id: string) {
  return (await request<StrategyWire>(`/strategies/${id}/simulate-teammate-edit`, { body: {} })).data;
}

// --- Practice reset, account deletion, devices (v1.1 new flows) ---------------------------------

export interface PracticeResetResult {
  epoch: number;
  starting_balance_lamports: string;
  archived?: { positions: number; pending_buys: number };
  next_allowed_at: string | null;
}

export async function fetchPracticeReset() {
  return (await request<PracticeResetResult>(`/practice/reset?mode=practice`)).data;
}

export async function resetPracticeClient() {
  return (await request<PracticeResetResult>(`/practice/reset?mode=practice`, { body: {} })).data;
}

export interface DeletionState {
  state: "active" | "pending_deletion" | "deleted";
  scheduled_for: string | null;
  rev: number;
  grace_days?: number;
}

export const fetchDeletion = async () => (await request<DeletionState>("/api/v1/me/deletion")).data;
export const requestDeletionClient = async () => (await request<DeletionState>("/api/v1/me/deletion", { body: {} })).data;
export const cancelDeletionClient = async () => (await request<DeletionState>("/api/v1/me/deletion", { method: "DELETE" })).data;

const DEVICE_KEY = "centurion.device_id";
/** App-generated install id (8–128 [A-Za-z0-9_-]); kept in localStorage on web. Not a secret. */
export function deviceId(): string {
  let id = readMigrated(localStorage, DEVICE_KEY);
  if (!id) {
    id = `web_${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export interface DeviceWire {
  id: string;
  device_id: string;
  platform: string;
  provider: string;
  app_version: string;
  locale: string;
  rev: number;
  last_seen_at: string;
}

export const fetchDevices = async () => (await request<unknown>("/api/v1/devices")).raw.items as DeviceWire[];

/** PUT /devices/{device_id} with platform "web", provider "webpush". The token is a mock placeholder, not a push subscription. */
export async function registerDeviceClient(locale: string) {
  const token = `mock-webpush-${crypto.randomUUID()}`;
  return (await request<DeviceWire>(`/api/v1/devices/${deviceId()}`, { method: "PUT", body: { platform: "web", provider: "webpush", token, app_version: "0.3.0", locale } })).data;
}

export const revokeDeviceClient = async () => (await request<unknown>(`/api/v1/devices/${deviceId()}`, { method: "DELETE" })).data;

/**
 * Subscribe to the realtime activity stream for one workspace mode (adapter chosen by NEXT_PUBLIC_REALTIME:
 * mock SSE default, "sse" for a backend SSE URL, "supabase" skeleton). Returns an unsubscribe function.
 */
/** Window event fired for every 1.1.4 proposal.updated (detail = ProposalUpdated wire payload). */
export const PROPOSAL_UPDATED = "centurion:proposal-updated";

export function subscribeActivity(mode: TradingMode, onEvent: (e: TradeEvent) => void, onStatus: (s: ConnectionState) => void, onMark?: (m: MarkMessage) => void): () => void {
  return createRealtime({ workspaceId: WS, mode }).subscribe({
    onEvent,
    onStatus,
    onMark,
    onProposalUpdated: (p) => window.dispatchEvent(new CustomEvent<ProposalUpdated>(PROPOSAL_UPDATED, { detail: p })),
  });
}

/** GET /coins one keyset page (1.1.4): `{items, next_cursor}`; 400 CURSOR_INVALID → ApiError. */
export async function fetchCoinsPage(mode: TradingMode, cursor: string | null, limit = 100): Promise<{ items: CoinSummary[]; nextCursor: string | null }> {
  const { raw } = await request<unknown>(`/coins?mode=${mode}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  return { items: (raw.items as CoinWireWithMcap[]).map(coinSummaryFromWire), nextCursor: (raw.next_cursor as string | null) ?? null };
}

/** Mock-only "Refresh quote" (backend set_approval_quote; see app/api/.../approvals/[id]/quote). */
export async function refreshQuoteClient(id: string): Promise<Approval> {
  const { data } = await request<ApprovalItemWire>(`/approvals/${id}/quote`, { body: {} });
  return approvalFromWire(data);
}
