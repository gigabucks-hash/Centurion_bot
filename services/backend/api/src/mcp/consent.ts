// App-side agent management (first-party app + SIWS wallet session only; never reachable by an agent):
// consent for pending authorization requests, pre-registration, grants list / revoke / reduce,
// "Disconnect all agents", and the per-workspace trade toggle.
import { ApiError } from "../errors.ts";
import { asService, asUser } from "../db.ts";
import { readJson, send, type Router } from "../http.ts";
import { expectedRev, requireRev, uuidParam } from "../rules.ts";
import { DEFAULT_SCOPES, emitAgentEvent, parseScopes, requireSiwsApp, revokeGrants, type AgentDeps } from "./common.ts";
import { wrap } from "./envelope.ts";
import { opaque, sha256 } from "../oauth/tokens.ts";
import { validRedirect } from "../oauth/routes.ts";

const HOLD_MS = 1200;

async function requireOwner(d: AgentDeps, claims: Record<string, unknown>, ws: string): Promise<void> {
  const ok = await asUser(d.db, claims as never, async (c) =>
    (await c.query<{ ok: boolean }>("select public.has_workspace_role($1::uuid, array['owner']::public.workspace_role[]) as ok", [ws])).rows[0]?.ok);
  if (!ok) throw new ApiError("FORBIDDEN_ROLE", { required: "owner" });
}

export async function agentSettings(d: AgentDeps, ws: string) {
  return asService(d.db, async (c) => {
    await c.query("insert into public.agent_settings (workspace_id) values ($1) on conflict do nothing", [ws]);
    return (await c.query<{ trade_enabled: boolean; buys_paused: boolean; buys_paused_via: string | null; buys_paused_at: Date | null; rev: number }>(
      "select * from public.agent_settings where workspace_id = $1", [ws])).rows[0]!;
  });
}

const grantWire = (g: Record<string, unknown>) => ({
  id: g.id, workspace_id: g.workspace_id, client_id: g.client_id, client_name: wrap("client_name", g.client_name),
  scopes: g.scopes, status: g.status, created_at: g.created_at, expires_at: g.expires_at, last_used_at: g.last_used_at,
  revoked_at: g.revoked_at, revoke_reason: g.revoke_reason,
});

export function registerConsent(r: Router, d: AgentDeps): void {
  /** Consent screen data. Client name is third-party text: shown with the redirect host, never alone. */
  r.add("GET", "/v1/agents/requests/:id", async (ctx) => {
    await requireSiwsApp(ctx, d);
    const id = uuidParam(ctx, "id");
    const row = await asService(d.db, async (c) => (await c.query(
      `select r.*, c.client_name, c.registration, c.status as client_status from public.agent_auth_requests r
         join public.agent_clients c using (client_id) where r.id = $1`, [id])).rows[0] as Record<string, any> | undefined);
    if (!row) throw new ApiError("NOT_FOUND");
    if (row.status !== "pending" || new Date(row.expires_at).getTime() < Date.now()) throw new ApiError("AGENT_REQUEST_EXPIRED");
    send(ctx, 200, {
      data: {
        request_id: row.id,
        client: { client_id: row.client_id, client_name: wrap("client_name", row.client_name), registration: row.registration, redirect_host: new URL(row.redirect_uri).host },
        requested_scopes: row.scopes, default_scopes: DEFAULT_SCOPES.filter((s) => row.scopes.includes(s)),
        expires_at: row.expires_at, hold_ms: HOLD_MS,
      },
    });
  });

  /** Approve (hold >= 1200 ms) or deny. Approve activates the client for this owner and creates the grant. */
  r.add("POST", "/v1/agents/requests/:id/decision", async (ctx) => {
    const p = await requireSiwsApp(ctx, d);
    const id = uuidParam(ctx, "id");
    const b = await readJson(ctx);
    if (b.decision !== "approve" && b.decision !== "deny") throw new ApiError("VALIDATION_FAILED", { field: "decision", allowed: ["approve", "deny"] });
    const row = await asService(d.db, async (c) => (await c.query(
      `select r.*, c.client_name, c.status as client_status, c.owner_user from public.agent_auth_requests r
         join public.agent_clients c using (client_id) where r.id = $1`, [id])).rows[0] as Record<string, any> | undefined);
    if (!row) throw new ApiError("NOT_FOUND");
    if (row.status !== "pending" || new Date(row.expires_at).getTime() < Date.now()) throw new ApiError("AGENT_REQUEST_EXPIRED");
    const redirect = new URL(row.redirect_uri as string);
    if (row.state) redirect.searchParams.set("state", row.state);
    redirect.searchParams.set("iss", d.agent.issuer);
    if (b.decision === "deny") {
      await asService(d.db, (c) => c.query("update public.agent_auth_requests set status = 'denied', user_id = $2 where id = $1", [id, p.userId]));
      redirect.searchParams.set("error", "access_denied");
      return send(ctx, 200, { data: { redirect_to: redirect.toString() } });
    }
    const hold = (b.confirmation as Record<string, unknown> | undefined)?.hold_duration_ms;
    if (hold === undefined) throw new ApiError("CONFIRMATION_REQUIRED", { required: { hold_ms: HOLD_MS } });
    if (typeof hold !== "number" || hold < HOLD_MS) throw new ApiError("HOLD_TOO_SHORT", { min_hold_ms: HOLD_MS });
    if (typeof b.workspace_id !== "string") throw new ApiError("VALIDATION_FAILED", { field: "workspace_id" });
    const ws = b.workspace_id.toLowerCase();
    await requireOwner(d, p.claims, ws);
    const scopes = b.scopes === undefined ? DEFAULT_SCOPES.filter((s) => (row.scopes as string[]).includes(s)) : parseScopes(b.scopes);
    if (!scopes || !scopes.every((s) => (row.scopes as string[]).includes(s) || s === "read")) {
      throw new ApiError("VALIDATION_FAILED", { field: "scopes", hint: "a subset of the requested scopes" });
    }
    if (scopes.includes("trade") && !(await agentSettings(d, ws)).trade_enabled) {
      throw new ApiError("AGENT_TRADE_DISABLED", { hint: "turn on agent trading in Settings first" });
    }
    if (row.owner_user && row.owner_user !== p.userId) throw new ApiError("FORBIDDEN_ROLE", { reason: "client belongs to another owner" });
    const code = opaque(32);
    const grantId = await asService(d.db, async (c) => {
      await c.query("update public.agent_clients set status = 'active', owner_user = $2, workspace_id = $3, activated_at = coalesce(activated_at, now()) where client_id = $1",
        [row.client_id, p.userId, ws]);
      const g = await c.query<{ id: string }>(
        "insert into public.agent_grants (user_id, workspace_id, client_id, client_name, scopes) values ($1, $2, $3, $4, $5) returning id",
        [p.userId, ws, row.client_id, row.client_name, scopes]);
      await c.query(
        `update public.agent_auth_requests set status = 'approved', user_id = $2, workspace_id = $3, granted_scopes = $4, grant_id = $5,
                code_sha256 = $6, code_expires_at = now() + interval '60 seconds' where id = $1`,
        [id, p.userId, ws, scopes, g.rows[0]!.id, sha256(code)]);
      await c.query(
        `insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, after, request_id, proof_kind)
         values ($1, $2, 'user', $3, 'agent.grant.create', 'agent_grant', $4, $5, $6, 'typed')`,
        [ws, p.userId, p.via, g.rows[0]!.id, JSON.stringify({ client_id: row.client_id, scopes }), ctx.requestId]);
      return g.rows[0]!.id;
    });
    await emitAgentEvent(d.db, ws, "agent.connected", { grant_id: grantId, client_id: row.client_id, client_name: row.client_name }, { scopes }, "digest");
    redirect.searchParams.set("code", code);
    send(ctx, 200, { data: { redirect_to: redirect.toString(), grant_id: grantId, scopes } });
  });

  /** Pre-registration from the app (MCP_DESIGN 1.4a). Still pending until the owner consents to a request. */
  r.add("POST", "/v1/agents/clients", async (ctx) => {
    await requireSiwsApp(ctx, d);
    const b = await readJson(ctx);
    const name = typeof b.client_name === "string" ? b.client_name.trim() : "";
    if (name.length < 1 || name.length > 100) throw new ApiError("VALIDATION_FAILED", { field: "client_name" });
    if (!Array.isArray(b.redirect_uris) || b.redirect_uris.length < 1 || b.redirect_uris.length > 5 || !b.redirect_uris.every(validRedirect)) {
      throw new ApiError("VALIDATION_FAILED", { field: "redirect_uris" });
    }
    const clientId = `ac_${opaque(18)}`;
    await asService(d.db, (c) => c.query(
      "insert into public.agent_clients (client_id, client_name, redirect_uris, registration) values ($1, $2, $3, 'pre')",
      [clientId, name, b.redirect_uris]));
    send(ctx, 201, { data: { client_id: clientId, mcp_url: d.agent.resource } });
  });

  r.add("GET", "/v1/agents/grants", async (ctx) => {
    const p = await requireSiwsApp(ctx, d);
    const rows = await asService(d.db, async (c) => (await c.query(
      "select * from public.agent_grants where user_id = $1 order by created_at desc limit 100", [p.userId])).rows);
    send(ctx, 200, { items: rows.map(grantWire) });
  });

  /** Reduce scopes (never add; adding needs a new consent). Takes effect on the next call. */
  r.add("PATCH", "/v1/agents/grants/:id", async (ctx) => {
    const p = await requireSiwsApp(ctx, d);
    const id = uuidParam(ctx, "id");
    const b = await readJson(ctx);
    const scopes = parseScopes(b.scopes);
    if (!scopes) throw new ApiError("VALIDATION_FAILED", { field: "scopes" });
    const row = await asService(d.db, async (c) => (await c.query(
      `update public.agent_grants set scopes = $3 where id = $1 and user_id = $2 and status = 'active' and $3::text[] <@ scopes returning *`,
      [id, p.userId, scopes])).rows[0]);
    if (!row) throw new ApiError("VALIDATION_FAILED", { field: "scopes", hint: "active grant; scopes can only be reduced" });
    send(ctx, 200, { data: grantWire(row) });
  });

  r.add("POST", "/v1/agents/grants/:id/revoke", async (ctx) => {
    const p = await requireSiwsApp(ctx, d);
    const id = uuidParam(ctx, "id");
    const own = await asService(d.db, async (c) => (await c.query("select 1 from public.agent_grants where id = $1 and user_id = $2", [id, p.userId])).rowCount);
    if (!own) throw new ApiError("NOT_FOUND");
    const rows = await revokeGrants(d.db, { grantId: id }, "user");
    for (const g of rows) {
      await emitAgentEvent(d.db, g.workspace_id, "agent.disconnected", { grant_id: g.id, client_id: g.client_id, client_name: g.client_name }, { reason: "user" }, "instant");
    }
    send(ctx, 200, { data: { revoked: rows.length } });
  });

  /** One tap, no hold: every grant and refresh family of this owner, effective on the next request. */
  r.add("POST", "/v1/agents/disconnect-all", async (ctx) => {
    const p = await requireSiwsApp(ctx, d);
    const rows = await revokeGrants(d.db, { userId: p.userId }, "disconnect_all");
    const wss = new Set(rows.map((g) => g.workspace_id));
    for (const ws of wss) {
      const g = rows.find((x) => x.workspace_id === ws)!;
      await emitAgentEvent(d.db, ws, "agent.disconnected", { grant_id: g.id, client_id: g.client_id, client_name: g.client_name },
        { reason: "disconnect_all", grants: rows.filter((x) => x.workspace_id === ws).map((x) => x.id) }, "instant");
    }
    send(ctx, 200, { data: { revoked: rows.length } });
  });

  /** Agent settings: the trade toggle (owner, app only). Turning it off also strips `trade` from grants. */
  r.add("GET", "/v1/workspaces/:ws/agent-settings", async (ctx) => {
    const p = await requireSiwsApp(ctx, d);
    const ws = uuidParam(ctx, "ws");
    await requireOwner(d, p.claims, ws);
    const s = await agentSettings(d, ws);
    send(ctx, 200, { data: s }, { ETag: `"${s.rev}"` });
  });

  r.add("PUT", "/v1/workspaces/:ws/agent-settings", async (ctx) => {
    const p = await requireSiwsApp(ctx, d);
    const ws = uuidParam(ctx, "ws");
    await requireOwner(d, p.claims, ws);
    const b = await readJson(ctx);
    if (typeof b.trade_enabled !== "boolean") throw new ApiError("VALIDATION_FAILED", { field: "trade_enabled" });
    const rev = requireRev(expectedRev(ctx, b));
    await agentSettings(d, ws);
    const row = await asService(d.db, async (c) => {
      const u = await c.query("update public.agent_settings set trade_enabled = $2, rev = rev + 1, updated_at = now() where workspace_id = $1 and rev = $3 returning *", [ws, b.trade_enabled, rev]);
      if (!u.rows[0]) {
        const cur = (await c.query("select * from public.agent_settings where workspace_id = $1", [ws])).rows[0];
        throw new ApiError("VERSION_CONFLICT", { current_rev: cur?.rev, base_rev: rev, current: cur });
      }
      if (!b.trade_enabled) {
        await c.query("update public.agent_grants set scopes = array_remove(scopes, 'trade') where workspace_id = $1 and status = 'active'", [ws]);
      }
      await c.query(
        `insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, after, request_id, proof_kind)
         values ($1::uuid, $2, 'user', $3, 'agent.settings.update', 'workspace', $1::text, $4, $5, 'none')`,
        [ws, p.userId, p.via, JSON.stringify({ trade_enabled: b.trade_enabled }), ctx.requestId]);
      return u.rows[0];
    });
    send(ctx, 200, { data: row }, { ETag: `"${row.rev}"` });
  });
}
