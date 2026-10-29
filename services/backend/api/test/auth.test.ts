// SIWS wallet login + rotating sessions. Ephemeral ed25519 test keys are generated in memory per run
// (never stored); the API only verifies signatures.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { call, startHarness, type Harness } from "./helpers.ts";
import { b58encode } from "../src/base58.ts";

let h: Harness;
let ipN = 0;
const DOMAIN = "app.sentra.test";

interface Wallet { address: string; key: KeyObject }
function wallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { address: b58encode(raw), key: privateKey };
}
const sig = (w: Wallet, m: string) => b58encode(sign(null, Buffer.from(m, "utf8"), w.key));
// several allow-listed owner wallets so each test stays under the 5/min/address limit
const OWNERS = Array.from({ length: 6 }, () => wallet());
let OWNER_W = OWNERS[0]!;
const OTHER_W = wallet();

function ipHeaders(fixed?: string): Record<string, string> {
  return { "x-forwarded-for": fixed ?? `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}` };
}
async function nonce(w: Wallet, extra: object = {}, headers = ipHeaders()) {
  return call(h.base, "POST", "/v1/auth/siws/nonce", { headers, body: { address: w.address, domain: DOMAIN, uri: `https://${DOMAIN}/login`, ...extra } });
}
async function login(w: Wallet, client = "desktop") {
  const n = await nonce(w);
  assert.equal(n.status, 200, JSON.stringify(n.body));
  const v = await call(h.base, "POST", "/v1/auth/siws/verify", {
    headers: ipHeaders(), body: { address: w.address, message: n.body.data.message, signature: sig(w, n.body.data.message), client },
  });
  return { n, v };
}

before(async () => {
  h = await startHarness({ AUTH_SIWS_DOMAINS: DOMAIN, OWNER_WALLETS: OWNERS.map((w) => w.address).join(","), TRUST_PROXY: "true", AUTH_ACCESS_TTL_S: "600", AUTH_USER_CREATE: "direct" });
});
after(async () => {
  await h?.stop();
});

describe("SIWS login", () => {
  test("nonce -> sign -> verify mints a short-lived access token that the API accepts", async () => {
    const { n, v } = await login(OWNER_W);
    const m: string = n.body.data.message;
    assert.match(m, new RegExp(`^${DOMAIN.replace(/\./g, "\\.")} wants you to sign in with your Solana account:\n${OWNER_W.address}\n`));
    assert.match(m, /\nChain ID: solana:mainnet\nNonce: [A-Za-z0-9]{32}\n/);
    assert.equal(Date.parse(n.body.data.expires_at) - Date.parse(n.body.data.issued_at), 300_000, "5 min nonce");
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const s = v.body.data;
    assert.equal(s.token_type, "bearer");
    assert.equal(s.expires_in, 600);
    assert.match(s.refresh_token, /^srt_/);
    assert.equal(s.address, OWNER_W.address);
    const me = await call(h.base, "GET", "/v1/me", { token: s.access_token });
    assert.equal(me.status, 200, JSON.stringify(me.body));
    const claims = JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString());
    assert.deepEqual([claims.sub, claims.sentra_client, claims.app_scopes, claims.exp - claims.iat], [s.user_id, "desktop", ["read", "trade"], 600]);
    assert.ok(!JSON.stringify(claims).includes("real"), "never trade:real");
    // same wallet again -> same user (identity upsert)
    const again = await login(OWNER_W, "web");
    assert.equal(again.v.body.data.user_id, s.user_id);
    // single owner: the first login created the owner's workspace; later logins reuse it
    assert.match(s.workspace_id, /^[0-9a-f-]{36}$/);
    assert.equal(again.v.body.data.workspace_id, s.workspace_id);
    const ws = await call(h.base, "GET", `/v1/workspaces/${s.workspace_id}`, { token: s.access_token });
    assert.equal(ws.status, 200, JSON.stringify(ws.body));
    const owned = await h.db.query("select count(*)::int as n from public.workspaces where owner_id = $1", [s.user_id]);
    assert.equal(owned.rows[0].n, 1);
    const role = await h.db.query("select role::text from public.workspace_members where workspace_id = $1 and user_id = $2", [s.workspace_id, s.user_id]);
    assert.equal(role.rows[0].role, "owner");
    const ident = await h.db.query("select count(*)::int as n from public.auth_identities where provider = 'siws' and subject = $1", [OWNER_W.address]);
    assert.equal(ident.rows[0].n, 1);
  });

  test("nonce is single-use and bound to address and domain; expired nonces fail", async () => {
    OWNER_W = OWNERS[1]!;
    const n = await nonce(OWNER_W);
    const m: string = n.body.data.message;
    const body = { address: OWNER_W.address, message: m, signature: sig(OWNER_W, m) };
    assert.equal((await call(h.base, "POST", "/v1/auth/siws/verify", { headers: ipHeaders(), body })).status, 200);
    const reuse = await call(h.base, "POST", "/v1/auth/siws/verify", { headers: ipHeaders(), body });
    assert.equal(reuse.body.error.code, "SIWS_NONCE_INVALID");
    // bound to the address: the message names OWNER_W; another address cannot use it
    const n2 = await nonce(OWNER_W);
    const other = await call(h.base, "POST", "/v1/auth/siws/verify", {
      headers: ipHeaders(), body: { address: OWNERS[5]!.address, message: n2.body.data.message, signature: sig(OWNERS[5]!, n2.body.data.message) },
    });
    assert.equal(other.status, 401, JSON.stringify(other.body)); // message/address mismatch (another allow-listed wallet)
    assert.equal(other.body.error.code, "SIWS_NONCE_INVALID");
    // bound to the domain: rewriting the domain in a nonce row's message no longer matches the stored binding
    await h.db.query("update public.siws_nonces set domain = 'evil.test' where nonce = $1", [n2.body.data.nonce]);
    const m2: string = n2.body.data.message;
    const bad = await call(h.base, "POST", "/v1/auth/siws/verify", { headers: ipHeaders(), body: { address: OWNER_W.address, message: m2, signature: sig(OWNER_W, m2) } });
    assert.equal(bad.body.error.code, "SIWS_NONCE_INVALID");
    // expired in the DB
    const n3 = await nonce(OWNER_W);
    await h.db.query("update public.siws_nonces set issued_at = issued_at - interval '10 minutes', expires_at = expires_at - interval '10 minutes' where nonce = $1", [n3.body.data.nonce]);
    const m3: string = n3.body.data.message;
    const exp = await call(h.base, "POST", "/v1/auth/siws/verify", { headers: ipHeaders(), body: { address: OWNER_W.address, message: m3, signature: sig(OWNER_W, m3) } });
    assert.equal(exp.body.error.code, "SIWS_NONCE_INVALID");
  });

  test("bad signature, tampered message, wrong domain, Origin mismatch", async () => {
    OWNER_W = OWNERS[2]!;
    const n = await nonce(OWNER_W);
    const m: string = n.body.data.message;
    const wrongSig = await call(h.base, "POST", "/v1/auth/siws/verify", { headers: ipHeaders(), body: { address: OWNER_W.address, message: m, signature: sig(OTHER_W, m) } });
    assert.equal(wrongSig.status, 401, JSON.stringify(wrongSig.body));
    assert.equal(wrongSig.body.error.code, "SIWS_SIGNATURE_INVALID");
    const n2 = await nonce(OWNER_W);
    const tampered = (n2.body.data.message as string).replace("Version: 1", "Version: 1\nResources: x");
    const t = await call(h.base, "POST", "/v1/auth/siws/verify", { headers: ipHeaders(), body: { address: OWNER_W.address, message: tampered, signature: sig(OWNER_W, tampered) } });
    assert.equal(t.body.error.code, "SIWS_NONCE_INVALID");
    const d = await nonce(OWNERS[5]!, { domain: "evil.test", uri: "https://evil.test/" });
    assert.equal(d.status, 422);
    assert.equal(d.body.error.field, "domain", "flat error envelope");
    const o = await nonce(OWNERS[5]!, {}, { ...ipHeaders(), origin: "https://evil.test" });
    assert.equal(o.status, 422);
    const ok = await nonce(OWNERS[5]!, {}, { ...ipHeaders(), origin: `https://${DOMAIN}` });
    assert.equal(ok.status, 200);
    assert.equal((await nonce(OWNERS[5]!, { chain_id: "solana:devnet" })).status, 422);
    assert.equal((await call(h.base, "POST", "/v1/auth/siws/nonce", { headers: ipHeaders(), body: { address: "not-a-wallet", domain: DOMAIN } })).status, 422);
  });

  test("OWNER_WALLETS: any other wallet is refused", async () => {
    const n = await nonce(OTHER_W);
    assert.equal(n.status, 403);
    assert.equal(n.body.error.code, "FORBIDDEN_ROLE");
    assert.equal(n.body.error.reason, "wallet_not_allowed");
  });

  test("refresh rotates; reusing a rotated token revokes the whole family; logout revokes", async () => {
    OWNER_W = OWNERS[3]!;
    const { v } = await login(OWNER_W);
    const r1 = v.body.data.refresh_token;
    const a = await call(h.base, "POST", "/v1/auth/session/refresh", { headers: ipHeaders(), body: { refresh_token: r1 } });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const r2 = a.body.data.refresh_token;
    assert.notEqual(r2, r1);
    assert.equal(a.body.data.session_id, v.body.data.session_id);
    assert.equal((await call(h.base, "GET", "/v1/me", { token: a.body.data.access_token })).status, 200);
    const reuse = await call(h.base, "POST", "/v1/auth/session/refresh", { headers: ipHeaders(), body: { refresh_token: r1 } });
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.error.reason, "refresh_reused");
    const after = await call(h.base, "POST", "/v1/auth/session/refresh", { headers: ipHeaders(), body: { refresh_token: r2 } });
    assert.equal(after.status, 401, "family revoked");
    assert.equal(after.body.error.reason, "refresh_revoked");
    const stored = await h.db.query("select count(*)::int as n from public.auth_refresh_tokens where token_sha256 = digest($1, 'sha256')", [r2]);
    assert.equal(stored.rows[0].n, 1, "only the hash is stored");
    // logout
    const { v: v2 } = await login(OWNER_W);
    assert.equal((await call(h.base, "POST", "/v1/auth/session/logout", { headers: ipHeaders(), body: { refresh_token: v2.body.data.refresh_token } })).status, 200);
    const gone = await call(h.base, "POST", "/v1/auth/session/refresh", { headers: ipHeaders(), body: { refresh_token: v2.body.data.refresh_token } });
    assert.equal(gone.status, 401);
    assert.equal((await call(h.base, "POST", "/v1/auth/session/refresh", { headers: ipHeaders(), body: { refresh_token: "nope" } })).status, 401);
  });

  test("email OTP and Telegram are off by default (404)", async () => {
    for (const p of ["/v1/auth/email/otp/request", "/v1/auth/telegram/nonce"]) {
      assert.equal((await call(h.base, "POST", p, { body: {} })).status, 404);
    }
  });
});

