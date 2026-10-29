import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import type { Ctx } from "./http.ts";
import { bearer, principal, verifyAccess, type Principal } from "./jwt.ts";
import type { MarkHub } from "./sse.ts";
import type { FeedHub } from "./feed.ts";
import type { Limiter } from "./ratelimit.ts";

export interface Deps {
  cfg: Config;
  db: Db;
  marks: MarkHub;
  feeds: FeedHub;
  /** Rate-limit store (memory or Postgres); created from config when absent. */
  limiter?: Limiter;
}

export function authenticate(ctx: Ctx, cfg: Config): Principal {
  const claims = verifyAccess(bearer(ctx.req.headers.authorization), cfg);
  return principal(claims);
}
