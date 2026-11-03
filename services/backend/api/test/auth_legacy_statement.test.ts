// B-7 transition: AUTH_SIWS_LEGACY_STATEMENT=false retires statement v1 ("Centurion") at once; v2 ("Centurion Trade") only.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { call, startHarness, type Harness } from "./helpers.ts";
import { b58encode } from "../src/base58.ts";
import { SIWS_STATEMENTS } from "../src/siws.ts";

const DOMAIN = "app.centurion.test";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const ADDRESS = b58encode(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
const sig = (m: string) => b58encode(sign(null, Buffer.from(m, "utf8"), privateKey));

describe("SIWS legacy statement retired", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness({
      AUTH_SIWS_DOMAINS: DOMAIN, OWNER_WALLETS: ADDRESS, AUTH_USER_CREATE: "direct", AUTH_SIWS_LEGACY_STATEMENT: "false",
    });
  });
  after(async () => h.stop());
  const nonce = (extra: Record<string, unknown> = {}) =>
    call(h.base, "POST", "/v1/auth/siws/nonce", { body: { address: ADDRESS, domain: DOMAIN, ...extra } });
  const verify = (message: string) =>
    call(h.base, "POST", "/v1/auth/siws/verify", { body: { address: ADDRESS, message, signature: sig(message) } });

  test("v1 nonce is refused, v2 logs in, a v1 message on an old v1 nonce row is refused", async () => {
    const v1 = await nonce({ statement_version: 1 });
    assert.equal(v1.status, 422);
    assert.deepEqual(v1.body.error.allowed, [2]);
    const v2 = await nonce();
    assert.equal(v2.status, 200);
    assert.equal((await verify(v2.body.data.message)).status, 200);

    const old = await nonce();
    await h.db.query("update public.siws_nonces set statement_version = 1 where nonce = $1", [old.body.data.nonce]);
    const m = String(old.body.data.message).replace(SIWS_STATEMENTS[2]!, SIWS_STATEMENTS[1]!);
    const r = await verify(m);
    assert.equal(r.status, 401, JSON.stringify(r.body));
    assert.equal(r.body.error.code, "SIWS_NONCE_INVALID");
    assert.equal(r.body.error.reason, "statement_retired");
  });

  test("healthz names the product", async () => {
    const r = await call(h.base, "GET", "/healthz");
    assert.equal(r.body.product, "Centurion Trade");
    assert.equal(r.body.service, "Centurion Trade API");
    assert.equal(r.body.contracts_version, "1.1.5");
  });
});
