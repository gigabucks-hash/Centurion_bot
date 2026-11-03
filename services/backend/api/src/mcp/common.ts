// Shared helpers for the agent (MCP/OAuth) modules.
import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "../errors.ts";
import { asService, asUser, type Db, type Tx } from "../db.ts";
import { authenticate, type Deps } from "../deps.ts";
import type { Ctx } from "../http.ts";
import { SESSION_ISSUER, type Principal } from "../jwt.ts";
import { requireApp } from "../rules.ts";
import type { AgentConfig } from "./config.ts";

export interface AgentDeps extends Deps {
  agent: AgentConfig;
  /** The API's own request handler (same middleware as any REST call). */
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

export const PRODUCT = "Centurion Trade";
export const SCOPES = ["read", "control", "trade"] as const;
export type Scope = (typeof SCOPES)[number];
/** Lead answer Q1: read + control by default; trade stays off until the owner turns the toggle on. */
export const DEFAULT_SCOPES: Scope[] = ["read", "control"];

/**
 * Consent and agent management: first-party app, SIWS wallet session only (iss centurion-api + live sid).
 * session_check() runs in asUser, so a logged-out / revoked session fails here.
 */
export async function requireSiwsApp(ctx: Ctx, d: Deps): Promise<Principal> {
  const p = authenticate(ctx, d.cfg);
  requireApp(p);
  if (p.claims.iss !== SESSION_ISSUER || typeof p.claims.sid !== "string") {
    throw new ApiError("SIWS_SESSION_REQUIRED", { hint: "sign in with your wallet in the Centurion Trade app" });
  }
  await asUser(d.db, p.claims, (c) => c.query("select 1"));
  return p;
}

export function parseScopes(raw: unknown): Scope[] | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const xs = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\s+/).filter(Boolean) : null;
  if (!xs) return null;
  const out = new Set<Scope>(["read"]);
  for (const s of xs) {
    if (!(SCOPES as readonly string[]).includes(String(s))) return null;
    out.add(s as Scope);
  }
  return SCOPES.filter((s) => out.has(s));
}

export interface AgentEventCtx {
  grant_id: string;
  client_id: string;
  client_name: string;
}

/** Emit a workspace event for an agent action. notify: digest (default) or instant (lead answer Q6). */
export async function emitAgentEvent(
  db: Db, ws: string, type: string, a: AgentEventCtx, payload: Record<string, unknown>, notify: "digest" | "instant",
): Promise<void> {
  await asService(db, (c: Tx) =>
    c.query(
      `insert into public.events (id, workspace_id, ts, type, actor, payload, untrusted)
       values ($1 || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint || ':' || $2, $3, clock_timestamp(), $2, 'user', $4, $5)`,
      [
        `agent_${a.grant_id.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        ws,
        JSON.stringify({ ...payload, notify, agent: { source: "agent", via: "mcp", grant_id: a.grant_id, client_id: a.client_id } }),
        JSON.stringify({ agent_client_name: a.client_name.slice(0, 100) }),
      ],
    ));
}

/** One audit row per MCP call (reads included). */
export async function auditAgentCall(
  db: Db, o: { ws: string; user: string; a: AgentEventCtx; tool: string; scope: string; outcome: "ok" | "error" | "refused"; error?: string; requestId: string },
): Promise<void> {
  await asService(db, (c) =>
    c.query(
      `insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, risk, request_id, proof_kind)
       values ($1, $2, 'user', 'mcp', $3, 'mcp_tool', $4, $5, $6, 'none')`,
      [o.ws, o.user, `mcp.${o.tool.replace(/[^a-z_]/g, "_").slice(0, 56)}`, o.tool.slice(0, 64),
        JSON.stringify({ source: "agent", agent: o.a, scope_used: o.scope, outcome: o.outcome, error_code: o.error ?? null }),
        o.requestId.slice(0, 64)],
    )).catch((e) => console.error("agent audit failed:", e instanceof Error ? e.message : e));
}

export async function revokeGrants(db: Db, where: { grantId?: string; userId?: string }, reason: string): Promise<{ id: string; workspace_id: string; client_id: string; client_name: string }[]> {
  return asService(db, async (c) => {
    const r = await c.query<{ id: string; workspace_id: string; client_id: string; client_name: string }>(
      `update public.agent_grants set status = 'revoked', revoked_at = now(), revoke_reason = $3
        where status = 'active' and ($1::uuid is null or id = $1) and ($2::uuid is null or user_id = $2)
        returning id, workspace_id, client_id, client_name`,
      [where.grantId ?? null, where.userId ?? null, reason]);
    const ids = r.rows.map((x) => x.id);
    if (ids.length) {
      await c.query("update public.agent_refresh_tokens set revoked_at = now() where grant_id = any($1::uuid[]) and revoked_at is null", [ids]);
    }
    return r.rows;
  });
}
