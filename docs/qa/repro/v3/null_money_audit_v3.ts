/**
 * BUG_HUNT_v3 - null-money audit of the web decoders/render helpers.
 *
 * Runs the REAL functions (no re-implementation) on the wire shapes the paper API sends and records
 * which null money values survive as null (em dash) and which are coerced to 0.
 *
 * Run from C:\cw\app:
 *   node --import ./apps/web/node_modules/tsx/dist/loader.mjs docs/qa/repro/v3/null_money_audit_v3.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exitStatFromWire, coinSummaryFromWire, positionFromWire, MOCK_SOL_USD } from "../../../../apps/web/lib/contracts.ts";
import { pnlReportFromSummary, pnlReport } from "../../../../apps/web/lib/pnl-report.ts";

const findings: Record<string, unknown> = {};

// ---------------------------------------------------------------------------------------------
// Preserved nulls (F1 class). These are the paths the render probes exercise.
// ---------------------------------------------------------------------------------------------
const coin = coinSummaryFromWire({
  mint: "m", venue: "amm", launchpad: null, decimals: null, token_program: null, quote_mint: null,
  tradeable: true, skip_reason: null, untrusted: {}, strategy_id: "s", strategy_name: "S", mode: "practice",
  status: "open", last_event_at: new Date().toISOString(), pnl_lamports: null,
} as never);
assert.equal(coin.pnlSol ?? null, null, "coin pnl missing must render as missing (the list guards with != null)");

const report = pnlReportFromSummary({ realizedPnlSol: null, unrealizedPnlSol: null, totalPnlSol: null, closedCount: 0, winCount: 0, winRatePct: null });
assert.deepEqual([report.realized, report.unrealized, report.total], [null, null, null]);

// ---------------------------------------------------------------------------------------------
// Coercions (documents CURRENT behavior; each entry is reported with file:line in BUG_HUNT_v3.md).
// ---------------------------------------------------------------------------------------------
// P3 contracts.ts:719-724 - a null aggregate becomes 0 instead of an em dash. Reachable when every
// closed row in that reason bucket has sol_in_lamports = 0 (SQL avg over NULL -> NULL).
const exit = exitStatFromWire({ exit_reason: "manual", count: 1, pnl_lamports: null, avg_pnl_pct: null, win_rate_pct: null, avg_hold_s: null } as never);
findings.exitStatFromWire = { totalPnlSol: exit.totalPnlSol, avgPnlSol: exit.avgPnlSol, avgPnlPct: exit.avgPnlPct, winRate: exit.winRate };
assert.deepEqual(findings.exitStatFromWire, { totalPnlSol: 0, avgPnlSol: 0, avgPnlPct: 0, winRate: 0 });

// P3 contracts.ts:700-701 - the positions board's USD entry/mark is derived from a hardcoded
// USD/SOL reference, not from any wire field (position_wire has no USD price).
const pos = positionFromWire({
  position_key: "p.1", strategy_id: "s", strategy_name: "S", mode: "practice", mint: "m", status: "open",
  rev: 1, sol_in_lamports: "500000000", avg_entry_price_sol: "0.000015", mark_price_sol: "0.000015",
  unrealized_pnl_lamports: "15000000", sold_bps: 0, decimals: 6, practice_epoch: 1, opened_at: new Date().toISOString(),
  untrusted: { symbol: "X" },
} as never);
findings.positionUsd = { entryPriceUsd: pos.entryPriceUsd, nowPriceUsd: pos.nowPriceUsd, mockSolUsd: MOCK_SOL_USD };
assert.equal(pos.entryPriceUsd, 0.000015 * MOCK_SOL_USD);

// Latent only: the dashboard's fallback card (used when GET /stats/pnl itself fails) coerces the
// nullable overview numbers; the primary path is pnlReportFromSummary, which keeps null.
const fallback = pnlReport({ realized: null as unknown as number, unrealized: null as unknown as number, openPositions: 0, trades: 0, wins: 0 });
findings.pnlReportFallback = { realized: fallback.realized, unrealized: fallback.unrealized, total: fallback.total };
assert.deepEqual(findings.pnlReportFallback, { realized: 0, unrealized: 0, total: 0 });

// P3 mock-only: the mock flips agent_trade_enabled with the buy pause; the real API keeps
// agent_settings.trade_enabled independent (http-api.ts tradingFromWire passes it through).
// Asserted on the source line (importing lib/mock pulls the Next-only "@/lib" alias, unavailable
// to plain node), so the script still runs from the repo root.
const mockTradingSrc = readFileSync(new URL("../../../../apps/web/lib/mock/trading.ts", import.meta.url), "utf8");
const mockLine = mockTradingSrc.split(/\r?\n/).findIndex((l) => l.includes("agentTradeEnabled: !paused")) + 1;
findings.mockAgentTrade = { line: mockLine, source: mockTradingSrc.split(/\r?\n/)[mockLine - 1]?.trim() };
assert.ok(mockLine > 0, "mock pause still couples agentTradeEnabled to the pause");

console.log(JSON.stringify({
  ok: true,
  preserved: ["coinSummaryFromWire.pnlSol (missing)", "pnlReportFromSummary.realized/unrealized/total"],
  findings,
  note: "Preserved-null rows are F1 PASS; the findings above are the audit defects/latent coercions listed in BUG_HUNT_v3.md.",
}, null, 2));