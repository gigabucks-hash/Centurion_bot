// Repro for BUG_HUNT_v1 F1: /pnl prints "0.00" for an all-time realized the server did
// not report (null), because page.tsx coalesces it with `?? 0` before formatting.
//
// Expressions are copied verbatim from apps/web/app/(app)/pnl/page.tsx:85 and :140 at HEAD 77a10e3.
// Run:  node --experimental-strip-types docs/qa/repro/pnl_null_realized_repro.ts
//       (from C:\cw\app\apps\web so the two imports resolve; see the note in the file)
import { sameLamports } from "../../../apps/web/lib/pnl-report.ts";
import { formatSol } from "../../../packages/i18n/format.mjs";

// Shape of GET /stats/pnl for a workspace whose portfolio snapshot does not exist yet
// (portfolio_latest has no row -> realized_pnl_lamports = null) but with one closed trade
// (pnl_summary() -> realized_pnl_window_lamports = "1500000000", closed_count = 1).
const summary = {
  realizedPnlSol: null as number | null,
  realizedWindowSol: 1.5 as number | null,
  closedCount: 1,
};

// page.tsx:85
const reconciled = summary.realizedWindowSol != null && sameLamports(summary.realizedWindowSol, summary.realizedPnlSol ?? 0);
const botName = null; // no ?strategy=
const showReconcile = !botName && !reconciled;

// page.tsx:140, practice mode, EN locale, f.sol(v, { unit:false })
const allTimeText = formatSol(summary.realizedPnlSol ?? 0, "en", { paper: true }).replace(/\u00A0(paper )?SOL$/, "");

console.log("reconciled        =", reconciled);
console.log("showReconcile     =", showReconcile);
console.log("server realized   =", summary.realizedPnlSol);
console.log("note all-time text=", allTimeText, " <-- prints a flat 0 the server never sent");
