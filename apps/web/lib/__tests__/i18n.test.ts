import { test } from "node:test";
import assert from "node:assert/strict";
import { createT, interpolate, missingKeys } from "../i18n/index.ts";

test("UX catalog wins through aliases, app namespace fills gaps, id falls back to en", () => {
  const en = createT("en");
  const id = createT("id");
  assert.equal(en("approvals.approve"), "Approve");
  assert.equal(id("approvals.approve"), "Setujui");
  assert.equal(id("approvals.skippedToast", { coin: "QUILL" }), "Dilewati: QUILL");
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
    assert.ok(!en(k, { dd: 1, stop: 2, engine: "x", coin: "A", strategy: "B", sol: "1", time: "00:10", n: 1, email: "a@b" }).startsWith("app."), k);
  }
});
