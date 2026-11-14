import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { b58encode } from "../auth/wallet.ts";
import { trails } from "../mock/data.ts";
import { localWriteAllowed, bearerMatches, loopbackHost } from "../local/http-guard.ts";
import { auditOk, mcpCall, setMcpEnabled } from "../local/mcp.ts";
import { armEnable, defaultBook, enableReal, writeBook } from "../local/real-book.ts";

function enableSignedBook() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const address = b58encode(new Uint8Array(der.subarray(der.length - 32)));
  const armed = armEnable(defaultBook(), address);
  if ("error" in armed) throw new Error(armed.error);
  const signature = b58encode(new Uint8Array(sign(null, Buffer.from(armed.message), privateKey)));
  const enabled = enableReal(armed.book, address, signature);
  if ("error" in enabled) throw new Error(enabled.error);
  writeBook(enabled.book);
}
import { MCP_TOOLS } from "../../mcp/registry.ts";

const MINT = "So11111111111111111111111111111111111111112";

function withLocal(run: () => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "centurion-mcp-"));
  const prev = {
    local: process.env.CENTURION_LOCAL,
    data: process.env.DATA_SOURCE,
    folder: process.env.CENTURION_LOCAL_DIR,
  };
  process.env.CENTURION_LOCAL = "1";
  delete process.env.DATA_SOURCE;
  process.env.CENTURION_LOCAL_DIR = dir;
  try {
    run();
  } finally {
    if (prev.local === undefined) delete process.env.CENTURION_LOCAL;
    else process.env.CENTURION_LOCAL = prev.local;
    if (prev.data === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = prev.data;
    if (prev.folder === undefined) delete process.env.CENTURION_LOCAL_DIR;
    else process.env.CENTURION_LOCAL_DIR = prev.folder;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("MCP tool list covers operation and does not offer key export or a transfer out", () => {
  const names = MCP_TOOLS.map((tool) => tool.name) as string[];
  for (const required of ["centurion_status", "centurion_engine_stop", "centurion_engine_start", "centurion_list_positions", "centurion_pnl", "centurion_team_scores", "centurion_paper_buy", "centurion_paper_sell", "centurion_sell_all", "centurion_get_settings", "centurion_update_settings", "centurion_real_buy", "centurion_real_sell"]) {
    assert.ok(names.includes(required), required);
  }
  const text = MCP_TOOLS.map((tool) => tool.description).join("\n");
  assert.equal(/privateKey|export the key/i.test(text), false);
  assert.equal(/tauri/i.test(text), false);
});

test("paper buy and sell-all work; real buy waits until Real is on; loosen applies with no extra signature", () => {
  withLocal(() => {
    const known = trails[0]!.coin.mint;
    const scores = mcpCall("centurion_team_scores", { mint: known });
    assert.equal(scores.found, true);
    const modules = scores.modules as { id: string; available: boolean }[];
    assert.equal(modules.find((m) => m.id === "smart_money")?.available, false);

    const bought = mcpCall("centurion_paper_buy", { mint: MINT, symbol: "SOL", sol: 0.02 });
    assert.equal(bought.ok, true);
    const sold = mcpCall("centurion_sell_all", { mode: "practice" });
    assert.equal(Array.isArray(sold.sold), true);

    const blocked = mcpCall("centurion_real_buy", { mint: MINT, symbol: "SOL", sol: 0.01 });
    assert.equal(blocked.error, "real_off");

    enableSignedBook();
    const real = mcpCall("centurion_real_buy", { mint: MINT, symbol: "SOL", sol: 0.01 });
    assert.equal(real.ok, true, JSON.stringify(real));
    const loosened = mcpCall("centurion_update_settings", { trade_sol: 1 });
    assert.equal(loosened.ok, true, JSON.stringify(loosened));
    assert.equal(loosened.kind, "loosen");

    const leak = mcpCall("centurion_paper_buy", { mint: MINT, symbol: "SOL", sol: 0.01, privateKey: "nope" });
    assert.equal(leak.error, "forbidden_field");

    setMcpEnabled(false);
    assert.equal(mcpCall("centurion_paper_buy", { mint: MINT, symbol: "SOL", sol: 0.01 }).error, "mcp_disabled");
    assert.equal(mcpCall("centurion_engine_stop", {}).error, "mcp_disabled");
    assert.equal(mcpCall("centurion_status", {}).mcp_enabled, false);
    setMcpEnabled(true);
  });
});

test("real caps use integer lamports, a second sell is refused, and bad numbers are rejected", () => {
  withLocal(() => {
    enableSignedBook();
    assert.equal(mcpCall("centurion_real_buy", { mint: MINT, symbol: "SO\u202eL", sol: Number.NaN }).error, "invalid");
    assert.equal(mcpCall("centurion_real_buy", { mint: MINT, symbol: "SOL", sol: -1 }).error, "invalid");
    assert.equal(mcpCall("centurion_update_settings", { trade_sol: 0.4, daily_sol: 0.5, slippage_pct: 101 }).error, "invalid");
    const widened = mcpCall("centurion_update_settings", { trade_sol: 0.4, daily_sol: 0.5 });
    assert.equal(widened.ok, true, JSON.stringify(widened));
    const first = mcpCall("centurion_real_buy", { mint: MINT, symbol: "SO\u202eL", sol: 0.4 });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(String(first.lamports), "400000000");
    const listed = mcpCall("centurion_list_positions", { mode: "real" }) as { items: { symbol: string }[] };
    assert.equal(listed.items[0]?.symbol.includes("\u202e"), false);
    assert.equal(mcpCall("centurion_real_buy", { mint: MINT, symbol: "SOL", sol: 0.2 }).error, "daily");
    const sold = mcpCall("centurion_real_sell", { key: first.key });
    assert.equal(sold.ok, true, JSON.stringify(sold));
    assert.equal(mcpCall("centurion_real_sell", { key: first.key }).error, "not_found");
    assert.equal(auditOk(), true);
    assert.equal(mcpCall("centurion_status", {}).audit_ok, true);
  });
});

test("localhost writes reject a foreign origin and compare the bearer in full", () => {
  const token = "ab".repeat(32);
  assert.equal(bearerMatches(`Bearer ${token}`, token), true);
  assert.equal(bearerMatches(`Bearer ${token.slice(0, -1)}c`, token), false);
  assert.equal(bearerMatches("Bearer short", token), false);
  assert.equal(loopbackHost("127.0.0.1:3210"), true);
  assert.equal(loopbackHost("evil.example"), false);
  const ok = new Request("http://127.0.0.1:3100/api/local/real", { headers: { host: "127.0.0.1:3100" } });
  assert.equal(localWriteAllowed(ok), true);
  const csrf = new Request("http://127.0.0.1:3100/api/local/real", { headers: { host: "127.0.0.1:3100", origin: "https://evil.example" } });
  assert.equal(localWriteAllowed(csrf), false);
  const rebound = new Request("http://evil.example/api/local/real", { headers: { host: "evil.example", origin: "http://evil.example" } });
  assert.equal(localWriteAllowed(rebound), false);
});
