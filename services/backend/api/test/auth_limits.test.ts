// B-2: login limits never hard-block the allow-listed owner; strangers are rejected cheaply and hard-limited per IP.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { call, startHarness, type Harness } from "./helpers.ts";
import { b58encode } from "../src/base58.ts";

const DOMAIN = "app.centurion.test";
interface Wallet { address: string; key: KeyObject }
function wallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { address: b58encode(publicKey.export({ format: "der", type: "spki" }).subarray(-32)), key: privateKey };
}
const OWNER = wallet();
const xff = (ip: string) => ({ "x-forwarded-for": ip });

describe("B-2 login limits", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness({
      AUTH_SIWS_DOMAINS: DOMAIN, OWNER_WALLETS: OWNER.address, TRUST_PROXY: "true", AUTH_USER_CREATE: "direct",
      AUTH_STRANGER_IP_PER_MIN: "5", AUTH_OWNER_IP_PER_MIN: "3", AUTH_OWNER_PER_MIN: "6", AUTH_OWNER_MAX_DELAY_MS: "600",
    });
  });
  after(async () => h.stop());
  const nonce = (address: string, ip: string) =>
    call(h.base, "POST", "/v1/auth/siws/nonce", { headers: xff(ip), body: { address, domain: DOMAIN } });

  test("strangers: 403 without any DB work, then 429 per IP; the owner on that same IP still gets in", async () => {
    const before = (await h.db.query("select count(*)::int n from public.siws_nonces")).rows[0].n;
    const st: number[] = [];
    for (let i = 0; i < 6; i++) st.push((await nonce(wallet().address, "192.0.2.50")).status);
    assert.deepEqual(st, [403, 403, 403, 403, 403, 429]);
    assert.equal((await call(h.base, "POST", "/v1/auth/siws/nonce", { headers: xff("192.0.2.50"), body: { address: "bad", domain: DOMAIN } })).status, 429);
    assert.equal((await h.db.query("select count(*)::int n from public.siws_nonces")).rows[0].n, before, "no nonce rows for strangers");
    const stranger = await call(h.base, "POST", "/v1/auth/siws/verify", {
      headers: xff("192.0.2.51"), body: { address: wallet().address, message: "x", signature: "1" },
    });
    assert.equal(stranger.status, 403, "rejected before the message or signature is looked at");
    const ok = await nonce(OWNER.address, "192.0.2.50");
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test("flooding the owner's address from many IPs never returns 429, only a bounded delay; owner still logs in", async () => {
    const st: number[] = [];
    let delayed = 0;
    for (let i = 0; i < 9; i++) {
      const t0 = Date.now();
      const r = await nonce(OWNER.address, `198.51.100.${i}`);
      st.push(r.status);
      const d = Number(r.headers.get("x-centurion-login-delay-ms") ?? 0);
      if (d > 0) {
        delayed += 1;
        assert.ok(d <= 600);
        assert.ok(Date.now() - t0 >= d - 20);
      }
    }
    assert.ok(st.every((s) => s === 200), String(st));
    assert.ok(delayed >= 3, `delayed ${delayed}`);
    // the owner completes a login despite the flood
    const n = await nonce(OWNER.address, "203.0.113.200");
    const sig = b58encode(sign(null, Buffer.from(n.body.data.message, "utf8"), OWNER.key));
    const v = await call(h.base, "POST", "/v1/auth/siws/verify", {
      headers: xff("203.0.113.200"), body: { address: OWNER.address, message: n.body.data.message, signature: sig },
    });
    assert.equal(v.status, 200, JSON.stringify(v.body));
  });

  test("owner counters are shared in Postgres", async () => {
    const r = await h.db.query("select count(*)::int n from public.rate_limit_counters where bucket like 'siws:nonce:owner:%'");
    assert.ok(r.rows[0].n >= 2);
  });
});
