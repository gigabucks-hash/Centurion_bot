// Idempotency-Key store for endpoints whose SQL function has no idempotency of its own (strategies,
// practice reset, devices, account deletion). Table public.api_idempotency, keyed (user_id, key), 24 h.
// Same key + same request (method, path, canonical body) -> stored 2xx response, `replayed: true` and
// `Idempotent-Replayed: true`. Same key + different request -> 422 IDEMPOTENCY_KEY_REUSED. Errors are not
// stored (the reservation is released), so a client can retry after fixing a 409/422 with the same key.
// A request still in flight under the same key -> 503 UNAVAILABLE (Retry-After: 1).
import { createHash } from "node:crypto";
import { ApiError } from "./errors.ts";
import { asService, type Db } from "./db.ts";
import { send, type Ctx } from "./http.ts";
import type { Principal } from "./jwt.ts";

export interface Result {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export function requestHash(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(`${method} ${path}\n${canonical(body)}`).digest("hex");
}

export async function idempotent(ctx: Ctx, db: Db, p: Principal, key: string, body: unknown, run: () => Promise<Result>): Promise<void> {
  const method = ctx.req.method ?? "POST";
  const path = ctx.url.pathname;
  const hash = requestHash(method, path, body);
  const prior = await asService(db, async (c) => {
    await c.query("delete from public.api_idempotency where user_id = $1 and key = $2 and expires_at < now()", [p.userId, key]);
    const ins = await c.query(
      `insert into public.api_idempotency (user_id, key, method, path, request_hash) values ($1, $2, $3, $4, $5)
       on conflict (user_id, key) do nothing returning key`,
      [p.userId, key, method, path, hash],
    );
    if (ins.rowCount === 1) return null;
    const r = await c.query("select method, path, request_hash, status_code, response from public.api_idempotency where user_id = $1 and key = $2", [p.userId, key]);
    return r.rows[0] as { method: string; path: string; request_hash: string; status_code: number | null; response: Record<string, unknown> | null };
  });
  if (prior) {
    if (prior.request_hash !== hash || prior.method !== method || prior.path !== path) throw new ApiError("IDEMPOTENCY_KEY_REUSED");
    if (prior.status_code === null || !prior.response) {
      throw new ApiError("UNAVAILABLE", { reason: "request with this Idempotency-Key is still in progress", retry_after_s: 1 }, { "Retry-After": "1" });
    }
    send(ctx, prior.status_code, { ...prior.response, replayed: true }, { "Idempotent-Replayed": "true" });
    return;
  }
  let out: Result;
  try {
    out = await run();
  } catch (e) {
    await asService(db, (c) => c.query("delete from public.api_idempotency where user_id = $1 and key = $2", [p.userId, key])).catch(() => undefined);
    throw e;
  }
  const { server_now: _drop, ...stored } = out.body;
  await asService(db, (c) =>
    c.query("update public.api_idempotency set status_code = $3, response = $4 where user_id = $1 and key = $2", [p.userId, key, out.status, JSON.stringify(stored)]),
  );
  send(ctx, out.status, { ...out.body, replayed: false }, out.headers ?? {});
}
