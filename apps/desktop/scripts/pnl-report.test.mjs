// Desktop PnL report: exact lamports, range/all-time reconciliation, null stats, sorting and the
// closed ledger's logo path. `npm run test:ui` (node --test; Node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCAL_TEMPLATES } from "../src/i18n/local.ts";
import { PNL_RANGES, botLabel, entryExitText, entryExitTimeText, loadPageForGeneration, pnlPageArgs, pnlReconciles, pnlTotal, priceText, receiptPct, receiptPrice, receiptSol, sortClosed, wibDateTimeText } from "../src/components/pnlReportView.ts";

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
  assert.match(src, /botLabel\(id, bots\)/, "bot id resolves to the strategy name or an em dash");
  assert.match(src, /data-entry-exit/);
});

test("entry→exit is 24-hour WIB; both sides carry a date only across midnight", () => {
  const now = Date.parse("2026-11-06T00:00:00.000Z");
  // 02:00Z/03:30Z = 09:00/10:30 WIB (same day): clocks only, 24-hour.
  assert.equal(entryExitText("2026-11-05T02:00:00.000Z", "2026-11-05T03:30:00.000Z", "en-US", now), "09:00 → 10:30");
  // 16:52Z = 23:52 WIB Nov 5 → 17:12Z = 00:12 WIB Nov 6 (crosses midnight in WIB, not in UTC).
  assert.equal(
    entryExitText("2026-11-05T16:52:00.000Z", "2026-11-05T17:12:00.000Z", "en-US", now),
    "05 Nov · 23:52 → 06 Nov · 00:12",
  );
  // Year rollover keeps the year on the side that is not the current WIB year.
  assert.equal(
    entryExitText("2026-12-31T15:00:00.000Z", "2026-12-31T17:30:00.000Z", "en-US", now),
    "31 Dec · 22:00 → 01 Jan 2027 · 00:30",
  );
  assert.equal(entryExitText(null, "2026-11-05T17:12:00.000Z", "en-US", now), "—");
  assert.equal(entryExitText("2026-11-05T16:52:00.000Z", null, "en-US", now), "—");
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
    "pnl.report.load_more",
    "pnl.report.loading_more",
  ];
  for (const k of keys) {
    assert.equal(typeof LOCAL_TEMPLATES.en[k], "string", `EN ${k}`);
    assert.equal(typeof LOCAL_TEMPLATES.id[k], "string", `ID ${k}`);
    assert.equal(args(LOCAL_TEMPLATES.en[k]), args(LOCAL_TEMPLATES.id[k]), `placeholders ${k}`);
  }
});

test("receipt SOL is exact string math: 3+ decimals, locale separator, null em dash", () => {
  assert.equal(receiptSol("200000000", "en-US"), "0.200");
  assert.equal(receiptSol("414000000", "en-US"), "0.414");
  assert.equal(receiptSol("200000000", "id-ID"), "0,200");
  assert.equal(receiptSol("0", "en-US"), "0.000");
  assert.equal(receiptSol("-1000000000", "en-US"), "−1.000");
  assert.equal(receiptSol("1234567890123", "en-US"), "1234.567890123");
  assert.equal(receiptSol(null, "en-US"), "—");
  assert.equal(receiptSol("", "en-US"), "—");
});

test("receipt % signs always, one decimal, zero neutral, null em dash", () => {
  assert.equal(receiptPct(31, "en-US"), "+31.0%");
  assert.equal(receiptPct(-12.5, "en-US"), "−12.5%");
  assert.equal(receiptPct(0, "en-US"), "0.0%");
  assert.equal(receiptPct(null, "en-US"), "—");
});

test("entry/exit price is SOL, no exponent, one trailing unit, per-side em dash", () => {
  assert.equal(priceText("0.000000255", "en-US"), "0.000000255");
  assert.equal(priceText("2.55e-7", "en-US"), "0.000000255");
  assert.equal(priceText("0", "en-US"), "0");
  assert.equal(priceText(null, "en-US"), "—");
  assert.equal(receiptPrice("0.000000255", "0.000000412", "en-US"), "0.000000255 → 0.000000412 SOL");
  assert.equal(receiptPrice(null, "0.000000412", "en-US"), "— → 0.000000412 SOL");
  assert.equal(receiptPrice("0.000000255", null, "en-US"), "0.000000255 → —");
  assert.equal(receiptPrice(null, null, "en-US"), "—");
});

test("receipt times are 24-hour WIB; dates appear on both sides only across midnight", () => {
  // 02:00Z/03:30Z = 09:00/10:30 WIB (same day).
  assert.equal(entryExitTimeText("2026-11-05T02:00:00.000Z", "2026-11-05T03:30:00.000Z", "en-US"), "09:00 → 10:30 WIB");
  // 16:52Z = 23:52 WIB Nov 5 → 17:12Z = 00:12 WIB Nov 6.
  assert.equal(
    entryExitTimeText("2026-11-05T16:52:00.000Z", "2026-11-05T17:12:00.000Z", "en-US"),
    "05 Nov · 23:52 → 06 Nov · 00:12 WIB",
  );
  assert.equal(entryExitTimeText(null, "2026-11-05T17:12:00.000Z", "en-US"), "— → 00:12 WIB");
  assert.equal(wibDateTimeText("2026-11-05T07:32:00.000Z", "en-US", Date.parse("2026-11-06T00:00:00.000Z")), "05 Nov · 14:32 WIB");
});

test("F4 paging reuses the frozen absolute range and never sends a relative window", () => {
  const frozen = pnlPageArgs({ window: "7d", from: "2026-10-30T00:00:00.000Z", to: "2026-11-06T00:00:00.000Z" }, "c:1");
  assert.equal(frozen.window, null, "absolute bounds replace the relative window");
  assert.equal(frozen.from, "2026-10-30T00:00:00.000Z");
  assert.equal(frozen.to, "2026-11-06T00:00:00.000Z");
  assert.equal(pnlPageArgs({ window: "7d", from: null, to: "2026-11-06T00:00:00.000Z" }, "c:2").window, null);
  assert.equal(pnlPageArgs({ window: "7d", from: null, to: null }, "c:3").window, "7d", "fallback only when nothing was pinned");
});

test("F4 race: a page that resolves after a range change never appends to the new range", async () => {
  let generation = 1;
  let resolveOld;
  const oldPage = new Promise((resolve) => {
    resolveOld = resolve;
  });
  const rows = ["7d:1"];
  const load = loadPageForGeneration(1, () => generation, () => oldPage);

  // The user switches 7d → 30d while the 7d page is still in flight. The new range replaces the rows.
  generation = 2;
  rows.length = 0;
  rows.push("30d:1");
  resolveOld({ items: ["7d:2"], next_cursor: "7d:c2" });

  assert.equal((await load).status, "stale");
  assert.deepEqual(rows, ["30d:1"], "the stale page did not append");
});

test("F4 race: a success in the same generation appends rows and the next cursor", async () => {
  let generation = 7;
  const result = await loadPageForGeneration(7, () => generation, async () => ({
    items: ["p2a", "p2b"],
    next_cursor: "c3",
  }));
  assert.equal(result.status, "ok");
  assert.deepEqual(result.items, ["p2a", "p2b"]);
  assert.equal(result.next, "c3");
  generation = 8;
  const staleError = await loadPageForGeneration(7, () => generation, async () => {
    throw new Error("CURSOR_INVALID");
  });
  assert.equal(staleError.status, "stale", "a stale failure never surfaces under the new range");
});

test("an unknown bot renders an em dash, never a truncated UUID", () => {
  const bots = new Map([["s1", "New pairs"]]);
  assert.equal(botLabel("s1", bots), "New pairs");
  assert.equal(botLabel("11111111-2222-3333-4444-555555555555", bots), "—");
  assert.equal(botLabel(null, bots), "—");
  assert.doesNotMatch(src, /slice\(0, 8\)/);
  assert.match(src, /botLabel\(id, bots\)/);
});

test("receipt source: provenance, prices, only View bot, unknown reason falls back to Closed", () => {
  assert.match(src, /t\("pnl\.receipt\.provenance"\)/);
  assert.match(src, /receiptSol\(selected\.sol_in_lamports/, "SOL in from wire");
  assert.match(src, /receiptSol\(selected\.sol_out_lamports/);
  assert.match(src, /receiptSol\(selected\.fees_lamports/);
  assert.match(src, /receiptPrice\(selected\.avg_entry_price_sol, selected\.exit_price_sol/);
  assert.match(src, /entryExitTimeText\(selected\.opened_at, selected\.closed_at/);
  assert.match(src, /t\("pnl\.receipt\.view_bot"\)/);
  assert.match(src, /knownBot && onViewBot/);
  assert.match(src, /onViewBot\(selected\.strategy_id!\)/);
  assert.doesNotMatch(src, /pnl\.receipt\.(sell|pause|stop|share|copy|view_tx)/i);
  assert.match(src, /t\(`exit_reason\.\$\{r\}`, undefined, "pnl\.closed"\)/);
  assert.match(src, /t\("pnl\.closed"\)/);
  assert.match(src, /role="button"/);
  assert.match(src, /onKeyDown=/);
  assert.match(src, /pnlPageArgs\(sum, cursor\)/);
  assert.match(src, /generation\.current \+= 1/, "a range reload bumps the paging generation");
  assert.match(src, /loadPageForGeneration\(token, \(\) => generation\.current/, "loadMore is generation-guarded");
  assert.match(src, /pnl-receipt-fees-hint/, "the fees hint is visible, not title-only");
  assert.match(src, /pnl-fees-hint dim/, "the ledger fees hint is visible too");
  assert.match(src, /<div className="dim">\{t\("pnl\.receipt\.bot"\)\}[^<]*<\/div>\s*<div className="row"/, "identity order: bot, then Closed chip + close time");
});

test("ID uses Durasi tahan and A2 ledger labels", () => {
  assert.equal(LOCAL_TEMPLATES.id["pnl.report.hold"], "Durasi tahan");
  assert.equal(LOCAL_TEMPLATES.id["pnl.receipt.hold"], "Durasi tahan");
  assert.equal(LOCAL_TEMPLATES.en["pnl.report.sol_in"], "SOL in");
  assert.equal(LOCAL_TEMPLATES.en["pnl.report.sol_out"], "SOL out");
  assert.equal(LOCAL_TEMPLATES.id["pnl.report.sol_in"], "SOL masuk");
  assert.equal(LOCAL_TEMPLATES.id["pnl.report.sol_out"], "SOL keluar");
  assert.equal(LOCAL_TEMPLATES.en["pnl.report.bot"], "Bot");
  assert.equal(LOCAL_TEMPLATES.id["pnl.report.bot"], "Bot");
});

test("all 14 exit reasons have one-line explanations in EN and ID", () => {
  const codes = [
    "sell_floor", "profit_target", "loss_guard", "peak_trail", "max_hold", "idle", "sell_pressure",
    "no_new_high", "rug_detected", "drawdown_halt", "manual", "strategy_retired", "practice_reset", "stall",
  ];
  for (const code of codes) {
    const key = `pnl.receipt.why.${code}`;
    assert.equal(typeof LOCAL_TEMPLATES.en[key], "string", `EN ${key}`);
    assert.equal(typeof LOCAL_TEMPLATES.id[key], "string", `ID ${key}`);
  }
  for (const k of [
    "pnl.receipt.title", "pnl.receipt.back", "pnl.receipt.closed_at", "pnl.receipt.sol_in",
    "pnl.receipt.sol_out", "pnl.receipt.fees", "pnl.receipt.fees_hint", "pnl.receipt.hold",
    "pnl.receipt.entry_exit", "pnl.receipt.entry_exit_value", "pnl.receipt.entry_exit_value_dates",
    "pnl.receipt.entry_exit_time", "pnl.receipt.entry_exit_time_dates", "pnl.receipt.exit_reason", "pnl.receipt.bot", "pnl.receipt.units",
    "pnl.receipt.provenance", "pnl.receipt.view_bot", "pnl.realized", "pnl.realized_hint", "pnl.closed",
  ]) {
    assert.equal(typeof LOCAL_TEMPLATES.en[k], "string", `EN ${k}`);
    assert.equal(typeof LOCAL_TEMPLATES.id[k], "string", `ID ${k}`);
    assert.equal(args(LOCAL_TEMPLATES.en[k]), args(LOCAL_TEMPLATES.id[k]), `placeholders ${k}`);
  }
  assert.equal(LOCAL_TEMPLATES.en["pnl.receipt.provenance"], "Server-reported · not recalculated");
});