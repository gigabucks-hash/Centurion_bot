// Minimal HTTP plumbing: routing, JSON bodies, `server_now` + `X-Server-Now` on every response, error envelope.
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { brotliCompressSync, constants as zc, gzipSync } from "node:zlib";
import { ApiError, errorBody, pickLang, type Lang } from "./errors.ts";

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  requestId: string;
  lang: Lang;
}

export type Handler = (ctx: Ctx) => Promise<void>;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  handler: Handler;
  pattern: string;
}

export class Router {
  private routes: Route[] = [];
  add(method: string, pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const re = new RegExp(
      "^" +
        pattern.replace(/\//g, "\\/").replace(/:([a-z_]+)/g, (_, k: string) => {
          keys.push(k);
          return "([^/]+)";
        }) +
        "\\/?$",
    );
    this.routes.push({ method, re, keys, handler, pattern });
    return this;
  }
  match(method: string, path: string): { handler: Handler; params: Record<string, string>; pattern: string } | "method" | undefined {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? "")));
      return { handler: r.handler, params, pattern: r.pattern };
    }
    return pathMatched ? "method" : undefined;
  }
}

export const serverNow = (): string => new Date().toISOString();

export function newRequestId(incoming: string | string[] | undefined): string {
  if (typeof incoming === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(incoming)) return incoming;
  return "req_" + randomBytes(12).toString("base64url");
}

/** Security headers on every API response (JSON only, never rendered): PERF_SECURITY.md section 4. HSTS is ignored by
 *  browsers over plain http (local dev) and enforced behind the TLS terminator (TLS 1.2+ only, documented). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-site",
};

export function baseHeaders(ctx: Ctx, now: string): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    "X-Server-Now": now,
    "X-Request-Id": ctx.requestId,
    "Cache-Control": "no-store",
  };
}

/** Responses at least this large are compressed when the client accepts br or gzip. */
export const COMPRESS_MIN_BYTES = 1024;

/** Pick br > gzip from Accept-Encoding (q=0 means refused). */
export function pickEncoding(accept: string | string[] | undefined): "br" | "gzip" | null {
  const raw = Array.isArray(accept) ? accept.join(",") : (accept ?? "");
  const ok = new Set<string>();
  for (const part of raw.split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((s) => s.trim()).find((s) => s.startsWith("q="));
    if (name && !(q && Number(q.slice(2)) === 0)) ok.add(name);
  }
  if (ok.has("br")) return "br";
  if (ok.has("gzip")) return "gzip";
  return null;
}

/** Body + headers, compressed when worthwhile (brotli quality 4: fast enough for per-request JSON). */
function encodeBody(ctx: Ctx, s: string): { body: Buffer; headers: Record<string, string> } {
  const raw = Buffer.from(s, "utf8");
  const enc = raw.length >= COMPRESS_MIN_BYTES ? pickEncoding(ctx.req.headers["accept-encoding"]) : null;
  if (!enc) return { body: raw, headers: { "Content-Length": String(raw.length) } };
  const body =
    enc === "br"
      ? brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 4, [zc.BROTLI_PARAM_SIZE_HINT]: raw.length } })
      : gzipSync(raw, { level: 5 });
  return { body, headers: { "Content-Encoding": enc, Vary: "Accept-Encoding", "Content-Length": String(body.length) } };
}

/** JSON response; adds top-level `server_now` unless the body already has one (RPC results carry the DB clock). */
export function send(ctx: Ctx, status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): void {
  const now = serverNow();
  // RPC results carry the DB clock (jsonb text, microseconds, session offset): normalize to RFC 3339 UTC ms
  const dbNow = typeof body.server_now === "string" ? Date.parse(body.server_now) : NaN;
  const out = { ...body, server_now: Number.isNaN(dbNow) ? now : new Date(dbNow).toISOString() };
  const enc = encodeBody(ctx, JSON.stringify(out));
  ctx.res.writeHead(status, {
    ...baseHeaders(ctx, now),
    "Content-Type": "application/json; charset=utf-8",
    ...enc.headers,
    ...headers,
  });
  ctx.res.end(enc.body);
}

function retryAfter(e: ApiError): Record<string, string> {
  if (e.headers["Retry-After"]) return {};
  const at = e.details.next_allowed_at;
  if (typeof at === "string" && !Number.isNaN(Date.parse(at))) {
    return { "Retry-After": String(Math.max(1, Math.ceil((Date.parse(at) - Date.now()) / 1000))) };
  }
  const s = e.details.retry_after_s;
  return typeof s === "number" && s > 0 ? { "Retry-After": String(Math.ceil(s)) } : {};
}

export function sendError(ctx: Ctx, e: ApiError): void {
  const now = serverNow();
  const s = JSON.stringify(errorBody(e, ctx.requestId, now, ctx.lang));
  if (ctx.res.headersSent) {
    ctx.res.end();
    return;
  }
  ctx.res.writeHead(e.status, {
    ...baseHeaders(ctx, now),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(s).toString(),
    ...retryAfter(e),
    ...e.headers,
  });
  ctx.res.end(s);
}

const MAX_BODY = 64 * 1024;

export async function readJson(ctx: Ctx): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of ctx.req) {
    const b = c as Buffer;
    n += b.length;
    if (n > MAX_BODY) throw new ApiError("VALIDATION_FAILED", { reason: "body too large" });
    chunks.push(b);
  }
  if (n === 0) return {};
  let v: unknown;
  try {
    v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("VALIDATION_FAILED", { reason: "body is not valid JSON" });
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError("VALIDATION_FAILED", { reason: "body must be a JSON object" });
  }
  return v as Record<string, unknown>;
}

export function makeCtx(req: IncomingMessage, res: ServerResponse): Ctx {
  return {
    req,
    res,
    url: new URL(req.url ?? "/", "http://local"),
    params: {},
    requestId: newRequestId(req.headers["x-request-id"]),
    lang: pickLang(req.headers["accept-language"]),
  };
}
