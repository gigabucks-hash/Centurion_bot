// Request rules shared by every endpoint: mode, revisions (If-Match / expected_rev), Idempotency-Key, cursors.
import { ApiError } from "./errors.ts";
import type { Ctx } from "./http.ts";
import type { Principal } from "./jwt.ts";
import { decodeCursor, type CursorIdKind, type Cursor, type CursorRange } from "./wire.ts";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(ctx: Ctx, k: string): string {
  const v = ctx.params[k] ?? "";
  if (!UUID.test(v)) throw new ApiError("NOT_FOUND");
  return v.toLowerCase();
}

/** `mode=practice|real` (default practice). Real does not exist before Phase 7. */
export function modeParam(ctx: Ctx, bodyMode?: unknown): "practice" {
  const m = bodyMode ?? ctx.url.searchParams.get("mode") ?? "practice";
  if (m === "practice") return "practice";
  if (m === "real") throw new ApiError("REAL_SOL_DISABLED", { real_enabled: false });
  throw new ApiError("VALIDATION_FAILED", { field: "mode", allowed: ["practice", "real"] });
}

export function requireScope(p: Principal, scope: "read" | "trade"): void {
  if (!p.scopes.has(scope)) throw new ApiError("FORBIDDEN_SCOPE", { required: scope });
}

/**
 * The revision a write is based on: `If-Match: "<rev>"` (also W/"<rev>" or bare) or body `expected_rev`.
 * Returns null when neither is sent; the SQL function then answers 428 PRECONDITION_REQUIRED.
 * Both sent and different -> 422.
 */
export function expectedRev(ctx: Ctx, body: Record<string, unknown>): number | null {
  const h = ctx.req.headers["if-match"];
  let fromHeader: number | null = null;
  if (typeof h === "string" && h.trim() !== "") {
    const m = /^\s*(?:W\/)?"?(\d{1,9})"?\s*$/.exec(h);
    if (!m?.[1]) throw new ApiError("VALIDATION_FAILED", { field: "If-Match", reason: 'expected "<rev>"' });
    fromHeader = Number(m[1]);
  }
  const b = body.expected_rev;
  let fromBody: number | null = null;
  if (b !== undefined && b !== null) {
    if (typeof b !== "number" || !Number.isInteger(b) || b < 1) {
      throw new ApiError("VALIDATION_FAILED", { field: "expected_rev", reason: "positive integer" });
    }
    fromBody = b;
  }
  if (fromHeader !== null && fromBody !== null && fromHeader !== fromBody) {
    throw new ApiError("VALIDATION_FAILED", { field: "expected_rev", reason: "If-Match and expected_rev differ" });
  }
  return fromHeader ?? fromBody;
}

export function requireRev(rev: number | null): number {
  if (rev === null) throw new ApiError("PRECONDITION_REQUIRED", { hint: 'send If-Match: "<rev>" or expected_rev' });
  return rev;
}

/** `Idempotency-Key` (8..128 chars), required on every mutating request. */
export function idempotencyKey(ctx: Ctx): string {
  const k = ctx.req.headers["idempotency-key"];
  if (typeof k !== "string" || k === "") {
    throw new ApiError("PRECONDITION_REQUIRED", { hint: "send Idempotency-Key (8-128 chars)" });
  }
  if (k.length < 8 || k.length > 128 || !/^[\x21-\x7e]+$/.test(k)) {
    throw new ApiError("VALIDATION_FAILED", { field: "Idempotency-Key", reason: "8-128 visible ASCII chars" });
  }
  return k;
}

/** int64 cursor as an integer string. */
export function seqParam(v: string | null | undefined, field: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (!/^\d{1,19}$/.test(v) || BigInt(v) > 9223372036854775807n) {
    throw new ApiError("CURSOR_INVALID", { field });
  }
  return BigInt(v).toString();
}

export function limitParam(ctx: Ctx, d: number, max: number): number {
  const v = ctx.url.searchParams.get("limit");
  if (v === null) return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new ApiError("VALIDATION_FAILED", { field: "limit", max });
  return n;
}

const WINDOWS: Record<string, number | null> = { "1h": 3600, "24h": 86400, "7d": 604800, "30d": 2592000, all: null };

/** `window=1h|24h|7d|30d|all` (default 24h, or `def` where a report has its own default) or explicit `from`/`to` (RFC 3339). */
export function timeRange(ctx: Ctx, def: string = "24h"): { from: string | null; to: string | null } {
  const q = ctx.url.searchParams;
  const iso = (k: string) => {
    const v = q.get(k);
    if (v === null) return null;
    const t = Date.parse(v);
    if (Number.isNaN(t)) throw new ApiError("VALIDATION_FAILED", { field: k, reason: "RFC 3339 timestamp" });
    return new Date(t).toISOString();
  };
  const from = iso("from");
  const to = iso("to");
  if (from || to) return { from, to };
  const w = q.get("window") ?? def;
  if (!(w in WINDOWS)) throw new ApiError("VALIDATION_FAILED", { field: "window", allowed: Object.keys(WINDOWS) });
  const secs = WINDOWS[w];
  return { from: secs == null ? null : new Date(Date.now() - secs * 1000).toISOString(), to: null };
}

const CONFLICTS = new Set(["VERSION_CONFLICT", "STRATEGY_REV_CONFLICT", "CONFIRMATION_RESTART_REQUIRED"]);

/**
 * `current` is REQUIRED on every 409 conflict (API_ENDPOINTS 2.1). The SQL functions send it; this is the
 * server-side guarantee for any path that does not: load the resource as it is now and attach it.
 */
export async function withCurrent<T>(fn: () => Promise<T>, load: () => Promise<unknown>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && CONFLICTS.has(e.code) && e.details.current === undefined) {
      e.details.current = (await load().catch(() => null)) ?? null;
    }
    throw e;
  }
}

/** Optional free-form device label (metadata only, like p_device). */
export function deviceLabel(ctx: Ctx, body: Record<string, unknown>): string | null {
  const v = body.device ?? ctx.req.headers["x-centurion-device"];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 64 || /[\u0000-\u001f]/.test(v)) throw new ApiError("VALIDATION_FAILED", { field: "device", max: 64 });
  return v;
}

/** "app" endpoints (deletion, unlink, Real switches): first-party apps only, never MCP agents. */
export function requireApp(p: Principal): void {
  if (p.via === "mcp") throw new ApiError("FORBIDDEN_SCOPE", { required: "app" });
}

/** `?cursor=` (opaque keyset cursor from a previous page); malformed -> 400 CURSOR_INVALID. */
export function cursorParam(ctx: Ctx, kind: CursorIdKind = "uuid"): Cursor | null {
  const c = decodeCursor(ctx.url.searchParams.get("cursor"), kind);
  if (c === "bad") throw new ApiError("CURSOR_INVALID", { field: "cursor" });
  return c;
}

/**
 * Resolve the stable `[from, to)` a ranged keyset walk is pinned to, and reject a cursor replayed
 * against another range. A relative `window` is resolved once (page 1) and carried inside the cursor,
 * so page 2 cannot silently move its lower bound and drop the oldest rows.
 *
 * `def`: `undefined` = 24h default, `null` = unbounded unless the request asks, else that window.
 */
export function pagedRange(
  ctx: Ctx,
  cur: Cursor | null,
  def?: string | null,
): { range: CursorRange; window: string | null } {
  const q = ctx.url.searchParams;
  const hasExplicit = q.has("from") || q.has("to");
  const requestedWindow = q.has("window") ? (q.get("window") ?? "") : null;
  const asked = requestedWindow !== null || hasExplicit;
  const current: CursorRange =
    def === null && !asked ? { from: null, to: null } : timeRange(ctx, def ?? "24h");
  const frozen = cur?.range ?? null;

  if (frozen) {
    if (hasExplicit) {
      if (current.from !== frozen.from || current.to !== frozen.to) {
        throw new ApiError("CURSOR_INVALID", { field: "cursor", reason: "cursor belongs to another range" });
      }
    } else if (requestedWindow !== null && requestedWindow !== (cur?.window ?? null)) {
      throw new ApiError("CURSOR_INVALID", { field: "cursor", reason: "cursor belongs to another range" });
    }
    return { range: frozen, window: cur?.window ?? null };
  }

  // Page 1 (or a legacy 2-part cursor): freeze what this request resolves to.
  const window = hasExplicit ? null : (requestedWindow ?? (typeof def === "string" ? def : null));
  return { range: current, window };
}
