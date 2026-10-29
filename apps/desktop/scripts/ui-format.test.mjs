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

test("errors.map.json v5 covers 57 codes incl. guard_weaken_requires_approval", () => {
  const e = pkg("errors.map.json");
  assert.equal(e.errors_json_version, 5);
  assert.equal(Object.keys(e.codes).length, 57);
  const k = e.codes.GUARD_WEAKEN_REQUIRES_APPROVAL.key;
  for (const l of ["en", "id"]) assert.equal(typeof get(cat[l], k), "string", `${l} ${k}`);
});
