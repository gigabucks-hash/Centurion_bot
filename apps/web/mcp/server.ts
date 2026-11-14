import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP_TOOLS } from "./registry.ts";

const mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

async function call(tool: string, args: Record<string, unknown>) {
  const base = (process.env.CENTURION_WEB_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
  const token = (process.env.CENTURION_MCP_TOKEN ?? "").trim();
  const res = await fetch(`${base}/api/local/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tool, args }),
  });
  const json = await res.json().catch(() => ({ error: "bad_response" })) as { data?: Record<string, unknown>; error?: string };
  const data = json.data ?? { error: json.error ?? `http_${res.status}` };
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function createCenturionServer() {
  const server = new McpServer({ name: "centurion-trade", version: "0.1.0" });
  const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool.description]));
  const add = (name: (typeof MCP_TOOLS)[number]["name"], shape: z.ZodRawShape) => {
    server.registerTool(name, { description: byName.get(name), inputSchema: shape }, async (args) => call(name, args as Record<string, unknown>));
  };
  add("centurion_status", {});
  add("centurion_engine_stop", {});
  add("centurion_engine_start", {});
  add("centurion_list_positions", { mode: z.enum(["practice", "real"]).optional() });
  add("centurion_pnl", {});
  add("centurion_team_scores", { mint });
  add("centurion_paper_buy", { mint, symbol: z.string().min(1).max(16), sol: z.number().positive() });
  add("centurion_paper_sell", { key: z.string().min(1).max(80), fraction_bps: z.number().int().min(1).max(10_000).optional() });
  add("centurion_sell_all", { mode: z.enum(["practice", "real"]).optional() });
  add("centurion_real_buy", { mint, symbol: z.string().min(1).max(16), sol: z.number().positive() });
  add("centurion_real_sell", { mint: mint.optional(), key: z.string().min(1).max(80).optional() });
  add("centurion_get_settings", {});
  add("centurion_update_settings", {
    trade_sol: z.number().positive().optional(),
    daily_sol: z.number().nonnegative().optional(),
    cap_sol: z.number().nonnegative().optional(),
    max_positions: z.number().int().positive().optional(),
    slippage_pct: z.number().nonnegative().optional(),
    stop_loss_pct: z.number().nonnegative().optional(),
    trail_pct: z.number().nonnegative().optional(),
    max_hold_minutes: z.number().int().nonnegative().optional(),
    rpc_url: z.string().max(200).optional(),
  });
  server.registerResource("config", "centurion://config", { description: "Current local settings" }, async () => ({
    contents: [{ uri: "centurion://config", mimeType: "application/json", text: JSON.stringify((await call("centurion_get_settings", {})).content[0]) }],
  }));
  server.registerPrompt("daily_report", { description: "Ask for today's paper PnL and whether buys are paused." }, async () => ({
    messages: [{ role: "user", content: { type: "text", text: "Read centurion_pnl and centurion_status. Summarize paper PnL and whether new buys are paused. Do not invent numbers." } }],
  }));
  return server;
}
