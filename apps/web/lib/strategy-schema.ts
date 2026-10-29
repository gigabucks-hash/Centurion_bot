/**
 * Strategy settings schema (frontend copy). Ranges mirror the blueprint's
 * reference keys; the backend `get_reference`-equivalent endpoint will replace
 * these constants. Also hosts presets, validation and the before/after diff
 * that decides whether a change WEAKENS a guard (UX SPEC §3, guard weakening).
 */
import type {
  DiffDirection,
  ExitPlanPreset,
  GuardCheck,
  GuardPreset,
  MustHaveRule,
  SettingsDiffRow,
  StrategySettings,
  TakeProfitRung,
} from "@/lib/types";
import type { MessageKey, T, Vars } from "@/lib/i18n";

export type StepId = "screener" | "guard" | "entry" | "exit" | "review";
export const STEPS: { id: StepId; label: string }[] = [
  { id: "screener", label: "Screener" },
  { id: "guard", label: "Guards" },
  { id: "entry", label: "Entry" },
  { id: "exit", label: "Exit plan" },
  { id: "review", label: "Review & sim" },
];

export interface NumberField {
  path: string;
  label: string;
  step: StepId;
  unit?: string;
  min: number;
  max: number;
  inc?: number;
  /** Guard semantics: raising a "max" threshold or lowering a "min" one loosens the filter. */
  guard?: "max" | "min";
}

export const NUMBER_FIELDS: NumberField[] = [
  { path: "sizing.budgetSol", label: "Budget", step: "entry", unit: "SOL", min: 0.1, max: 1000, inc: 0.1 },
  { path: "sizing.tradeSol", label: "Per trade", step: "entry", unit: "SOL", min: 0.01, max: 100, inc: 0.01 },
  { path: "sizing.maxOpen", label: "Max open", step: "entry", min: 1, max: 20 },
  { path: "sizing.lossStopPct", label: "Loss stop", step: "entry", unit: "%", min: 5, max: 90 },
  { path: "screener.minAgeMinutes", label: "Min age", step: "screener", unit: "min", min: 0, max: 10080, guard: "min" },
  { path: "screener.maxAgeMinutes", label: "Max age", step: "screener", unit: "min", min: 1, max: 10080, guard: "max" },
  { path: "screener.minMarketCapUsd", label: "Min market cap", step: "screener", unit: "USD", min: 0, max: 1e9, inc: 1000, guard: "min" },
  { path: "screener.maxMarketCapUsd", label: "Max market cap", step: "screener", unit: "USD", min: 1000, max: 1e10, inc: 1000, guard: "max" },
  { path: "screener.minLiquidityUsd", label: "Min liquidity", step: "screener", unit: "USD", min: 0, max: 1e8, inc: 500, guard: "min" },
  { path: "screener.minVolume24hUsd", label: "Min volume 24h", step: "screener", unit: "USD", min: 0, max: 1e9, inc: 1000, guard: "min" },
  { path: "screener.minHolders", label: "Min holders", step: "screener", min: 0, max: 100000, guard: "min" },
  { path: "screener.minBuyers1h", label: "Min buyers 1h", step: "screener", min: 0, max: 10000, guard: "min" },
  { path: "screener.minBuySellRatio", label: "Min buy/sell ratio", step: "screener", min: 0, max: 20, inc: 0.1, guard: "min" },
  { path: "screener.maxTop10Percent", label: "Max top-10 share", step: "screener", unit: "%", min: 1, max: 100, guard: "max" },
  { path: "screener.minLpBurnPct", label: "Min LP burned", step: "screener", unit: "%", min: 0, max: 100, guard: "min" },
  { path: "screener.maxDrawdownPct", label: "Max drop from high", step: "screener", unit: "%", min: 1, max: 100, guard: "max" },
  { path: "screener.passMark", label: "Pass mark", step: "screener", unit: "pts", min: 50, max: 125, guard: "min" },
  { path: "guard.maxDevPercent", label: "Max dev share", step: "guard", unit: "%", min: 0, max: 100, guard: "max" },
  { path: "guard.maxBundlersPct", label: "Max bundlers share", step: "guard", unit: "%", min: 0, max: 100, guard: "max" },
  { path: "guard.maxSnipersPct", label: "Max snipers share", step: "guard", unit: "%", min: 0, max: 100, guard: "max" },
  { path: "entry.dipPct", label: "Wait for dip", step: "entry", unit: "%", min: 0, max: 50 },
  { path: "entry.entryDelayMinutes", label: "Watch before buy", step: "entry", unit: "min", min: 0, max: 60 },
  { path: "entry.entryMaxUpPct", label: "Skip if already up", step: "entry", unit: "%", min: 0, max: 500 },
  { path: "exit.trailingPct", label: "Trailing stop from high", step: "exit", unit: "%", min: 0, max: 49 },
  { path: "exit.stopLossPct", label: "Hard stop loss from entry", step: "exit", unit: "%", min: 5, max: 49 },
  { path: "exit.timeStopMinutes", label: "Time stop", step: "exit", unit: "min", min: 0, max: 1440 },
  { path: "exit.noTradeSeconds", label: "No-trade exit", step: "exit", unit: "s", min: 5, max: 3600 },
  { path: "exit.drainDropPct", label: "Drain: drop", step: "exit", unit: "%", min: 1, max: 90 },
];
export const fieldByPath = Object.fromEntries(NUMBER_FIELDS.map((f) => [f.path, f]));

export const GUARD_CHECKS: { id: GuardCheck; label: string }[] = [
  { id: "bundlers", label: "Bundled buys" },
  { id: "devDump", label: "Dev dumping" },
  { id: "snipers", label: "Sniper clusters" },
  { id: "washTrading", label: "Wash trading" },
  { id: "layeredLaunch", label: "Layered launch" },
  { id: "serialCreator", label: "Serial creator" },
  { id: "transferFee", label: "Transfer fee token" },
  { id: "insiderProfit", label: "Insider profit taking" },
];
export const MUST_HAVE: { id: MustHaveRule; label: string }[] = [
  { id: "liquidity", label: "Liquidity" },
  { id: "volume", label: "Volume" },
  { id: "marketCap", label: "Market cap" },
  { id: "age", label: "Age" },
  { id: "top10", label: "Top-10" },
  { id: "lpBurn", label: "LP burn" },
];

export const GUARD_PRESETS: Record<Exclude<GuardPreset, "custom">, { label: string; maxDevPercent: number; maxBundlersPct: number; maxSnipersPct: number; allChecks: boolean }> = {
  strict: { label: "Strict", maxDevPercent: 3, maxBundlersPct: 10, maxSnipersPct: 8, allChecks: true },
  balanced: { label: "Balanced", maxDevPercent: 5, maxBundlersPct: 20, maxSnipersPct: 15, allChecks: true },
  loose: { label: "Loose", maxDevPercent: 10, maxBundlersPct: 35, maxSnipersPct: 25, allChecks: false },
};

/** Original exit-plan presets (names are ours). */
export const EXIT_PRESETS: Record<Exclude<ExitPlanPreset, "custom">, { label: string; takeProfits: TakeProfitRung[]; trailingPct: number; timeStopMinutes: number; stallExit: boolean }> = {
  ladder3: { label: "Ladder 3-rung", takeProfits: [{ gainPct: 50, sellPct: 33 }, { gainPct: 100, sellPct: 33 }, { gainPct: 200, sellPct: 34, pullbackPct: 15 }], trailingPct: 20, timeStopMinutes: 30, stallExit: false },
  trailOnly: { label: "Trailing only", takeProfits: [], trailingPct: 15, timeStopMinutes: 0, stallExit: false },
  quickScalp: { label: "Quick scalp", takeProfits: [{ gainPct: 20, sellPct: 50 }, { gainPct: 40, sellPct: 50 }], trailingPct: 8, timeStopMinutes: 5, stallExit: true },
  doubling: { label: "Doubling", takeProfits: [{ gainPct: 100, sellPct: 33 }, { gainPct: 300, sellPct: 33 }, { gainPct: 700, sellPct: 34 }], trailingPct: 25, timeStopMinutes: 60, stallExit: false },
};

const allChecks = (on: boolean): Record<GuardCheck, boolean> =>
  Object.fromEntries(GUARD_CHECKS.map((c) => [c.id, on || ["bundlers", "devDump"].includes(c.id)])) as Record<GuardCheck, boolean>;

export function blankSettings(): StrategySettings {
  return {
    name: "New strategy",
    mode: "practice",
    approvalMode: "ask_first_buy",
    sizing: { budgetSol: 3, tradeSol: 0.25, maxOpen: 5, lossStopPct: 50 },
    screener: {
      streams: ["bonding"],
      minAgeMinutes: 2,
      maxAgeMinutes: 60,
      minMarketCapUsd: 20000,
      maxMarketCapUsd: 2000000,
      minLiquidityUsd: 8000,
      minVolume24hUsd: 30000,
      minHolders: 80,
      minBuyers1h: 20,
      minBuySellRatio: 1.1,
      maxTop10Percent: 30,
      minLpBurnPct: 90,
      maxDrawdownPct: 40,
      mustHave: ["liquidity", "volume", "age"],
      passMark: 70,
    },
    guard: { preset: "balanced", maxDevPercent: 5, maxBundlersPct: 20, maxSnipersPct: 15, checks: allChecks(true) },
    entry: {
      dipPct: 6,
      entryDelayMinutes: 0,
      entryMaxUpPct: 40,
      breakout: { enabled: false, minutes: 12, rangePct: 15, buyers: 6 },
      activeTrading: true,
      rebuy: false,
      tradingHoursUtc: { enabled: false, from: 0, to: 23 },
    },
    exit: { plan: "ladder3", ...structuredClone(EXIT_PRESETS.ladder3), stopLossPct: 30, noTradeSeconds: 300, drainDropPct: 25 },
  };
}

export type StrategyPresetId = "conservative" | "balanced" | "scalper" | "graduated";
export const STRATEGY_PRESETS: { id: StrategyPresetId; label: string; blurb: string; build: () => StrategySettings }[] = [
  { id: "conservative", label: "Conservative", blurb: "Strict guards, older coins, ladder exits", build: () => applyGuardPreset({ ...blankSettings(), name: "Conservative", screener: { ...blankSettings().screener, minAgeMinutes: 10, passMark: 85, minLiquidityUsd: 15000 } }, "strict") },
  { id: "balanced", label: "Balanced", blurb: "Default filters, ask before first buy", build: () => ({ ...blankSettings(), name: "Balanced" }) },
  { id: "scalper", label: "Scalper", blurb: "Fresh bonding coins, quick scalp exits", build: () => applyExitPreset({ ...blankSettings(), name: "Scalper", sizing: { budgetSol: 2, tradeSol: 0.1, maxOpen: 8, lossStopPct: 40 } }, "quickScalp") },
  { id: "graduated", label: "Graduated", blurb: "Graduated pools only, trailing exits", build: () => applyExitPreset({ ...blankSettings(), name: "Graduated", screener: { ...blankSettings().screener, streams: ["graduated"], maxAgeMinutes: 1440 } }, "trailOnly") },
];

export function applyGuardPreset(s: StrategySettings, p: Exclude<GuardPreset, "custom">): StrategySettings {
  const g = GUARD_PRESETS[p];
  return { ...s, guard: { preset: p, maxDevPercent: g.maxDevPercent, maxBundlersPct: g.maxBundlersPct, maxSnipersPct: g.maxSnipersPct, checks: allChecks(g.allChecks) } };
}

export function applyExitPreset(s: StrategySettings, p: ExitPlanPreset): StrategySettings {
  if (p === "custom") return { ...s, exit: { ...s.exit, plan: "custom" } };
  const e = structuredClone(EXIT_PRESETS[p]);
  return { ...s, exit: { ...s.exit, plan: p, takeProfits: e.takeProfits, trailingPct: e.trailingPct, timeStopMinutes: e.timeStopMinutes, stallExit: e.stallExit } };
}

// ---------------------------------------------------------------------------
// get/set by path
// ---------------------------------------------------------------------------

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const clone = structuredClone(obj) as Record<string, unknown>;
  const keys = path.split(".");
  let cur = clone;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[keys[keys.length - 1]] = value;
  return clone as T;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validation messages are i18n keys + params; render with t(msg.key, msg.vars). */
export type Msg = { key: MessageKey; vars?: Vars };
export type Errors = Record<string, Msg>;
const m = (key: MessageKey, vars?: Vars): Msg => ({ key, vars });

export function validate(s: StrategySettings): Errors {
  const e: Errors = {};
  for (const f of NUMBER_FIELDS) {
    const v = getPath(s, f.path);
    if (typeof v !== "number" || Number.isNaN(v)) e[f.path] = m("err.required");
    else if (v < f.min || v > f.max) e[f.path] = m("err.range", { min: f.min, max: f.max, unit: f.unit ? ` ${f.unit}` : "" });
  }
  if (!s.name.trim()) e["name"] = m("err.nameRequired");
  else if (s.name.length > 60) e["name"] = m("err.nameMax");
  if (s.screener.streams.length === 0) e["screener.streams"] = m("err.streams");
  if (s.screener.minAgeMinutes >= s.screener.maxAgeMinutes) e["screener.maxAgeMinutes"] = m("err.ageOrder");
  if (s.screener.minMarketCapUsd >= s.screener.maxMarketCapUsd) e["screener.maxMarketCapUsd"] = m("err.mcapOrder");
  if (s.sizing.tradeSol > s.sizing.budgetSol) e["sizing.tradeSol"] = m("err.tradeGtBudget");
  if (s.exit.takeProfits.length > 8) e["exit.takeProfits"] = m("err.maxRungs");
  const totalSell = s.exit.takeProfits.reduce((a, r) => a + (r.sellPct || 0), 0);
  if (totalSell > 100) e["exit.takeProfits"] = m("err.totalSell", { n: totalSell });
  s.exit.takeProfits.forEach((r, i) => {
    if (!(r.gainPct > 0)) e[`exit.takeProfits.${i}.gainPct`] = m("err.gainPos");
    if (!(r.sellPct > 0 && r.sellPct <= 100)) e[`exit.takeProfits.${i}.sellPct`] = m("err.sellRange");
    if (i > 0 && r.gainPct <= s.exit.takeProfits[i - 1].gainPct) e[`exit.takeProfits.${i}.gainPct`] = m("err.gainOrder");
    if (r.pullbackPct != null && (r.pullbackPct < 1 || r.pullbackPct > 90)) e[`exit.takeProfits.${i}.pullbackPct`] = m("err.pullbackRange");
  });
  if (s.mode === "real" && s.approvalMode === "off") e["approvalMode"] = m("err.realOff");
  return e;
}

export function stepStatus(errors: Errors, step: StepId, weakened: boolean): "valid" | "error" | "weakened" {
  const has = Object.keys(errors).some((p) => {
    const f = fieldByPath[p];
    if (f) return f.step === step;
    if (p.startsWith("exit.")) return step === "exit";
    if (p.startsWith("screener.")) return step === "screener";
    if (p === "approvalMode" || p.startsWith("sizing.")) return step === "entry";
    if (p === "name") return step === "review";
    return false;
  });
  if (has) return "error";
  return weakened ? "weakened" : "valid";
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

const fmt = (v: unknown, unit?: string) => (v == null || v === "" ? "—" : `${typeof v === "number" ? v.toLocaleString("id-ID") : String(v)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`);

export function diffSettings(before: StrategySettings, after: StrategySettings): SettingsDiffRow[] {
  const rows: SettingsDiffRow[] = [];
  const push = (key: string, label: string, b: string, a: string, direction: DiffDirection) => {
    if (b !== a) rows.push({ key, label, before: b, after: a, direction });
  };
  if (before.name !== after.name) push("name", "Name", before.name, after.name, "neutral");
  if (before.approvalMode !== after.approvalMode) {
    const order = { off: 0, ask_first_buy: 1, ask_every_buy: 2 } as const;
    push("approvalMode", "Approval mode", before.approvalMode, after.approvalMode, order[after.approvalMode] < order[before.approvalMode] ? "weakens" : "strengthens");
  }
  for (const f of NUMBER_FIELDS) {
    const b = getPath(before, f.path) as number;
    const a = getPath(after, f.path) as number;
    if (b === a) continue;
    let dir: DiffDirection = "neutral";
    if (f.guard === "max") dir = a > b ? "weakens" : "strengthens";
    if (f.guard === "min") dir = a < b ? "weakens" : "strengthens";
    push(f.path, f.label, fmt(b, f.unit), fmt(a, f.unit), dir);
  }
  for (const c of GUARD_CHECKS) {
    const b = before.guard.checks[c.id];
    const a = after.guard.checks[c.id];
    if (b !== a) push(`guard.checks.${c.id}`, `Check: ${c.label}`, b ? "on" : "off", a ? "on" : "off", a ? "strengthens" : "weakens");
  }
  for (const m of MUST_HAVE) {
    const b = before.screener.mustHave.includes(m.id);
    const a = after.screener.mustHave.includes(m.id);
    if (b !== a) push(`screener.mustHave.${m.id}`, `Must-have: ${m.label}`, b ? "hard" : "weighted", a ? "hard" : "weighted", a ? "strengthens" : "weakens");
  }
  if (before.screener.streams.join() !== after.screener.streams.join())
    push("screener.streams", "Streams", before.screener.streams.join(", "), after.screener.streams.join(", "), "neutral");
  if (before.exit.plan !== after.exit.plan) push("exit.plan", "Exit plan", before.exit.plan, after.exit.plan, "neutral");
  const n = Math.max(before.exit.takeProfits.length, after.exit.takeProfits.length);
  for (let i = 0; i < n; i++) {
    const b = before.exit.takeProfits[i];
    const a = after.exit.takeProfits[i];
    const s = (r?: TakeProfitRung) => (r ? `+${r.gainPct}% · ${r.sellPct}%${r.pullbackPct ? ` · pb ${r.pullbackPct}%` : ""}` : "—");
    push(`exit.tp[${i + 1}]`, `Take-profit rung ${i + 1}`, s(b), s(a), !b ? "new" : "neutral");
  }
  if (before.exit.stallExit !== after.exit.stallExit) push("exit.stallExit", "Stall exit", String(before.exit.stallExit), String(after.exit.stallExit), "neutral");
  return rows;
}

export const weakensGuard = (rows: SettingsDiffRow[]) => rows.some((r) => r.direction === "weakens");

// ---------------------------------------------------------------------------
// i18n helpers (labels above stay as English fallbacks for server-built data)
// ---------------------------------------------------------------------------

/** Localized label for a settings path / diff row key. */
export function settingLabel(t: T, key: string, fallback?: string): string {
  let mm: RegExpMatchArray | null;
  if ((mm = key.match(/^guard\.checks\.(\w+)$/))) return t("diff.check", { label: t(`check.${mm[1]}` as MessageKey) });
  if ((mm = key.match(/^screener\.mustHave\.(\w+)$/))) return t("diff.mustHave", { label: t(`mustHave.${mm[1]}` as MessageKey) });
  if ((mm = key.match(/^exit\.tp\[(\d+)\]$/))) return t("diff.rung", { n: mm[1] });
  const k = `field.${key}` as MessageKey;
  const v = t(k);
  return v === k ? (fallback ?? key) : v;
}
