import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { trails } from "../mock/data.ts";
import { mcpCall, setMcpEnabled } from "../local/mcp.ts";
import { defaultBook, writeBook } from "../local/real-book.ts";
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

    const book = defaultBook();
    book.enabled = true;
    book.wallet = MINT;
    writeBook(book);
    const real = mcpCall("centurion_real_buy", { mint: MINT, symbol: "SOL", sol: 0.01 });
    assert.equal(real.ok, true, JSON.stringify(real));
    const loosened = mcpCall("centurion_update_settings", { trade_sol: 1 });
    assert.equal(loosened.ok, true, JSON.stringify(loosened));
    assert.equal(loosened.kind, "loosen");

    const leak = mcpCall("centurion_paper_buy", { mint: MINT, symbol: "SOL", sol: 0.01, privateKey: "nope" });
    assert.equal(leak.error, "forbidden_field");

    setMcpEnabled(false);
    assert.equal(mcpCall("centurion_paper_buy", { mint: MINT, symbol: "SOL", sol: 0.01 }).error, "mcp_disabled");
    assert.equal(mcpCall("centurion_status", {}).mcp_enabled, false);
    setMcpEnabled(true);
  });
});
