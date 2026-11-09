import { test } from "node:test";
import assert from "node:assert/strict";
import { cmpSeq, dedupeBySeq, maxSeq, parseSeq } from "../seq.ts";
import { envelopeToTradeEvent, pageEvents, solToLamports, tradeEventToEnvelope } from "../contracts.ts";

test("lamports are integer strings, never floats", () => {
  assert.equal(solToLamports(0.25), "250000000");
  assert.equal(solToLamports(-0.066), "-66000000");
  assert.equal(solToLamports(30), "30000000000");
  assert.equal(solToLamports(0.1 + 0.2), "300000000");
});

test("TradeEvent → envelope → TradeEvent round-trips the feed fields", () => {
  const e = { id: "x:1:position.closed", seq: "42", ts: Date.UTC(2026, 9, 29, 8), kind: "sold" as const, actor: "exit" as const, strategyId: "s1", mint: "M1", symbol: "QUILL", message: "Sold QUILL −14%", pctChange: -14, pnlSol: -0.034, exitReason: "loss_guard" as const };
  const env = tradeEventToEnvelope(e, { workspaceId: "ws", mode: "practice" });
  assert.equal(env.type, "position.closed");
  assert.equal(env.ts, "2026-10-29T08:00:00.000Z");
  assert.equal(env.payload.pnl_lamports, "-34000000");
  assert.deepEqual(env.untrusted, { symbol: "QUILL" });
  const back = envelopeToTradeEvent(env)!;
  assert.equal(back.pnlSol, -0.034);
  assert.equal(back.pctChange, -14);
  assert.equal(back.kind, "sold");
  assert.equal(envelopeToTradeEvent({ ...env, type: "future.unknown" }), null);
});

test("event paging by seq with gaps (int64 strings, BigInt compare)", () => {
  const mk = (seq: string) => tradeEventToEnvelope({ id: `e${seq}`, seq, ts: 0, kind: "found", actor: "screener", message: "" }, { workspaceId: "ws", mode: "practice" });
  const all = ["1", "2", "5", "9", "10"].map(mk);
  const latest = pageEvents(all, { limit: 2 }, "now");
  assert.deepEqual(latest.items.map((e) => e.seq), ["10", "9"]); // "10" > "9" numerically, not lexically
  assert.equal(latest.has_more, true);
  assert.equal(latest.next_before_seq, "9");
  const older = pageEvents(all, { before_seq: "9", limit: 10 }, "now");
  assert.deepEqual(older.items.map((e) => e.seq), ["5", "2", "1"]);
  const newer = pageEvents(all, { after_seq: "2" }, "now");
  assert.deepEqual(newer.items.map((e) => e.seq), ["5", "9", "10"]);
  assert.equal(newer.safe_seq, "10");
});

test("seq above 2^53 keeps precision (no Number())", () => {
  const a = "9007199254740993", b = "9007199254740992"; // Number(a) === Number(b)
  assert.equal(cmpSeq(a, b), 1);
  assert.equal(maxSeq([b, a]), a);
  const page = pageEvents([b, a].map((seq) => tradeEventToEnvelope({ id: seq, seq, ts: 0, kind: "found", actor: "screener", message: "" }, { workspaceId: "ws", mode: "practice" })), { after_seq: b }, "now");
  assert.deepEqual(page.items.map((e) => e.seq), [a]);
  assert.deepEqual(dedupeBySeq([{ seq: a, v: 1 }, { seq: b, v: 2 }, { seq: a, v: 3 }]), [{ seq: a, v: 3 }, { seq: b, v: 2 }]);
  assert.equal(parseSeq("01"), null);
  assert.equal(parseSeq("12"), "12");
});

test("builder settings map to schema v1.1 keys only and round-trip", async () => {
  const { readFileSync } = await import("node:fs");
  const { settingsFromWire, settingsToWire, settingsPatch } = await import("../contracts.ts");
  const { blankSettings } = await import("../strategy-schema.ts");
  const schema = JSON.parse(readFileSync(new URL("../../../../services/backend/config/strategy_settings.schema.json", import.meta.url), "utf8"));
  const s = blankSettings();
  const w = settingsToWire(s);
  const extra = Object.keys(w).filter((k) => !(k in schema.properties));
  assert.deepEqual(extra, []);
  assert.equal(typeof w.bankroll_lamports, "string");
  assert.match(w.bankroll_lamports, /^-?\d+$/);
  assert.deepEqual(settingsFromWire(w, s), s);
  const next = settingsToWire({ ...s, exit: { ...s.exit, trailingPct: s.exit.trailingPct + 5 } });
  assert.deepEqual(Object.keys(settingsPatch(w, next)), ["peak_trail_pct"]);
});

test("prices go on the wire as plain decimal strings", async () => {
  const { toDecimalString, usdToPriceSol } = await import("../contracts.ts");
  assert.equal(toDecimalString(0.000000123), "0.000000123");
  assert.equal(toDecimalString(-1.5), "-1.5");
  assert.equal(toDecimalString(42), "42");
  assert.match(usdToPriceSol(0.0000042), /^\d+\.\d+$/);
  assert.doesNotMatch(usdToPriceSol(0.0000000042), /e/i);
});

test("3-way merge keeps non-overlapping edits and defaults overlaps to saved", async () => {
  const { mergeSettings, threeWay } = await import("../../components/builder/RevisionConflict.tsx");
  const base = { name: "a", bankroll_lamports: "1", ticket_lamports: "1", max_concurrent_positions: 1, venues: [], approval_mode: "off", peak_trail_pct: 20, liquidity_usd_min: 1000 } as never;
  const mine = { ...(base as object), peak_trail_pct: 25, score_threshold: 80 } as never;
  const theirs = { ...(base as object), peak_trail_pct: 15, liquidity_usd_min: 2000 } as never;
  const rows = threeWay(base, mine, theirs);
  assert.deepEqual(rows.filter((r) => r.overlap).map((r) => r.key), ["peak_trail_pct"]);
  const m = mergeSettings(base, mine, theirs) as Record<string, unknown>;
  assert.equal(m.peak_trail_pct, 15);
  assert.equal(m.liquidity_usd_min, 2000);
  assert.equal(m.score_threshold, 80);
  assert.equal((mergeSettings(base, mine, theirs, { peak_trail_pct: "mine" }) as Record<string, unknown>).peak_trail_pct, 25);
});

test("1.1.2 error body: details flattened into error, server_now inside", async () => {
  const { fail } = await import("../bff.ts");
  const { toApiError } = await import("../errors.ts");
  const res = fail("STRATEGY_REV_CONFLICT", { current_rev: 4, base_rev: 3, changed_fields: ["peak_trail_pct"], current: { rev: 4 } });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: Record<string, unknown>; current_rev?: number; server_now: string };
  assert.equal(body.error.code, "STRATEGY_REV_CONFLICT");
  assert.equal(body.error.current_rev, 4);
  assert.deepEqual(body.error.changed_fields, ["peak_trail_pct"]);
  assert.equal(typeof body.error.server_now, "string");
  assert.equal(body.current_rev, undefined); // nothing at top level any more
  const e = toApiError(409, body);
  assert.equal(e.details.current_rev, 4);
  assert.equal(e.details.base_rev, 3);
});

test("errors.json v4 carries en + id copy for every code", async () => {
  const { ERROR_CODES, errorMessage } = await import("@centurion/contracts/wire");
  for (const code of Object.keys(ERROR_CODES) as (keyof typeof ERROR_CODES)[]) {
    assert.ok(errorMessage(code, "en").length > 0, code);
    assert.ok(errorMessage(code, "id").length > 0, code);
  }
});

test("manual close percent → fraction_bps; exit-stats row shape; tradeable flag", async () => {
  const { pctToBps, exitStatToWire, exitStatFromWire, screenerStateOf } = await import("../contracts.ts");
  assert.equal(pctToBps(25), 2500);
  assert.equal(pctToBps(100), 10_000);
  assert.throws(() => pctToBps(0.004), RangeError); // below 0.01 % → INVALID_FRACTION (package rule)
  assert.throws(() => pctToBps(101), RangeError);
  const row = exitStatToWire({ reason: "peak_trail", count: 4, wins: 3, winRate: 0.75, avgPnlSol: 0.0125, avgPnlPct: 12.5, totalPnlSol: 0.05, avgHoldSeconds: 420 });
  assert.deepEqual(Object.keys(row).sort(), ["avg_hold_s", "avg_pnl_pct", "count", "exit_reason", "pnl_lamports", "win_rate_pct"]);
  assert.equal(row.pnl_lamports, "50000000");
  assert.equal(row.win_rate_pct, 75);
  const back = exitStatFromWire(row);
  assert.equal(back.totalPnlSol, 0.05);
  assert.equal(back.wins, 3);
  assert.equal(screenerStateOf({ tradeable: false, skip_reason: "UNSUPPORTED_QUOTE_MINT" }), "UNSUPPORTED_QUOTE_MINT");
  assert.equal(screenerStateOf({ tradeable: true, skip_reason: null }), undefined);
});

test("exit-stats keep a missing average as null (em dash), never 0", async () => {
  const { exitStatFromWire, exitStatToWire } = await import("../contracts.ts");
  const empty = exitStatFromWire({ exit_reason: "peak_trail", count: 0, pnl_lamports: "0", avg_pnl_pct: null, win_rate_pct: 0, avg_hold_s: 0 });
  assert.equal(empty.winRate, null);
  assert.equal(empty.avgPnlSol, null);
  assert.equal(empty.avgPnlPct, null);
  assert.equal(empty.avgHoldSeconds, null);
  // A closed bucket with trades but no cost basis: the server sends avg_pnl_pct null and it must survive.
  const noBasis = exitStatFromWire({ exit_reason: "manual", count: 2, pnl_lamports: "-5000", avg_pnl_pct: null, win_rate_pct: 50, avg_hold_s: 90 });
  assert.equal(noBasis.avgPnlPct, null);
  assert.ok(Math.abs((noBasis.avgPnlSol ?? 0) + 0.0000025) < 1e-15);
  const back = exitStatToWire(empty);
  assert.equal(back.avg_pnl_pct, null);
  assert.equal(back.win_rate_pct, 0);
  assert.equal(back.avg_hold_s, 0);
});

test("stop_loss_pct (from entry) and peak_trail_pct (from peak) are separate wire keys", async () => {
  const { settingsToWire } = await import("../contracts.ts");
  const { blankSettings } = await import("../strategy-schema.ts");
  const s = blankSettings();
  s.exit.stopLossPct = 30;
  s.exit.trailingPct = 20;
  const w = settingsToWire(s) as Record<string, unknown>;
  assert.equal(w.stop_loss_pct, 30);
  assert.equal(w.peak_trail_pct, 20);
  assert.equal((w.sell_floors as Record<string, unknown>).max_loss_pct, undefined);
});
