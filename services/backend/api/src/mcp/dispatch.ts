// In-process dispatch of an MCP tool call into the API's own request handler, so the agent goes through the
// SAME middleware and handlers as any REST client: auth, scopes, role/RLS, mode, write rate limits,
// Idempotency-Key, If-Match, SQL guards. No parallel implementation of any rule.
//
// Route-level default deny (MCP_DESIGN section 3, L2): a request whose token says centurion_client=mcp is
// only served when it was created here AND its (method, route pattern) is on the calling tool's allowlist.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { ApiError } from "../errors.ts";
import { signJwt } from "../jwt.ts";
import type { AgentDeps } from "./common.ts";

const dispatched = new WeakMap<IncomingMessage, Set<string>>();

/** Called by server.ts for every matched route, before rate limits and the handler. */
export function agentRouteGuard(req: IncomingMessage, method: string, pattern: string): void {
  if (!pattern.startsWith("/v1/")) return; // /mcp and /oauth/* authenticate agent tokens themselves
  const auth = req.headers.authorization;
  if (typeof auth !== "string") return;
  let claims: { centurion_client?: unknown; agent?: unknown };
  try {
    const payload = auth.replace(/^\s*(Bearer|DPoP)\s+/i, "").split(".")[1] ?? "";
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as typeof claims;
  } catch {
    return; // not a JWT: authenticate() rejects it later
  }
  // Tokens minted by dispatch() carry an `agent` claim. Other mcp-channel tokens (contracts 1.1.5) keep the
  // existing per-route refusals (requireApp -> FORBIDDEN_SCOPE, SQL -> FORBIDDEN_ROLE agent_cannot_loosen).
  if (claims?.centurion_client !== "mcp" || claims.agent == null) return;
  const allowed = dispatched.get(req);
  if (!allowed || !allowed.has(`${method} ${pattern}`)) throw new ApiError("FORBIDDEN_SCOPE", { required: "app" });
}

export interface Caller {
  sub: string;
  ws: string;
  grantId: string;
  clientId: string;
  clientName: string;
  /** Internal app scopes for this call: ["read"] or ["read","trade"] (practice mutations). */
  appScopes: string[];
  ip: string;
  forwardedFor?: string;
  requestId: string;
}

export interface Reply {
  status: number;
  body: any;
  headers: Record<string, string>;
}

class Capture {
  statusCode = 0;
  headersSent = false;
  headers: Record<string, string> = {};
  private chunks: string[] = [];
  private done: () => void;
  constructor(done: () => void) {
    this.done = done;
  }
  writeHead(status: number, h?: Record<string, string>) {
    this.statusCode = status;
    this.headersSent = true;
    for (const [k, v] of Object.entries(h ?? {})) this.headers[k.toLowerCase()] = String(v);
    return this;
  }
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = String(v);
  }
  write(s: string | Buffer) {
    this.chunks.push(String(s));
    return true;
  }
  end(s?: string | Buffer) {
    if (s !== undefined) this.chunks.push(String(s));
    this.done();
    return this;
  }
  on() {
    return this;
  }
  once() {
    return this;
  }
  text(): string {
    return this.chunks.join("");
  }
}

/** Run one REST request as the agent. `allow` = the (method, pattern) pairs this tool may reach. */
export async function dispatch(
  d: AgentDeps, who: Caller, allow: string[], method: string, path: string,
  o: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const now = Math.floor(Date.now() / 1000);
  const internal = signJwt({
    sub: who.sub, aud: d.cfg.jwtAudience || "authenticated", role: "authenticated", iat: now, exp: now + 60,
    app_scopes: who.appScopes, centurion_client: "mcp",
    agent: { grant_id: who.grantId, client_id: who.clientId, client_name: who.clientName.slice(0, 100) },
  }, d.cfg.jwtSecret);
  const raw = o.body === undefined ? [] : [Buffer.from(JSON.stringify(o.body))];
  const req = Readable.from(raw) as unknown as IncomingMessage;
  Object.assign(req, {
    method, url: path,
    headers: {
      authorization: `Bearer ${internal}`,
      "x-request-id": who.requestId,
      "user-agent": "centurion-trade-mcp",
      ...(o.body === undefined ? {} : { "content-type": "application/json" }),
      ...(who.forwardedFor ? { "x-forwarded-for": who.forwardedFor } : {}),
      ...(o.headers ?? {}),
    },
    socket: { remoteAddress: who.ip },
  });
  dispatched.set(req, new Set(allow));
  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));
  const res = new Capture(resolve);
  await d.handle(req, res as unknown as ServerResponse);
  await finished;
  const t = res.text();
  let body: unknown = null;
  try {
    body = t ? JSON.parse(t) : null;
  } catch {
    body = { raw: t.slice(0, 200) };
  }
  return { status: res.statusCode, body, headers: res.headers };
}
