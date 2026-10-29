/**
 * In-memory mutable mock state (server process only; resets on restart).
 * Nothing here touches wallets, RPC, chain or any external service.
 */
import type { Approval, ApprovalDecision, PublishResult, RiskLevel, Strategy, StrategySettings, TradingMode } from "@/lib/types";
import { diffSettings, validate, weakensGuard } from "@/lib/strategy-schema";
import { coinSummaries, seedStrategies, trails } from "./data";

const MIN = 60_000;
const HOUR = 60 * MIN;
export const PICK_TTL_MS = 10 * MIN;
export const GUARD_TTL_MS = 24 * HOUR;
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
}

const g = globalThis as unknown as { __sentraMock?: State };

function initApprovals(now: number, strategies: Strategy[]): Approval[] {
  return seedApprovals(now, strategies).map((a) => ({ ...a, version: 1 }));
}

function seedApprovals(now: number, strategies: Strategy[]): Omit<Approval, "version">[] {
  const byName = (n: string) => strategies.find((x) => x.name === n)!;
  const coin = (mode: TradingMode, k: number) => coinSummaries.filter((c) => c.mode === mode)[k];
  const bh = byName("Breakout Hunter");
  const gm = byName("Graduated Momentum");
  const fb = byName("Fresh Bonding Scout");
  const cr = byName("Conservative Real");
  const gs = byName("Graduated scalp");
  const c1 = coin("practice", 0), c2 = coin("practice", 1), c3 = coin("real", 0), c4 = coin("real", 1);
  const gsAfter: StrategySettings = { ...structuredClone(gs.settings), guard: { ...gs.settings.guard, maxBundlersPct: 30, checks: { ...gs.settings.guard.checks, washTrading: false } }, exit: { ...gs.settings.exit, trailingPct: 30 } };
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
    // ---- Real SOL workspace ----
    {
      id: "ap_201", kind: "buy_pick", status: "pending", mode: "real", strategyId: cr.id, strategyName: cr.name, mint: c3.mint, symbol: c3.symbol, title: c3.symbol,
      detail: "Real SOL buy (mock — no wallet in this build).", amountSol: 0.2, risk: "high", requestedBy: "entry", createdAt: now - 4 * MIN, expiresAt: now + 6 * MIN,
      pick: { pickKind: "first_buy", score: { value: 101, passMark: 85 }, guard: { passed: 8, total: 8 }, entry: "dip −6%", exitPlan: "Ladder 3-rung · trail 20%", budgetSol: cr.settings.sizing.budgetSol },
    },
    {
      id: "ap_202", kind: "buy_pick", status: "pending", mode: "real", strategyId: gs.id, strategyName: gs.name, mint: c4.mint, symbol: c4.symbol, title: c4.symbol,
      detail: "Real SOL buy (mock).", amountSol: 0.15, risk: "high", requestedBy: "entry", createdAt: now - 2 * MIN, expiresAt: now + 8 * MIN,
      pick: { pickKind: "buy", score: { value: 88, passMark: 70 }, guard: { passed: 8, total: 8 }, entry: "market", exitPlan: "Ladder 3-rung", budgetSol: gs.settings.sizing.budgetSol },
    },
    {
      id: "ap_203", kind: "guard_change", status: "pending", mode: "real", strategyId: gs.id, strategyName: gs.name, title: "Guard change",
      detail: "Loosens bundler limit and turns off the wash-trading check.", risk: "high", requestedBy: "user", createdAt: now - 30 * MIN, expiresAt: now - 30 * MIN + GUARD_TTL_MS,
      diff: diffSettings(gsBefore, gsAfter), revFrom: 14, revTo: 15,
      riskImpact: { coinsPassedPerDayBefore: 118, coinsPassedPerDayAfter: 163, rugsBefore: 5, rugsAfter: 12, maxDrawdownBeforePct: 12, maxDrawdownAfterPct: 19 },
    },
    {
      id: "ap_204", kind: "team_action", teamAction: "rearm_loss_stop", status: "pending", mode: "real", strategyId: cr.id, strategyName: cr.name, title: "Re-arm loss stop",
      detail: "Resume buying after the workspace loss stop; resets the peak.", risk: "critical", requestedBy: "user", createdAt: now - 10 * MIN, expiresAt: now - 10 * MIN + TEAM_TTL_MS,
    },
  ];
}

function state(): State {
  if (!g.__sentraMock) {
    const strategies = structuredClone(seedStrategies);
    g.__sentraMock = { strategies, approvals: initApprovals(Date.now(), strategies), audit: [], seq: 300 };
  }
  return g.__sentraMock;
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
  if (Object.keys(errors).length) throw new Error(`Invalid settings: ${Object.keys(errors).join(", ")}`);
  const now = Date.now();
  const existing = id ? st.strategies.find((x) => x.id === id) : undefined;
  if (!existing) {
    const newId = `str_${String(++st.seq).padStart(3, "0")}`;
    st.strategies.push({
      id: newId, name: settings.name, mode: "practice", status: "running", rev: 1, settings: { ...settings, mode: "practice" },
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
      version: 1,
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
  if (!a) throw new Error(`Approval ${id} not found`);

  if (d.action === "undo_skip") {
    if (a.status !== "rejected" || !a.decidedAt || now - a.decidedAt > UNDO_MS + 1000) throw new Error("Undo window has passed");
    a.status = "pending";
    a.skipReason = undefined;
    a.decidedAt = undefined;
    return { ...a };
  }
  if (d.action === "cancel_cooldown") {
    if (a.kind !== "guard_change" || a.status !== "approved" || !a.cooldownEndsAt) throw new Error("Nothing to cancel");
    a.status = "rejected";
    a.skipNote = "Cooldown cancelled — change not applied";
    a.guardChangeState = "cancelled";
    a.cooldownEndsAt = undefined;
    audit(a, "cancel_cooldown", now);
    return { ...a };
  }
  if (a.status !== "pending") throw new Error(a.status === "expired" ? "Expired — cannot be approved" : `Already ${a.status}`);

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
  if (needsHold && (!c || c.holdMs < HOLD_MS[a.mode])) throw new Error(`Hold-to-confirm ${HOLD_MS[a.mode] / 1000}s required`);
  if (a.kind === "guard_change" && a.mode === "real") {
    if (c?.typedName !== a.strategyName) throw new Error("Typed strategy name does not match");
    if (c?.secondFactor !== "mock_passkey") throw new Error("Second factor required");
  }
  if (a.mode === "real" && a.kind === "team_action" && c?.secondFactor !== "mock_passkey") throw new Error("Second factor required");
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
  return { ...a };
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
