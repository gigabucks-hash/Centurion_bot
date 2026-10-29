// Write-route rate limits: per IP, per user, per route; memory and Postgres stores.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OWNER, call, startHarness, token, type Harness } from "./helpers.ts";
import { RateLimiter, PgRateLimiter } from "../src/ratelimit.ts";
import { ApiError } from "../src/errors.ts";

describe("write-route rate limits", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness({ TRUST_PROXY: "true", RATE_LIMIT_WRITE_ROUTE_PER_MIN: "3", RATE_LIMIT_WRITE_IP_PER_MIN: "5", RATE_LIMIT_WRITE_USER_PER_MIN: "4" });
  });
  after(async () => h.stop());

  test("per route (user or IP): 4th write to the same route is 429 with Retry-After", async () => {
    const hdr = { "x-forwarded-for": "203.0.113.10" };
    for (let i = 0; i < 3; i++) {
      const r = await call(h.base, "POST", "/v1/auth/session/logout", { body: {}, headers: hdr });
      assert.notEqual(r.status, 429);
    }
    const r = await call(h.base, "POST", "/v1/auth/session/logout", { body: {}, headers: hdr });
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, "RATE_LIMITED");
    assert.equal(r.body.error.limit, 3);
    assert.equal(r.body.error.window_s, 60);
    assert.ok(Number(r.headers.get("retry-after")) >= 1);
    // reads are never write-limited
    assert.notEqual((await call(h.base, "GET", "/healthz", { headers: hdr })).status, 429);
  });

  test("per IP across routes", async () => {
    const hdr = { "x-forwarded-for": "203.0.113.11" };
    const routes = ["/v1/auth/session/logout", "/v1/auth/session/refresh", "/v1/auth/siws/verify"];
    const st: number[] = [];
    for (let i = 0; i < 6; i++) st.push((await call(h.base, "POST", routes[i % 3]!, { body: {}, headers: hdr })).status);
    assert.equal(st.filter((s) => s === 429).length, 1, JSON.stringify(st));
    assert.equal(st[5], 429);
  });

  test("per user across IPs", async () => {
    const tok = token(OWNER);
    const st: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await call(h.base, "POST", i % 2 ? "/v1/auth/session/logout" : "/v1/auth/session/refresh", {
        body: {}, token: tok, headers: { "x-forwarded-for": `198.51.100.${i}` },
      });
      st.push(r.status);
    }
    assert.equal(st[4], 429, JSON.stringify(st));
    assert.equal(st.filter((s) => s === 429).length, 1);
  });

  test("memory: window resets", async () => {
    let now = 0;
    const l = new RateLimiter(() => now);
    await l.hit("k", 1, 10);
    await assert.rejects(l.hit("k", 1, 10), (e: unknown) => e instanceof ApiError && e.code === "RATE_LIMITED");
    now = 10_000;
    await l.hit("k", 1, 10);
  });

  test("postgres: counters shared between limiter instances", async () => {
    {
      const a = new PgRateLimiter(h.db), b = new PgRateLimiter(h.db);
      const key = `t:${Date.now()}`;
      await a.hit(key, 2, 60);
      await b.hit(key, 2, 60);
      await assert.rejects(a.hit(key, 2, 60), (e: unknown) => e instanceof ApiError && e.code === "RATE_LIMITED" && Number(e.details?.retry_after_s) >= 1);
      // not callable by app roles
      const c = await h.db.connect();
      try {
        await c.query("set role authenticated");
        await assert.rejects(c.query("select public.rate_limit_hit('x', 1, 60)"));
      } finally { await c.query("reset role"); c.release(); }
    }
  });
});
