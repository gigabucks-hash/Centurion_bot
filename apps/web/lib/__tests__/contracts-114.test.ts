import { test } from "node:test";
import assert from "node:assert/strict";
import { applyProposalUpdated, approvalFromWire, approvalToWire, mcapFromWire, mcapToWire, settingsFromWire, settingsToWire } from "../contracts";
import { blankSettings, diffSettings, validate } from "../strategy-schema";
import { decideApprovalWire, issueDecisionToken, listApprovals, refreshQuote, WireError } from "../mock/store";
import { CursorInvalid, decodeCursor, encodeCursor, paginate, parseLimit } from "../paging";
import { safeName, safeSymbol, safeText } from "../untrusted";
import { createRafBatcher } from "../raf-batch";
import { buildCsp, SECURITY_HEADERS, THEME_INIT_HASH } from "../security/csp";

test("1.1.4 time_stop_s / stall_exit round-trip; null = off", () => {
  const s = blankSettings();
  const on = { ...s, exit: { ...s.exit, timeStopMinutes: 45, stallExit: true, stallWindowS: 600, stallMinMovePct: 1.5 } };
  const w = settingsToWire(on);
  assert.equal(w.time_stop_s, 2700);
  assert.deepEqual(w.stall_exit, { window_s: 600, min_move_pct: 1.5 });
  const back = settingsFromWire(w, s);
  assert.equal(back.exit.timeStopMinutes, 45);
  assert.deepEqual([back.exit.stallExit, back.exit.stallWindowS, back.exit.stallMinMovePct], [true, 600, 1.5]);
  const off = settingsToWire({ ...s, exit: { ...s.exit, timeStopMinutes: 0, stallExit: false } });
  assert.equal(off.time_stop_s, null);
  assert.equal(off.stall_exit, null);
  assert.equal(settingsFromWire(off, on).exit.stallExit, false);
  assert.equal(settingsFromWire(off, on).exit.timeStopMinutes, 0);
  // stall sub-fields validated only while on; contract ranges
  assert.equal(validate({ ...on, exit: { ...on.exit, stallWindowS: 2 } })["exit.stallWindowS"] != null, true);
  assert.equal(validate({ ...on, exit: { ...on.exit, stallExit: false, stallWindowS: 2 } })["exit.stallWindowS"], undefined);
  assert.ok(diffSettings(s, on).some((r) => r.key === "exit.stallExit"));
});

test("1.1.4 market cap mapping: strings validated, absent → undefined", () => {
  const m = { lamports: "8400000000000", usd: "1260000", asOf: Date.parse("2026-10-29T10:00:00Z") };
  const w = mcapToWire(m);
  assert.deepEqual(w, { mcap_source: "curve", market_cap_lamports: "8400000000000", mcap_usd: "1260000", mcap_as_of: "2026-10-29T10:00:00.000Z" });
  assert.deepEqual(mcapFromWire(w), { ...m, source: "curve" });
  assert.equal(mcapFromWire({}), undefined);
  assert.deepEqual(mcapFromWire({ market_cap_lamports: "1e9" as never, mcap_usd: "abc", mcap_as_of: null }), { lamports: null, usd: null, asOf: null });
});

test("1.1.4 quote: Real approve with a stale quote → 409 QUOTE_MISSING_OR_STALE; refresh bumps rev; proposal.updated patches in place", () => {
  const real = listApprovals("real").find((a) => a.kind === "buy_pick" && a.status === "pending" && a.quote);
  assert.ok(real, "seeded real pick with a quote");
  const later = (real.quote!.quoteExpiresAt ?? 0) + 1;
  const tok = issueDecisionToken(real.id, later);
  assert.throws(() => decideApprovalWire(real.id, { decision: "approve", token: tok.token, expected_rev: real.rev } as never, later), (e) => e instanceof WireError && e.code === "QUOTE_MISSING_OR_STALE" && e.details?.missing === false);
  const fresh = refreshQuote(real.id);
  assert.equal(fresh.rev, real.rev, "1.1.5: refresh never bumps rev");
  assert.equal(Number(fresh.quote?.quoteId), Number(real.quote?.quoteId ?? 0) + 1, "quote_id increments");
  assert.ok((fresh.quote?.quoteExpiresAt ?? 0) > Date.now());
  const w = approvalToWire(fresh);
  assert.equal(typeof w.est_network_fee_lamports, "string");
  assert.equal(typeof w.min_out_raw, "string");
  assert.equal(typeof w.max_slippage_bps, "number");
  const view = approvalFromWire(w);
  const patched = applyProposalUpdated(view, { proposal_id: w.id, kind: "buy_pick", rev: view.rev, quote_id: String(Number(w.quote_id) + 1), decimals: 6, token_program: null, est_network_fee_lamports: "7000", quote_ts: w.quote_ts, quote_expires_at: w.quote_expires_at, max_slippage_bps: 250 } as never);
  assert.equal(patched.rev, view.rev);
  assert.equal(patched.quote?.networkFeeLamports, "7000");
  assert.equal(patched.quote?.maxSlippageBps, 250);
  assert.equal(applyProposalUpdated(view, { proposal_id: w.id, kind: "buy_pick", rev: view.rev, quote_id: w.quote_id, decimals: 6, token_program: null } as never), view, "equal quote_id ignored");
  assert.equal(applyProposalUpdated(view, { proposal_id: w.id, kind: "buy_pick", rev: view.rev - 1, quote_id: "999", decimals: 6, token_program: null } as never), view, "older rev ignored");
});

test("cursor paging: stable keyset pages, opaque cursors bound to their list, CURSOR_INVALID", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, t: 1000 + (i % 3) }));
  const key = (r: { id: string; t: number }) => r;
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const p: { items: { id: string; t: number }[]; next_cursor: string | null } = paginate(rows, "x", key, { cursor, limit: 3 });
    seen.push(...p.items.map((r) => r.id));
    cursor = p.next_cursor;
    if (!cursor) break;
  }
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7, "no duplicates across pages");
  assert.throws(() => decodeCursor("other", encodeCursor("x", 1, "a")), CursorInvalid);
  assert.throws(() => decodeCursor("x", "%%%"), CursorInvalid);
  assert.equal(parseLimit("500"), 100);
  assert.equal(parseLimit("abc"), 50);
});

test("untrusted coin text: control/bidi/invisible stripped, NFC, capped", () => {
  assert.equal(safeSymbol("PE\u202ETE\u0000"), "PETE");
  assert.equal(safeText("a\u200Bb\u2066c", 10), "abc");
  assert.equal(safeSymbol("A".repeat(40)).length <= 16, true);
  assert.ok(safeName("x".repeat(100)).endsWith("…"));
  assert.equal(safeText("<script>", 20), "<script>", "escaping is React's job; text stays text");
});

test("rAF batcher keeps the latest value per key and flushes once per frame", () => {
  const frames: (() => void)[] = [];
  const flushed: Map<string, number>[] = [];
  const b = createRafBatcher<string, number>((m) => flushed.push(m), (cb) => frames.push(cb));
  b.push("a", 1);
  b.push("a", 2);
  b.push("b", 3);
  assert.equal(frames.length, 1);
  frames.shift()!();
  assert.deepEqual([...flushed[0]], [["a", 2], ["b", 3]]);
});

test("CSP: nonce + strict-dynamic + theme hash, no unsafe-inline scripts in prod, framing denied", () => {
  const csp = buildCsp({ nonce: "abc", dev: false, https: true, googleClientId: undefined, apiOrigin: null });
  assert.match(csp, /script-src 'self' 'nonce-abc' 'strict-dynamic'/);
  assert.ok(csp.includes(THEME_INIT_HASH));
  assert.doesNotMatch(csp.split(";").find((d) => d.trim().startsWith("script-src"))!, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
  assert.equal(SECURITY_HEADERS["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(SECURITY_HEADERS["Strict-Transport-Security"], /max-age=\d{8}/);
});

test("zod route schemas: decision/close/strategy bodies", async () => {
  const { DecisionBody, CloseBody, StrategyPatchBody, ChallengeBody } = await import("../schemas/wire");
  assert.equal(DecisionBody.safeParse({ decision: "approve", token: "apt_1", expected_rev: 2 }).success, true);
  assert.equal(DecisionBody.safeParse({ decision: "approve", token: "apt_1", reject_reason: "nope" }).success, false);
  assert.equal(DecisionBody.safeParse({ decision: "approve", token: "apt_1", confirmation: { hold_duration_ms: 1300 } }).success, true);
  assert.equal(CloseBody.safeParse({ fraction_bps: 0 }).success, false);
  assert.equal(CloseBody.safeParse({ fraction_bps: 5000 }).success, true);
  assert.equal(StrategyPatchBody.safeParse({ settings_patch: { stop_loss_pct: 20 } }).success, true);
  assert.equal(StrategyPatchBody.safeParse({ settings_patch: "x" }).success, false);
  assert.equal(ChallengeBody.safeParse({ action: "a", target: "ap_1", payload_hash: "z", mode: "practice" }).success, false);
});

test("CSP style hash matches the installed lightweight-charts attribution <style>", async () => {
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { LWC_ATTRIBUTION_STYLE_HASH } = await import("../security/csp");
  const src = readFileSync(new URL("../../node_modules/lightweight-charts/dist/lightweight-charts.production.mjs", import.meta.url), "utf8");
  const m = /createElement\("style"\),this\.\w+\.innerText="((?:[^"\\]|\\.)*)"/.exec(src);
  assert.ok(m, "attribution style literal found");
  const css = JSON.parse(`"${m[1]}"`) as string;
  assert.equal(LWC_ATTRIBUTION_STYLE_HASH, `'sha256-${createHash("sha256").update(css).digest("base64")}'`);
});

test("i18n 0.4.6: guard_weaken_requires_approval is pending copy (no 'perlu approval'), driven by errors.map", async () => {
  const { errorPresentation } = await import("../errors");
  const id = (await import("@centurion/i18n/id.json", { with: { type: "json" } })).default as unknown as { error: { code: Record<string, string> } };
  const en = (await import("@centurion/i18n/en.json", { with: { type: "json" } })).default as unknown as { error: { code: Record<string, string> } };
  const idCopy = id.error.code.guard_weaken_requires_approval as string;
  assert.doesNotMatch(idCopy, /perlu approval/);
  assert.match(idCopy, /menunggu approval/);
  assert.match(en.error.code.guard_weaken_requires_approval as string, /waiting for approval/);
  const g = errorPresentation("GUARD_WEAKEN_REQUIRES_APPROVAL");
  assert.equal(g.surface, "banner");
  assert.equal(g.titleKey, "guard.weaken.pending.title");
  assert.equal(g.ctaKey, "guard.weaken.pending.open");
  const q = errorPresentation("QUOTE_MISSING_OR_STALE", "real");
  assert.deepEqual([q.surface, q.tone, q.ctaKey, q.inlineKey], ["inline", "warning", "review.quote.refresh", "review.quote.stale"]);
  assert.equal(errorPresentation("QUOTE_MISSING_OR_STALE", "practice").surface, "toast");
  assert.equal(errorPresentation("INTERNAL").surface, "toast");
});

test("review quote state: 1.1.4 fallback completeness, 1.1.5 quote_id hold key", async () => {
  const { reviewQuoteState, quoteKey, isQuoteChange } = await import("../quote");
  const now = 1_000_000;
  const quote = { networkFeeLamports: "5000", minOutRaw: "1000", totalMaxLamports: "250005000", quoteTs: now - 2000, quoteExpiresAt: now + 13000 };
  const real = reviewQuoteState({ mode: "real", quote }, 0, now);
  assert.deepEqual([real.state, real.complete, real.blocksApprove], ["fresh", true, false]);
  assert.equal(reviewQuoteState({ mode: "real", quote: { ...quote, quoteExpiresAt: now - 1 } }, 0, now).blocksApprove, true);
  assert.equal(reviewQuoteState({ mode: "practice", quote: { ...quote, quoteExpiresAt: now - 1 } }, 0, now).blocksApprove, false);
  // 1.1.5 wire: package rule (needs est_ata_rent_lamports too)
  assert.equal(reviewQuoteState({ mode: "real", quote: { ...quote, quoteId: "q1" } }, 0, now).blocksApprove, true);
  assert.equal(reviewQuoteState({ mode: "real", quote: { ...quote, quoteId: "q1", ataRentLamports: "0" } }, 0, now).blocksApprove, false);
  const a = { rev: 3, quote };
  assert.equal(isQuoteChange(a, { rev: 4, quote }), false, "rev bump without a new quote keeps the hold");
  assert.equal(isQuoteChange(a, { rev: 4, quote: { ...quote, quoteTs: now } }), true);
  assert.equal(isQuoteChange({ rev: 3, quote: { ...quote, quoteId: "q1" } }, { rev: 3, quote: { ...quote, quoteId: "q2" } }), true);
  assert.equal(quoteKey({ rev: 1, quote: { quoteId: "q9" } }), "q9");
});
