/**
 * Server-side HTTP adapter for the real backend (DATA_SOURCE=http), contracts v1.1 (API_ENDPOINTS.md):
 * - base `${API_BASE_URL}/v1/workspaces/{ws}/…` with `?mode=practice|real` on reads, `mode` in write bodies;
 * - envelopes `{data, server_now}` / `{items, next_cursor, server_now}` / `{error, server_now}` → ApiError (i18n'd by code);
 * - strategy saves: POST (new) or PATCH + If-Match + flat `settings_patch` (409 merge body is preserved on ApiError.body);
 * - decisions: POST …/approvals/{id}/decision (single-use token + If-Match: "<rev>" + Idempotency-Key).
 * Decoders for overview / coins / timeline / exit-reasons are pass-through until Backend publishes their JSON schemas
 * (open item). The default build uses the in-process mock (lib/mock) and never calls this.
 */
import { randomUUID } from "node:crypto";
import type { AnyEvent, EventPage, ExitStatsRow, StrategyRealGateFields } from "@centurion/contracts/wire";
import type { DashboardApi } from "./api";
import { approvalFromWire, coinSummaryFromWire, realGateFromWire, envelopeToTradeEvent, exitStatFromWire, type CoinWire, settingsFromWire, settingsPatch, settingsToWire, type ApprovalItemWire as ApprovalWire, rejectReasonFor, type WireSettings } from "./contracts";
import { ApiError, toApiError } from "./errors";
import { blankSettings } from "./strategy-schema";
import type { Strategy, TradeEvent, TradingMode } from "./types";

const base = () => process.env.API_BASE_URL ?? "http://localhost:8080";
const ws = () => process.env.API_WORKSPACE_ID ?? "ws_mock";
const wsPath = (p: string) => `/v1/workspaces/${encodeURIComponent(ws())}${p}`;

async function req<T>(path: string, init: RequestInit & { idempotent?: boolean } = {}): Promise<{ data: T; raw: Record<string, unknown> }> {
  const write = init.method && init.method !== "GET";
  const res = await fetch(`${base()}${path}`, {
    ...init,
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json", ...(write ? { "Idempotency-Key": randomUUID() } : {}), ...init.headers },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw toApiError(res.status, json);
  return { data: (json.data ?? json) as T, raw: json };
}

/**
 * 1.1.4 keyset paging: follow `next_cursor` (limit=100) up to MAX_PAGES; a 400 CURSOR_INVALID mid-walk (list changed
 * under a cursor) restarts once from the first page.
 */
const MAX_PAGES = 20;
async function items<T>(path: string, restarted = false): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const sep = path.includes("?") ? "&" : "?";
    try {
      const res: { raw: Record<string, unknown> } = await req<unknown>(`${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      const raw = res.raw;
      out.push(...((raw.items ?? []) as T[]));
      cursor = (raw.next_cursor as string | null | undefined) ?? null;
      if (!cursor) break;
    } catch (e) {
      if (!restarted && e instanceof ApiError && e.code === "CURSOR_INVALID") return items<T>(path, true);
      throw e;
    }
  }
  return out;
}

async function page<T>(path: string, o: { cursor?: string | null; limit?: number } = {}): Promise<{ items: T[]; nextCursor: string | null }> {
  const sep = path.includes("?") ? "&" : "?";
  const { raw } = await req<unknown>(`${path}${sep}limit=${o.limit ?? 50}${o.cursor ? `&cursor=${encodeURIComponent(o.cursor)}` : ""}`);
  return { items: (raw.items ?? []) as T[], nextCursor: (raw.next_cursor as string | null | undefined) ?? null };
}

interface StrategyWire extends Partial<StrategyRealGateFields> { id: string; rev: number; name: string; status: Strategy["status"]; mode: TradingMode; settings: WireSettings; updated_at?: string; created_at?: string; stats?: Record<string, number> }

function strategyFromWire(w: StrategyWire): Strategy {
  const fb = { ...blankSettings(), mode: w.mode };
  const ts = (s?: string) => (s ? Date.parse(s) : 0);
  return {
    id: w.id, name: w.name, mode: w.mode, ...realGateFromWire(w), status: w.status, rev: w.rev, settings: { ...settingsFromWire(w.settings, fb), mode: w.mode },
    openPositions: w.stats?.open_positions ?? 0, realizedPnlSol: 0, unrealizedPnlSol: 0, trades: w.stats?.trades ?? 0, wins: w.stats?.wins ?? 0,
    maxDrawdownPct: w.stats?.max_drawdown_pct ?? 0, avgHoldSeconds: w.stats?.avg_hold_seconds ?? 0, pnlSpark: [],
    funnel: { scanned: 0, filtered: 0, signaled: 0, entered: 0, exited: 0, rejections: [] }, createdAt: ts(w.created_at), updatedAt: ts(w.updated_at),
  };
}

export const httpApi: DashboardApi = {
  getOverview: async (mode) => (await req<never>(wsPath(`/overview?mode=${mode}`))).data,
  listStrategies: async (mode) => (await items<StrategyWire>(wsPath(`/strategies?mode=${mode}`))).map(strategyFromWire),
  getStrategy: async (id) => strategyFromWire((await req<StrategyWire>(wsPath(`/strategies/${encodeURIComponent(id)}`))).data),
  publishStrategy: async (id, settings) => {
    if (!id) {
      const { data } = await req<StrategyWire>(wsPath(`/strategies`), { method: "POST", body: JSON.stringify({ mode: settings.mode, name: settings.name, settings: settingsToWire(settings) }) });
      return { strategyId: data.id, outcome: "published", rev: data.rev };
    }
    const cur = (await req<StrategyWire>(wsPath(`/strategies/${encodeURIComponent(id)}`))).data;
    const patch = settingsPatch(cur.settings, settingsToWire(settings));
    const { data } = await req<StrategyWire | { proposal: ApprovalWire; strategy: StrategyWire }>(wsPath(`/strategies/${encodeURIComponent(id)}`), {
      method: "PATCH", headers: { "If-Match": `"${cur.rev}"` }, body: JSON.stringify({ settings_patch: patch }),
    });
    return "proposal" in data ? { strategyId: id, outcome: "needs_approval", rev: data.strategy.rev, approvalId: data.proposal.id } : { strategyId: id, outcome: "published", rev: data.rev };
  },
  listRecentEvents: async (mode, limit = 50) => {
    const page = (await req<unknown>(wsPath(`/events?mode=${mode}&limit=${limit}`))).raw as unknown as EventPage;
    return (page.items as AnyEvent[]).map(envelopeToTradeEvent).filter((e): e is TradeEvent => e != null);
  },
  listCoins: async (mode) => (await items<CoinWire>(wsPath(`/coins?mode=${mode}`))).map(coinSummaryFromWire),
  listCoinsPage: async (mode, o) => {
    const p = await page<CoinWire>(wsPath(`/coins?mode=${mode}`), o);
    return { items: p.items.map(coinSummaryFromWire), nextCursor: p.nextCursor };
  },
  getCoinTrail: async (mint) => (await req<never>(wsPath(`/coins/${encodeURIComponent(mint)}/timeline`))).data,
  getExitStats: async (f) => {
    const q = new URLSearchParams({ mode: f.mode, ...(f.strategyId ? { strategy_id: f.strategyId } : {}), ...(f.windowHours ? { window: `${f.windowHours}h` } : {}) });
    return (await items<ExitStatsRow>(wsPath(`/stats/exit-reasons?${q}`))).map(exitStatFromWire);
  },
  listApprovals: async (mode) => (await items<ApprovalWire>(wsPath(`/approvals?mode=${mode}`))).map(approvalFromWire),
  decideApproval: async (id, d) => {
    if (d.action === "cancel_cooldown") {
      await req(wsPath(`/guard-changes/${encodeURIComponent(id)}/cancel`), { method: "POST", body: "{}" });
    } else if (d.action !== "undo_skip") {
      // undo_skip is client-side only (the reject is sent after the 5 s window).
      const fresh = approvalFromWire((await req<ApprovalWire>(wsPath(`/approvals/${encodeURIComponent(id)}`))).data);
      await req(wsPath(`/approvals/${encodeURIComponent(id)}/decision`), {
        method: "POST",
        headers: { "If-Match": `"${fresh.rev}"` },
        body: JSON.stringify({ decision: d.action === "approve" ? "approve" : "reject", token: fresh.decisionToken, expected_rev: fresh.rev, reason: d.action === "skip" ? (d.reason ?? null) : null, ...(d.action === "skip" ? { reject_reason: d.rejectReason ?? rejectReasonFor({ skipReason: d.reason }) } : {}) }),
      });
    }
    return approvalFromWire((await req<ApprovalWire>(wsPath(`/approvals/${encodeURIComponent(id)}`))).data);
  },
};
