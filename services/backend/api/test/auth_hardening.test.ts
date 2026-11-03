// SIWS hardening: B-3 (all message fields bound to the nonce row), B-4 (refresh grace), B-5 (logout kills the
// access token via sid), B-7 (statement version), B-10 (our own session key).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { SECRET, SESSION_SECRET, call, startHarness, type Harness } from "./helpers.ts";
import { b58encode } from "../src/base58.ts";
import { signJwt } from "../src/jwt.ts";

const DOMAIN = "app.centurion.test";
interface Wallet { address: string; key: KeyObject }
function wallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { address: b58encode(publicKey.export({ format: "der", type: "spki" }).subarray(-32)), key: privateKey };
}
const W = wallet();
const sig = (m: string) => b58encode(sign(null, Buffer.from(m, "utf8"), W.key));

describe("SIWS hardening", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness({ AUTH_SIWS_DOMAINS: DOMAIN, OWNER_WALLETS: W.address, AUTH_USER_CREATE: "direct" });
  });
  after(async () => h.stop());
  const nonce = (extra: Record<string, unknown> = {}) =>
    call(h.base, "POST", "/v1/auth/siws/nonce", { body: { address: W.address, domain: DOMAIN, ...extra } });
  const verify = (message: string) =>
    call(h.base, "POST", "/v1/auth/siws/verify", { body: { address: W.address, message, signature: sig(message), client: "mobile" } });
  const login = async () => {
    const n = await nonce();
    const v = await verify(n.body.data.message);
    assert.equal(v.status, 200, JSON.stringify(v.body));
    return v.body.data;
  };

  test("B-3: a validly signed message whose uri / issued_at differ from the nonce row is refused", async () => {
    const n = await nonce({ uri: `https://${DOMAIN}/login` });
    const m: string = n.body.data.message;
    for (const forged of [
      m.replace(`URI: https://${DOMAIN}/login`, `URI: https://${DOMAIN}/other`),
      m.replace(/Issued At: .*/, `Issued At: ${new Date(Date.parse(n.body.data.issued_at) - 1000).toISOString()}`),
    ]) {
      assert.notEqual(forged, m);
      const r = await verify(forged);
      assert.equal(r.status, 401, JSON.stringify(r.body));
      assert.equal(r.body.error.code, "SIWS_NONCE_INVALID");
    }
    const row = await h.db.query("select uri, chain_id, statement_version, consumed_at from public.siws_nonces where nonce = $1", [n.body.data.nonce]);
    assert.equal(row.rows[0].uri, `https://${DOMAIN}/login`);
    assert.equal(row.rows[0].chain_id, "solana:mainnet");
    assert.ok(row.rows[0].consumed_at, "a mismatching message burns the nonce");
    assert.equal((await verify(m)).status, 401, "the genuine message cannot use a burned nonce");
  });

  test("B-7: statement version is returned, stored and validated", async () => {
    const n = await nonce();
    assert.equal(n.body.data.statement_version, 2);
    assert.ok(String(n.body.data.message).includes("\n\nSign in to Centurion Trade\n"), n.body.data.message);
    assert.equal((await nonce({ statement_version: 3 })).status, 422);
    assert.equal((await nonce({ statement_version: "1" })).status, 422);
    // legacy v1 is still accepted during the transition window (default until 2026-11-05T12:00:00Z)
    const legacy = await nonce({ statement_version: 1 });
    assert.equal(legacy.status, 200);
    assert.ok(String(legacy.body.data.message).includes("Sign in to Centurion (practice)."));
    assert.equal((await verify(legacy.body.data.message)).status, 200);
  });

  test("B-4: parallel refresh inside the grace window gets the same pair; replay after the window revokes", async () => {
    const s = await login();
    const refresh = (t: string) => call(h.base, "POST", "/v1/auth/session/refresh", { body: { refresh_token: t } });
    const [a, b] = await Promise.all([refresh(s.refresh_token), refresh(s.refresh_token)]);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal(a.body.data.refresh_token, b.body.data.refresh_token);
    assert.equal(a.body.data.access_token, b.body.data.access_token);
    assert.notEqual(a.body.data.refresh_token, s.refresh_token);
    const live = await h.db.query("select count(*)::int n from public.auth_refresh_tokens where family_id = $1 and revoked_at is null", [s.session_id]);
    assert.equal(live.rows[0].n, 2, "no revocation, one successor");
    // successor keeps working
    const c = await refresh(a.body.data.refresh_token);
    assert.equal(c.status, 200);
    // outside the window: move the first rotation back 11 s, replay -> family revoked
    await h.db.query("update public.auth_refresh_tokens set used_at = used_at - interval '11 seconds' where family_id = $1 and used_at is not null", [s.session_id]);
    const late = await refresh(s.refresh_token);
    assert.equal(late.status, 401);
    assert.equal(late.body.error.reason, "refresh_reused");
    assert.equal((await refresh(c.body.data.refresh_token)).status, 401);
  });

  test("B-5: logout (and reuse revocation) end the access token immediately via sid", async () => {
    const s = await login();
    const claims = JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString());
    assert.equal(claims.sid, s.session_id);
    assert.equal((await call(h.base, "GET", "/v1/me", { token: s.access_token })).status, 200);
    assert.equal((await call(h.base, "POST", "/v1/auth/session/logout", { body: { refresh_token: s.refresh_token } })).status, 200);
    const r = await call(h.base, "GET", "/v1/me", { token: s.access_token });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.reason, "session_revoked");
  });

  test("B-10: wallet-login tokens use our own key, never the Supabase secret", async () => {
    const s = await login();
    const claims = JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString());
    assert.equal(claims.iss, "centurion-api");
    const forgedWithSupabase = signJwt(claims, SECRET);
    assert.equal((await call(h.base, "GET", "/v1/me", { token: forgedWithSupabase })).status, 401);
    const { iss: _i, ...noIss } = claims;
    assert.equal((await call(h.base, "GET", "/v1/me", { token: signJwt(noIss, SESSION_SECRET) })).status, 401);
    assert.equal((await call(h.base, "GET", "/v1/me", { token: signJwt({ ...claims, sid: "x" }, SESSION_SECRET) })).status, 401);
    assert.equal((await call(h.base, "GET", "/v1/me", { token: s.access_token })).status, 200);
  });
});
