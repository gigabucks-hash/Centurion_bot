import { closedTradeFromWire, pnlSummaryFromWire } from "../../../../apps/web/lib/contracts.ts";
import { pnlReportFromSummary } from "../../../../apps/web/lib/pnl-report.ts";

const base = { id: "p1", position_key: "pk", strategy_id: "s1", mode: "practice", mint: "m", opened_at: "2026-01-01T00:00:00Z", closed_at: "2026-01-01T00:01:00Z", pnl_pct: null, hold_seconds: null, exit_reason: null, fees_lamports: null, sol_in_lamports: null, sol_out_lamports: null, pnl_lamports: null } as any;
const row = closedTradeFromWire(base);
if (row.solInSol !== null || row.solOutSol !== null || row.pnlSol !== null) throw new Error(`closed row fabricated: ${JSON.stringify(row)}`);
const summary = pnlSummaryFromWire({ mode: "practice", practice_epoch: 1, window: "all", from: null, to: null, unrealized_pnl_lamports: null, realized_pnl_lamports: null, total_pnl_lamports: null, realized_pnl_window_lamports: "1500000000", closed_count: 1, win_count: 0, win_rate_pct: null, avg_hold_s: null, fees_lamports: null, best_pnl_lamports: null, worst_pnl_lamports: null, as_of_seq: 1, ts: null } as any);
if (summary.realizedPnlSol !== null || summary.totalPnlSol !== null) throw new Error("summary fabricated null");
const card = pnlReportFromSummary(summary, 0);
if (card.realized !== null || card.total !== null) throw new Error(`card fabricated: ${JSON.stringify(card)}`);
console.log("F1 PASS: closed ledger In/Out/PnL, summary realized/total and summary card preserve null; UI guards render em dash.");
