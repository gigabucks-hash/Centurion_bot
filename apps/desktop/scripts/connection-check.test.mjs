// Paper connection field rules: `npm run test:ui` (node --test strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBackend, checkLoginUrl, needsRestart } from "../src/components/connectionCheck.ts";

test("backend: empty means demo data, https anywhere, http only to loopback", () => {
  assert.deepEqual(checkBackend("  "), { ok: true, value: null });
  assert.deepEqual(checkBackend("https://paper.example.com/"), { ok: true, value: "https://paper.example.com" });
  assert.deepEqual(checkBackend("http://127.0.0.1:8080"), { ok: true, value: "http://127.0.0.1:8080" });
  assert.deepEqual(checkBackend("http://localhost:8080"), { ok: true, value: "http://localhost:8080" });
  assert.deepEqual(checkBackend("http://[::1]:8080"), { ok: true, value: "http://[::1]:8080" });
});

test("backend: rejects remote http, paths, credentials and a missing scheme", () => {
  assert.deepEqual(checkBackend("http://paper.example.com"), { ok: false, error: "backend_loopback" });
  assert.deepEqual(checkBackend("https://paper.example.com/v1"), { ok: false, error: "backend_path" });
  assert.deepEqual(checkBackend("https://paper.example.com?x=1"), { ok: false, error: "backend_path" });
  assert.deepEqual(checkBackend("paper.example.com"), { ok: false, error: "backend_scheme" });
  assert.deepEqual(checkBackend("http://user:pw@127.0.0.1"), { ok: false, error: "backend_url" });
  assert.deepEqual(checkBackend(`https://${"a".repeat(260)}`), { ok: false, error: "backend_url" });
});

test("login page: https anywhere, http only loopback, a path is allowed", () => {
  assert.deepEqual(checkLoginUrl(""), { ok: true, value: null });
  assert.deepEqual(checkLoginUrl(" https://app.example.com/auth/desktop "), {
    ok: true,
    value: "https://app.example.com/auth/desktop",
  });
  assert.deepEqual(checkLoginUrl("http://localhost:3100/auth/desktop"), {
    ok: true,
    value: "http://localhost:3100/auth/desktop",
  });
  assert.deepEqual(checkLoginUrl("http://app.example.com/auth/desktop"), { ok: false, error: "login_loopback" });
  assert.deepEqual(checkLoginUrl("https://app.example.com/auth#x"), { ok: false, error: "login_url" });
  assert.deepEqual(checkLoginUrl("ftp://app.example.com"), { ok: false, error: "login_scheme" });
});

test("scheme and loopback host are case-insensitive", () => {
  assert.deepEqual(checkBackend("HTTPS://Paper.Example.COM"), { ok: true, value: "https://Paper.Example.COM" });
  assert.deepEqual(checkBackend("Http://LOCALHOST:8080"), { ok: true, value: "http://LOCALHOST:8080" });
  assert.deepEqual(checkLoginUrl("HTTPS://App.Example.com/auth/desktop"), {
    ok: true,
    value: "https://App.Example.com/auth/desktop",
  });
});

test("a restart is needed only when the API base itself changes", () => {
  assert.equal(needsRestart("https://a.example.com", "https://a.example.com"), false);
  assert.equal(needsRestart(null, null), false);
  assert.equal(needsRestart(null, "https://a.example.com"), true);
  assert.equal(needsRestart("https://a.example.com", null), true);
  assert.equal(needsRestart("https://a.example.com", "https://b.example.com"), true);
});