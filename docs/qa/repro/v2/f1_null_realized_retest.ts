// BUG_HUNT_v2 — retest F1 at main 97faf0a.
// F1: when GET /stats/pnl reports the all-time realized as null (no portfolio snapshot), the /pnl
// reconciliation note must not print a flat `0.00` for it.
//
// The expressions below are copied from apps/web/app/(app)/pnl/page.tsx at 97faf0a:
//   const reconciled = summary.realizedWindowSol != null && sameLamports(summary.realizedWindowSol, summary.realizedPnlSol ?? 0);
//   const showReconcile = !botName && !reconciled;
//   t("pnl.reconcile", { all: f.sol(summary.realizedPnlSol ?? 0), range: ... })
// with the real sameLamports and the real package formatter.
//
// Run from C:\cw\app:
//   node --experimental-strip-types docs/qa/repro/v2/f1_null_realized_retest.ts
import { sameLamports } from "../../../../apps/web/lib/pnl-report.ts";
import { formatSol } from "../../../../packages/i18n/format.mjs";

// GET /stats/pnl for a workspace with one current-epoch close but no portfolio snapshot:
// realized_pnl_lamports = null, realized_pnl_window_lamports = "1500000000", closed_count = 1.
const summary = {
  realizedPnlSol: null as number | null,
  realizedWindowSol: 1.5,
  closedCount: 1,
};
const botName = null;

const reconciled =
  summary.realizedWindowSol != null && sameLamports(summary.realizedWindowSol, summary.realizedPnlSol ?? 0);
const showReconcile = !botName && !reconciled;
const allTimeText = formatSol(summary.realizedPnlSol ?? 0, "en", { paper: true }).replace(/\u00A0(paper )?SOL$/, "");

console.log("server realized   =", summary.realizedPnlSol);
console.log("range realized    =", summary.realizedWindowSol);
console.log("showReconcile     =", showReconcile);
console.log("note all-time text=", allTimeText);

const fixed = !showReconcile || allTimeText !== "0.00";
console.log(fixed ? "\nF1 RETEST: FIXED (no fabricated 0.00)" : "\nF1 RETEST: NOT FIXED (note still prints a flat 0.00 for a null server value)");
process.exitCode = fixed ? 0 : 1;