/**
 * In-memory mutable mock state (server process only; resets on restart).
 * Nothing here touches wallets, RPC, chain or any external service.
 */
import type { Approval, ApprovalDecision, OpenPosition, PublishResult, RiskLevel, Strategy, StrategySettings, TradingMode } from "@/lib/types";
import { diffSettings, validate, weakensGuard } from "@/lib/strategy-schema";
import { APPROVAL_REJECT_REASONS, approvalToWire, MOCK_SOL_USD, realGateToWire, settingsFromWire, settingsToWire, type WireSettings } from "@/lib/contracts";
import type { ApprovalDecisionRequest, ErrorCode } from "@centurion/contracts/wire";
import { closedTrades, coinSummaries, realGateFor, seedStrategies, trails, type ClosedTrade as LedgerRow } from "./data";

/** Error carrying a contract error code (errors.json); the BFF turns it into the wire error body. */
export class WireError extends Error {
  constructor(readonly code: ErrorCode, readonly details?: Record<string, unknown>, readonly extra?: Record<string, unknown>) {
    super(code);
  }
}
const wireErr = (code: ErrorCode, details?: Record<string, unknown>, extra?: Record<string, unknown>) => new WireError(code, details, extra);

const MIN = 60_000;
const HOUR = 60 * MIN;
export const PICK_TTL_MS = 10 * MIN;
export const GUARD_TTL_MS = 24 * HOUR;
/** papersim quote validity (API_ENDPOINTS 1.1.4: valid while server_now < quote_expires_at, papersim +15 s). */
export const QUOTE_TTL_MS = 15_000;
/** Server-owned TTLs (contracts v1): pick 10 min, guard change 24 h, team action 1 h. */
export const TEAM_TTL_MS = 1 * HOUR;
export const REAL_GUARD_COOLDOWN_MS = 10 * MIN;
/** Mandatory for Real SOL guard weakening (Apex decision): revert 24 h after it takes effect. */
export const REAL_GUARD_AUTO_REVERT_MS = 24 * HOUR;
export const HOLD_MS: Record<TradingMode, number> = { practice: 1200, real: 2500 };
const UNDO_MS = 5000;

interface AuditEntry { id: string; at: number; actor: string; device: string; approvalId: string; action: string; risk: RiskLevel; diffKeys: string[] }

interface State {
  strategies: Strategy[];
  approvals: Approval[];
  audit: AuditEntry[];
  seq: number;
  /** Manual sells per position key (percent sold). */
  sold: Record<string, number>;
  /** Position rev per key (1.1.2: manual close uses If-Match: "<position rev>"). Absent = 1. */
  posRev?: Record<string, number>;
  /** Settings per strategy and rev (merge base for the 3-way review). */
  revisions?: Record<string, Record<number, StrategySettings>>;
  /** Last change per strategy (who/when), for the 409 body. */
  lastChange?: Record<string, { by: { actor: string; via: "web" | "mobile"; device?: string }; at: number; fields: string[] }>;
  practice?: { epoch: number; lastResetAt: number | null };
  /** Positions opened by approving a buy pick in this mock session (D4: one snapshot feeds every screen). */
  createdPositions?: OpenPosition[];
  /** Manual 100 % closes appended to the ledger (D4: /pnl reads the same snapshot as /positions). */
  manualCloses?: LedgerRow[];
}

const g = globalThis as unknown as { __centurionMock?: State };

function initApprovals(now: number, strategies: Strategy[]): Approval[] {
  return seedApprovals(now, strategies).map((a) => ({ ...a, rev: 1, ...(a.kind === "buy_pick" && a.status === "pending" && !a.screenerState && a.amountSol ? { quote: mockQuote(a, now) } : {}) }));
}

/**
 * Deterministic papersim quote per pick (contracts 1.1.4 quote fields): 5 000-lamport base fee + 0.0001 SOL priority
 * fee, 1.25 % swap fee, max slippage from the mint hash (1–3 %), min out after fee + slippage. Real ap_201 carries
 * a +3.4 % price move since the pick to exercise review.price_moved. Never a signed transaction.
 */
function mockQuote(a: Omit<Approval, "rev">, now: number): NonNullable<Approval["quote"]> {
  const h = [...(a.mint ?? a.id)].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
  const decimals = trails.find((t) => t.coin.mint === a.mint)?.coin.decimals ?? 6;
  const pickPrice = 0.000004 + (h % 9000) / 1e9; // SOL per whole token
  const price = a.id === "ap_201" ? pickPrice * 1.034 : pickPrice;
  const slipBps = 100 + (h % 3) * 100;
  const feeBps = 125;
  const amountLamports = BigInt(Math.round((a.amountSol ?? 0) * 1e9));
  const network = 5000n;
  const priority = 100000n;
  const tokensOut = ((a.amountSol ?? 0) / price) * (1 - feeBps / 10000) * (1 - slipBps / 10000);
  const minOutRaw = BigInt(Math.floor(tokensOut * 10 ** decimals)).toString();
  return {
    networkFeeLamports: (network + priority).toString(), priorityFeeLamports: priority.toString(), swapFeeBps: feeBps, maxSlippageBps: slipBps,
    // 1.1.5: total_max = SOL in + network fee (priority included) + ATA rent; quote_id counts refreshes.
    quoteId: String(Number(a.quote?.quoteId ?? "0") + 1), ataRentLamports: "0",
    minOutRaw, decimals, totalMaxLamports: (amountLamports + network + priority).toString(), quoteTs: now, quoteExpiresAt: now + QUOTE_TTL_MS,
    priceSol: price.toFixed(12), pickPriceSol: pickPrice.toFixed(12),
  };
}

function seedApprovals(now: number, strategies: Strategy[]): Omit<Approval, "rev">[] {
  const byName = (n: string) => strategies.find((x) => x.name === n)!;
  const coin = (mode: TradingMode, k: number) => coinSummaries.filter((c) => c.mode === mode)[k];
  const bh = byName("Breakout Hunter");
  const gm = byName("Graduated Momentum");
  const fb = byName("Fresh Bonding Scout");
  const cr = byName("Conservative");
  const gs = byName("Graduated scalp");
  // The two "Real" seeds run in Paper unless CENTURION_MOCK_REAL_DEMO=1 (lib/mock/data.ts): their items follow the strategy mode.
  const own = (x: Strategy) => coinSummaries.filter((c) => c.strategyId === x.id);
  const others = coinSummaries.filter((c) => c.mode === "practice" && c.strategyId !== cr.id && c.strategyId !== gs.id);
  const c1 = others[0], c2 = others[1], c3 = own(cr)[0] ?? coin(cr.mode, 0), c4 = own(gs)[0] ?? coin(gs.mode, 1);
  const gsAfter: StrategySettings = { ...structuredClone(gs.settings), guard: { ...gs.settings.guard, maxBundlersPct: 30, checks: { ...gs.settings.guard.checks, sniper_share: false } }, exit: { ...gs.settings.exit, trailingPct: 30 } };
  const gsBefore: StrategySettings = { ...structuredClone(gs.settings), exit: { ...gs.settings.exit, trailingPct: 20 } };
  const fbAfter: StrategySettings = { ...structuredClone(fb.settings), guard: { ...fb.settings.guard, maxDevPercent: 10, preset: "custom" } };
  return [
    {
      id: "ap_101", kind: "buy_pick", status: "pending", mode: "practice", strategyId: bh.id, strategyName: bh.name, mint: c1.mint, symbol: c1.symbol,
      title: c1.symbol, detail: "Breakout confirmed: 12-min range broken with 9 fresh buyers.", amountSol: 0.24, risk: "medium", requestedBy: "entry",
      createdAt: now - PICK_TTL_MS + 102_000, expiresAt: now + 102_000,
      pick: { pickKind: "first_buy", score: { value: 86, passMark: 70 }, guard: { passed: 8, total: 8 }, entry: "dip −8% · market", exitPlan: "Ladder 3-rung · trail 20%", budgetSol: bh.settings.sizing.budgetSol },
    },
    {
      id: "ap_102", kind: "buy_pick", status: "pending", mode: "practice", strategyId: gm.id, strategyName: gm.name, mint: c2.mint, symbol: c2.symbol,
      title: c2.symbol, detail: "Graduated pool, steady buyers.", amountSol: 0.2, risk: "medium", requestedBy: "entry",
      createdAt: now - PICK_TTL_MS + 435_000, expiresAt: now + 435_000,
      pick: { pickKind: "buy", score: { value: 74, passMark: 70 }, guard: { passed: 7, total: 8, note: "top10 41%" }, entry: "market", exitPlan: "Trailing only · 15%", budgetSol: gm.settings.sizing.budgetSol },
    },
    {
      id: "ap_103", kind: "guard_change", status: "pending", mode: "practice", strategyId: fb.id, strategyName: fb.name, title: "Guard change",
      detail: "Settings change loosens a guard and needs review.", risk: "medium", requestedBy: "user", createdAt: now - 20 * MIN, expiresAt: now - 20 * MIN + GUARD_TTL_MS,
      diff: diffSettings(fb.settings, fbAfter), revFrom: fb.rev, revTo: fb.rev + 1,
      riskImpact: { coinsPassedPerDayBefore: 96, coinsPassedPerDayAfter: 121, rugsBefore: 3, rugsAfter: 5, maxDrawdownBeforePct: 9, maxDrawdownAfterPct: 13 },
    },
    // Race case (WF-21 / N-05): the pick was queued, then the screener saw a non-SOL quote mint. Apex rule:
    // the card stays, "Skip" works as dismiss, Approve (and Sell) stay disabled; approve → 422 UNSUPPORTED_QUOTE_MINT.
    ...(() => {
      const nt = coinSummaries.find((c) => c.mode === "practice" && c.screenerState === "UNSUPPORTED_QUOTE_MINT");
      return nt ? [{
        id: "ap_105", kind: "buy_pick" as const, status: "pending" as const, mode: "practice" as const, strategyId: nt.strategyId, strategyName: nt.strategyName, mint: nt.mint, symbol: nt.symbol,
        title: nt.symbol, detail: "Quote mint changed to USDC after the pick was queued.", amountSol: 0.2, risk: "low" as const, requestedBy: "entry" as const,
        createdAt: now - 2 * MIN, expiresAt: now + 8 * MIN, screenerState: "UNSUPPORTED_QUOTE_MINT" as const,
        pick: { pickKind: "buy" as const, score: { value: 71, passMark: 70 }, guard: { passed: 0, total: 8, note: "not run" }, entry: "—", exitPlan: "—", budgetSol: 1 },
      }] : [];
    })(),
    {
      id: "ap_104", kind: "buy_pick", status: "expired", expiredReason: "strategy_deleted", mode: "practice", strategyName: "Old pairs test", symbol: "ABC", title: "ABC",
      detail: "Strategy was deleted while this pick was waiting.", amountSol: 0.1, risk: "low", requestedBy: "entry", createdAt: now - 25 * MIN, expiresAt: now - 15 * MIN, decidedAt: now - 13 * MIN,
      pick: { pickKind: "buy", score: { value: 72, passMark: 70 }, guard: { passed: 8, total: 8 }, entry: "market", exitPlan: "—", budgetSol: 1 },
    },
    {
      id: "ap_090", kind: "buy_pick", status: "filled", mode: "practice", strategyId: bh.id, strategyName: bh.name, symbol: "TIDE", title: "TIDE", detail: "Filled at market.", amountSol: 0.24, risk: "low",
      requestedBy: "entry", createdAt: now - 3 * HOUR, expiresAt: now - 3 * HOUR + PICK_TTL_MS, decidedAt: now - 3 * HOUR + 60_000,
      pick: { pickKind: "first_buy", score: { value: 91, passMark: 70 }, guard: { passed: 8, total: 8 }, entry: "market", exitPlan: "Ladder 3-rung", budgetSol: 3 },
    },
    {
      id: "ap_091", kind: "buy_pick", status: "rejected", skipReason: "already_pumped", mode: "practice", strategyId: gm.id, strategyName: gm.name, symbol: "KITTY", title: "KITTY", detail: "", amountSol: 0.2,
      risk: "medium", requestedBy: "entry", createdAt: now - 4 * HOUR, expiresAt: now - 4 * HOUR + PICK_TTL_MS, decidedAt: now - 4 * HOUR + 30_000,
      pick: { pickKind: "buy", score: { value: 71, passMark: 70 }, guard: { passed: 8, total: 8 }, entry: "market", exitPlan: "Trailing only", budgetSol: 3 },
    },
    // ---- "Real" seed strategies (Real only in the dev demo) ----
    {
      id: "ap_201", kind: "buy_pick", status: "pending", mode: cr.mode, strategyId: cr.id, strategyName: cr.name, mint: c3.mint, symbol: c3.symbol, title: c3.symbol,
      detail: cr.mode === "real" ? "Real buy (mock — no wallet in this build)." : "Paper buy (simulated fill).", amountSol: 0.2, risk: "high", requestedBy: "entry", createdAt: now - 4 * MIN, expiresAt: now + 6 * MIN,
      pick: { pickKind: "first_buy", score: { value: 101, passMark: 85 }, guard: { passed: 8, total: 8 }, entry: "dip −6%", exitPlan: "Ladder 3-rung · trail 20%", budgetSol: cr.settings.sizing.budgetSol },
    },
    {
      id: "ap_202", kind: "buy_pick", status: "pending", mode: gs.mode, strategyId: gs.id, strategyName: gs.name, mint: c4.mint, symbol: c4.symbol, title: c4.symbol,
      detail: gs.mode === "real" ? "Real buy (mock)." : "Paper buy (simulated fill).", amountSol: 0.15, risk: "high", requestedBy: "entry", createdAt: now - 2 * MIN, expiresAt: now + 8 * MIN,
      pick: { pickKind: "buy", score: { value: 88, passMark: 70 }, guard: { passed: 8, total: 8 }, entry: "market", exitPlan: "Ladder 3-rung", budgetSol: gs.settings.sizing.budgetSol },
    },
    {
      id: "ap_203", kind: "guard_change", status: "pending", mode: gs.mode, strategyId: gs.id, strategyName: gs.name, title: "Guard change",
      detail: "Loosens bundler limit and turns off the wash-trading check.", risk: "high", requestedBy: "user", createdAt: now - 30 * MIN, expiresAt: now - 30 * MIN + GUARD_TTL_MS,
      diff: diffSettings(gsBefore, gsAfter), revFrom: 14, revTo: 15,
      riskImpact: { coinsPassedPerDayBefore: 118, coinsPassedPerDayAfter: 163, rugsBefore: 5, rugsAfter: 12, maxDrawdownBeforePct: 12, maxDrawdownAfterPct: 19 },
    },
    {
      id: "ap_204", kind: "team_action", teamAction: "rearm_loss_stop", status: "pending", mode: cr.mode, strategyId: cr.id, strategyName: cr.name, title: "Re-arm loss stop",
      detail: "Resume buying after the workspace loss stop; resets the peak.", risk: "critical", requestedBy: "user", createdAt: now - 10 * MIN, expiresAt: now - 10 * MIN + TEAM_TTL_MS,
    },
  ];
}

function state(): State {
  if (g.__centurionMock && !g.__centurionMock.sold) g.__centurionMock.sold = {};
  if (!g.__centurionMock) {
    const strategies = structuredClone(seedStrategies);
    g.__centurionMock = { strategies, approvals: initApprovals(Date.now(), strategies), audit: [], seq: 300, sold: {} };
  }
  return g.__centurionMock;
}

/** Lazily advance time-based transitions. */
function tick(now = Date.now()) {
  const st = state();
  for (const a of st.approvals) {
    if (a.status === "pending" && now > a.expiresAt) {
      a.status = "expired";
      a.expiredReason = "timeout";
      a.decidedAt = a.expiresAt;
    }
    if (a.status === "approved" && a.kind === "buy_pick" && a.decidedAt && now - a.decidedAt > 1500) a.status = "executing";
    if (a.status === "executing" && a.decidedAt && now - a.decidedAt > 4000) a.status = "filled";
    if (a.status === "approved" && a.kind === "guard_change" && a.cooldownEndsAt && now >= a.cooldownEndsAt) applyGuardChange(a);
    if (a.kind === "guard_change" && a.guardChangeState === "applied" && a.autoRevertAt && now >= a.autoRevertAt) a.guardChangeState = "reverted";
  }
}

function applyGuardChange(a: Approval) {
  const s = state().strategies.find((x) => x.id === a.strategyId);
  if (s && a.revTo && s.rev < a.revTo) s.rev = a.revTo;
  a.status = "filled"; // "filled" = applied for guard changes
  a.guardChangeState = "applied";
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export function listStrategies(): Strategy[] {
  return state().strategies;
}

export function getStrategy(id: string): Strategy | null {
  return state().strategies.find((x) => x.id === id) ?? null;
}

export function publishStrategy(id: string | null, settings: StrategySettings): PublishResult {
  const st = state();
  const errors = validate(settings);
  if (Object.keys(errors).length) throw wireErr("SETTINGS_SCHEMA_INVALID", { fields: Object.keys(errors) });
  const now = Date.now();
  const existing = id ? st.strategies.find((x) => x.id === id) : undefined;
  if (!existing) {
    const newId = `str_${String(++st.seq).padStart(3, "0")}`;
    st.strategies.push({
      // New strategies always start in Paper with Real locked (contracts 1.1.6).
      id: newId, name: settings.name, mode: "practice", ...realGateFor("practice", 0, null), status: "running", rev: 1, settings: { ...settings, mode: "practice" },
      openPositions: 0, realizedPnlSol: 0, unrealizedPnlSol: 0, trades: 0, wins: 0, maxDrawdownPct: 0, avgHoldSeconds: 0, pnlSpark: [],
      funnel: { scanned: 0, filtered: 0, signaled: 0, entered: 0, exited: 0, rejections: [] }, createdAt: now, updatedAt: now,
    });
    return { strategyId: newId, outcome: "published", rev: 1 };
  }
  if (existing.status === "draft") {
    Object.assign(existing, { settings: { ...settings, mode: existing.mode }, name: settings.name, rev: 1, status: "running", updatedAt: now });
    return { strategyId: existing.id, outcome: "published", rev: 1 };
  }
  const diff = diffSettings(existing.settings, settings);
  if (weakensGuard(diff)) {
    // Strengthening/neutral parts would apply immediately in the real system; the mock keeps the whole patch together.
    const ap: Approval = {
      rev: 1,
      id: `ap_${++st.seq}`, kind: "guard_change", status: "pending", mode: existing.mode, strategyId: existing.id, strategyName: existing.name,
      title: "Guard change", detail: "Published from the strategy builder; loosens at least one guard.", risk: existing.mode === "real" ? "high" : "medium",
      requestedBy: "user", createdAt: now, expiresAt: now + GUARD_TTL_MS, diff, revFrom: existing.rev, revTo: existing.rev + 1,
      riskImpact: { coinsPassedPerDayBefore: 100, coinsPassedPerDayAfter: 130, rugsBefore: 4, rugsAfter: 6, maxDrawdownBeforePct: 10, maxDrawdownAfterPct: 14 },
    };
    pendingSettings.set(ap.id, settings);
    st.approvals.push(ap);
    return { strategyId: existing.id, outcome: "needs_approval", rev: existing.rev, approvalId: ap.id };
  }
  existing.settings = settings;
  existing.name = settings.name;
  existing.rev += 1;
  existing.updatedAt = now;
  return { strategyId: existing.id, outcome: "published", rev: existing.rev };
}
const pendingSettings = new Map<string, StrategySettings>();

// --- v1.1 PATCH /strategies/{id} (If-Match / expected_rev + flat settings_patch) ---------------------------

function revs(id: string): Record<number, StrategySettings> {
  const st = state();
  st.revisions ??= {};
  st.revisions[id] ??= {};
  const s = st.strategies.find((x) => x.id === id);
  if (s && !st.revisions[id][s.rev]) st.revisions[id][s.rev] = structuredClone(s.settings);
  return st.revisions[id];
}

export function getRevision(id: string, rev: number): StrategySettings | null {
  return revs(id)[rev] ?? null;
}

export function strategyToWire(s: Strategy) {
  return { id: s.id, rev: s.rev, name: s.name, status: s.status, ...realGateToWire(s), settings: settingsToWire(s.settings), updated_at: new Date(s.updatedAt).toISOString() };
}

/**
 * Per-strategy mode switch, mirroring the paper backend `POST /strategies/{id}/mode`:
 * - rev required (`428 PRECONDITION_REQUIRED`), stale rev → `409 STRATEGY_REV_CONFLICT` with merge data.
 * - same mode → 200, no rev bump.
 * - practice → real: ALWAYS `403 MODE_NOT_ALLOWED` while this phase is paper-only, with `real_locked_reason`
 *   (the client shows it inline). Archived strategies are retired.
 * - real → practice: allowed, rev + 1.
 * The 2.5 s hold is a client-side gesture and is NOT sent (`hold_ms` is not part of the route body).
 * Open positions keep their original mode; only new entries use the new mode.
 */
export function setStrategyMode(id: string, mode: TradingMode, expectedRev: number | null, now = Date.now()): Strategy {
  const s = state().strategies.find((x) => x.id === id);
  if (!s) throw wireErr("NOT_FOUND");
  if (s.status === "archived") throw wireErr("STRATEGY_RETIRED");
  if (expectedRev == null) throw wireErr("PRECONDITION_REQUIRED");
  if (expectedRev !== s.rev) throw wireErr("STRATEGY_REV_CONFLICT", undefined, conflictBody(s, expectedRev));
  if (s.mode === mode) return { ...s };
  if (mode === "real") {
    throw wireErr("MODE_NOT_ALLOWED", {
      strategy_id: s.id,
      reason: "real_locked",
      real_locked_reason: s.realLockedReason ?? "needs_owner_approval",
      hint: "Real trading needs owner approval; this build stays in Paper.",
    });
  }
  Object.assign(s, { mode, settings: { ...s.settings, mode }, rev: s.rev + 1, updatedAt: now });
  revs(s.id)[s.rev] = structuredClone(s.settings);
  return { ...s };
}

/**
 * Mock of the backend's `POST /strategies/{id}/pause|resume` → `set_strategy_status()`: expected rev is required
 * (`428 PRECONDITION_REQUIRED`), a stale rev is `409 STRATEGY_REV_CONFLICT` with merge data, archived strategies are
 * retired, and an idempotent repeat of the same status does not bump the rev. Paper only; no wallet or chain access.
 */
export function setStrategyStatus(id: string, status: "running" | "paused", expectedRev: number | null, now = Date.now()): Strategy {
  const s = state().strategies.find((x) => x.id === id);
  if (!s) throw wireErr("NOT_FOUND");
  if (s.status === "archived") throw wireErr("STRATEGY_RETIRED");
  if (expectedRev == null) throw wireErr("PRECONDITION_REQUIRED");
  if (expectedRev !== s.rev) throw wireErr("STRATEGY_REV_CONFLICT", undefined, conflictBody(s, expectedRev));
  if (s.status === status) return { ...s };
  s.status = status;
  s.rev += 1;
  s.updatedAt = now;
  return { ...s };
}

function conflictBody(s: Strategy, baseRev: number) {
  const st = state();
  const lc = st.lastChange?.[s.id];
  return {
    current_rev: s.rev, base_rev: baseRev, changed_fields: lc?.fields ?? [],
    changed_by: lc?.by ?? { actor: "teammate", via: "web" }, changed_at: new Date(lc?.at ?? s.updatedAt).toISOString(),
    current: strategyToWire(s),
  };
}

export type PatchOutcome = { status: 200; strategy: ReturnType<typeof strategyToWire> } | { status: 202; proposal: Approval; strategy: ReturnType<typeof strategyToWire> };

/**
 * JSON-merge `settings_patch` onto the current wire settings. No force-save, no auto-merge:
 * expectedRev !== rev → 409 STRATEGY_REV_CONFLICT (Real + weakening → CONFIRMATION_RESTART_REQUIRED) with merge data.
 */
export function patchStrategy(id: string, expectedRev: number | null, patch: Record<string, unknown>, by: { actor: string; via: "web" | "mobile"; device?: string } = { actor: "you", via: "web" }, now = Date.now()): PatchOutcome {
  const st = state();
  const s = st.strategies.find((x) => x.id === id);
  if (!s) throw wireErr("NOT_FOUND");
  if (s.status === "archived") throw wireErr("STRATEGY_RETIRED");
  if (expectedRev == null) throw wireErr("PRECONDITION_REQUIRED");
  revs(id);
  const merged: WireSettings = { ...settingsToWire(s.settings) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  const next = { ...settingsFromWire(merged, s.settings), mode: s.mode };
  const diff = diffSettings(s.settings, next);
  const weakening = weakensGuard(diff);
  if (expectedRev !== s.rev) {
    throw wireErr(s.mode === "real" && weakening ? "CONFIRMATION_RESTART_REQUIRED" : "STRATEGY_REV_CONFLICT", undefined, conflictBody(s, expectedRev));
  }
  const errors = validate(next);
  if (Object.keys(errors).length) throw wireErr("SETTINGS_SCHEMA_INVALID", { fields: Object.keys(errors) });
  if (weakening) {
    const ap: Approval = {
      rev: 1,
      id: `ap_${++st.seq}`, kind: "guard_change", status: "pending", mode: s.mode, strategyId: s.id, strategyName: s.name,
      title: "Guard change", detail: "Saved from the strategy builder; loosens at least one guard.", risk: s.mode === "real" ? "high" : "medium",
      requestedBy: "user", createdAt: now, expiresAt: now + GUARD_TTL_MS, diff, revFrom: s.rev, revTo: s.rev + 1,
      riskImpact: { coinsPassedPerDayBefore: 100, coinsPassedPerDayAfter: 130, rugsBefore: 4, rugsAfter: 6, maxDrawdownBeforePct: 10, maxDrawdownAfterPct: 14 },
    };
    pendingSettings.set(ap.id, next);
    st.approvals.push(ap);
    return { status: 202, proposal: ap, strategy: strategyToWire(s) };
  }
  s.settings = next;
  s.name = next.name;
  s.rev += 1;
  s.updatedAt = now;
  revs(id)[s.rev] = structuredClone(next);
  st.lastChange ??= {};
  st.lastChange[id] = { by, at: now, fields: Object.keys(patch) };
  return { status: 200, strategy: strategyToWire(s) };
}

/** Demo helper for the revision-conflict flow: a teammate on mobile tightens the peak trail and bumps rev. */
export function simulateTeammateEdit(id: string, now = Date.now()) {
  const s = getStrategy(id);
  if (!s) throw wireErr("NOT_FOUND");
  const trail = Math.max(5, Math.min(49, s.settings.exit.trailingPct - 5 || 15));
  return patchStrategy(id, s.rev, { peak_trail_pct: trail, liquidity_usd_min: s.settings.screener.minLiquidityUsd + 1000 }, { actor: "Rani", via: "mobile", device: "Pixel 8" }, now);
}

// --- Practice reset (POST /practice/reset) ---------------------------------------------------------------
export const PRACTICE_START_LAMPORTS = "30000000000";
const RESET_COOLDOWN_MS = 24 * HOUR;

export function practiceState() {
  const st = state();
  st.practice ??= { epoch: 1, lastResetAt: null };
  return st.practice;
}

export function resetPractice(now = Date.now()) {
  const st = state();
  const p = practiceState();
  if (p.lastResetAt != null && now - p.lastResetAt < RESET_COOLDOWN_MS) {
    throw wireErr("RESET_COOLDOWN", { next_allowed_at: new Date(p.lastResetAt + RESET_COOLDOWN_MS).toISOString() }, { retry_after_s: Math.ceil((p.lastResetAt + RESET_COOLDOWN_MS - now) / 1000) });
  }
  const open = listOpenPositions("practice");
  for (const pos of open) st.sold[pos.key] = 100;
  let expired = 0;
  for (const a of st.approvals) {
    if (a.mode === "practice" && a.status === "pending" && a.kind === "buy_pick") {
      a.status = "expired";
      a.expiredReason = "practice_reset";
      a.rev += 1;
      expired++;
    }
  }
  p.epoch += 1;
  p.lastResetAt = now;
  return {
    epoch: p.epoch, starting_balance_lamports: PRACTICE_START_LAMPORTS,
    archived: { positions: open.length, pending_buys: expired },
    next_allowed_at: new Date(now + RESET_COOLDOWN_MS).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function listApprovals(mode: TradingMode): Approval[] {
  tick();
  return state().approvals.filter((a) => a.mode === mode).map((a) => ({ ...a }));
}

export function decideApproval(id: string, d: ApprovalDecision, now = Date.now()): Approval {
  tick(now);
  const st = state();
  const a = st.approvals.find((x) => x.id === id);
  if (!a) throw wireErr("NOT_FOUND");
  if (a.screenerState === "UNSUPPORTED_QUOTE_MINT" && d.action === "approve") throw wireErr("UNSUPPORTED_QUOTE_MINT");

  if (d.action === "undo_skip") {
    if (a.status !== "rejected" || !a.decidedAt || now - a.decidedAt > UNDO_MS + 1000) throw wireErr("APPROVAL_ALREADY_DECIDED");
    a.status = "pending";
    a.skipReason = undefined;
    a.decidedAt = undefined;
    return { ...a };
  }
  if (d.action === "cancel_cooldown") {
    if (a.kind !== "guard_change" || a.status !== "approved" || !a.cooldownEndsAt) throw wireErr("NOT_FOUND");
    a.status = "rejected";
    a.skipNote = "Cooldown cancelled — change not applied";
    a.guardChangeState = "cancelled";
    a.cooldownEndsAt = undefined;
    audit(a, "cancel_cooldown", now);
    return { ...a };
  }
  if (a.status !== "pending") throw wireErr(a.status === "expired" ? "APPROVAL_EXPIRED" : "APPROVAL_ALREADY_DECIDED", { reason: a.expiredReason });

  if (d.action === "skip") {
    a.status = "rejected";
    a.skipReason = d.reason;
    a.skipNote = d.note?.slice(0, 200);
    a.decidedAt = now;
    return { ...a };
  }

  // approve
  const c = d.confirmation;
  const needsHold = a.kind !== "buy_pick" || a.mode === "real";
  if (needsHold && (!c || c.holdMs < HOLD_MS[a.mode])) throw wireErr(c ? "HOLD_TOO_SHORT" : "CONFIRMATION_REQUIRED", { hold_ms: HOLD_MS[a.mode] });
  if (a.kind === "guard_change" && a.mode === "real") {
    if (c?.typedName !== a.strategyName) throw wireErr("TYPED_CONFIRMATION_MISMATCH");
    if (c?.secondFactor !== "mock_passkey") throw wireErr("WEBAUTHN_INVALID");
  }
  if (a.mode === "real" && a.kind === "team_action" && c?.secondFactor !== "mock_passkey") throw wireErr("WEBAUTHN_INVALID");
  a.decidedAt = now;
  a.status = "approved";
  if (a.kind === "guard_change") {
    if (a.mode === "real") {
      // Cooldown AND auto-revert are both mandatory on Real SOL; the client cannot opt out.
      a.cooldownEndsAt = now + REAL_GUARD_COOLDOWN_MS;
      a.autoRevertAt = a.cooldownEndsAt + REAL_GUARD_AUTO_REVERT_MS;
      a.guardChangeState = "cooling_down";
    } else {
      applyGuardChange(a);
    }
    const s = pendingSettings.get(a.id);
    if (s && a.mode === "practice") {
      const strat = st.strategies.find((x) => x.id === a.strategyId);
      if (strat) strat.settings = s;
    }
  }
  a.auditId = audit(a, "approve", now);
  if (a.kind === "buy_pick") openFromApproval(a, now);
  return { ...a };
}

// ---------------------------------------------------------------------------
// Contract v1.1.2 decision flow: decision tokens, approval rev (If-Match / expected_rev), confirmation challenges
// ---------------------------------------------------------------------------

const tokens = ((globalThis as unknown as { __centurionTokens?: Map<string, { approvalId: string; exp: number; used?: { decision: string; result: unknown } }> }).__centurionTokens ??= new Map());
const challenges = ((globalThis as unknown as { __centurionChallenges?: Map<string, { action: string; target: string; payloadHash: string; exp: number; used: boolean }> }).__centurionChallenges ??= new Map());
const TOKEN_TTL_MS = 15 * MIN;
export const CHALLENGE_TTL_MS = 2 * MIN;

const rand = (n: number) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Buffer.from(a).toString("base64url");
};

/** GET /approvals/{id}: mints a single-use decision token, TTL = min(15 min, expires_at). */
export function issueDecisionToken(id: string, now = Date.now()): { token: string; expiresAt: number } {
  const a = state().approvals.find((x) => x.id === id);
  if (!a) throw wireErr("NOT_FOUND");
  const token = `apt_${rand(16).slice(0, 22)}`;
  const expiresAt = Math.min(now + TOKEN_TTL_MS, a.expiresAt);
  tokens.set(token, { approvalId: id, exp: expiresAt });
  return { token, expiresAt };
}

/** POST /confirmations/challenge {action, target, payload_hash} → 2 min, single use, bound to the change hash. */
export function createChallenge(action: string, target: string, payloadHash: string, now = Date.now()) {
  const id = crypto.randomUUID();
  challenges.set(id, { action, target, payloadHash, exp: now + CHALLENGE_TTL_MS, used: false });
  return { challenge_id: id, challenge: rand(32), expires_at: new Date(now + CHALLENGE_TTL_MS).toISOString(), rp_id: "localhost" };
}

/** POST /approvals/{id}/decision (contract). Same token + same decision → stored result with replayed=true. */
export function decideApprovalWire(id: string, req: ApprovalDecisionRequest, now = Date.now()) {
  tick(now);
  const a = state().approvals.find((x) => x.id === id);
  if (!a) throw wireErr("NOT_FOUND");
  // 1.1.3: reject_reason only with decision=reject, closed enum; default user_declined.
  if (req.reject_reason !== undefined && (req.decision !== "reject" || !APPROVAL_REJECT_REASONS.includes(req.reject_reason))) {
    throw wireErr("VALIDATION_FAILED", { field: "reject_reason", allowed: [...APPROVAL_REJECT_REASONS] });
  }
  // Not tradeable: reject (= Skip as dismiss) is allowed; approve is refused.
  if (a.screenerState === "UNSUPPORTED_QUOTE_MINT" && req.decision === "approve") throw wireErr("UNSUPPORTED_QUOTE_MINT");
  const tok = tokens.get(req.token);
  if (!tok || tok.approvalId !== id) throw wireErr("APPROVAL_TOKEN_INVALID");
  if (tok.used) {
    if (tok.used.decision === req.decision) return { ...(tok.used.result as object), replayed: true };
    throw wireErr("APPROVAL_ALREADY_DECIDED");
  }
  if (now > tok.exp && a.status === "pending") throw wireErr("APPROVAL_EXPIRED", { reason: "timeout" });
  if (a.status === "expired") throw wireErr("APPROVAL_EXPIRED", { reason: a.expiredReason });
  if (a.status !== "pending") throw wireErr("APPROVAL_ALREADY_DECIDED");
  if (req.expected_rev == null) throw wireErr("PRECONDITION_REQUIRED");
  if (req.expected_rev !== a.rev) throw wireErr("VERSION_CONFLICT", { current_rev: a.rev, base_rev: req.expected_rev, current: approvalToWire(a) as unknown as Record<string, unknown> } /* ConflictError<ApprovalWire>: current REQUIRED */);

  // 1.1.4 approval_quote_check: Real approve needs a live quote; practice is never blocked by a missing/stale quote.
  if (req.decision === "approve" && a.mode === "real" && a.kind === "buy_pick") {
    const q = a.quote;
    const exp = (req as { expected_quote_id?: string | null }).expected_quote_id ?? null;
    const reason = !q?.quoteTs || !q.quoteExpiresAt ? "missing" : q.quoteExpiresAt <= now ? "stale" : exp != null && exp !== (q.quoteId ?? null) ? "mismatch" : null;
    if (reason) {
      // 1.1.5 QuoteMissingOrStaleError: reason + quote ids + current (the proposal as it is now).
      throw wireErr("QUOTE_MISSING_OR_STALE", { reason, quote_ts: q?.quoteTs ? new Date(q.quoteTs).toISOString() : null, quote_expires_at: q?.quoteExpiresAt ? new Date(q.quoteExpiresAt).toISOString() : null, missing: !q?.quoteTs, quote_id: q?.quoteId ?? "0", expected_quote_id: exp, current: approvalToWire(a) as unknown as Record<string, unknown> });
    }
  }
  let confirmation: { typedName?: string; secondFactor?: "mock_passkey"; holdMs: number } | undefined;
  if (req.confirmation) {
    const c = req.confirmation;
    // Practice hold-only proof ({hold_duration_ms}) has no challenge; the mock accepts it as a hold.
    if (!("challenge_id" in c)) {
      confirmation = { holdMs: c.hold_duration_ms };
    } else {
      const ch = challenges.get(c.challenge_id);
      if (!ch || ch.used || now > ch.exp || ch.target !== id) throw wireErr("CONFIRMATION_INVALID");
      ch.used = true;
      confirmation = { holdMs: c.hold_duration_ms, typedName: c.typed_confirmation ?? undefined, secondFactor: c.webauthn ? "mock_passkey" : undefined };
    }
  }
  const next = req.decision === "approve" ? decideApproval(id, { action: "approve", confirmation }, now) : decideApproval(id, { action: "skip", reason: (req.reason ?? undefined) as never }, now);
  const live = state().approvals.find((x) => x.id === id)!;
  live.rev += 1;
  const rejectReason = req.decision === "reject" ? (req.reject_reason ?? "user_declined") : null;
  if (rejectReason) live.rejectReason = rejectReason;
  const result = { proposal_id: id, status: next.status === "rejected" ? "rejected" : "approved", rev: live.rev, reject_reason: rejectReason, replayed: false };
  tok.used = { decision: req.decision, result };
  return result;
}

/**
 * Mock of backend `set_approval_quote` (pending only; rev + 1; emits proposal.updated). Exposed to the web as the
 * mock-only POST /approvals/{id}/quote ("Refresh quote"); contracts 1.1.4 has no client route for this yet.
 */
export function refreshQuote(id: string, now = Date.now()): Approval {
  tick(now);
  const a = state().approvals.find((x) => x.id === id);
  if (!a) throw wireErr("NOT_FOUND");
  if (a.status !== "pending") throw wireErr(a.status === "expired" ? "APPROVAL_EXPIRED" : "APPROVAL_ALREADY_DECIDED");
  if (a.kind !== "buy_pick" || !a.amountSol || a.screenerState) throw wireErr("VALIDATION_FAILED", { field: "kind" });
  a.quote = mockQuote(a, now);
  // contracts 1.1.5: a quote refresh increments quote_id and never bumps rev (decision tokens stay valid).
  proposalUpdates.push({ at: now, approval: { ...a } });
  if (proposalUpdates.length > 100) proposalUpdates.shift();
  return { ...a };
}

/** proposal.updated outbox for the mock SSE stream (drained by events/stream). */
const gp = globalThis as unknown as { __centurionProposalUpdates?: { at: number; approval: Approval }[] };
export const proposalUpdates = (gp.__centurionProposalUpdates ??= []);

export function getApproval(id: string): Approval | null {
  tick();
  const a = state().approvals.find((x) => x.id === id);
  return a ? { ...a } : null;
}

/** POST /guard-changes/{id}/cancel: any member can cancel during the cooldown. */
export function cancelGuardChange(id: string, now = Date.now()): Approval {
  const a = decideApproval(id, { action: "cancel_cooldown" }, now);
  state().approvals.find((x) => x.id === id)!.rev += 1;
  return a;
}


function audit(a: Approval, action: string, now: number): string {
  const st = state();
  const id = `aud_${now.toString(36)}_${st.audit.length}`;
  st.audit.push({ id, at: now, actor: "you", device: "web (mock)", approvalId: a.id, action, risk: a.risk, diffKeys: a.diff?.map((r) => r.key) ?? [] });
  return id;
}

export function getTrailMode(mint: string): TradingMode | null {
  return trails.find((t) => t.coin.mint === mint)?.mode ?? null;
}

// ---------------------------------------------------------------------------
// Positions (manual sell = mock job; nothing leaves this process)
// ---------------------------------------------------------------------------

export function listOpenPositions(mode: TradingMode): OpenPosition[] {
  const st = state();
  const seeded = trails
    .filter((t) => t.mode === mode)
    .flatMap((t) =>
      t.positions
        .filter((p) => p.status === "open" && (st.sold[p.key] ?? 0) < 100)
        .map((p) => {
          const strat = st.strategies.find((s) => s.id === t.strategyId);
          return {
            key: p.key, strategyId: t.strategyId, strategyName: t.strategyName, mode: t.mode, mint: t.coin.mint, symbol: t.coin.untrusted.symbol,
            solIn: p.solIn, entryPriceUsd: p.entryPriceUsd, nowPriceUsd: p.entryPriceUsd * (1 + (p.pnlPct ?? 0) / 100), pnlSol: p.pnlSol ?? 0, pnlPct: p.pnlPct ?? 0, openedAt: p.openedAt,
            soldPct: st.sold[p.key] ?? 0, stopLossPct: strat?.settings.exit.stopLossPct ?? 0, trailingPct: strat?.settings.exit.trailingPct ?? 0,
            ...(t.screenerState ? { screenerState: t.screenerState } : {}),
            rev: st.posRev?.[p.key] ?? 1, decimals: t.coin.decimals, tokenProgram: t.coin.tokenProgram, practiceEpoch: t.mode === "practice" ? practiceState().epoch : 0,
          };
        }),
    );
  // D4: approvals approved this session add rows to the very same list the dashboard counts.
  const created = (st.createdPositions ?? [])
    .filter((p) => p.mode === mode)
    .map((p) => ({ ...p, soldPct: st.sold[p.key] ?? p.soldPct, rev: st.posRev?.[p.key] ?? p.rev }))
    .filter((p) => p.soldPct < 100);
  return [...seeded, ...created].sort((a, b) => b.openedAt - a.openedAt);
}

/** D4: the closed ledger every mock screen reads (seeded rows + manual 100 % closes from this session). */
export function listClosedLedger(): LedgerRow[] {
  return [...closedTrades, ...(state().manualCloses ?? [])];
}

/**
 * D4: one snapshot per read. Overview, /positions and /pnl all derive from this, so counts and SOL can never
 * disagree after an approve or a 100 % manual sell.
 */
export function snapshot(mode: TradingMode) {
  const positions = listOpenPositions(mode);
  return {
    positions,
    closes: listClosedLedger().filter((t) => t.mode === mode),
    inPositionsSol: Math.round(positions.reduce((a, p) => a + p.solIn * (1 - p.soldPct / 100), 0) * 1e9) / 1e9,
    unrealizedSol: Math.round(positions.reduce((a, p) => a + p.pnlSol * (1 - p.soldPct / 100), 0) * 1e9) / 1e9,
    realizedSol: Math.round(listClosedLedger().filter((t) => t.mode === mode).reduce((a, t) => a + (t.pnlSol ?? 0), 0) * 1e9) / 1e9,
  };
}

/** D4: an approved buy pick becomes a live position in the same mutable store. */
function openFromApproval(a: Approval, now: number) {
  if (!a.strategyId || !a.mint || !a.amountSol) return;
  const st = state();
  st.createdPositions ??= [];
  const key = `approval:${a.id}`;
  if (st.createdPositions.some((p) => p.key === key)) return;
  const strat = st.strategies.find((s) => s.id === a.strategyId);
  const meta = trails.find((t) => t.coin.mint === a.mint)?.coin;
  if (!strat || !meta) return;
  const priceSol = Number(a.quote?.priceSol ?? 0);
  const entryUsd = priceSol > 0 ? priceSol * MOCK_SOL_USD : 0.000004 * MOCK_SOL_USD;
  st.createdPositions.push({
    key, logoHash: meta.logoHash ?? null, strategyId: strat.id, strategyName: strat.name, mode: a.mode,
    mint: meta.mint, symbol: meta.untrusted.symbol, solIn: a.amountSol, entryPriceUsd: entryUsd, nowPriceUsd: entryUsd, pnlSol: 0, pnlPct: 0,
    openedAt: now, soldPct: 0, rev: 1, decimals: meta.decimals, tokenProgram: meta.tokenProgram,
    practiceEpoch: a.mode === "practice" ? practiceState().epoch : 0,
    stopLossPct: strat.settings.exit.stopLossPct, trailingPct: strat.settings.exit.trailingPct,
  });
}

/**
 * POST /positions/{id}/close (contracts 1.1.2). `If-Match: "<position rev>"` + `{fraction_bps}` (1–10000 of the
 * remaining quantity, default 10000). Practice only: Real → 403 MODE_NOT_ALLOWED. Stale rev → 409 VERSION_CONFLICT
 * {current_rev, base_rev, current}. The simulated fill completes synchronously here (status "filled", job_id null).
 */
export function closePosition(key: string, expectedRev: number | null, fractionBps: number, mode: TradingMode, now = Date.now()) {
  if (mode !== "practice") throw wireErr("MODE_NOT_ALLOWED");
  if (!Number.isInteger(fractionBps) || fractionBps < 1 || fractionBps > 10_000) throw wireErr("INVALID_FRACTION", { fraction_bps: fractionBps });
  const st = state();
  const pos = listOpenPositions(mode).find((p) => p.key === key);
  if (!pos) {
    if (trails.some((t) => t.positions.some((p) => p.key === key))) throw wireErr("POSITION_ALREADY_CLOSED");
    throw wireErr("NOT_FOUND");
  }
  if (pos.screenerState === "UNSUPPORTED_QUOTE_MINT") throw wireErr("UNSUPPORTED_QUOTE_MINT");
  if (expectedRev == null) throw wireErr("PRECONDITION_REQUIRED");
  if (expectedRev !== pos.rev) throw wireErr("VERSION_CONFLICT", { current_rev: pos.rev, base_rev: expectedRev, current: { id: pos.key, rev: pos.rev, sold_pct: pos.soldPct } });
  const before = { ...pos };
  const remaining = 100 - pos.soldPct;
  st.sold[key] = fractionBps >= 10_000 ? 100 : Math.min(100, pos.soldPct + remaining * (fractionBps / 10_000));
  st.posRev ??= {};
  st.posRev[key] = pos.rev + 1;
  // D4: a 100 % manual sell closes the position AND appends its realized row to the same ledger /pnl reads.
  if (st.sold[key] >= 100) {
    st.manualCloses ??= [];
    if (!st.manualCloses.some((c) => c.id === key)) {
      const share = remaining / 100; // only the part still open at this call
      const pnl = Math.round(pos.pnlSol * share * 1e9) / 1e9;
      const solIn = Math.round(pos.solIn * share * 1e9) / 1e9;
      st.manualCloses.push({
        id: key, strategyId: pos.strategyId, mode: pos.mode, mint: pos.mint, symbol: pos.symbol,
        logoHash: pos.logoHash ?? null, solInSol: solIn, solOutSol: Math.round((solIn + pnl) * 1e9) / 1e9, feesSol: 0,
        pnlSol: pnl, pnlPct: pos.pnlPct, holdSeconds: Math.max(0, Math.round((now - pos.openedAt) / 1000)),
        reason: "manual", closedAt: now,
      });
    }
  }
  return { before, after: { ...pos, soldPct: st.sold[key], rev: pos.rev + 1 }, fractionBps, at: now };
}
