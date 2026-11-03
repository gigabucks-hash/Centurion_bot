// OAuth 2.1 authorization server for MCP agents (MCP spec 2026-07-28 authorization; RFC 8414, RFC 9728,
// RFC 8707, RFC 7591, RFC 7009, RFC 9449 optional). Authorization code + PKCE S256 only; public clients.
// Consent happens in the first-party app from a SIWS session (mcp/consent.ts); clients stay pending until then.
import type { ServerResponse } from "node:http";
import { asService } from "../db.ts";
import { serverNow, type Ctx, type Router } from "../http.ts";
import { clientIp } from "../ratelimit.ts";
import { ApiError } from "../errors.ts";
import { DEFAULT_SCOPES, PRODUCT, SCOPES, emitAgentEvent, parseScopes, revokeGrants, type AgentDeps } from "../mcp/common.ts";
import { opaque, pkceOk, sha256, signHs256, verifyAgentToken, verifyDpop } from "./tokens.ts";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(s).toString(), "X-Server-Now": serverNow(), ...NO_STORE, ...headers });
  res.end(s);
}

/** RFC 6749 section 5.2 error body (OAuth endpoints do not use the REST envelope). */
const oauthErr = (res: ServerResponse, status: number, error: string, description: string, headers: Record<string, string> = {}) =>
  json(res, status, { error, error_description: description }, headers);

async function readBody(ctx: Ctx): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of ctx.req) {
    n += (c as Buffer).length;
    if (n > 16 * 1024) throw new ApiError("VALIDATION_FAILED", { reason: "body too large" });
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const ct = String(ctx.req.headers["content-type"] ?? "");
  if (ct.includes("application/json")) {
    try {
      const v = JSON.parse(raw || "{}") as Record<string, unknown>;
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === "string" ? x : JSON.stringify(x)]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export function validRedirect(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 512) return false;
  try {
    const x = new URL(u);
    if (x.hash) return false;
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(x.hostname);
  } catch {
    return false;
  }
}

export function asMetadata(d: AgentDeps) {
  const a = d.agent;
  return {
    issuer: a.issuer,
    authorization_endpoint: `${a.issuer}/oauth/authorize`,
    token_endpoint: `${a.issuer}/oauth/token`,
    registration_endpoint: `${a.issuer}/oauth/register`,
    revocation_endpoint: `${a.issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SCOPES],
    dpop_signing_alg_values_supported: ["ES256", "EdDSA"],
    client_id_metadata_document_supported: false,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${a.issuer}/mcp`,
  };
}

export function prMetadata(d: AgentDeps) {
  return {
    resource: d.agent.resource,
    resource_name: PRODUCT,
    authorization_servers: [d.agent.issuer],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    dpop_signing_alg_values_supported: ["ES256", "EdDSA"],
    dpop_bound_access_tokens_required: false,
  };
}

/** Issue an access token (+ rotating refresh token) for a grant. DPoP-bound when `jkt` is given. */
async function issueTokens(d: AgentDeps, g: { id: string; user_id: string; workspace_id: string; client_id: string; scopes: string[]; expires_at: Date }, jkt: string | null) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + d.agent.accessTtlS;
  const access = signHs256({
    iss: d.agent.issuer, sub: g.user_id, aud: d.agent.resource, centurion_client: "mcp", ws: g.workspace_id, grant_id: g.id,
    client_id: g.client_id, scope: g.scopes.join(" "), jti: opaque(12), iat: now, exp, ...(jkt ? { cnf: { jkt } } : {}),
  }, d.agent.tokenSecret);
  const refresh = opaque(32);
  const rexp = new Date(Math.min(Date.now() + d.agent.refreshIdleS * 1000, g.expires_at.getTime()));
  await asService(d.db, (c) => c.query(
    "insert into public.agent_refresh_tokens (grant_id, token_sha256, dpop_jkt, expires_at) values ($1, $2, $3, $4)",
    [g.id, sha256(refresh), jkt, rexp]));
  return {
    access_token: access, token_type: jkt ? "DPoP" : "Bearer", expires_in: d.agent.accessTtlS, refresh_token: refresh,
    scope: g.scopes.join(" "),
  };
}

/** DPoP proof on the token endpoint: optional; if sent it must be valid and unreplayed. */
async function dpopAtToken(ctx: Ctx, d: AgentDeps): Promise<string | null | "bad"> {
  const h = ctx.req.headers.dpop;
  if (h === undefined) return null;
  if (typeof h !== "string") return "bad";
  const v = verifyDpop(h, "POST", `${d.agent.issuer}/oauth/token`);
  if (typeof v === "string") return "bad";
  if (!(await rememberJti(d, v.jti))) return "bad";
  return v.jkt;
}

export async function rememberJti(d: AgentDeps, jti: string): Promise<boolean> {
  return asService(d.db, async (c) => {
    await c.query("delete from public.agent_dpop_jti where expires_at < now()");
    const r = await c.query("insert into public.agent_dpop_jti (jti, expires_at) values ($1, now() + interval '2 minutes') on conflict do nothing", [jti]);
    return r.rowCount === 1;
  });
}

export function registerOAuth(r: Router, d: AgentDeps): void {
  const a = d.agent;

  r.add("GET", "/.well-known/oauth-authorization-server", async (ctx) => json(ctx.res, 200, asMetadata(d), { "Cache-Control": "max-age=300" }));
  r.add("GET", "/.well-known/oauth-protected-resource", async (ctx) => json(ctx.res, 200, prMetadata(d), { "Cache-Control": "max-age=300" }));
  r.add("GET", "/.well-known/oauth-protected-resource/mcp", async (ctx) => json(ctx.res, 200, prMetadata(d), { "Cache-Control": "max-age=300" }));

  /** RFC 7591 dynamic registration. The client is created `pending`: no token until the owner consents. */
  r.add("POST", "/oauth/register", async (ctx) => {
    await d.limiter!.hit(`oauth:reg:${clientIp(ctx.req, d.cfg.trustProxy)}`, a.registerPerHour, 3600);
    let b: Record<string, unknown>;
    try {
      const chunks: Buffer[] = [];
      for await (const c of ctx.req) chunks.push(c as Buffer);
      b = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
    } catch {
      return oauthErr(ctx.res, 400, "invalid_client_metadata", "body must be JSON");
    }
    const name = typeof b.client_name === "string" ? b.client_name.trim() : "";
    if (name.length < 1 || name.length > 100) return oauthErr(ctx.res, 400, "invalid_client_metadata", "client_name 1-100 chars required");
    const uris = b.redirect_uris;
    if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5 || !uris.every(validRedirect)) {
      return oauthErr(ctx.res, 400, "invalid_redirect_uri", "1-5 redirect_uris, https or loopback http, no fragment");
    }
    const am = b.token_endpoint_auth_method ?? "none";
    if (am !== "none") return oauthErr(ctx.res, 400, "invalid_client_metadata", "public clients only (token_endpoint_auth_method=none)");
    const gts = b.grant_types ?? ["authorization_code", "refresh_token"];
    if (!Array.isArray(gts) || !gts.every((g) => g === "authorization_code" || g === "refresh_token")) {
      return oauthErr(ctx.res, 400, "invalid_client_metadata", "grant_types: authorization_code, refresh_token");
    }
    const clientId = `ac_${opaque(18)}`;
    await asService(d.db, (c) => c.query(
      "insert into public.agent_clients (client_id, client_name, redirect_uris, registration) values ($1, $2, $3, 'dcr')",
      [clientId, name, uris]));
    json(ctx.res, 201, {
      client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
      status: "pending_owner_consent",
    });
  });

  /** Authorization request -> stored, then handed to the app's consent screen (SIWS session required there). */
  r.add("GET", "/oauth/authorize", async (ctx) => {
    const q = ctx.url.searchParams;
    const clientId = q.get("client_id") ?? "";
    const redirect = q.get("redirect_uri") ?? "";
    const client = await asService(d.db, async (c) =>
      (await c.query<{ client_id: string; redirect_uris: string[]; status: string }>(
        "select client_id, redirect_uris, status from public.agent_clients where client_id = $1", [clientId])).rows[0]);
    // never redirect to an unverified URI (RFC 6749 4.1.2.1)
    if (!client || client.status === "disabled") return oauthErr(ctx.res, 400, "invalid_client", "unknown or disabled client");
    if (!client.redirect_uris.includes(redirect)) return oauthErr(ctx.res, 400, "invalid_request", "redirect_uri does not match a registered URI exactly");
    const state = q.get("state");
    const back = (error: string, desc: string) => {
      const u = new URL(redirect);
      u.searchParams.set("error", error);
      u.searchParams.set("error_description", desc);
      if (state) u.searchParams.set("state", state);
      u.searchParams.set("iss", a.issuer);
      ctx.res.writeHead(302, { Location: u.toString(), ...NO_STORE });
      ctx.res.end();
    };
    if (q.get("response_type") !== "code") return back("unsupported_response_type", "response_type=code only");
    if (q.get("code_challenge_method") !== "S256") return back("invalid_request", "code_challenge_method=S256 is required");
    const ch = q.get("code_challenge") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(ch)) return back("invalid_request", "code_challenge (S256, 43 chars) is required");
    if (q.get("resource") !== a.resource) return back("invalid_target", `resource must be ${a.resource}`);
    if (state !== null && state.length > 512) return back("invalid_request", "state too long");
    const scopes = parseScopes(q.get("scope")) ?? (q.get("scope") ? null : DEFAULT_SCOPES);
    if (!scopes) return back("invalid_scope", "scopes: read control trade");
    const id = await asService(d.db, async (c) => (await c.query<{ id: string }>(
      `insert into public.agent_auth_requests (client_id, redirect_uri, code_challenge, scopes, resource, state)
       values ($1, $2, $3, $4, $5, $6) returning id`, [clientId, redirect, ch, scopes, a.resource, state])).rows[0]!.id);
    if (a.consentUrl) {
      const u = new URL(a.consentUrl);
      u.searchParams.set("request_id", id);
      ctx.res.writeHead(302, { Location: u.toString(), ...NO_STORE });
      ctx.res.end();
      return;
    }
    json(ctx.res, 200, { request_id: id, consent: `/v1/agents/requests/${id}`, hint: `approve in the ${PRODUCT} app` });
  });

  r.add("POST", "/oauth/token", async (ctx) => {
    const b = await readBody(ctx);
    const jkt = await dpopAtToken(ctx, d);
    if (jkt === "bad") return oauthErr(ctx.res, 400, "invalid_dpop_proof", "DPoP proof invalid or replayed");
    if (b.resource !== undefined && b.resource !== a.resource) return oauthErr(ctx.res, 400, "invalid_target", `resource must be ${a.resource}`);

    if (b.grant_type === "authorization_code") {
      if (!b.code || !b.client_id || !b.redirect_uri) return oauthErr(ctx.res, 400, "invalid_request", "code, client_id, redirect_uri required");
      const out = await asService(d.db, async (c) => {
        const q = await c.query<{ id: string; client_id: string; redirect_uri: string; code_challenge: string; status: string; code_expires_at: Date; grant_id: string }>(
          "select * from public.agent_auth_requests where code_sha256 = $1 for update", [sha256(b.code!)]);
        const row = q.rows[0];
        if (!row) return "invalid" as const;
        if (row.status === "used") {
          // a replayed code revokes what it issued (OAuth 2.1 4.1.3)
          return { replay: row.grant_id } as const;
        }
        if (row.status !== "approved" || row.code_expires_at.getTime() < Date.now()) return "invalid" as const;
        if (row.client_id !== b.client_id || row.redirect_uri !== b.redirect_uri) return "invalid" as const;
        if (!pkceOk(b.code_verifier, row.code_challenge)) return "pkce" as const;
        await c.query("update public.agent_auth_requests set status = 'used' where id = $1", [row.id]);
        const g = await c.query<{ id: string; user_id: string; workspace_id: string; client_id: string; scopes: string[]; expires_at: Date; status: string }>(
          "select * from public.agent_grants where id = $1", [row.grant_id]);
        return g.rows[0]?.status === "active" ? g.rows[0] : ("invalid" as const);
      });
      if (out === "pkce") return oauthErr(ctx.res, 400, "invalid_grant", "PKCE verification failed");
      if (out === "invalid") return oauthErr(ctx.res, 400, "invalid_grant", "code invalid, expired or not for this client");
      if ("replay" in out) {
        await revokeGrants(d.db, { grantId: out.replay }, "client_revoke");
        return oauthErr(ctx.res, 400, "invalid_grant", "authorization code already used");
      }
      return json(ctx.res, 200, await issueTokens(d, out, jkt));
    }

    if (b.grant_type === "refresh_token") {
      if (!b.refresh_token || !b.client_id) return oauthErr(ctx.res, 400, "invalid_request", "refresh_token and client_id required");
      const out = await asService(d.db, async (c) => {
        const q = await c.query<{ id: string; grant_id: string; used_at: Date | null; revoked_at: Date | null; expires_at: Date; dpop_jkt: string | null }>(
          "select * from public.agent_refresh_tokens where token_sha256 = $1 for update", [sha256(b.refresh_token!)]);
        const t = q.rows[0];
        if (!t) return "invalid" as const;
        const g = (await c.query<{ id: string; user_id: string; workspace_id: string; client_id: string; client_name: string; scopes: string[]; expires_at: Date; status: string }>(
          "select * from public.agent_grants where id = $1 for update", [t.grant_id])).rows[0]!;
        if (g.client_id !== b.client_id) return "invalid" as const;
        if (t.used_at !== null) return { reuse: g } as const;   // rotated token presented again
        if (t.revoked_at !== null || g.status !== "active" || t.expires_at.getTime() < Date.now() || g.expires_at.getTime() < Date.now()) return "invalid" as const;
        if (t.dpop_jkt !== null && t.dpop_jkt !== jkt) return "dpop" as const;
        await c.query("update public.agent_refresh_tokens set used_at = now() where id = $1", [t.id]);
        return { g, jkt: t.dpop_jkt } as const;
      });
      if (out === "invalid") return oauthErr(ctx.res, 400, "invalid_grant", "refresh token invalid, expired or revoked");
      if (out === "dpop") return oauthErr(ctx.res, 400, "invalid_dpop_proof", "refresh token is DPoP-bound; send a proof with the same key");
      if ("reuse" in out && out.reuse) {
        const g = out.reuse;
        if ((await revokeGrants(d.db, { grantId: g.id }, "refresh_reuse")).length) {
          await emitAgentEvent(d.db, g.workspace_id, "agent.disconnected", { grant_id: g.id, client_id: g.client_id, client_name: g.client_name },
            { reason: "refresh_reuse" }, "instant").catch(() => undefined);
        }
        return oauthErr(ctx.res, 400, "invalid_grant", "refresh token reuse detected; the grant is revoked");
      }
      return json(ctx.res, 200, await issueTokens(d, out.g, out.jkt));
    }
    return oauthErr(ctx.res, 400, "unsupported_grant_type", "authorization_code or refresh_token");
  });

  /** RFC 7009: revoking either token revokes the whole grant. Always 200. */
  r.add("POST", "/oauth/revoke", async (ctx) => {
    const b = await readBody(ctx);
    const tok = b.token ?? "";
    let grantId: string | null = null;
    const at = verifyAgentToken(tok, a.tokenSecret, a.resource);
    if (at) grantId = at.grant_id;
    else if (tok) {
      grantId = await asService(d.db, async (c) => (await c.query<{ grant_id: string }>(
        "select grant_id from public.agent_refresh_tokens where token_sha256 = $1", [sha256(tok)])).rows[0]?.grant_id ?? null);
    }
    if (grantId) {
      const rows = await revokeGrants(d.db, { grantId }, "client_revoke");
      for (const g of rows) {
        await emitAgentEvent(d.db, g.workspace_id, "agent.disconnected", { grant_id: g.id, client_id: g.client_id, client_name: g.client_name },
          { reason: "client_revoke" }, "instant").catch(() => undefined);
      }
    }
    json(ctx.res, 200, {});
  });
}
