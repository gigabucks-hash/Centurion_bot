// UX re-QA D10 / reject_reasons / Mcap tooltip checks that need no browser: `npm run test:ui`
// (node --test; Node 24 strips the TS types of src/i18n/local.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatFractionBps, LOCALES } from "../../../packages/i18n/format.mjs";
import { LOCAL_TEMPLATES } from "../src/i18n/local.ts";

const pkg = (f) => JSON.parse(readFileSync(new URL(`../../../packages/i18n/${f}`, import.meta.url), "utf8"));
const get = (o, k) => k.split(".").reduce((v, p) => v?.[p], o);
const cat = { en: pkg("en.json"), id: pkg("id.json") };

test("D10: executor bps/decimals follow the UI locale (format.mjs)", () => {
  assert.equal(formatFractionBps(125, "id"), "1,25%");
  assert.equal(formatFractionBps(125, "en"), "1.25%");
  assert.equal(formatFractionBps(5000, "id"), "50%");
  const price = (d, l) => new Intl.NumberFormat(LOCALES[l], { maximumSignificantDigits: 6 }).format(Number(d));
  assert.equal(price("0.0002512", "id"), "0,0002512");
  assert.equal(price("0.0002512", "en"), "0.0002512");
});

test("local templates only fill keys the package lacks, with the same placeholders in en and id", () => {
  for (const key of Object.keys(LOCAL_TEMPLATES.en)) {
    const args = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(args(LOCAL_TEMPLATES.en[key]), args(LOCAL_TEMPLATES.id[key]), key);
    if (get(cat.en, key) != null) console.log(`NOTE ${key} now ships in @sentra/i18n; the local template is unused`);
  }
  assert.ok(get(cat.en, "dashboard.feed.filter.buys") && get(cat.id, "dashboard.feed.filter.sells"), "side labels");
});

test("reject_reasons.map.json: chips resolve to copy, not_tradeable chip → wire not_tradeable", () => {
  const m = pkg("reject_reasons.map.json");
  assert.equal(m.skip_chips.not_tradeable.reject_reason, "not_tradeable");
  assert.equal(m.default, "user_declined");
  for (const l of ["en", "id"]) {
    for (const c of Object.values(m.skip_chips)) assert.equal(typeof get(cat[l], c.label_key), "string", `${l} ${c.label_key}`);
    for (const k of Object.values(m.wire)) assert.equal(typeof get(cat[l], k), "string", `${l} ${k}`);
  }
});

test("Mcap / liquidity '—' tooltip key exists (common.value.unavailable)", () => {
  assert.equal(get(cat.id, "common.value.unavailable"), "Data belum tersedia");
  assert.equal(typeof get(cat.en, "common.value.unavailable"), "string");
  assert.equal(typeof get(cat.id, "common.state.loading"), "string");
});

test("errors.map.json v6 covers 58 codes incl. guard weaken (pending tone) + quote stale (refresh CTA)", () => {
  const e = pkg("errors.map.json");
  assert.equal(e.errors_json_version, 6);
  assert.equal(Object.keys(e.codes).length, 58);
  for (const c of ["GUARD_WEAKEN_REQUIRES_APPROVAL", "QUOTE_MISSING_OR_STALE"]) {
    const k = e.codes[c].key;
    for (const l of ["en", "id"]) assert.equal(typeof get(cat[l], k), "string", `${l} ${k}`);
  }
  assert.equal(e.codes.GUARD_WEAKEN_REQUIRES_APPROVAL.tone, "pending");
  assert.equal(e.codes.QUOTE_MISSING_OR_STALE.cta_key, "review.quote.refresh");
});

test("1.1.4 quote formatters (i18n 0.4.7): bps → %, fee/total dash on null, quoteState from server clock", async () => {
  const f = await import("../../../packages/i18n/format.mjs");
  assert.equal(f.formatBps(300, "en"), "3%");
  assert.equal(f.formatBps(25, "id"), "0,25%");
  assert.equal(f.formatLamportsOrDash(null, "id"), "—");
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  const q = { quote_ts: "2026-10-29T11:59:50.000Z", quote_expires_at: "2026-10-29T12:00:20.000Z" };
  // 0.4.7+: `complete` needs the 1.1.5 fields (quote_id, est_ata_rent_lamports); a fresh but incomplete quote
  // still blocks Real (QuoteBlock / SignalQueue use blocksApprove as-is since contracts 1.1.5).
  assert.deepEqual(f.quoteState(q, 0, { mode: "real", localNowMs: now }), { state: "fresh", ageS: 10, expiresInS: 20, complete: false, blocksApprove: true });
  const full = { ...q, quote_id: "7", est_network_fee_lamports: "25000", est_ata_rent_lamports: "0", min_out_raw: "1", total_max_lamports: "250025000" };
  assert.equal(f.quoteState(full, 0, { mode: "real", localNowMs: now }).blocksApprove, false);
  assert.equal(f.quoteState(full, 30_000, { mode: "real", localNowMs: now }).state, "stale"); // server clock ahead → stale
  assert.equal(f.quoteState(q, 30_000, { mode: "practice", localNowMs: now }).blocksApprove, false); // practice never blocked
  for (const k of ["review.quote.refresh", "review.quote.stale", "review.quote.practice_stale", "review.quote.expires_in", "guard.weaken.pending.title", "exit_reason.stall", "exit_reason.max_hold", "mcap.as_of"])
    for (const l of ["en", "id"]) assert.equal(typeof get(cat[l], k), "string", `${l} ${k}`);
  assert.equal(get(cat.id, "exit_reason.stall"), "Exit stagnan");
});

test("i18n 0.4.7 brand: app.name = Centurion Trade (tray tooltip + notification titles)", () => {
  for (const l of ["en", "id"]) assert.equal(get(cat[l], "app.name"), "Centurion Trade");
});
