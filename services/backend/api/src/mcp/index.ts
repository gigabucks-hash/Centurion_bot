// Agent access wiring. Everything is registered only when MCP_ENABLED=true (off by default); the app-side
// buys pause / sell-all endpoints are always available (they are plain REST).
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Router } from "../http.ts";
import type { Deps } from "../deps.ts";
import { loadAgentConfig, type AgentConfig } from "./config.ts";
import type { AgentDeps } from "./common.ts";
import { registerConsent } from "./consent.ts";
import { registerMcp } from "./server.ts";
import { registerTrading } from "./trading.ts";
import { registerOAuth } from "../oauth/routes.ts";

export { agentRouteGuard } from "./dispatch.ts";

export function registerAgent(r: Router, d: Deps & { agent?: AgentConfig }, handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>): void {
  const agent = d.agent ?? loadAgentConfig(process.env, { jwtSecret: d.cfg.jwtSecret, sessionSecret: d.cfg.sessionSecret });
  const ad: AgentDeps = { ...d, agent, handle };
  registerTrading(r, ad);
  if (!agent.enabled) return;
  registerOAuth(r, ad);
  registerConsent(r, ad);
  registerMcp(r, ad);
}
