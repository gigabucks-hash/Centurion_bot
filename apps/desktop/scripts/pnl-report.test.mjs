// Desktop PnL report: exact lamports, range/all-time reconciliation, null stats, sorting and the
// closed ledger's logo path. `npm run test:ui` (node --test; Node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCAL_TEMPLATES } from "../src/i18n/local.ts";
import { PNL_RANGES, entryExitText, pnlReconciles, pnlTotal, sortClosed } from "../src/components/pnlReportView.ts";

const src = readFileSync(new URL("../src/components/PnlReportDialog.tsx", import.meta.url), "utf8");
const args = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();

test("report ranges are the UX four, 24h first, default 7d", () => {
  assert.deepEqual([...PNL_RANGES], ["24h", "7d", "30d", "all"]);
  assert.match(src, /useState<PnlWindow>\("7d"\)/);
});

test("total is exact: server value wins, fallback is BigInt (never Number)", () => {
  const big = "9007199254740993"; // 2^53 + 1: Number would round it
  assert.equal(pnlTotal({ total_pnl_lamports: big, realized_pnl_lamports: "1", unrealized_pnl_lamports: "1" }), big);
  assert.equal(
    pnlTotal({ total_pnl_lamports: null, realized_pnl_lamports: big, unrealized_pnl_lamports: "-9007199254740992" }),
    "1",
  );
  assert.equal(pnlTotal({ total_pnl_lamports: null, realized_pnl_lamports: null, unrealized_pnl_lamports: "1" }), null);
  assert.equal(pnlTotal({ total_pnl_lamports: null, realized_pnl_lamports: "1", unrealized_pnl_lamports: null }), null);
});

test("reconciliation flags an inconsistent server total instead of hiding it", () => {
  const ok = { total_pnl_lamports: "30", realized_pnl_lamports: "20", unrealized_pnl_lamports: "10" };
  assert.equal(pnlReconciles(ok), true);
  assert.equal(pnlReconciles({ ...ok, total_pnl_lamports: "31" }), false);
  assert.equal(pnlReconciles({ ...ok, total_pnl_lamports: null }), true, "fallback total is the exact sum");
  assert.equal(pnlReconciles({ ...ok, realized_pnl_lamports: null }), null);
});

const row = (id, pnl, pct, hold, closed) => ({
  id,
  position_key: `k-${id}`,
  mint: `mint-${id}`,
  logo_hash: null,
  exit_reason: "manual",
  closed_at: closed,
  sol_out_lamports: "1",
  pnl_lamports: pnl,
  pnl_pct: pct,
  hold_seconds: hold,
});

test("ledger sort: newest close first by default, null values last, stable on ties", () => {
  const rows = [
    row("a", "5", 1, 10, "2026-11-05T10:00:00.000Z"),
    row("b", "-2", -2, null, "2026-11-05T11:00:00.000Z"),
    row("c", "9007199254740993", null, 20, "2026-11-04T10:00:00.000Z"),
    row("d", null, null, null, null),
  ];
  assert.deepEqual(sortClosed(rows, "closed", "desc").map((r) => r.id), ["b", "a", "c", "d"]);
  assert.deepEqual(sortClosed(rows, "closed", "asc").map((r) => r.id), ["c", "a", "b", "d"]);
  assert.deepEqual(sortClosed(rows, "pnl", "desc").map((r) => r.id), ["c", "a", "b", "d"]);
  assert.deepEqual(sortClosed(rows, "pnl", "asc").map((r) => r.id), ["b", "a", "c", "d"]);
  assert.deepEqual(sortClosed(rows, "pct", "desc").map((r) => r.id), ["a", "b", "c", "d"]);
  assert.deepEqual(sortClosed(rows, "pct", "asc").map((r) => r.id), ["b", "a", "c", "d"]);
  assert.deepEqual(sortClosed(rows, "hold", "asc").map((r) => r.id), ["a", "c", "b", "d"]);
  const ties = [row("x", "1", 0, 1, null), row("y", "1", 0, 1, null)];
  assert.deepEqual(sortClosed(ties, "pnl", "desc").map((r) => r.id), ["x", "y"], "equal values keep server order");
});

test("null stats stay null (no fake 0 % and no 0s hold)", () => {
  assert.match(src, /sum\.win_rate_pct\), t\("pnl\.report\.closed_count"/);
  assert.match(src, /pctText\(sum\.win_rate_pct\)/);
  assert.match(src, /holdText\(sum\.avg_hold_s, t\)/);
  assert.match(src, /return "—";/, "holdText(null) renders an em dash");
  assert.match(src, /if \(pct == null\) return "—"/);
  assert.match(src, /x\.avg_hold_s == null \? "—"/);
});

test("every ledger row keeps its logo (avatar 20 + identicon fallback)", () => {
  assert.match(src, /<CoinAvatar mint=\{r\.mint\} symbol=\{sym\} logoHash=\{r\.logo_hash\} size=\{20\} \/>/);
  assert.match(src, /data-row="closed-trade"/);
});

test("summary is authoritative: no client re-sum of the ledger for realized", () => {
  assert.doesNotMatch(src, /\.closed\.(reduce|map)\([^)]*pnl_lamports/);
  assert.doesNotMatch(src, /sum\(.*closed/i);
  assert.match(src, /realized_pnl_window_lamports/);
  assert.match(src, /pnlTotal\(sum\)/);
  assert.match(src, /pnl\.report\.reconcile_note/);
});

test("closed ledger carries In/Out/Fees/Bot and a compact WIB entry→exit", () => {
  for (const k of ["pnl.report.sol_in", "pnl.report.sol_out", "pnl.report.fees_reported", "pnl.report.bot", "pnl.report.entry_exit"]) {
    assert.match(src, new RegExp(`t\\("${k}"\\)`), k);
  }
  assert.match(src, /r\.sol_in_lamports == null \? "—" : solText/);
  assert.match(src, /r\.sol_out_lamports == null \? "—" : solText/);
  assert.match(src, /r\.fees_lamports == null \? "—" : solText/);
  assert.match(src, /entryExitText\(r\.opened_at, r\.closed_at, LOCALES\[lang\]\)/);
  assert.match(src, /bots\.get\(id\)/, "bot id resolves to the strategy name");
  assert.match(src, /data-entry-exit/);
});

test("entry→exit is WIB and only adds the exit date across midnight", () => {
  // 02:00Z/03:30Z = 09:00/10:30 WIB (same day).
  assert.equal(entryExitText("2026-11-05T02:00:00.000Z", "2026-11-05T03:30:00.000Z", "en-US"), "9:00 AM → 10:30 AM");
  // 16:52Z = 23:52 WIB Nov 5 → 17:12Z = 00:12 WIB Nov 6 (crosses midnight in WIB, not in UTC).
  assert.equal(entryExitText("2026-11-05T16:52:00.000Z", "2026-11-05T17:12:00.000Z", "en-US"), "11:52 PM → Nov 6 · 12:12 AM");
  // Year rollover keeps the year on the exit date.
  assert.equal(entryExitText("2026-12-31T15:00:00.000Z", "2026-12-31T17:30:00.000Z", "en-US"), "10:00 PM → Jan 1, 2027 · 12:30 AM");
  assert.equal(entryExitText(null, "2026-11-05T17:12:00.000Z", "en-US"), "—");
  assert.equal(entryExitText("2026-11-05T16:52:00.000Z", null, "en-US"), "—");
});

test("new report copy exists in EN and ID with matching placeholders", () => {
  const keys = [
    "pnl.report.open_hint",
    "pnl.report.epoch",
    "pnl.report.closed",
    "pnl.report.closed_wins",
    "pnl.report.open_count",
    "pnl.report.fees_reported",
    "pnl.report.fees_hint",
    "pnl.report.sol_in",
    "pnl.report.sol_out",
    "pnl.report.bot",
    "pnl.report.entry_exit",
    "pnl.report.ledger_hint",
    "pnl.report.reconcile",
    "pnl.report.reconcile_note",
    "pnl.report.reconcile_bad",
    "pnl.report.sort",
    "pnl.report.range.24h",
    "pnl.report.range.7d",
    "pnl.report.range.30d",
    "pnl.report.range.all",
  ];
  for (const k of keys) {
    assert.equal(typeof LOCAL_TEMPLATES.en[k], "string", `EN ${k}`);
    assert.equal(typeof LOCAL_TEMPLATES.id[k], "string", `ID ${k}`);
    assert.equal(args(LOCAL_TEMPLATES.en[k]), args(LOCAL_TEMPLATES.id[k]), `placeholders ${k}`);
  }
});