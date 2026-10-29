// SIWS user creation through the Supabase admin API (fake admin server) and config rules.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { call, startHarness } from "./helpers.ts";
import { b58encode } from "../src/base58.ts";

const DOMAIN = "app.sentra.test";
interface Wallet { address: string; key: KeyObject }
function wallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { address: b58encode(publicKey.export({ format: "der", type: "spki" }).subarray(-32)), key: privateKey };
}
const sig = (w: Wallet, m: string) => b58encode(sign(null, Buffer.from(m, "utf8"), w.key));

describe("SIWS with AUTH_USER_CREATE=supabase_admin", () => {
  test("a new wallet user is created through the Supabase admin API (service-role key from env)", async () => {
    const seen: { url?: string; auth?: string; apikey?: string; body?: any }[] = [];
    const ADMIN_ID = "7a1f0c4e-0000-4000-8000-00000000ad01";
    const fake = createServer((req: IncomingMessage, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        seen.push({ url: req.url, auth: req.headers.authorization, apikey: req.headers.apikey as string, body: JSON.parse(raw) });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: ADMIN_ID, aud: "authenticated" }));
      });
    });
    await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
    const KEY = "test-service-role-key-not-real-000000";
    const w = wallet();
    const h2 = await startHarness({
      AUTH_SIWS_DOMAINS: DOMAIN, OWNER_WALLETS: w.address, AUTH_USER_CREATE: "supabase_admin",
      SUPABASE_URL: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, SUPABASE_SERVICE_ROLE_KEY: KEY,
    });
    try {
      const n = await call(h2.base, "POST", "/v1/auth/siws/nonce", { body: { address: w.address, domain: DOMAIN } });
      const m: string = n.body.data.message;
      const v = await call(h2.base, "POST", "/v1/auth/siws/verify", { body: { address: w.address, message: m, signature: sig(w, m) } });
      assert.equal(v.status, 200, JSON.stringify(v.body));
      assert.equal(v.body.data.user_id, ADMIN_ID);
      assert.equal(seen.length, 1);
      assert.equal(seen[0]!.url, "/auth/v1/admin/users");
      assert.equal(seen[0]!.auth, `Bearer ${KEY}`);
      assert.equal(seen[0]!.apikey, KEY);
      assert.match(seen[0]!.body.email, /^w-[0-9a-f]{32}@wallet\.sentra\.invalid$/);
      assert.equal(seen[0]!.body.user_metadata.wallet, w.address);
      assert.ok(!JSON.stringify(v.body).includes(KEY), "key never echoed");
      // second login: identity exists, no admin call
      const n2 = await call(h2.base, "POST", "/v1/auth/siws/nonce", { body: { address: w.address, domain: DOMAIN } });
      const m2: string = n2.body.data.message;
      const v2 = await call(h2.base, "POST", "/v1/auth/siws/verify", { body: { address: w.address, message: m2, signature: sig(w, m2) } });
      assert.equal(v2.body.data.user_id, ADMIN_ID);
      assert.equal(v2.body.data.workspace_id, v.body.data.workspace_id);
      assert.equal(seen.length, 1);
    } finally {
      await h2.stop();
      fake.closeAllConnections();
      fake.close();
    }
  });

  test("config: supabase_admin needs SUPABASE_URL + key; direct is refused in production", async () => {
    const { loadConfig, ConfigError } = await import("../src/config.ts");
    const base = { TRADING_MODE: "paper", DATABASE_URL: "postgres://x", SUPABASE_JWT_SECRET: "x".repeat(32), AUTH_SIWS_DOMAINS: DOMAIN };
    assert.throws(() => loadConfig(base), ConfigError);
    assert.throws(() => loadConfig({ ...base, AUTH_USER_CREATE: "direct", NODE_ENV: "production" }), ConfigError);
    assert.equal(loadConfig({ ...base, AUTH_USER_CREATE: "direct" }).userCreate, "direct");
  });
});
