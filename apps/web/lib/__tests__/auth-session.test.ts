import { test } from "node:test";
import assert from "node:assert/strict";
import { accessSession, issueSession, logoutSession, refreshSession, ACCESS_TTL_S } from "../mock/session";
import { WireError } from "../mock/store";
import { gate, safeNext } from "../auth/gate";
import { MOCK_OWNER_WALLET } from "../auth/allowlist";
import { NonceBody, VerifyBody } from "../auth/schemas";

const reason = (code: string, r: string) => (e: unknown) => e instanceof WireError && e.code === code && e.details?.reason === r;

test("session: 15 min access + rotating refresh with reuse revocation", () => {
  const t0 = Date.now();
  const s = issueSession(MOCK_OWNER_WALLET, t0);
  assert.equal(s.expires_in, ACCESS_TTL_S);
  assert.match(s.refresh_token, /^srt_/);
  assert.ok(accessSession(s.access_token, t0));
  assert.equal(accessSession(s.access_token, t0 + ACCESS_TTL_S * 1000 + 1), null, "access expires after 900 s");
  const s2 = refreshSession(s.refresh_token, t0 + 1000);
  assert.notEqual(s2.refresh_token, s.refresh_token);
  assert.equal(s2.session_id, s.session_id);
  assert.throws(() => refreshSession(s.refresh_token), reason("UNAUTHENTICATED", "refresh_reused"));
  assert.throws(() => refreshSession(s2.refresh_token), reason("UNAUTHENTICATED", "refresh_revoked"), "reuse revoked the family");
  assert.equal(accessSession(s2.access_token), null);
});

test("session: owner removed from OWNER_WALLETS → refresh 403 wallet_not_allowed; logout revokes", () => {
  const s = issueSession(MOCK_OWNER_WALLET);
  process.env.OWNER_WALLETS = "SomeoneElse1111111111111111111111111111111";
  try {
    assert.throws(() => refreshSession(s.refresh_token), reason("FORBIDDEN_ROLE", "wallet_not_allowed"));
  } finally {
    delete process.env.OWNER_WALLETS;
  }
  const s2 = issueSession(MOCK_OWNER_WALLET);
  assert.deepEqual(logoutSession(s2.refresh_token), { revoked: true });
  assert.throws(() => refreshSession(s2.refresh_token), reason("UNAUTHENTICATED", "refresh_revoked"));
  assert.throws(() => refreshSession(undefined), reason("UNAUTHENTICATED", "refresh_invalid"));
});

test("gate: pages redirect without cookies, APIs 401, auth routes public, off switch", () => {
  const none = { access: false, refresh: false };
  assert.deepEqual(gate("/positions", "?x=1", none, true), { kind: "redirect", to: "/login?next=%2Fpositions%3Fx%3D1" });
  assert.deepEqual(gate("/api/v1/workspaces/ws_mock/approvals", "", none, true), { kind: "unauthorized" });
  assert.deepEqual(gate("/api/v1/auth/siws/nonce", "", none, true), { kind: "pass" });
  assert.deepEqual(gate("/login", "", none, true), { kind: "pass" });
  assert.deepEqual(gate("/", "", { access: false, refresh: true }, true), { kind: "pass" }, "refresh-only → client refreshes silently");
  assert.deepEqual(gate("/", "", none, false), { kind: "pass" });
});

test("safeNext only allows same-origin paths", () => {
  assert.equal(safeNext("/positions?x=1"), "/positions?x=1");
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "/a\nb", null, ""]) assert.equal(safeNext(bad as string | null), null, String(bad));
});

test("auth zod schemas reject junk and extra fields", () => {
  assert.equal(NonceBody.safeParse({ address: MOCK_OWNER_WALLET, domain: "localhost:3100" }).success, true);
  assert.equal(NonceBody.safeParse({ address: "0OIl-not-base58", domain: "x" }).success, false);
  assert.equal(VerifyBody.safeParse({ address: MOCK_OWNER_WALLET, message: "m", signature: "s", extra: 1 }).success, false);
});
