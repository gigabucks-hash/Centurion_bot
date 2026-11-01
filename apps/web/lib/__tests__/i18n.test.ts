import { test } from "node:test";
import assert from "node:assert/strict";
import { createT, interpolate, missingKeys } from "../i18n/index.ts";

test("UX catalog wins through aliases, app namespace fills gaps, id falls back to en", () => {
  const en = createT("en");
  const id = createT("id");
  assert.equal(en("approvals.approve"), "Approve");
  assert.equal(id("approvals.approve"), "Setujui");
  assert.equal(id("approvals.skippedToast", { symbol: "QUILL" }), "Dilewati: QUILL");
  assert.equal(en("overview.expiringSoon", { n: 2 }), "2 expire in under 2 min");
  assert.equal(en("stats.closed"), "Closed trades");
  assert.equal(id("stats.closed"), "Closed trades");
  assert.equal(en.ux("queue.guard.reject"), "Reject change");
  assert.equal(id.ux("queue.guard.reject"), "Tolak perubahan");
  assert.equal(interpolate("{a}-{b}", { a: 1 }), "1-{b}");
});

test("every app key is defined in English and every string parses as ICU", () => {
  assert.deepEqual(missingKeys("en"), []);
  const en = createT("en");
  for (const k of ["overview.footer", "approvals.cardAria", "builder.loosensNReal", "login.otpMock"] as const) {
    assert.ok(!en(k, { dd: 1, stop: 2, engine: "x", symbol: "A", strategy: "B", amount_lamports: "1 SOL", time: "00:10", n: 1, email: "a@b" }).startsWith("app."), k);
  }
});

test("every alias points at a key in @sentra/i18n 0.4.3 (en + id)", async () => {
  const { ALIASES } = await import("../i18n/aliases.ts");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const leaves = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? leaves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
  for (const loc of ["en", "id"]) {
    const keys = new Set(leaves(req(`@sentra/i18n/${loc}.json`)));
    const missing = Object.values(ALIASES).map((a) => (typeof a === "string" ? a : a.key)).filter((k) => !keys.has(k));
    assert.deepEqual(missing, [], loc);
  }
});

test("N-05 order.failed uses 0.4.1 vars {side, symbol, reason_code, amount_lamports} via format.mjs", async () => {
  const { orderFailedText } = await import("../notify.ts");
  const en = orderFailedText(createT("en"), { side: "sell", symbol: "QUILL", reason_code: "SLIPPAGE_EXCEEDED", amount_lamports: "250000000", mode: "practice" });
  assert.match(en.title, /PRACTICE.*Sell QUILL failed/);
  assert.match(en.body, /slippage/i);
  assert.match(en.body, /0\.25\u00A0paper SOL/);
  assert.doesNotMatch(en.body, /\{|SLIPPAGE_EXCEEDED/);
  const unk = orderFailedText(createT("id"), { side: "buy", symbol: "X", reason_code: "SOMETHING_NEW", amount_lamports: "1500000000", mode: "real" });
  assert.doesNotMatch(unk.body, /SOMETHING_NEW/);
  assert.match(unk.body, /1,50\u00A0SOL/);
});

test("0.4.3: no app copy uses the removed vars {coin} / {sol} / {mm_ss}", async () => {
  const { messagesFor } = await import("../i18n/index.ts");
  const walk = (o: unknown, p = ""): [string, string][] =>
    typeof o === "string" ? [[p, o]] : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => walk(v, p ? `${p}.${k}` : k));
  for (const loc of ["en", "id"] as const) {
    const bad = walk((messagesFor(loc) as { app?: unknown }).app ?? messagesFor(loc)).filter(([, v]) => /\{(coin|sol|mm_ss)\b/.test(v));
    assert.deepEqual(bad, [], loc);
  }
});

test("0.4.3: every screener.* key exists in en + id and is reachable through an alias", async () => {
  const { ALIASES } = await import("../i18n/aliases.ts");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [`${p}${k}`] : flat(v as Record<string, unknown>, `${p}${k}.`)));
  const en = flat(req("@sentra/i18n/en.json")).filter((k) => k.startsWith("screener."));
  const id = new Set(flat(req("@sentra/i18n/id.json")));
  const targets = new Set<string>(Object.values(ALIASES).map((a) => (typeof a === "string" ? a : a.key) as string));
  assert.ok(en.length >= 34, `screener keys: ${en.length}`);
  for (const k of en) {
    assert.ok(id.has(k), `id missing ${k}`);
    assert.ok(targets.has(k), `no alias for ${k}`);
  }
});

test("0.4.3: errors.map.json maps all errors.json v4 codes to existing UX keys; unknown → error.code.internal", async () => {
  const { ERROR_CODES } = await import("@sentra/contracts/wire");
  const { errorUxKey } = await import("../errors.ts");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const map = req("@sentra/i18n/errors.map.json") as { codes: Record<string, { key: string }> };
  const all = Object.keys(ERROR_CODES);
  // errors.json v5 adds GUARD_WEAKEN_REQUIRES_APPROVAL and v6 adds QUOTE_MISSING_OR_STALE; errors.map.json still maps the v4 codes (app copy covers the gap).
  assert.ok(all.length >= 56);
  const unmapped = all.filter((c) => !map.codes[c]);
  // Newer codes (v5+ and the contracts working tree) may lag errors.map.json; each must then have app copy (below).
  const { codeText } = await import("../errors.ts");
  for (const c of unmapped) {
    assert.notEqual(codeText(createT("en"), c as never), createT("en").ux("error.code.internal" as never), `${c} has app copy`);
    assert.notEqual(codeText(createT("id"), c as never), createT("id").ux("error.code.internal" as never), `${c} has app copy (id)`);
  }
  const codes = all.filter((c) => map.codes[c]);
  const en = createT("en");
  const id = createT("id");
  for (const c of codes) {
    const k = errorUxKey(c);
    assert.notEqual(en.ux(k as never), k, `en ${c} → ${k}`);
    assert.notEqual(id.ux(k as never), k, `id ${c} → ${k}`);
  }
  assert.equal(errorUxKey("SOMETHING_NEW"), "error.code.internal");
});
