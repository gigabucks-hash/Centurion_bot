/**
 * Mock dataset (seeded, deterministic). ONE app, each strategy runs in Paper (wire `practice`) or Real; balances stay
 * per mode and are never mixed. All coins and mints are fictional.
 *
 * Contracts 1.1.6: Real is gated off, so by default every strategy runs in Paper with `real_locked: true`
 * (`needs_owner_approval`). `CENTURION_MOCK_REAL_DEMO=1` (dev/tests only) runs the two "Real" seeds in Real with
 * `real_locked: false` so the per-strategy Real safety rules (no swipe, 2.5 s holds, guard cooldown + 24 h
 * auto-revert) can be exercised. It never touches a wallet or the chain.
 */
import { MOCK_SOL_USD, screenerStateOf } from "@/lib/contracts";
const SPL_TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as const;
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as const;
/** Mock non-SOL quote (USDC mint). Display only. */
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
import type {
  Alert,
  CheckResult,
  CoinMeta,
  CoinSummary,
  CoinTrail,
  ExitReason,
  ExitReasonStat,
  Position,
  PricePoint,
  Strategy,
  StrategySettings,
  TradeEvent,
  TradingMode,
  WorkspaceOverview,
} from "@/lib/types";
import { EXIT_REASONS } from "@/lib/types";
import { applyExitPreset, applyGuardPreset, blankSettings, EXIT_PRESETS } from "@/lib/strategy-schema";
import { between, fakeMint, intBetween, mulberry32, pick, round } from "./rng";

/** Fixed "now" for seeded history: 2026-10-29 15:00 WIB. */
export const MOCK_NOW = Date.UTC(2026, 9, 29, 8, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

const rng = mulberry32(20261029);

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

type Seed = { name: string; mode: TradingMode; status: Strategy["status"]; settings: StrategySettings };

const s = (patch: (x: StrategySettings) => StrategySettings) => patch(blankSettings());

export const MOCK_REAL_DEMO = process.env.CENTURION_MOCK_REAL_DEMO === "1";
/** Mode of the two "Real" seeds: Paper unless the dev-only Real demo is on. */
const R: TradingMode = MOCK_REAL_DEMO ? "real" : "practice";

const strategySeeds: Seed[] = [
  { name: "Fresh Bonding Scout", mode: "practice", status: "running", settings: s((x) => ({ ...x, approvalMode: "off" })) },
  { name: "Graduated Momentum", mode: "practice", status: "running", settings: s((x) => applyExitPreset({ ...x, approvalMode: "ask_first_buy", screener: { ...x.screener, streams: ["amm"], maxAgeMinutes: 1440 } }, "trail_stop_only")) },
  { name: "Dip Catcher v2", mode: "practice", status: "paused", settings: s((x) => applyExitPreset({ ...x, approvalMode: "ask_every_buy", entry: { ...x.entry, dipPct: 12 } }, "fast_half")) },
  { name: "Breakout Hunter", mode: "practice", status: "running", settings: s((x) => ({ ...x, approvalMode: "ask_first_buy", entry: { ...x.entry, breakout: { enabled: true, minutes: 12, rangePct: 15, buyers: 8 } } })) },
  { name: "Night Owl", mode: "practice", status: "archived", settings: s((x) => applyExitPreset({ ...x, approvalMode: "off" }, "trail_stop_only")) },
  { name: "New pairs (draft)", mode: "practice", status: "draft", settings: s((x) => x) },
  { name: "Conservative", mode: R, status: "running", settings: s((x) => applyGuardPreset({ ...x, mode: R, approvalMode: "ask_every_buy", sizing: { budgetSol: 2, tradeSol: 0.2, maxOpen: 3, lossStopPct: 30 } }, "strict")) },
  { name: "Graduated scalp", mode: R, status: "running", settings: s((x) => applyExitPreset({ ...x, mode: R, approvalMode: "ask_first_buy", sizing: { budgetSol: 1.5, tradeSol: 0.15, maxOpen: 3, lossStopPct: 30 }, screener: { ...x.screener, streams: ["amm"] } }, "three_step_ladder")) },
];

const rejectionReasons = [
  "Liquidity below minimum",
  "Top-10 holders too concentrated",
  "Bundled launch detected",
  "Dev wallet holds too much",
  "Too old for strategy window",
  "Sniper share too high",
  "Wash-trading pattern",
  "LP not burned",
];

/** Days since the strategy's first paper buy (deterministic per seed index). */
const firstBuyDaysAgo = (i: number) => [9, 6, 4, 3, 12, 0, 8, 5][i] ?? 1;
/** Owner thresholds (`centurion.real_gate.min_paper_*`): unset (null) unless the mock env sets them. */
const gateMin = (v: string | undefined) => (v && /^\d{1,4}$/.test(v) ? Number(v) : null);

/** contracts 1.1.6 StrategyRealGateFields for a mock strategy. */
export function realGateFor(mode: TradingMode, tradesDone: number, firstBuyAt: number | null): Pick<Strategy, "realLocked" | "realLockedReason" | "paperProgress"> {
  const unlocked = mode === "real"; // only the dev-only Real demo runs a strategy in Real
  return {
    realLocked: !unlocked,
    realLockedReason: unlocked ? null : "needs_owner_approval",
    paperProgress: {
      days_done: firstBuyAt == null || tradesDone === 0 ? 0 : Math.max(0, Math.floor((MOCK_NOW - firstBuyAt) / (24 * HOUR))),
      days_required: gateMin(process.env.CENTURION_REAL_GATE_MIN_PAPER_DAYS),
      trades_done: tradesDone,
      trades_required: gateMin(process.env.CENTURION_REAL_GATE_MIN_PAPER_TRADES),
    },
  };
}

export const seedStrategies: Strategy[] = strategySeeds.map((seed, i) => {
  const draft = seed.status === "draft";
  const scanned = draft ? 0 : intBetween(rng, seed.mode === "real" ? 600 : 1800, seed.mode === "real" ? 3000 : 12000);
  const filtered = Math.floor(scanned * between(rng, 0.04, 0.12));
  const signaled = Math.floor(filtered * between(rng, 0.25, 0.6));
  const entered = Math.floor(signaled * between(rng, 0.4, 0.85));
  const exited = Math.max(0, entered - intBetween(rng, 0, 3));
  const wins = Math.floor(exited * between(rng, 0.3, 0.6));
  const rejections = draft
    ? []
    : [...rejectionReasons]
        .sort(() => rng() - 0.5)
        .slice(0, 4)
        .map((reason) => ({ reason, count: intBetween(rng, 20, Math.max(40, Math.floor((scanned - filtered) / 4))) }))
        .sort((a, b) => b.count - a.count);
  const realized = draft ? 0 : round(between(rng, seed.mode === "real" ? -0.3 : -0.9, seed.mode === "real" ? 0.2 : 0.6), 4);
  const spark: number[] = [];
  let acc = 0;
  for (let k = 0; k < 24; k++) {
    acc += between(rng, -0.05, 0.05);
    spark.push(round(acc, 4));
  }
  const drift = realized - acc;
  const pnlSpark = spark.map((v, k) => round(v + (drift * (k + 1)) / spark.length, 4));
  const running = seed.status === "running";
  return {
    id: `str_${(i + 1).toString().padStart(3, "0")}`,
    name: seed.name,
    mode: seed.mode,
    ...realGateFor(seed.mode, seed.status === "draft" ? 0 : exited, MOCK_NOW - firstBuyDaysAgo(i) * 24 * HOUR),
    status: seed.status,
    rev: draft ? 0 : intBetween(rng, 2, 15),
    settings: { ...seed.settings, name: seed.name, mode: seed.mode },
    openPositions: running ? Math.min(seed.settings.sizing.maxOpen, entered - exited) : 0,
    realizedPnlSol: realized,
    unrealizedPnlSol: running ? round(between(rng, -0.08, 0.12), 4) : 0,
    trades: exited,
    wins,
    maxDrawdownPct: draft ? 0 : round(between(rng, 3, 18), 1),
    avgHoldSeconds: draft ? 0 : intBetween(rng, 40, 700),
    pnlSpark: draft ? [] : pnlSpark,
    funnel: { scanned, filtered, signaled, entered, exited, rejections },
    createdAt: MOCK_NOW - intBetween(rng, 2, 20) * 24 * HOUR,
    updatedAt: MOCK_NOW - intBetween(rng, 1, 600) * MIN,
  };
});

// ---------------------------------------------------------------------------
// Coins + trails
// ---------------------------------------------------------------------------

const symbols = ["ORBIT", "MOCHI", "KELP", "ZAPP", "BREW", "PIXL", "NOVA", "TIDE", "GLUM", "FROG2", "SPRK", "WAVY", "LUMA", "DUSK", "QUILL", "BASIL", "COBALT", "JUNO"];
const launchpads = ["pump.fun", "LaunchLab", "Meteora DBC", "Moonshot"];

const checkLabels: Record<string, string> = {
  liquidity: "Liquidity below minimum",
  volume_24h: "24h volume too low",
  age: "Too old for strategy window",
  top10_share: "Top-10 holders too concentrated",
  dev_share: "Dev wallet holds too much",
  bundled_launch: "Bundled launch detected",
};

function checksFor(passing: boolean): CheckResult[] {
  const failIdx = passing ? -1 : intBetween(rng, 0, 5);
  const f = (i: number) => i === failIdx;
  const liq = f(0) ? intBetween(rng, 2, 7) : intBetween(rng, 9, 80);
  const vol = f(1) ? intBetween(rng, 5, 28) : intBetween(rng, 40, 900);
  const age = f(2) ? intBetween(rng, 70, 200) : intBetween(rng, 3, 50);
  const top10 = f(3) ? intBetween(rng, 34, 60) : intBetween(rng, 12, 29);
  const dev = f(4) ? round(between(rng, 6, 15), 1) : round(between(rng, 0, 4.9), 1);
  const bundled = f(5) ? "heavy" : pick(rng, ["none", "minor"]);
  return [
    { name: "liquidity", hard: true, passed: !f(0), measured: `$${liq}k`, threshold: "≥ $8k" },
    { name: "volume_24h", hard: true, passed: !f(1), measured: `$${vol}k`, threshold: "≥ $30k" },
    { name: "age", hard: true, passed: !f(2), measured: `${age} min`, threshold: "≤ 60 min" },
    { name: "top10_share", hard: false, passed: !f(3), measured: `${top10}%`, threshold: "≤ 30%" },
    { name: "dev_share", hard: false, passed: !f(4), measured: `${dev}%`, threshold: "≤ 5%" },
    { name: "bundled_launch", hard: false, passed: !f(5), measured: bundled, threshold: "none/minor" },
  ];
}

const TRAIL_EXIT_REASONS: ExitReason[] = ["profit_target", "loss_guard", "peak_trail", "max_hold", "idle", "sell_pressure", "rug_detected", "manual"];
const exitRanges: Partial<Record<ExitReason, [number, number]>> = {
  profit_target: [20, 120], loss_guard: [-40, -12], peak_trail: [-15, 40], max_hold: [-20, 10],
  idle: [-25, 5], sell_pressure: [-45, -10], rug_detected: [-95, -70], manual: [-20, 30],
};

/** Piecewise path through anchor prices with noise, ~1 point / 5 s. */
function pricePath(anchors: { t: number; p: number }[]): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const steps = Math.max(2, Math.round((b.t - a.t) / 5000));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const base = a.p + (b.p - a.p) * f;
      const noise = k === 0 ? 0 : base * between(rng, -0.04, 0.04);
      out.push({ t: Math.round(a.t + (b.t - a.t) * f), priceUsd: base + noise });
    }
  }
  const last = anchors[anchors.length - 1];
  out.push({ t: last.t, priceUsd: last.p });
  return out;
}

function buildTrail(i: number, strat: Strategy) {
  const mint = fakeMint(rng);
  const symbol = symbols[i % symbols.length];
  const start = MOCK_NOW - intBetween(rng, 5, 360) * MIN;
  const st = strat.settings;
  const coin: CoinMeta = {
    mint,
    untrusted: { symbol, name: `${symbol.charAt(0)}${symbol.slice(1).toLowerCase()} Token` },
    launchpad: pick(rng, launchpads),
    venue: pick(rng, st.screener.streams),
    createdAt: start - intBetween(rng, 1, 40) * MIN,
    // Deterministic (no extra rng draws, so the seeded data stays stable). Mixes 6/9 decimals and Token-2022.
    decimals: i % 3 === 0 ? 9 : 6,
    tokenProgram: i % 4 === 1 ? TOKEN_2022 : SPL_TOKEN,
    quoteMint: null,
    tradeable: true,
    skipReason: null,
  };
  const outcome = i % 7 === 5 ? "rejected" : i % 7 === 6 ? "watching" : i % 5 === 3 ? "open" : "closed";
  const key = `pk_${mint.slice(0, 8).toLowerCase()}`;
  const events: TradeEvent[] = [];
  let t = start;
  const ev = (kind: TradeEvent["kind"], actor: TradeEvent["actor"], message: string, extra: Partial<TradeEvent> = {}) => {
    t += intBetween(rng, 3, 60) * 1000;
    events.push({ id: `${key}:${t}:${kind}`, seq: String(t * 10 + (events.length % 10)), ts: t, kind, actor, strategyId: strat.id, mint, symbol, message, rev: strat.rev, ...extra });
    return t;
  };
  const p0 = round(between(rng, 0.00002, 0.002), 7);
  const anchors: { t: number; p: number }[] = [{ t: start, p: p0 }];
  const passMark = st.screener.passMark;
  const passing = outcome !== "rejected";
  const scoreValue = passing ? intBetween(rng, passMark + 2, passMark + 40) : intBetween(rng, 30, passMark - 5);
  const checks = checksFor(passing);
  ev("found", "screener", `Found on ${coin.launchpad}`, { reason: `${coin.venue} venue` });
  if (!passing) {
    const failed = checks.find((c) => !c.passed);
    ev("blocked", failed && ["liquidity", "volume_24h", "age"].includes(failed.name) ? "screener" : "guard", `Blocked ${symbol}`, {
      reason: `fit ${scoreValue}/${passMark} · ${failed ? checkLabels[failed.name] : "below pass mark"}`,
      checks,
    });
  } else {
    ev("passed", "screener", `Passed ${symbol} fit ${scoreValue}/${passMark}`, { reason: `${checks.filter((c) => c.passed).length} of ${checks.length} rules`, checks });
    ev("passed", "guard", `Guard ${st.guard.preset}: all checks passed`, { reason: `dev ≤ ${st.guard.maxDevPercent}% · bundlers ≤ ${st.guard.maxBundlersPct}%` });
    ev("armed", "entry", `Armed ${symbol}`, { reason: st.entry.dipPct ? `waiting for −${st.entry.dipPct}% dip` : "buy at market" });
  }
  anchors.push({ t: t + 1000, p: p0 * between(rng, 0.95, 1.15) });
  const positions: Position[] = [];
  let status: CoinSummary["status"] = outcome === "rejected" ? "rejected" : "watching";
  let pnlSol: number | undefined;
  if (outcome === "open" || outcome === "closed") {
    const solIn = st.sizing.tradeSol;
    const entryPrice = round(anchors[anchors.length - 1].p * (1 - st.entry.dipPct / 100), 8);
    if (st.approvalMode !== "off") {
      ev("proposal", "entry", `Proposal: buy ${solIn} SOL`, { reason: st.approvalMode === "ask_first_buy" ? "first buy for this coin" : "ask on every buy", solAmount: solIn });
      ev("approved", "user", `You approved ${symbol}`);
    }
    const openedAt = ev("bought", "executor", `Bought ${symbol} ${solIn} SOL`, { reason: `dip −${st.entry.dipPct}% reached`, solAmount: solIn, priceUsd: entryPrice });
    anchors.push({ t: openedAt, p: entryPrice });
    const peak = round(between(rng, 3, 140), 1);
    let solOut = 0;
    const tp1 = st.exit.takeProfits[0];
    if (tp1 && peak > tp1.gainPct && rng() > 0.3) {
      const part = round(solIn * (tp1.sellPct / 100) * (1 + tp1.gainPct / 100), 4);
      solOut += part;
      const pTp = entryPrice * (1 + tp1.gainPct / 100);
      const tt = ev("sold", "exit", `Sold ${tp1.sellPct}% ${symbol} +${tp1.gainPct}%`, { reason: "take-profit rung 1", partial: true, solAmount: part, pctChange: tp1.gainPct, priceUsd: pTp, exitReason: "profit_target" });
      anchors.push({ t: tt, p: pTp });
    }
    if (outcome === "closed") {
      const reason: ExitReason = pick(rng, TRAIL_EXIT_REASONS);
      const finalPct = between(rng, ...exitRanges[reason]!);
      const remaining = solIn - (solOut > 0 ? solIn * (tp1!.sellPct / 100) : 0);
      const out = round(remaining * (1 + finalPct / 100), 4);
      solOut = round(solOut + out, 4);
      const pnl = round(solOut - solIn - solIn * 0.0125, 4);
      const pExit = entryPrice * (1 + finalPct / 100);
      const closedAt = ev("sold", "exit", `Sold ${symbol} ${finalPct >= 0 ? "+" : "−"}${Math.abs(finalPct).toFixed(0)}%`, {
        reason: reasonText(reason, st),
        pnlSol: pnl,
        exitReason: reason,
        solAmount: out,
        pctChange: round(finalPct, 1),
        priceUsd: pExit,
      });
      anchors.push({ t: closedAt, p: pExit });
      anchors.push({ t: closedAt + 90_000, p: pExit * between(rng, 0.85, 1.1) });
      positions.push({
        key: `${key}.0`, strategyId: strat.id, mint, status: "closed", entryPriceUsd: entryPrice, exitPriceUsd: round(pExit, 8),
        solIn, solOut, peakGainPct: peak, feeBps: 125, openedAt, closedAt, exitReason: reason, pnlSol: pnl, pnlPct: round((pnl / solIn) * 100, 1),
      });
      status = "closed";
      pnlSol = pnl;
    } else {
      const unrealPct = between(rng, -20, 35);
      const unreal = round(solIn * (unrealPct / 100), 4);
      anchors.push({ t: t + 120_000, p: entryPrice * (1 + unrealPct / 100) });
      positions.push({ key: `${key}.0`, strategyId: strat.id, mint, status: "open", entryPriceUsd: entryPrice, solIn, solOut, peakGainPct: peak, feeBps: 125, openedAt, pnlSol: unreal, pnlPct: round(unrealPct, 1) });
      status = "open";
      pnlSol = unreal;
    }
  } else {
    anchors.push({ t: t + 120_000, p: p0 * between(rng, 0.7, 1.4) });
  }
  const mcap = mockMcap(mint, coin.decimals, t);
  const trail: CoinTrail = { mcap, coin, strategyId: strat.id, strategyName: strat.name, mode: strat.mode, score: { value: scoreValue, passMark }, positions, events, prices: pricePath(anchors) };
  const summary: CoinSummary = { mint, symbol, strategyId: strat.id, strategyName: strat.name, mode: strat.mode, lastEventAt: t, status, pnlSol, mcap };
  return { trail, summary };
}

function reasonText(r: ExitReason, st: StrategySettings): string {
  switch (r) {
    case "profit_target": return "final take-profit rung";
    case "loss_guard": return `hard stop −${st.exit.stopLossPct}% from entry`;
    case "peak_trail": return `trailing stop ${st.exit.trailingPct}% below high`;
    case "max_hold": return `time stop ${st.exit.timeStopMinutes || 10} min`;
    case "idle": return `no trades for ${Math.round(st.exit.noTradeSeconds / 60)} min`;
    case "sell_pressure": return `sell_pressure: −${st.exit.drainDropPct}% with sells > buys`;
    case "rug_detected": return "liquidity pulled";
    case "manual": return "you closed it";
    default: return r.replace("_", " ");
  }
}

const active = seedStrategies.filter((x) => x.status === "running" || x.status === "paused");
const practiceActive = active.filter((x) => x.mode === "practice");
const realActive = active.filter((x) => x.mode === "real");
const built = [
  ...Array.from({ length: 14 }, (_, i) => buildTrail(i, practiceActive[i % practiceActive.length])),
  // Real seeds only exist when the dev-only Real demo is enabled; otherwise every seed runs in Paper.
  ...(realActive.length
    ? Array.from({ length: 5 }, (_, i) => buildTrail(14 + i, realActive[i % realActive.length]))
    : []),
];
// One rejected coin per mode is quoted in a non-SOL mint → screener state UNSUPPORTED_QUOTE_MINT ("Not tradeable").
for (const mode of ["practice", "real"] as const) {
  const b = built.find((x) => x.trail.mode === mode && x.summary.status === "rejected");
  const ev = b?.trail.events.find((e) => e.kind === "blocked");
  if (b) {
    // Wire truth (1.1.2): tradeable:false + skip_reason; the UI state is derived from it, never set directly.
    Object.assign(b.trail.coin, { tradeable: false, skipReason: "UNSUPPORTED_QUOTE_MINT", quoteMint: USDC_MINT });
    const state = screenerStateOf({ tradeable: false, skip_reason: "UNSUPPORTED_QUOTE_MINT" });
    Object.assign(b.trail, { screenerState: state, quoteSymbol: "USDC" });
    b.summary.screenerState = state;
  }
  if (ev) Object.assign(ev, { actor: "screener", reasonCode: "UNSUPPORTED_QUOTE_MINT", reason: "quote mint is not SOL", message: `Blocked ${ev.symbol}`, checks: undefined });
}
export const NOT_TRADEABLE_MINTS = new Set(built.filter((b) => b.trail.events.some((e) => e.reasonCode === "UNSUPPORTED_QUOTE_MINT")).map((b) => b.trail.coin.mint));
export const trails: CoinTrail[] = built.map((b) => b.trail);
/**
 * contracts 1.1.4 market cap (mock of backend common::mcap): deterministic per mint, SOL first, USD from the same
 * reference SOL price as the marks (MOCK_SOL_USD). null when decimals are unknown (never assumed).
 */
function mockMcap(mint: string, decimals: number | null, at: number): CoinSummary["mcap"] {
  if (decimals == null) return { lamports: null, usd: null, asOf: null };
  const h = [...mint].reduce((x, c) => (x * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const sol = 60 + (h % 40_000); // 60 – 40 060 SOL
  return { lamports: (BigInt(sol) * 1_000_000_000n).toString(), usd: String(sol * MOCK_SOL_USD), asOf: at - (h % 50_000) };
}

export const coinSummaries: CoinSummary[] = built.map((b) => b.summary).sort((a, b) => b.lastEventAt - a.lastEventAt);
export const recentEvents: TradeEvent[] = trails.flatMap((t) => t.events).sort((a, b) => b.ts - a.ts);

// ---------------------------------------------------------------------------
// Closed-trade ledger = SINGLE SOURCE for strategy trades/wins/realized PnL,
// the overview's realized PnL and exit stats (they reconcile exactly per mode).
// Backend equivalent: positions(closed) → portfolio_snapshots + /stats/exits.
// ---------------------------------------------------------------------------

const reasonProfile: Record<ExitReason, { weight: number; win: number; pct: [number, number]; hold: [number, number] }> = {
  profit_target: { weight: 22, win: 0.95, pct: [10, 45], hold: [40, 900] },
  loss_guard: { weight: 18, win: 0.02, pct: [-40, -12], hold: [20, 600] },
  peak_trail: { weight: 30, win: 0.42, pct: [-20, 45], hold: [8, 1200] },
  max_hold: { weight: 12, win: 0.3, pct: [-15, 12], hold: [600, 1200] },
  idle: { weight: 8, win: 0.2, pct: [-25, 8], hold: [300, 900] },
  sell_pressure: { weight: 5, win: 0.05, pct: [-45, -10], hold: [60, 400] },
  no_new_high: { weight: 3, win: 0.35, pct: [-10, 15], hold: [200, 900] },
  rug_detected: { weight: 3, win: 0, pct: [-98, -70], hold: [10, 300] },
  sell_floor: { weight: 1, win: 0.1, pct: [-30, 5], hold: [30, 600] },
  drawdown_halt: { weight: 1, win: 0, pct: [-35, -5], hold: [60, 1200] },
  manual: { weight: 4, win: 0.5, pct: [-20, 30], hold: [60, 3000] },
  strategy_retired: { weight: 0, win: 0.5, pct: [-10, 10], hold: [60, 600] },
  practice_reset: { weight: 0, win: 0.5, pct: [-10, 10], hold: [60, 600] },
  // contracts 1.1.4 stall_exit (exit_reason stall); max_hold also covers time_stop_s.
  stall: { weight: 4, win: 0.3, pct: [-8, 8], hold: [120, 900] },
};
const weightedReasons: ExitReason[] = EXIT_REASONS.flatMap((r) => Array.from({ length: reasonProfile[r].weight }, () => r));

export interface ClosedTrade {
  id: string;
  strategyId: string;
  mode: TradingMode;
  reason: ExitReason;
  closedAt: number;
  pnlPct: number;
  pnlSol: number;
  holdSeconds: number;
  /** Report ledger join (the backend reads these from coins/position_wire). */
  mint: string;
  symbol: string;
  logoHash: string | null;
  solInSol: number;
  solOutSol: number;
  /** Swap + network fees, reported context only (never subtracted twice). */
  feesSol: number;
}

const ledgerFromTrails: ClosedTrade[] = trails.flatMap((t) =>
  t.positions
    .filter((p) => p.status === "closed" && p.closedAt && p.exitReason)
    .map((p) => ({
      id: p.key, strategyId: p.strategyId, mode: t.mode, reason: p.exitReason!, closedAt: p.closedAt!,
      pnlPct: p.pnlPct, pnlSol: p.pnlSol, holdSeconds: Math.round((p.closedAt! - p.openedAt) / 1000),
      mint: t.coin.mint, symbol: t.coin.untrusted.symbol, logoHash: t.coin.logoHash ?? null,
      solInSol: p.solIn, solOutSol: p.solOut, feesSol: round((p.solIn + p.solOut) * 0.0125, 6),
    })),
);

export const closedTrades: ClosedTrade[] = [...ledgerFromTrails];
for (const strat of seedStrategies) {
  if (strat.status === "draft") continue;
  const have = ledgerFromTrails.filter((x) => x.strategyId === strat.id).length;
  const need = Math.max(0, strat.funnel.exited - have);
  // A synthetic close still needs a coin surface for the ledger: prefer a coin the strategy screened,
  // then any coin in the mode. Deterministic (seeded) so screenshots and tests stay stable.
  const own = coinSummaries.filter((c) => c.strategyId === strat.id);
  const pool = own.length ? own : coinSummaries.filter((c) => c.mode === strat.mode);
  for (let k = 0; k < need; k++) {
    const reason = pick(rng, weightedReasons);
    const p = reasonProfile[reason];
    const isWin = rng() < p.win;
    const pct = round(isWin ? between(rng, Math.max(1, p.pct[0]), Math.max(2, p.pct[1])) : between(rng, p.pct[0], Math.min(-0.5, p.pct[1])), 1);
    const solIn = strat.settings.sizing.tradeSol;
    const pnlSol = round((solIn * pct) / 100, 4);
    const solOut = round(solIn + pnlSol, 6);
    const coin = pool.length ? pool[k % pool.length] : coinSummaries[k % coinSummaries.length];
    closedTrades.push({
      id: `${strat.id}.h${k}`, strategyId: strat.id, mode: strat.mode, reason,
      closedAt: MOCK_NOW - intBetween(rng, 1, 7 * 24 * 60) * MIN,
      pnlPct: pct, pnlSol, holdSeconds: intBetween(rng, p.hold[0], p.hold[1]),
      mint: coin.mint, symbol: coin.symbol, logoHash: coin.logoHash ?? null,
      solInSol: solIn, solOutSol: solOut, feesSol: round((solIn + solOut) * 0.0125, 6),
    });
  }
}
closedTrades.sort((a, b) => a.closedAt - b.closedAt);

// Derive per-strategy stats from the ledger (overview + strategy table read these).
for (const strat of seedStrategies) {
  const rows = closedTrades.filter((x) => x.strategyId === strat.id);
  if (strat.status === "draft") continue;
  strat.trades = rows.length;
  strat.wins = rows.filter((r) => r.pnlSol > 0).length;
  strat.realizedPnlSol = round(rows.reduce((a, r) => a + r.pnlSol, 0), 4);
  strat.avgHoldSeconds = rows.length ? Math.round(rows.reduce((a, r) => a + r.holdSeconds, 0) / rows.length) : 0;
  strat.funnel.exited = rows.length;
  strat.funnel.entered = Math.max(strat.funnel.entered, rows.length + strat.openPositions);
  // Sparkline = cumulative realized PnL in 24 buckets; max drawdown from the same curve.
  const spark: number[] = [];
  let acc = 0, peak = 0, dd = 0;
  const per = Math.max(1, Math.ceil(rows.length / 24));
  rows.forEach((r, i) => {
    acc += r.pnlSol;
    peak = Math.max(peak, acc);
    dd = Math.max(dd, peak - acc);
    if ((i + 1) % per === 0 || i === rows.length - 1) spark.push(round(acc, 4));
  });
  strat.pnlSpark = spark;
  const capital = strat.settings.sizing.budgetSol;
  strat.maxDrawdownPct = round(Math.min(99, (dd / capital) * 100), 1);
}

/** Back-compat name used by the mock API. */
export const exitSamples = closedTrades;

export function computeExitStats(samples: ClosedTrade[]): ExitReasonStat[] {
  return EXIT_REASONS.map((reason) => {
    const rows = samples.filter((x) => x.reason === reason);
    const count = rows.length;
    const wins = rows.filter((r) => r.pnlSol > 0).length;
    const total = rows.reduce((a, r) => a + r.pnlSol, 0);
    return {
      reason, count, wins,
      winRate: count ? wins / count : 0,
      avgPnlSol: count ? round(total / count, 4) : 0,
      avgPnlPct: count ? round(rows.reduce((a, r) => a + r.pnlPct, 0) / count, 1) : 0,
      totalPnlSol: round(total, 4),
      avgHoldSeconds: count ? Math.round(rows.reduce((a, r) => a + r.holdSeconds, 0) / count) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Overview (per mode). Pending counts are filled in from the live store.
// ---------------------------------------------------------------------------

const alertsByMode: Record<TradingMode, Alert[]> = {
  practice: [
    { id: "al_2", severity: "warning", title: "Screener idle on Dip Catcher v2", detail: "No coins checked in the last 45 minutes — strategy is paused.", createdAt: MOCK_NOW - 45 * MIN, href: "/strategies", strategyId: "str_003" },
    { id: "al_3", severity: "warning", title: "Trailing stops exiting very early", detail: "11 of the last 20 trailing-stop exits closed under 15 s after entry.", createdAt: MOCK_NOW - 2 * HOUR, href: "/stats" },
  ],
  real: [
    { id: "al_r1", severity: "critical", title: "Loss stop at 82% of limit", detail: "Conservative is down 24.6% from its peak (stop at 30%). New buys halt at the limit.", createdAt: MOCK_NOW - 12 * MIN, href: "/strategies", strategyId: "str_007" },
    { id: "al_r2", severity: "info", title: "Mock build: no wallet connected", detail: "Real SOL screens show simulated numbers only. No transaction can be sent from this build.", createdAt: MOCK_NOW - 60 * MIN },
  ],
};

/** 72h equity from the ledger: start + cumulative realized (+ current unrealized at the last point). */
function equityCurve(mode: TradingMode, start: number, unrealized: number) {
  const rows = closedTrades.filter((x) => x.mode === mode);
  const pts = [];
  for (let h = 72; h >= 0; h--) {
    const t = MOCK_NOW - h * HOUR;
    const realized = rows.filter((r) => r.closedAt <= t).reduce((a, r) => a + r.pnlSol, 0);
    pts.push({ t, equitySol: round(start + realized + (h === 0 ? unrealized : 0), 3) });
  }
  return pts;
}

export function buildOverview(mode: TradingMode, strategies: Strategy[]): Omit<WorkspaceOverview, "pendingApprovals" | "expiringSoon"> {
  const list = strategies.filter((x) => x.mode === mode);
  const start = mode === "practice" ? 30 : 3;
  const realized = round(list.reduce((a, x) => a + x.realizedPnlSol, 0), 4);
  const running = list.filter((x) => x.status === "running");
  const inPositions = round(list.reduce((a, x) => a + x.openPositions * x.settings.sizing.tradeSol, 0), 3);
  return {
    id: `ws_${mode}`,
    name: mode === "practice" ? "Paper portfolio" : "Real portfolio",
    mode,
    walletConnected: false,
    startingCashSol: start,
    cashSol: round(start + realized - inPositions, 4),
    inPositionsSol: inPositions,
    realizedPnlSol: realized,
    unrealizedPnlSol: round(list.reduce((a, x) => a + x.unrealizedPnlSol, 0), 4),
    openPositions: list.reduce((a, x) => a + x.openPositions, 0),
    openPositionsCap: running.reduce((a, x) => a + x.settings.sizing.maxOpen, 0),
    runningStrategies: running.length,
    pausedStrategies: list.filter((x) => x.status === "paused").length,
    lossStopPct: mode === "practice" ? 50 : 30,
    drawdownPct: mode === "practice" ? 8.4 : 24.6,
    engine: { online: true, lastHeartbeatAt: MOCK_NOW - 4000, version: "0.0.0-mock" },
    equityCurve: equityCurve(mode, start, list.reduce((a, x) => a + x.unrealizedPnlSol, 0)),
    alerts: alertsByMode[mode],
    updatedAt: MOCK_NOW,
  };
}

export { EXIT_PRESETS };

// Dev assertion: exit stats and overview realized PnL come from the same ledger.
if (process.env.NODE_ENV !== "production") {
  for (const mode of ["practice", "real"] as const) {
    const statsTotal = round(computeExitStats(closedTrades.filter((x) => x.mode === mode)).reduce((a, r) => a + r.totalPnlSol, 0), 3);
    const overviewTotal = round(seedStrategies.filter((x) => x.mode === mode).reduce((a, x) => a + x.realizedPnlSol, 0), 3);
    console.assert(Math.abs(statsTotal - overviewTotal) < 0.002, `[mock] exit stats (${statsTotal}) ≠ overview realized (${overviewTotal}) for ${mode}`);
  }
}
