import { createServer, type Server } from "node:http";
import { ApiError } from "./errors.ts";
import { makeCtx, sendError } from "./http.ts";
import { buildRouter, type Deps } from "./routes.ts";

export function createApiServer(d: Deps): Server {
  const router = buildRouter(d);
  return createServer(async (req, res) => {
    const ctx = makeCtx(req, res);
    try {
      const m = router.match(req.method ?? "GET", ctx.url.pathname);
      if (m === undefined) throw new ApiError("NOT_FOUND");
      if (m === "method") throw new ApiError("VALIDATION_FAILED", { reason: `method ${req.method} not allowed` });
      ctx.params = m.params;
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
