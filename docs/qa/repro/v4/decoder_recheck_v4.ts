/**
 * BUG_HUNT_v4 - decoder/render-helper recheck of the v3 null-money findings.
 *
 * Exercises the real web helpers (no re-implementation) at the current tree:
 *   - positionFromWire: USD stays unknown (NaN), SOL mark is exposed for realtime scaling
 *   - applyMark: realtime marks rescale from the SOL mark without inventing USD
 *   - exitStatFromWire: documents the one v3 coercion that is still present (latent P3)
 *   - mock pause: the mock no longer flips agent_trade_enabled (source invariant)
 *
 * Run from the repo root:
 *   node --import ./apps/web/node_modules/tsx/dist/loader.mjs docs/qa/repro/v4/decoder_recheck_v4.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exitStatFromWire, positionFromWire } from "../../../../apps/web/lib/contracts.ts";
import { applyMark } from "../../../../apps/web/lib/marks.ts";

const findings: Record<string, unknown> = {};

const wire = {
  position_key: "p.1", strategy_id: "s", strategy_name: "S", mode: "practice", mint: "M",
  status: "open", rev: 1, sol_in_lamports: "500000000", avg_entry_price_sol: "0.000015",
  mark_price_sol: "0.000015000000000000", unrealized_pnl_lamports: "15000000", pnl_pct: 3,
  sold_bps: 0, decimals: 6, practice_epoch: 1, opened_at: new Date().toISOString(),
  untrusted: { symbol: "X" },
} as never;

const pos = positionFromWire(wire);
findings.positionFromWire = { entryPriceUsd: pos.entryPriceUsd, nowPriceUsd: pos.nowPriceUsd, nowPriceSol: pos.nowPriceSol, pnlSol: pos.pnlSol, markUnknown: pos.markUnknown ?? null };
assert.equal(Number.isNaN(pos.entryPriceUsd), true, "no USD entry price is invented");
assert.equal(Number.isNaN(pos.nowPriceUsd), true, "no USD mark is invented");
assert.equal(pos.nowPriceSol, 0.000015, "the SOL mark is exposed for realtime scaling");
assert.equal(pos.pnlSol, 0.015);
assert.equal(pos.markUnknown, undefined);

const scaled = applyMark(pos, { mint: "M", price_sol: "0.00003", price_usd: "0.5", ts: Date.now() } as never);
findings.applyMark = { nowPriceSol: scaled.nowPriceSol, nowPriceUsd: scaled.nowPriceUsd, pnlSol: scaled.pnlSol, pnlPct: scaled.pnlPct };
assert.equal(scaled.nowPriceSol, 0.00003, "the live SOL mark replaces the snapshot mark");
assert.equal(Number.isNaN(scaled.nowPriceUsd), true, "a live mark does not invent a USD price");
assert.equal(scaled.pnlSol, 0.53, "0.5 SOL at +3% doubled by the 2x SOL mark ratio");
assert.equal(scaled.pnlPct, 106);

const unknown = positionFromWire({ ...(wire as object), mark_price_sol: null, unrealized_pnl_lamports: null, pnl_pct: null } as never);
findings.unknownMark = { markUnknown: unknown.markUnknown, pnlSol: unknown.pnlSol };
assert.equal(unknown.markUnknown, true, "missing mark+PnL still renders an em dash");

const exit = exitStatFromWire({ exit_reason: "manual", count: 1, pnl_lamports: null, avg_pnl_pct: null, win_rate_pct: 0, avg_hold_s: null } as never);
findings.exitStatStillCoerces = { totalPnlSol: exit.totalPnlSol, avgPnlSol: exit.avgPnlSol, avgPnlPct: exit.avgPnlPct, winRate: exit.winRate };
assert.deepEqual(findings.exitStatStillCoerces, { totalPnlSol: 0, avgPnlSol: 0, avgPnlPct: 0, winRate: 0 }, "documents the remaining latent P3");

const mockSrc = readFileSync(new URL("../../../../apps/web/lib/mock/trading.ts", import.meta.url), "utf8");
findings.mockPause = { stillCouplesAgentTrade: /agentTradeEnabled\s*:\s*!paused/.test(mockSrc) };
assert.equal(findings.mockPause.stillCouplesAgentTrade, false, "mock pause no longer flips agent_trade_enabled");

console.log(JSON.stringify({
  ok: true,
  fixed: [
    "positionFromWire: USD unknown (NaN), nowPriceSol exposed",
    "applyMark: SOL mark scaling, no synthetic USD",
    "mock pause: agent_trade_enabled untouched",
  ],
  remaining: ["exitStatFromWire still maps null aggregates to 0 (latent P3, zero-entry bucket)"],
  findings,
}, null, 2));
