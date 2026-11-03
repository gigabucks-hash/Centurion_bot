// Desktop deep-link hand-off (API_ENDPOINTS 4.1.1): verify + PKCE S256 -> one-time code (60 s, single use),
// POST /v1/auth/desktop/exchange {code, code_verifier} -> session. Ephemeral in-memory test keys only.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { call, startHarness, type Harness } from "./helpers.ts";
import { b58encode } from "../src/base58.ts";
import { pkceS256Ok } from "../src/routes_auth.ts";

let h: Harness;
let ipN = 0;
const DOMAIN = "app.centurion.test";
interface Wallet { address: string; key: KeyObject }
function wallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { address: b58encode(publicKey.export({ format: "der", type: "spki" }).subarray(-32)), key: privateKey };
}
const OWNERS = Array.from({ length: 4 }, () => wallet());
const sig = (w: Wallet, m: string) => b58encode(sign(null, Buffer.from(m, "utf8"), w.key));
const hdr = () => ({ "x-forwarded-for": `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}` });
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const STATE = "state_" + "a".repeat(20);

async function verify(w: Wallet, extra: Record<string, unknown>) {
  const n = await call(h.base, "POST", "/v1/auth/siws/nonce", { headers: hdr(), body: { address: w.address, domain: DOMAIN, uri: `https://${DOMAIN}/auth/desktop` } });
  assert.equal(n.status, 200, JSON.stringify(n.body));
  const m = n.body.data.message as string;
  return call(h.base, "POST", "/v1/auth/siws/verify", { headers: hdr(), body: { address: w.address, message: m, signature: sig(w, m), ...extra } });
}
const exchange = (body: Record<string, unknown>) => call(h.base, "POST", "/v1/auth/desktop/exchange", { headers: hdr(), body });

before(async () => {
  h = await startHarness({ AUTH_SIWS_DOMAINS: DOMAIN, OWNER_WALLETS: OWNERS.map((w) => w.address).join(","), TRUST_PROXY: "true", AUTH_USER_CREATE: "direct" });
});
after(async () => {
  await h?.stop();
});

describe("desktop hand-off", () => {
  test("pkceS256Ok matches RFC 7636 appendix B", () => {
    assert.equal(pkceS256Ok("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"), true);
    assert.equal(pkceS256Ok("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXx", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"), false);
    assert.equal(pkceS256Ok("short", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"), false);
  });

  test("verify with a challenge returns only a code; exchange mints a desktop session; single use", async () => {
    const p = pkce();
    const v = await verify(OWNERS[0]!, { client: "desktop", code_challenge: p.challenge, code_challenge_method: "S256", state: STATE });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const d = v.body.data;
    assert.match(d.code, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(d.expires_in, 60);
    assert.equal(d.state, STATE);
    assert.equal(d.redirect_uri, "centurion://auth");
    assert.equal(d.access_token, undefined, "no session from verify");
    assert.equal(d.refresh_token, undefined);
    assert.equal(v.headers.get("set-cookie"), null);
    const x = await exchange({ code: d.code, code_verifier: p.verifier, client: "desktop" });
    assert.equal(x.status, 200, JSON.stringify(x.body));
    assert.match(x.body.data.refresh_token, /^srt_/);
    assert.match(x.body.data.workspace_id, /^[0-9a-f-]{36}$/);
    const claims = JSON.parse(Buffer.from(x.body.data.access_token.split(".")[1], "base64url").toString());
    assert.equal(claims.centurion_client, "desktop");
    assert.equal(claims.wallet, OWNERS[0]!.address);
    assert.equal((await call(h.base, "GET", "/v1/me", { token: x.body.data.access_token })).status, 200);
    const again = await exchange({ code: d.code, code_verifier: p.verifier });
    assert.equal(again.status, 401);
    assert.equal(again.body.error.code, "UNAUTHENTICATED");
    assert.equal(again.body.error.reason, "code_invalid");
  });

  test("wrong verifier burns the code; bad shapes are 422", async () => {
    const p = pkce();
    const v = await verify(OWNERS[1]!, { client: "desktop", code_challenge: p.challenge, code_challenge_method: "S256", state: STATE });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const bad = await exchange({ code: v.body.data.code, code_verifier: pkce().verifier });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.reason, "code_verifier_mismatch");
    const late = await exchange({ code: v.body.data.code, code_verifier: p.verifier });
    assert.equal(late.body.error.reason, "code_invalid", "burned by the failed attempt");
    for (const body of [{ code: "x", code_verifier: p.verifier }, { code: v.body.data.code, code_verifier: "short" }, { code: v.body.data.code, code_verifier: p.verifier, client: "web" }, { code: v.body.data.code, code_verifier: p.verifier, extra: 1 }]) {
      const r = await exchange(body);
      assert.equal(r.status, 422, JSON.stringify(body));
      assert.equal(r.body.error.code, "VALIDATION_FAILED");
    }
  });

  test("verify: S256 only, state required, desktop client only, redirect allowlist centurion://auth", async () => {
    const p = pkce();
    const cases: [Record<string, unknown>, string][] = [
      [{ client: "desktop", code_challenge: p.challenge, code_challenge_method: "plain", state: STATE }, "code_challenge_method"],
      [{ client: "desktop", code_challenge: p.challenge, code_challenge_method: "S256" }, "state"],
      [{ client: "desktop", code_challenge: "short", code_challenge_method: "S256", state: STATE }, "code_challenge"],
      [{ client: "web", code_challenge: p.challenge, code_challenge_method: "S256", state: STATE }, "client"],
      [{ client: "desktop", code_challenge: p.challenge, code_challenge_method: "S256", state: STATE, redirect_uri: "https://evil.example/cb" }, "redirect_uri"],
    ];
    for (const [extra, field] of cases) {
      const r = await verify(OWNERS[2]!, extra);
      assert.equal(r.status, 422, field);
      assert.equal(r.body.error.field, field);
    }
    const ok = await verify(OWNERS[3]!, { client: "desktop", code_challenge: p.challenge, code_challenge_method: "S256", state: STATE, redirect_uri: "centurion://auth" });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test("expired code (60 s TTL) is refused", async (t) => {
    const p = pkce();
    const v = await verify(OWNERS[3]!, { client: "desktop", code_challenge: p.challenge, code_challenge_method: "S256", state: STATE });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const real = Date.now;
    t.after(() => { Date.now = real; });
    Date.now = () => real() + 61_000;
    const r = await exchange({ code: v.body.data.code, code_verifier: p.verifier });
    Date.now = real;
    assert.equal(r.status, 401);
    assert.equal(r.body.error.reason, "code_invalid");
  });
});
