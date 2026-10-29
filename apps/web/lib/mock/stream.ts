/** Synthetic live-event generator used by the mock SSE route (/api/v1/workspaces/{ws}/events/stream). */
import type { EventKind, ExitReason, TradeEvent, TradingMode } from "@/lib/types";
import { coinSummaries, seedStrategies } from "./data";
import { between, mulberry32, pick, round } from "./rng";

const templates: Array<{ kind: EventKind; actor: TradeEvent["actor"]; weight: number }> = [
  { kind: "found", actor: "screener", weight: 6 },
  { kind: "blocked", actor: "guard", weight: 4 },
  { kind: "passed", actor: "screener", weight: 2 },
  { kind: "armed", actor: "entry", weight: 2 },
  { kind: "expired", actor: "system", weight: 1 },
  { kind: "bought", actor: "executor", weight: 1 },
  { kind: "sold", actor: "exit", weight: 2 },
];
const bag = templates.flatMap((t) => Array.from({ length: t.weight }, () => t));

export function createEventGenerator(mode: TradingMode, seed = Date.now()) {
  const rng = mulberry32(seed);
  const coins = coinSummaries.filter((c) => c.mode === mode);
  let seq = 0;
  return function next(ts = Date.now()): TradeEvent {
    const tpl = pick(rng, bag);
    const coin = pick(rng, coins);
    const strat = seedStrategies.find((s) => s.id === coin.strategyId)!;
    const base = { seq: String(ts * 10 + (seq % 10)), ts, kind: tpl.kind, actor: tpl.actor, strategyId: strat.id, mint: coin.mint, symbol: coin.symbol, rev: strat.rev };
    const n = seq++;
    const id = `live_${n}:${ts}:${tpl.kind}`;
    const sym = coin.symbol;
    switch (tpl.kind) {
      case "found":
        return { ...base, id, message: `Found ${sym}`, reason: `${pick(rng, ["curve", "amm"])} venue` };
      case "blocked":
        return { ...base, id, message: `Blocked ${sym}`, reason: pick(rng, ["bundlers 31% > limit 20%", "dev share 9% > 5%", "liquidity $4k < $8k", "top-10 44% > 30%"]) };
      case "passed":
        return { ...base, id, message: `Passed ${sym} fit ${Math.round(between(rng, 70, 115))}/70`, reason: "7 of 7 hard rules" };
      case "armed":
        return { ...base, id, message: `Armed ${sym}`, reason: `waiting for −${Math.round(between(rng, 3, 12))}% dip` };
      case "expired":
        return { ...base, id, message: `Expired ${sym}`, reason: `ran +${Math.round(between(rng, 12, 40))}% past its pick` };
      case "bought": {
        const sol = strat.settings.sizing.tradeSol;
        return { ...base, id, solAmount: sol, message: `Bought ${sym} ${sol} SOL`, reason: "dip reached" };
      }
      default: {
        // Sign-consistent: the % in the title, pnlSol and the exit reason always agree.
        const reason: ExitReason = pick(rng, ["profit_target", "loss_guard", "peak_trail", "max_hold", "sell_pressure", "manual"] as ExitReason[]);
        const range: Record<string, [number, number]> = { profit_target: [15, 60], loss_guard: [-35, -10], peak_trail: [-12, 35], max_hold: [-15, 10], sell_pressure: [-40, -10], manual: [-20, 30] };
        const pct = round(between(rng, ...range[reason]), 0);
        const pnl = round((strat.settings.sizing.tradeSol * pct) / 100, 4);
        return { ...base, id, pnlSol: pnl, pctChange: pct, exitReason: reason, message: `Sold ${sym} ${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, reason: reason.replace("_", " ") };
      }
    }
  };
}
