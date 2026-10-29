import { test } from "node:test";
import assert from "node:assert/strict";
import { createT, interpolate, missingKeys } from "../i18n/index.ts";

test("interpolates variables and falls back to English", () => {
  const t = createT("id");
  assert.equal(t("approvals.skippedToast", { coin: "QUILL" }), "Dilewati: QUILL");
  // key without an Indonesian string yet -> English
  assert.equal(t("stats.closed"), "Closed trades");
  assert.equal(interpolate("{a}-{b}", { a: 1 }), "1-{b}");
});

test("English dictionary is complete; id scaffold reports its gaps", () => {
  assert.deepEqual(missingKeys("en"), []);
  assert.ok(missingKeys("id").length > 0);
});
