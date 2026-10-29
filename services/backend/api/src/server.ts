import { createServer, type Server } from "node:http";
import { ApiError } from "./errors.ts";
import { makeCtx, sendError, type Ctx } from "./http.ts";
import { buildRouter, type Deps } from "./routes.ts";
import { bearer, verifyJwt } from "./jwt.ts";
import { PgRateLimiter, RateLimiter, clientIp, type Limiter } from "./ratelimit.ts";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Verified token subject for rate-limit keys only (an invalid token just means "no user key"). */
function subjectOf(ctx: Ctx, d: Deps): string | null {
  try {
    return verifyJwt(bearer(ctx.req.headers.authorization), d.cfg.jwtSecret, d.cfg.jwtAudience).sub;
  } catch {
    return null;
  }
}

/** Every write: per IP, per user, and per (user or IP) + route pattern. */
async function limitWrite(ctx: Ctx, d: Deps, l: Limiter, method: string, pattern: string): Promise<void> {
  const ip = clientIp(ctx.req, d.cfg.trustProxy);
  const sub = subjectOf(ctx, d);
  await l.hit(`w:ip:${ip}`, d.cfg.rateLimitWriteIpPerMin, 60);
  if (sub) await l.hit(`w:user:${sub}`, d.cfg.rateLimitWriteUserPerMin, 60);
  await l.hit(`w:route:${method} ${pattern}:${sub ?? ip}`, d.cfg.rateLimitWriteRoutePerMin, 60);
}

export function createApiServer(d: Deps): Server {
  const limiter = d.limiter ?? (d.cfg.rateLimitStore === "postgres" ? new PgRateLimiter(d.db) : new RateLimiter());
  const deps: Deps = { ...d, limiter };
  const router = buildRouter(deps);
  return createServer(async (req, res) => {
    const ctx = makeCtx(req, res);
    try {
      const method = req.method ?? "GET";
      const m = router.match(method, ctx.url.pathname);
      if (m === undefined) throw new ApiError("NOT_FOUND");
      if (m === "method") throw new ApiError("VALIDATION_FAILED", { reason: `method ${req.method} not allowed` });
      ctx.params = m.params;
      // /v1/auth/* has its own limits (routes_auth.ts) that never hard-block the owner wallet
      if (WRITES.has(method) && !m.pattern.startsWith("/v1/auth/")) await limitWrite(ctx, deps, limiter, method, m.pattern);
      await m.handler(ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        sendError(ctx, e);
      } else {
        // never echo internals; log without request bodies or tokens
        console.error(`[${ctx.requestId}] ${req.method} ${ctx.url.pathname}:`, e instanceof Error ? e.message : e);
        sendError(ctx, new ApiError("INTERNAL"));
      }
    }
  });
}
