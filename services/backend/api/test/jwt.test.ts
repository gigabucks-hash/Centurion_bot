import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/errors.ts";
import { principal, signJwt, verifyJwt } from "../src/jwt.ts";

const S = "k".repeat(40);
const sub = "00000000-0000-0000-0000-0000000000a1";
const exp = Math.floor(Date.now() / 1000) + 60;

test("verifies HS256 and derives via from sentra_client only", () => {
  const c = verifyJwt(signJwt({ sub, exp, aud: "authenticated", sentra_client: "desktop", app_scopes: ["trade"] }, S), S, "authenticated");
  const p = principal(c);
  assert.equal(p.via, "desktop");
  assert.ok(p.scopes.has("read") && p.scopes.has("trade"), "trade implies read");
  assert.equal(principal({ ...c, sentra_client: "push" }).via, "web", "unknown client -> web");
  assert.equal(principal({ ...c, app_scopes: undefined }).scopes.size, 0, "no scopes claim -> nothing");
});

test("rejects bad signature, alg none, expiry, audience, non-uuid sub", () => {
  const good = signJwt({ sub, exp, aud: "authenticated" }, S);
  const [h, p] = good.split(".");
  const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`;
  const cases = [
    signJwt({ sub, exp, aud: "authenticated" }, "other".repeat(10)),
    none,
    `${h}.${p}`,
    signJwt({ sub, exp: exp - 120, aud: "authenticated" }, S),
    signJwt({ sub, exp, aud: "anon" }, S),
    signJwt({ sub: "not-a-uuid", exp, aud: "authenticated" }, S),
  ];
  for (const t of cases) {
    assert.throws(() => verifyJwt(t, S, "authenticated"), (e: unknown) => e instanceof ApiError && e.code === "UNAUTHENTICATED");
  }
});
