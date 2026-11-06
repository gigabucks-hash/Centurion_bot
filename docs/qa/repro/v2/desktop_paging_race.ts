// BUG_HUNT_v2 — N3 (P3): the desktop PnL dialog merges an in-flight `loadMore` page for the OLD
// range into the NEW range's ledger.
//
// PnlReportDialog.tsx:
//   - the range effect (65-88) replaces `data` and is guarded only by `live` for the report fetch;
//   - `loadMore` (149-164) captures `sum`/`data.next_cursor` from the render that started it and
//     then applies `setData((d) => d ? {...d, closed: [...d.closed, ...page.items], ...} : d)`;
//   - the range tabs (281) are NOT disabled while `more` is true.
// So: click "Load more" on 7d -> click "30d" -> the 7d page lands after the 30d page and its rows
// and cursor are appended to the 30d ledger.
//
// There is no DOM test environment in apps/desktop (no jsdom / @testing-library), so this is an
// EXPRESSION-LEVEL repro: the real `pnlPageArgs` decides the page range, then the two-line updater
// is copied verbatim from the dialog. It proves the merge result, not the click sequence.
//
// Run from C:\cw\app:
//   node --experimental-strip-types docs/qa/repro/v2/desktop_paging_race.ts
import { readFileSync } from "node:fs";
import { pnlPageArgs } from "../../../../apps/desktop/src/components/pnlReportView.ts";
import type { ClosedTradeView, PnlReportView } from "../../../../apps/desktop/src/api/contract.ts";

const row = (id: string) => ({ id }) as ClosedTradeView;
let fail = 0;
const check = (ok: boolean, label: string, extra = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
};

const src = readFileSync(
  new URL("../../../../apps/desktop/src/components/PnlReportDialog.tsx", import.meta.url),
  "utf8",
);

// The dialog renders these ranges; 1h is API-only.
const PNL_RANGES = ["24h", "7d", "30d", "all"] as const;
const sumA = { window: "7d" as const, from: "2026-10-30T03:00:00.000Z", to: null };
const sumB = { window: "30d" as const, from: "2026-10-07T03:00:00.000Z", to: null };

// 1. The in-flight page is requested with the OLD summary -> old absolute range (F4 freeze works).
const args = pnlPageArgs(sumA, "cursor-7d");
check(
  args.from === sumA.from && args.to === sumA.to && args.window === null,
  "in-flight page keeps the 7d absolute range",
  JSON.stringify(args),
);

// 2. The range effect has already replaced `data` with the 30d first page.
let data: PnlReportView = {
  summary: { ...sumB } as PnlReportView["summary"],
  closed: [row("r30d-1")],
  next_cursor: "cursor-30d",
  exit_stats: [],
};

// 3. The 7d page lands; updater copied verbatim from PnlReportDialog.tsx:156-158.
const page = { items: [row("r7d-1"), row("r7d-2")], next_cursor: "cursor-7d-2" };
data = data ? { ...data, closed: [...data.closed, ...page.items], next_cursor: page.next_cursor } : data;

const observed = { items: data.closed.map((r) => r.id), nextCursor: data.next_cursor };
// Printed before the assertion so a failing run shows the mixed ledger.
// ignore: avoid_print
console.log(`after stale page: ${JSON.stringify(observed)}`);
check(
  JSON.stringify(observed) === JSON.stringify({ items: ["r30d-1"], nextCursor: "cursor-30d" }),
  "the 30d ledger is unchanged by the stale 7d page",
  JSON.stringify(observed),
);

// 4. The source really is the pattern above (no generation guard, tabs enabled during `more`).
check(
  src.includes("closed: [...d.closed, ...page.items], next_cursor: page.next_cursor"),
  "loadMore still appends without an epoch check",
);
check(/setMore\(true\)/.test(src) && !/disabled=\{more \|\| loading\}/.test(src), "range tabs stay clickable while `more`");
check(
  /<button key=\{r\} role="tab" aria-selected=\{range === r\}[^>]*onClick=\{\(\) => setRange\(r\)\}/.test(src) &&
    !/<button key=\{r\}[^>]*disabled/.test(src),
  "range tab button has no disabled attribute",
);

console.log(
  fail === 0
    ? "\nDESKTOP PAGING RACE: not reproduced"
    : `\nDESKTOP PAGING RACE: BUG PRESENT (${fail} check(s) failed; expression-level, no DOM harness)`,
);
process.exitCode = fail === 0 ? 0 : 1;
