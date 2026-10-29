import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ConfigError, loadConfig } from "../src/config.ts";

const ok = { DATABASE_URL: "postgres://x@localhost/db", SUPABASE_JWT_SECRET: "s".repeat(40) };

test("refuses to start unless TRADING_MODE=paper", () => {
  for (const mode of [undefined, "", "live", "real", "PAPER", "paper "]) {
    assert.throws(() => loadConfig({ ...ok, TRADING_MODE: mode }), ConfigError, `mode ${String(mode)}`);
  }
  assert.equal(loadConfig({ ...ok, TRADING_MODE: "paper" }).port, 8080);
});

test("refuses REAL_TRADING_ENABLED and missing secrets", () => {
  assert.throws(() => loadConfig({ ...ok, TRADING_MODE: "paper", REAL_TRADING_ENABLED: "true" }), ConfigError);
  assert.doesNotThrow(() => loadConfig({ ...ok, TRADING_MODE: "paper", REAL_TRADING_ENABLED: "false" }));
  assert.throws(() => loadConfig({ TRADING_MODE: "paper", SUPABASE_JWT_SECRET: "s".repeat(40) }), /DATABASE_URL/);
  assert.throws(() => loadConfig({ TRADING_MODE: "paper", DATABASE_URL: "x", SUPABASE_JWT_SECRET: "short" }), /SUPABASE_JWT_SECRET/);
});

test("the process exits 78 (EX_CONFIG) when TRADING_MODE is not paper", () => {
  const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));
  const r = spawnSync(process.execPath, [main], { env: { ...ok, PATH: process.env.PATH, TRADING_MODE: "live" }, encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 78);
  assert.match(r.stderr, /refusing to start: TRADING_MODE must be "paper"/);
  assert.doesNotMatch(r.stderr + r.stdout, /s{40}/, "secret never printed");
});
