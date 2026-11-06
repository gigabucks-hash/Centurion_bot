// UX re-QA D10 / reject_reasons / Mcap tooltip checks that need no browser: `npm run test:ui`
// (node --test; Node 24 strips the TS types of src/i18n/local.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
    if (get(cat.en, key) != null) console.log(`NOTE ${key} now ships in @centurion/i18n; the local template is unused`);
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

test("errors.map.json v7 (i18n 0.4.10) covers 67 codes incl. guard weaken, quote stale, MODE_NOT_ALLOWED per strategy", () => {
  const e = pkg("errors.map.json");
  assert.equal(e.errors_json_version, 7);
  assert.equal(Object.keys(e.codes).length, 67);
  assert.equal(e.codes.MODE_NOT_ALLOWED.key, "error.code.mode_not_allowed");
  assert.match(get(cat.en, "error.code.mode_not_allowed"), /approved for Real/);
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

test("i18n 0.4.10/0.4.11: desktop uses no deprecated/removed key, and every literal t() key resolves", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const mig = pkg("key-migrations.json");
  const banned = new Map();
  for (const r of mig.releases ?? []) for (const kind of ["deprecated", "removed"]) for (const e of r[kind] ?? []) banned.set(e.key ?? e.from ?? e, `${r.version} ${kind}${e.use ? ` → ${e.use}` : ""}`);
  for (const r of mig.releases ?? []) for (const e of r.renamed ?? []) if (e.from) banned.set(e.from, `${r.version} renamed → ${e.to}`);
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); } };
  walk(root);
  const bad = [], missing = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const [, k] of src.matchAll(/\bt\(\s*"([a-z0-9_]+(?:\.[a-z0-9_]+)+)"/g)) {
      if (banned.has(k)) bad.push(`${f.slice(root.length)}: ${k} (${banned.get(k)})`);
      if (typeof get(cat.en, k) !== "string" && !(k in LOCAL_TEMPLATES.en)) missing.push(`${f.slice(root.length)}: ${k}`);
    }
  }
  assert.deepEqual(bad, [], "deprecated/removed keys still used");
  assert.deepEqual(missing, [], "keys missing from @centurion/i18n and LOCAL_TEMPLATES");
  assert.equal(get(cat.id, "kill_switch.dialog.effect.exits_keep"), "Exit plan, TP & SL tetap jalan.");
});

test("contracts pin: packages/contracts is @centurion/contracts 1.1.6 at ca52707 (no unreviewed drift)", async () => {
  const { readFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const pin = JSON.parse(readFileSync(new URL("../contracts.pin.json", import.meta.url), "utf8"));
  const pkgJson = JSON.parse(readFileSync(new URL("../../../packages/contracts/package.json", import.meta.url), "utf8"));
  assert.equal(pkgJson.name, pin.package);
  assert.equal(pkgJson.version, pin.version);
  const root = new URL("../../..", import.meta.url).pathname;
  let git = null;
  try {
    // Committed tree and working tree both equal the pinned commit (exit 1 = drift).
    // The pin is an ancestor of HEAD, and the tree equals the last reviewed commit (exit 1 = unreviewed drift).
    execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", pin.commit, "HEAD"], { stdio: "ignore" });
    const last = pin.reviewed_additive?.at(-1)?.commit ?? pin.commit;
    // Committed trees only: uncommitted Backend WIP in packages/contracts is not part of the pin.
    execFileSync("git", ["-C", root, "diff", "--quiet", last, "HEAD", "--", "packages/contracts"], { stdio: "ignore" });
    git = "same";
  } catch (e) {
    git = e.status === 1 ? "drift" : "no-git";
  }
  assert.notEqual(git, "drift", `packages/contracts changed since ${pin.commit}; re-check the desktop and bump contracts.pin.json`);
});

test("i18n pin: I18N_PACKAGE_VERSION equals packages/i18n (0.4.12: receipt + markets ARB keys)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/i18n/index.ts", import.meta.url), "utf8");
  assert.equal(/I18N_PACKAGE_VERSION = "([^"]+)"/.exec(src)?.[1], pkg("package.json").version);
  assert.equal(pkg("package.json").version, "0.4.12");
});

test("next_allowed_at: RFC 3339 UTC with ms + Z, parsed strictly (no local-time guesses)", async () => {
  const { parseIsoTs } = await import("../src/i18n/isots.ts");
  assert.equal(parseIsoTs("2026-11-04T08:06:04.312Z"), Date.UTC(2026, 10, 4, 8, 6, 4, 312));
  for (const bad of ["2026-11-04T08:06:04Z", "2026-11-04T15:06:04.312+07:00", "2026-11-04T08:06:04.312", "2026-11-04 08:06:04.312Z",
    "2026-11-04T08:06:04.3121Z", "2026-02-30T08:06:04.312Z", "2026-11-04T24:00:00.000Z", "1730707564312", "", null, undefined, 5]) {
    assert.equal(parseIsoTs(bad), null, String(bad));
  }
});
