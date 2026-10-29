// Every user request runs in its own transaction as role `authenticated` with the verified JWT claims in
// `request.jwt.claims` (exactly what PostgREST does), so RLS, auth.uid() and request_client() see the caller.
// The actor and channel therefore come from the token; the API never passes p_actor / p_via.
import pg from "pg";
import { ApiError, fromPg } from "./errors.ts";
import type { Claims } from "./jwt.ts";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 20, idleTimeoutMillis: 30_000 });
  pool.on("error", (e) => console.error("pg pool error:", e.message));
  return pool;
}

async function inTx<T>(db: Db, role: "authenticated" | "service_role", claims: Claims | null, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(
      "select public.session_check($4::uuid), set_config('role', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.sub', $3, true)",
      [role, claims ? JSON.stringify(claims) : "", claims?.sub ?? "", typeof claims?.sid === "string" ? claims.sid : null],
    );
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw fromPg(e) ?? e;
  } finally {
    c.release();
  }
}

export function asUser<T>(db: Db, claims: Claims, fn: (c: Tx) => Promise<T>): Promise<T> {
  return inTx(db, "authenticated", claims, fn);
}
/** Service-only functions (issue_approval_token, ...); callers pass the already verified user explicitly. */
export function asService<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  return inTx(db, "service_role", null, fn);
}

export async function requireMember(c: Tx, ws: string): Promise<void> {
  const r = await c.query<{ ok: boolean }>("select public.is_workspace_member($1::uuid) as ok", [ws]);
  if (!r.rows[0]?.ok) throw new ApiError("NOT_FOUND");
}
