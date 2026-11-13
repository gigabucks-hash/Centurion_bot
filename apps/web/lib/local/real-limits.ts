/**
 * Real-money knobs for the local web app. Same rules and the same signed text as
 * `apps/desktop/src/real/limits.ts`. This module never sees a private key.
 *
 * Real-money knobs the owner sets, globally and per strategy.
 *
 * 0.05 SOL / trade, 0.5 SOL / day, 2 SOL cap and 3 positions are defaults only.
 * There is no policy ceiling on those amounts. Tightening applies at once.
 * Loosening applies only after the owner signs the exact old→new message
 * with their own wallet. This module never sees a private key.
 */

export interface TakeProfit {
  gainPct: number;
  sellPct: number;
}

export interface BuyFilters {
  minMcapUsd: number;
  /** null = no maximum */
  maxMcapUsd: number | null;
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  maxTop10Pct: number;
  minHolders: number;
  minAgeMinutes: number;
  /** null = no maximum */
  maxAgeMinutes: number | null;
  minLpBurnPct: number;
  maxPoolSharePct: number;
}

export interface RealKnobs {
  /** Lamports, integer string. */
  tradeLamports: string;
  dailyLamports: string;
  capLamports: string;
  maxPositions: number;
  slippageBps: number;
  priorityFeeLamports: string;
  tipLamports: string;
  takeProfits: TakeProfit[];
  /** 0 = off (no hard stop). Higher = wider = looser. */
  stopLossPct: number;
  /** 0 = off. Higher = wider trail = looser. */
  trailPct: number;
  /** 0 = off (hold forever). Higher or off = looser. */
  maxHoldMinutes: number;
  filters: BuyFilters;
}

export const DEFAULT_KNOBS: RealKnobs = {
  tradeLamports: "50000000",
  dailyLamports: "500000000",
  capLamports: "2000000000",
  maxPositions: 3,
  slippageBps: 300,
  priorityFeeLamports: "0",
  tipLamports: "0",
  takeProfits: [{ gainPct: 100, sellPct: 100 }],
  stopLossPct: 25,
  trailPct: 20,
  maxHoldMinutes: 0,
  filters: {
    minMcapUsd: 0,
    maxMcapUsd: null,
    minLiquidityUsd: 0,
    minVolume24hUsd: 0,
    maxTop10Pct: 100,
    minHolders: 0,
    minAgeMinutes: 0,
    maxAgeMinutes: null,
    minLpBurnPct: 0,
    maxPoolSharePct: 100,
  },
};

export type LimitChange = "same" | "tighten" | "loosen";

export interface FieldChange {
  field: string;
  old: string;
  new: string;
  kind: LimitChange;
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Decimal SOL text → lamports string. Rejects negatives, extra decimals, and values that do not fit u64. */
export function solToLamports(text: string): string | null {
  const s = text.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 9) return null;
  const lam = BigInt(whole) * LAMPORTS_PER_SOL + BigInt((frac + "000000000").slice(0, 9));
  if (lam > 0xffffffffffffffffn) return null;
  return lam.toString();
}

export function lamportsToSolInput(lamports: string): string {
  const n = BigInt(lamports);
  const whole = n / LAMPORTS_PER_SOL;
  const frac = (n % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function u64(s: string): bigint | null {
  if (!/^\d+$/.test(s)) return null;
  const n = BigInt(s);
  return n <= 0xffffffffffffffffn ? n : null;
}

function pctOk(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

export function validateKnobs(k: RealKnobs): string | null {
  if (u64(k.tradeLamports) == null || k.tradeLamports === "0") return "trade";
  if (u64(k.dailyLamports) == null) return "daily";
  if (u64(k.capLamports) == null) return "cap";
  if (!Number.isInteger(k.maxPositions) || k.maxPositions < 1) return "positions";
  if (!Number.isInteger(k.slippageBps) || k.slippageBps < 0 || k.slippageBps > 10_000) return "slippage";
  if (u64(k.priorityFeeLamports) == null) return "priority";
  if (u64(k.tipLamports) == null) return "tip";
  if (!pctOk(k.stopLossPct) || !pctOk(k.trailPct)) return "exit";
  if (!Number.isInteger(k.maxHoldMinutes) || k.maxHoldMinutes < 0) return "hold";
  if (k.takeProfits.length > 8) return "take_profits";
  for (const tp of k.takeProfits) {
    if (!Number.isInteger(tp.gainPct) || tp.gainPct < 1 || tp.gainPct > 100_000) return "take_profits";
    if (!pctOk(tp.sellPct) || tp.sellPct < 1) return "take_profits";
  }
  const f = k.filters;
  const nums = [f.minMcapUsd, f.minLiquidityUsd, f.minVolume24hUsd, f.minHolders, f.minAgeMinutes, f.minLpBurnPct];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return "filters";
  if (!pctOk(f.maxTop10Pct) || !pctOk(f.maxPoolSharePct) || !pctOk(f.minLpBurnPct)) return "filters";
  if (f.maxMcapUsd != null && f.maxMcapUsd < f.minMcapUsd) return "filters";
  if (f.maxAgeMinutes != null && f.maxAgeMinutes < f.minAgeMinutes) return "filters";
  return null;
}

/** 0 means the protection is off, which is looser than any positive setting. */
function room(n: number): number {
  return n <= 0 ? Number.POSITIVE_INFINITY : n;
}

function cmpNum(oldN: number, newN: number, higherIsLooser: boolean): LimitChange {
  if (oldN === newN) return "same";
  const up = newN > oldN;
  return (up && higherIsLooser) || (!up && !higherIsLooser) ? "loosen" : "tighten";
}

function cmpBig(oldS: string, newS: string, higherIsLooser: boolean): LimitChange {
  const a = BigInt(oldS);
  const b = BigInt(newS);
  if (a === b) return "same";
  const up = b > a;
  return (up && higherIsLooser) || (!up && !higherIsLooser) ? "loosen" : "tighten";
}

function cmpRoom(oldN: number, newN: number): LimitChange {
  const a = room(oldN);
  const b = room(newN);
  if (a === b) return "same";
  return b > a ? "loosen" : "tighten";
}

function cmpMax(oldN: number | null, newN: number | null): LimitChange {
  if (oldN === newN) return "same";
  if (oldN == null) return "tighten";
  if (newN == null) return "loosen";
  return newN > oldN ? "loosen" : "tighten";
}

function tpText(list: TakeProfit[]): string {
  const rows = [...list].sort((a, b) => a.gainPct - b.gainPct || a.sellPct - b.sellPct);
  return JSON.stringify(rows.map((r) => ({ gain_pct: r.gainPct, sell_pct: r.sellPct })));
}

function filtersText(f: BuyFilters): string {
  return JSON.stringify({
    max_age_minutes: f.maxAgeMinutes,
    max_mcap_usd: f.maxMcapUsd,
    max_pool_share_pct: f.maxPoolSharePct,
    max_top10_pct: f.maxTop10Pct,
    min_age_minutes: f.minAgeMinutes,
    min_holders: f.minHolders,
    min_liquidity_usd: f.minLiquidityUsd,
    min_lp_burn_pct: f.minLpBurnPct,
    min_mcap_usd: f.minMcapUsd,
    min_volume_24h_usd: f.minVolume24hUsd,
  });
}

function tpKind(oldL: TakeProfit[], newL: TakeProfit[]): LimitChange {
  if (tpText(oldL) === tpText(newL)) return "same";
  if (newL.length < oldL.length) return "loosen";
  let kind: LimitChange = "same";
  const n = Math.max(oldL.length, newL.length);
  for (let i = 0; i < n; i++) {
    const a = oldL[i];
    const b = newL[i];
    if (!a || !b) {
      kind = !a ? "tighten" : "loosen";
      if (kind === "loosen") return kind;
      continue;
    }
    if (b.gainPct > a.gainPct || b.sellPct < a.sellPct) return "loosen";
    if (b.gainPct < a.gainPct || b.sellPct > a.sellPct) kind = "tighten";
  }
  return kind === "same" ? "tighten" : kind;
}

function filterKind(a: BuyFilters, b: BuyFilters): LimitChange {
  const parts = [
    cmpNum(a.minMcapUsd, b.minMcapUsd, false),
    cmpMax(a.maxMcapUsd, b.maxMcapUsd),
    cmpNum(a.minLiquidityUsd, b.minLiquidityUsd, false),
    cmpNum(a.minVolume24hUsd, b.minVolume24hUsd, false),
    cmpNum(a.maxTop10Pct, b.maxTop10Pct, true),
    cmpNum(a.minHolders, b.minHolders, false),
    cmpNum(a.minAgeMinutes, b.minAgeMinutes, false),
    cmpMax(a.maxAgeMinutes, b.maxAgeMinutes),
    cmpNum(a.minLpBurnPct, b.minLpBurnPct, false),
    cmpNum(a.maxPoolSharePct, b.maxPoolSharePct, true),
  ];
  if (parts.some((p) => p === "loosen")) return "loosen";
  if (parts.some((p) => p === "tighten")) return "tighten";
  return "same";
}

export function diffKnobs(oldK: RealKnobs, newK: RealKnobs): { kind: LimitChange; fields: FieldChange[] } {
  const rows: Array<[string, string, string, LimitChange]> = [
    ["trade_lamports", oldK.tradeLamports, newK.tradeLamports, cmpBig(oldK.tradeLamports, newK.tradeLamports, true)],
    ["daily_lamports", oldK.dailyLamports, newK.dailyLamports, cmpBig(oldK.dailyLamports, newK.dailyLamports, true)],
    ["cap_lamports", oldK.capLamports, newK.capLamports, cmpBig(oldK.capLamports, newK.capLamports, true)],
    ["max_positions", String(oldK.maxPositions), String(newK.maxPositions), cmpNum(oldK.maxPositions, newK.maxPositions, true)],
    ["slippage_bps", String(oldK.slippageBps), String(newK.slippageBps), cmpNum(oldK.slippageBps, newK.slippageBps, true)],
    ["priority_fee_lamports", oldK.priorityFeeLamports, newK.priorityFeeLamports, cmpBig(oldK.priorityFeeLamports, newK.priorityFeeLamports, true)],
    ["tip_lamports", oldK.tipLamports, newK.tipLamports, cmpBig(oldK.tipLamports, newK.tipLamports, true)],
    ["stop_loss_pct", String(oldK.stopLossPct), String(newK.stopLossPct), cmpRoom(oldK.stopLossPct, newK.stopLossPct)],
    ["trail_pct", String(oldK.trailPct), String(newK.trailPct), cmpRoom(oldK.trailPct, newK.trailPct)],
    ["max_hold_minutes", String(oldK.maxHoldMinutes), String(newK.maxHoldMinutes), cmpRoom(oldK.maxHoldMinutes, newK.maxHoldMinutes)],
    ["take_profits", tpText(oldK.takeProfits), tpText(newK.takeProfits), tpKind(oldK.takeProfits, newK.takeProfits)],
    ["filters", filtersText(oldK.filters), filtersText(newK.filters), filterKind(oldK.filters, newK.filters)],
  ];
  const fields = rows.filter((r) => r[3] !== "same" || r[1] !== r[2]).map(([field, old, next, kind]) => ({ field, old, new: next, kind }));
  const kind: LimitChange = fields.some((f) => f.kind === "loosen") ? "loosen" : fields.some((f) => f.kind === "tighten") ? "tighten" : "same";
  return { kind, fields };
}

/** Exact bytes the wallet signs. Both the dialog and the Rust checker build this string. */
export function limitsMessage(wallet: string, scope: string, oldK: RealKnobs, newK: RealKnobs): string {
  const d = diffKnobs(oldK, newK);
  const body = [
    ["trade_lamports", oldK.tradeLamports, newK.tradeLamports],
    ["daily_lamports", oldK.dailyLamports, newK.dailyLamports],
    ["cap_lamports", oldK.capLamports, newK.capLamports],
    ["max_positions", String(oldK.maxPositions), String(newK.maxPositions)],
    ["slippage_bps", String(oldK.slippageBps), String(newK.slippageBps)],
    ["priority_fee_lamports", oldK.priorityFeeLamports, newK.priorityFeeLamports],
    ["tip_lamports", oldK.tipLamports, newK.tipLamports],
    ["stop_loss_pct", String(oldK.stopLossPct), String(newK.stopLossPct)],
    ["trail_pct", String(oldK.trailPct), String(newK.trailPct)],
    ["max_hold_minutes", String(oldK.maxHoldMinutes), String(newK.maxHoldMinutes)],
    ["take_profits", tpText(oldK.takeProfits), tpText(newK.takeProfits)],
    ["filters", filtersText(oldK.filters), filtersText(newK.filters)],
  ].map(([name, a, b]) => `${name}: ${a} -> ${b}`).join("\n");
  return `Centurion Trade\naction: set-real-limits\nwallet: ${wallet}\nscope: ${scope}\n${body}\nkind: ${d.kind}\n`;
}

export function enableMessage(wallet: string): string {
  return `Centurion Trade\naction: enable-real\nwallet: ${wallet}\n`;
}

export type BuyRefuse =
  | "real_off"
  | "buys_paused"
  | "guard"
  | "risk"
  | "per_trade"
  | "daily"
  | "cap"
  | "positions"
  | "slippage"
  | "filter";

export interface BuyCheck {
  enabled: boolean;
  buysPaused: boolean;
  guardVerdict: string | null;
  /** Set when the risk manager already vetoed, independent of the numeric caps. */
  riskVeto: string | null;
  openPositions: number;
  spentTodayLamports: string;
  capitalUsedLamports: string;
  tradeLamports: string;
  slippageBps: number;
  mcapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  top10Pct: number | null;
  holders: number | null;
  ageMinutes: number | null;
  lpBurnPct: number | null;
}

export function admitBuy(k: RealKnobs, c: BuyCheck): BuyRefuse | null {
  if (!c.enabled) return "real_off";
  if (c.buysPaused) return "buys_paused";
  if ((c.guardVerdict ?? "").toLowerCase() !== "pass") return "guard";
  if (c.riskVeto) return "risk";
  const trade = u64(c.tradeLamports);
  const capTrade = u64(k.tradeLamports);
  const daily = u64(k.dailyLamports);
  const spent = u64(c.spentTodayLamports);
  const cap = u64(k.capLamports);
  const used = u64(c.capitalUsedLamports);
  if (trade == null || capTrade == null || trade > capTrade) return "per_trade";
  if (daily == null || spent == null || spent + trade > daily) return "daily";
  if (cap == null || used == null || used + trade > cap) return "cap";
  if (c.openPositions >= k.maxPositions) return "positions";
  if (c.slippageBps > k.slippageBps) return "slippage";
  const f = k.filters;
  if (c.mcapUsd != null && c.mcapUsd < f.minMcapUsd) return "filter";
  if (c.mcapUsd != null && f.maxMcapUsd != null && c.mcapUsd > f.maxMcapUsd) return "filter";
  if (c.liquidityUsd != null && c.liquidityUsd < f.minLiquidityUsd) return "filter";
  if (c.volume24hUsd != null && c.volume24hUsd < f.minVolume24hUsd) return "filter";
  if (c.top10Pct != null && c.top10Pct > f.maxTop10Pct) return "filter";
  if (c.holders != null && c.holders < f.minHolders) return "filter";
  if (c.ageMinutes != null && c.ageMinutes < f.minAgeMinutes) return "filter";
  if (c.ageMinutes != null && f.maxAgeMinutes != null && c.ageMinutes > f.maxAgeMinutes) return "filter";
  if (c.lpBurnPct != null && c.lpBurnPct < f.minLpBurnPct) return "filter";
  return null;
}

export function admitSell(enabled: boolean): "real_off" | null {
  return enabled ? null : "real_off";
}

/** https anywhere, or http only to this machine. No path, no userinfo. */
export interface RealStatus {
  enabled: boolean;
  wallet: string;
  rpc_url: string;
  global: WireKnobs;
  strategies: Record<string, WireKnobs>;
  buys_paused: boolean;
  real_strategies: string[];
}

export interface WireKnobs {
  trade_lamports: number;
  daily_lamports: number;
  cap_lamports: number;
  max_positions: number;
  slippage_bps: number;
  priority_fee_lamports: number;
  tip_lamports: number;
  take_profits: { gain_pct: number; sell_pct: number }[];
  stop_loss_pct: number;
  trail_pct: number;
  max_hold_minutes: number;
  filters: {
    min_mcap_usd: number;
    max_mcap_usd: number | null;
    min_liquidity_usd: number;
    min_volume_24h_usd: number;
    max_top10_pct: number;
    min_holders: number;
    min_age_minutes: number;
    max_age_minutes: number | null;
    min_lp_burn_pct: number;
    max_pool_share_pct: number;
  };
}

function asNum(lamports: string): number {
  if (lamports.length > 15) throw new Error("amount");
  return Number(lamports);
}

export function toWire(k: RealKnobs): WireKnobs {
  const f = k.filters;
  return {
    trade_lamports: asNum(k.tradeLamports),
    daily_lamports: asNum(k.dailyLamports),
    cap_lamports: asNum(k.capLamports),
    max_positions: k.maxPositions,
    slippage_bps: k.slippageBps,
    priority_fee_lamports: asNum(k.priorityFeeLamports),
    tip_lamports: asNum(k.tipLamports),
    take_profits: k.takeProfits.map((t) => ({ gain_pct: t.gainPct, sell_pct: t.sellPct })),
    stop_loss_pct: k.stopLossPct,
    trail_pct: k.trailPct,
    max_hold_minutes: k.maxHoldMinutes,
    filters: {
      min_mcap_usd: f.minMcapUsd,
      max_mcap_usd: f.maxMcapUsd,
      min_liquidity_usd: f.minLiquidityUsd,
      min_volume_24h_usd: f.minVolume24hUsd,
      max_top10_pct: f.maxTop10Pct,
      min_holders: f.minHolders,
      min_age_minutes: f.minAgeMinutes,
      max_age_minutes: f.maxAgeMinutes,
      min_lp_burn_pct: f.minLpBurnPct,
      max_pool_share_pct: f.maxPoolSharePct,
    },
  };
}

export function fromWire(k: WireKnobs): RealKnobs {
  const f = k.filters;
  return {
    tradeLamports: String(k.trade_lamports),
    dailyLamports: String(k.daily_lamports),
    capLamports: String(k.cap_lamports),
    maxPositions: k.max_positions,
    slippageBps: k.slippage_bps,
    priorityFeeLamports: String(k.priority_fee_lamports),
    tipLamports: String(k.tip_lamports),
    takeProfits: k.take_profits.map((t) => ({ gainPct: t.gain_pct, sellPct: t.sell_pct })),
    stopLossPct: k.stop_loss_pct,
    trailPct: k.trail_pct,
    maxHoldMinutes: k.max_hold_minutes,
    filters: {
      minMcapUsd: f.min_mcap_usd,
      maxMcapUsd: f.max_mcap_usd,
      minLiquidityUsd: f.min_liquidity_usd,
      minVolume24hUsd: f.min_volume_24h_usd,
      maxTop10Pct: f.max_top10_pct,
      minHolders: f.min_holders,
      minAgeMinutes: f.min_age_minutes,
      maxAgeMinutes: f.max_age_minutes,
      minLpBurnPct: f.min_lp_burn_pct,
      maxPoolSharePct: f.max_pool_share_pct,
    },
  };
}

export function rpcUrlOk(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.username || u.password || u.search || u.hash) return false;
  if (u.pathname !== "" && u.pathname !== "/") return false;
  if (u.protocol === "https:") return true;
  if (u.protocol !== "http:") return false;
  return u.hostname === "127.0.0.1" || u.hostname === "localhost";
}
