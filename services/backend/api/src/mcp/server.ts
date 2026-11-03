// Remote MCP endpoint (Streamable HTTP, JSON responses): POST /mcp carries one JSON-RPC message.
// Auth: agent access token (aud = this resource), DPoP-bound when the token says so. Every tools/call:
// grant check (revocation is immediate), scope, per-grant budget, audit row, attribution.
import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import { ApiError, errorDef } from "../errors.ts";
import { asService } from "../db.ts";
import { serverNow, type Ctx, type Router } from "../http.ts";
import { clientIp } from "../ratelimit.ts";
import { PRODUCT, auditAgentCall, emitAgentEvent, revokeGrants, type AgentDeps, type AgentEventCtx, type Scope } from "./common.ts";
import { envelopeDeep, UNTRUSTED_NOTE } from "./envelope.ts";
import { NEVER_TOOLS, TOOLS, toolByName, type Tool } from "./tools.ts";
import { verifyAgentToken, verifyDpop, type AgentClaims } from "../oauth/tokens.ts";
import { rememberJti } from "../oauth/routes.ts";

const PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_VERSION = "0.1.0";

function out(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const s = body === null ? "" : JSON.stringify(body);
  res.writeHead(status, {
    ...(s ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(s).toString() } : {}),
    "Cache-Control": "no-store", "X-Server-Now": serverNow(), ...headers,
  });
  res.end(s);
}

const rpcErr = (id: unknown, code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });

interface Session {
  claims: AgentClaims;
  scopes: Set<Scope>;
  a: AgentEventCtx;
}

export function registerMcp(r: Router, d: AgentDeps): void {
  const A = d.agent;
  const prm = `${A.issuer}/.well-known/oauth-protected-resource/mcp`;
  const challenge = (extra = "") => ({ "WWW-Authenticate": `Bearer resource_metadata="${prm}", scope="read control"${extra}` });

  /** Authenticate the agent; null -> a response was already sent. */
  async function auth(ctx: Ctx): Promise<Session | null> {
    const origin = ctx.req.headers.origin;
    if (typeof origin === "string" && origin !== new URL(A.issuer).origin) {
      out(ctx.res, 403, rpcErr(null, -32000, "origin not allowed"));
      return null;
    }
    const h = ctx.req.headers.authorization ?? "";
    const m = /^(Bearer|DPoP)\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/i.exec(h);
    const claims = m ? verifyAgentToken(m[2]!, A.tokenSecret, A.resource) : null;
    if (!m || !claims) {
      out(ctx.res, 401, rpcErr(null, -32001, "UNAUTHENTICATED"), challenge(m ? ', error="invalid_token"' : ""));
      return null;
    }
    if (claims.cnf?.jkt) {
      const proof = ctx.req.headers.dpop;
      const v = m[1]!.toLowerCase() === "dpop" && typeof proof === "string" ? verifyDpop(proof, "POST", A.resource, m[2]!) : "missing";
      if (typeof v === "string" || v.jkt !== claims.cnf.jkt || !(await rememberJti(d, v.jti))) {
        out(ctx.res, 401, rpcErr(null, -32001, "UNAUTHENTICATED"), { "WWW-Authenticate": `DPoP error="invalid_dpop_proof", algs="ES256 EdDSA"` });
        return null;
      }
    } else if (m[1]!.toLowerCase() === "dpop") {
      out(ctx.res, 401, rpcErr(null, -32001, "UNAUTHENTICATED"), challenge(', error="invalid_token"'));
      return null;
    }
    // revocation, scope reduction and expiry take effect on the very next call
    const g = await asService(d.db, async (c) => (await c.query<{ status: string; expires_at: Date; scopes: string[]; client_name: string; user_id: string; workspace_id: string }>(
      "update public.agent_grants set last_used_at = now() where id = $1 returning status, expires_at, scopes, client_name, user_id, workspace_id",
      [claims.grant_id])).rows[0]);
    if (!g || g.status !== "active" || g.expires_at.getTime() <= Date.now() || g.user_id !== claims.sub || g.workspace_id !== claims.ws) {
      out(ctx.res, 401, rpcErr(null, -32001, "UNAUTHENTICATED", { reason: "grant_revoked_or_expired" }), challenge(', error="invalid_token"'));
      return null;
    }
    const tokScopes = new Set(claims.scope.split(" "));
    const scopes = new Set(g.scopes.filter((s) => tokScopes.has(s)) as Scope[]);
    return { claims, scopes, a: { grant_id: claims.grant_id, client_id: claims.client_id, client_name: g.client_name } };
  }

  function budgetErr(bucket: string, limit: number, retry: number): ApiError {
    return new ApiError("AGENT_BUDGET_EXCEEDED", { bucket, limit, retry_after_s: retry }, { "Retry-After": String(retry) });
  }

  async function budget(s: Session, tool: Tool, args: Record<string, unknown>): Promise<void> {
    const L = d.limiter!;
    const g = s.a.grant_id;
    const checks: [string, string, number, number][] = [["calls_per_min", `mcp:c:m:${g}`, 60, A.callsPerMin], ["calls_per_day", `mcp:c:d:${g}`, 86_400, A.callsPerDay]];
    if (tool.kind !== "read") checks.push(["writes_per_min", `mcp:w:m:${g}`, 60, A.writesPerMin]);
    if (tool.name === "decide_card" && args.decision === "approve") checks.push(["approvals_per_hour", `mcp:a:h:${g}`, 3600, A.approvalsPerHour]);
    for (const [bucket, key, win, max] of checks) {
      const c = await L.count(key, win);
      if (c.n > max) throw budgetErr(bucket, max, c.retryAfterS);
    }
  }

  async function refused(ctx: Ctx, s: Session, tool: string, code: string): Promise<void> {
    await emitAgentEvent(d.db, s.claims.ws, "agent.refused", s.a, { tool: tool.slice(0, 64), error: code }, "instant").catch(() => undefined);
    const c = await d.limiter!.count(`mcp:refused:${s.a.grant_id}`, 600);
    if (c.n >= A.refusedLimit) {
      const rows = await revokeGrants(d.db, { grantId: s.a.grant_id }, "refused_attempts");
      if (rows.length) await emitAgentEvent(d.db, s.claims.ws, "agent.disconnected", s.a, { reason: "refused_attempts" }, "instant").catch(() => undefined);
    }
    void ctx;
  }

  const toolResult = (structured: Record<string, unknown>, isError = false) => ({
    content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured, ...(isError ? { isError: true } : {}),
  });

  const apiErrorResult = (e: ApiError, lang: "en" | "id") =>
    toolResult({ error: { code: e.code, message: errorDef(e.code)?.messages[lang] ?? e.code, ...envelopeDeep(e.details) as object } }, true);

  async function callTool(ctx: Ctx, s: Session, id: unknown, params: Record<string, unknown>): Promise<void> {
    const name = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as Record<string, unknown>;
    const tool = toolByName.get(name);
    if (!tool) {
      if (NEVER_TOOLS.has(name)) {
        await auditAgentCall(d.db, { ws: s.claims.ws, user: s.claims.sub, a: s.a, tool: name, scope: "none", outcome: "refused", error: "FORBIDDEN_SCOPE", requestId: ctx.requestId });
        await refused(ctx, s, name, "FORBIDDEN_SCOPE");
        return out(ctx.res, 200, { jsonrpc: "2.0", id, result: apiErrorResult(new ApiError("FORBIDDEN_SCOPE", { required: "app" }), ctx.lang) });
      }
      return out(ctx.res, 200, rpcErr(id, -32602, `Unknown tool: ${name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64)}`));
    }
    if (!s.scopes.has(tool.scope)) {
      await auditAgentCall(d.db, { ws: s.claims.ws, user: s.claims.sub, a: s.a, tool: name, scope: tool.scope, outcome: "error", error: "FORBIDDEN_SCOPE", requestId: ctx.requestId });
      return out(ctx.res, 403, rpcErr(id, -32003, "FORBIDDEN_SCOPE", { required: tool.scope }),
        { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${[...s.scopes, tool.scope].join(" ")}", resource_metadata="${prm}"` });
    }
    try {
      await budget(s, tool, args);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      await auditAgentCall(d.db, { ws: s.claims.ws, user: s.claims.sub, a: s.a, tool: name, scope: tool.scope, outcome: "error", error: e.code, requestId: ctx.requestId });
      return out(ctx.res, 429, rpcErr(id, -32029, e.code, e.details), e.headers);
    }
    let result: Record<string, unknown>;
    try {
      if (tool.scope === "trade") {
        const t = await asService(d.db, async (c) => (await c.query<{ trade_enabled: boolean }>("select trade_enabled from public.agent_settings where workspace_id = $1", [s.claims.ws])).rows[0]);
        if (!t?.trade_enabled && tool.name !== "approve_real_buy") throw new ApiError("AGENT_TRADE_DISABLED", { hint: "agent trading is off in the Centurion Trade app" });
      }
      const xff = ctx.req.headers["x-forwarded-for"];
      result = await tool.run({
        d, args,
        who: {
          sub: s.claims.sub, ws: s.claims.ws, grantId: s.a.grant_id, clientId: s.a.client_id, clientName: s.a.client_name,
          appScopes: tool.kind === "read" ? ["read"] : ["read", "trade"], ip: clientIp(ctx.req, false),
          forwardedFor: typeof xff === "string" ? xff : undefined, requestId: ctx.requestId,
        },
      });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL");
      if (!(e instanceof ApiError)) console.error(`[${ctx.requestId}] mcp tool ${name}:`, e instanceof Error ? e.message : e);
      await auditAgentCall(d.db, { ws: s.claims.ws, user: s.claims.sub, a: s.a, tool: name, scope: tool.scope, outcome: err.code === "LOOSEN_REQUIRES_APP" || err.code === "FORBIDDEN_SCOPE" ? "refused" : "error", error: err.code, requestId: ctx.requestId });
      if (err.code === "LOOSEN_REQUIRES_APP" || (err.code === "FORBIDDEN_SCOPE" && err.details.required === "app")) await refused(ctx, s, name, err.code);
      return out(ctx.res, 200, { jsonrpc: "2.0", id, result: apiErrorResult(err, ctx.lang) });
    }
    await auditAgentCall(d.db, { ws: s.claims.ws, user: s.claims.sub, a: s.a, tool: name, scope: tool.scope, outcome: "ok", requestId: ctx.requestId });
    if (tool.kind !== "read") {
      await emitAgentEvent(d.db, s.claims.ws, "agent.action", s.a, { tool: name }, tool.instant ? "instant" : "digest").catch(() => undefined);
    }
    out(ctx.res, 200, { jsonrpc: "2.0", id, result: toolResult(envelopeDeep(result) as Record<string, unknown>) });
  }

  r.add("POST", "/mcp", async (ctx) => {
    const s = await auth(ctx);
    if (!s) return;
    let msg: Record<string, unknown>;
    try {
      const chunks: Buffer[] = [];
      let n = 0;
      for await (const c of ctx.req) {
        n += (c as Buffer).length;
        if (n > 64 * 1024) return out(ctx.res, 413, rpcErr(null, -32600, "request too large"));
        chunks.push(c as Buffer);
      }
      msg = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    } catch {
      return out(ctx.res, 400, rpcErr(null, -32700, "Parse error"));
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0") return out(ctx.res, 400, rpcErr(null, -32600, "Invalid Request (one JSON-RPC 2.0 message per POST)"));
    const id = msg.id;
    const method = msg.method;
    if (method === undefined) return out(ctx.res, 202, null); // a response from the client: accepted
    if (typeof method !== "string") return out(ctx.res, 400, rpcErr(id, -32600, "Invalid Request"));
    if (id === undefined) return out(ctx.res, 202, null); // notification
    const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;
    switch (method) {
      case "initialize": {
        const want = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        const v = PROTOCOL_VERSIONS.includes(want) ? want : PROTOCOL_VERSIONS[0]!;
        return out(ctx.res, 200, {
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: v,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "centurion-trade", title: PRODUCT, version: SERVER_VERSION },
            instructions: `${PRODUCT} practice (paper) trading control. Scopes: ${[...s.scopes].join(", ")}. Writes need expected_rev and idempotency_key. ${UNTRUSTED_NOTE}`,
          },
        }, { "Mcp-Session-Id": randomBytes(16).toString("hex") });
      }
      case "ping":
        return out(ctx.res, 200, { jsonrpc: "2.0", id, result: {} });
      case "tools/list":
        return out(ctx.res, 200, {
          jsonrpc: "2.0", id,
          result: {
            tools: TOOLS.filter((t) => s.scopes.has(t.scope)).map((t) => ({
              name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
              annotations: { readOnlyHint: t.kind === "read", destructiveHint: t.kind === "sell", idempotentHint: t.kind !== "read", openWorldHint: false },
            })),
          },
        });
      case "tools/call":
        return callTool(ctx, s, id, params);
      default:
        return out(ctx.res, 200, rpcErr(id, -32601, "Method not found"));
    }
  });
  // No server-initiated stream; sessions are not credentials and are not kept.
  r.add("GET", "/mcp", async (ctx) => out(ctx.res, 405, null, { Allow: "POST, DELETE" }));
  r.add("DELETE", "/mcp", async (ctx) => out(ctx.res, 204, null));
}
