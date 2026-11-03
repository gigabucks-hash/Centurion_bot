/**
 * Mock BFF helpers: this app's route handlers under /api/v1/workspaces/{ws}/… speak the contract wire format
 * (API_ENDPOINTS.md v1.1): `{data, server_now}` / `{items, next_cursor, server_now}` / `{error, server_now}`,
 * mode as a query param on reads and a body field on writes, Idempotency-Key on writes.
 * Mock only: nothing here touches wallets, RPC or chain.
 */
import { errorMessage, type ErrorCode, type Mode } from "@centurion/contracts/wire";
import { httpStatus } from "./errors";

export const MOCK_WORKSPACE = "ws_mock";

export const now = () => new Date().toISOString();

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data, server_now: now() }, init);
}

export function list<T>(items: T[], extra: Record<string, unknown> = {}) {
  return Response.json({ items, next_cursor: null, ...extra, server_now: now() });
}

/**
 * Contract 1.1.2 error body: `error` is always an object and every detail is flattened into it
 * (`{error: {code, message, request_id, server_now, current_rev, current, retry_after_s, ...}, server_now}`).
 * `extra` and `details` are both merged into `error` (kept as two args for call-site compatibility).
 */
export function fail(code: ErrorCode, extra: Record<string, unknown> = {}, details?: Record<string, unknown>) {
  const ts = now();
  return Response.json(
    { error: { ...(details ?? {}), ...extra, code, message: errorMessage(code, "en"), request_id: `req_mock_${Math.random().toString(36).slice(2, 10)}`, server_now: ts }, server_now: ts },
    { status: httpStatus(code) },
  );
}

/**
 * Real SOL switch for the mock. Contract today: `mode=real` → 403 REAL_SOL_DISABLED.
 * CENTURION_REAL_SOL=mock (default in this prototype) keeps the mock Real workspace browsable for design QA;
 * CENTURION_REAL_SOL=disabled reproduces the production answer so the disabled state can be tested.
 */
export function realSolDisabled(): boolean {
  return process.env.CENTURION_REAL_SOL === "disabled";
}

export function parseMode(v: unknown): Mode | null {
  return v === "practice" || v === "real" ? v : v == null ? "practice" : null;
}

/** Returns an error Response when the mode is invalid or Real SOL is disabled, else the mode. */
export function gateMode(v: unknown): Mode | Response {
  const m = parseMode(v);
  if (!m) return fail("VALIDATION_FAILED", {}, { field: "mode" });
  if (m === "real" && realSolDisabled()) return fail("REAL_SOL_DISABLED");
  return m;
}

// Idempotency (24 h in the contract; process lifetime here).
const g = globalThis as unknown as { __centurionIdem?: Map<string, { hash: string; status: number; body: unknown }> };
const idem = (g.__centurionIdem ??= new Map());

/**
 * Wraps a mutating handler: requires `Idempotency-Key` (8..128 chars), replays the stored response for the
 * same key + body (`Idempotent-Replayed: true`), 409 IDEMPOTENCY_KEY_REUSED for the same key + different body.
 */
export async function idempotent(req: Request, rawBody: string, run: () => Promise<Response>): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 128) return fail("VALIDATION_FAILED", {}, { header: "Idempotency-Key" });
  const prev = idem.get(key);
  if (prev) {
    if (prev.hash !== rawBody) return fail("IDEMPOTENCY_KEY_REUSED");
    return Response.json(prev.body, { status: prev.status, headers: { "Idempotent-Replayed": "true" } });
  }
  const res = await run();
  const body = await res.clone().json().catch(() => null);
  if (res.status < 500) idem.set(key, { hash: rawBody, status: res.status, body });
  return res;
}

export async function readJson(req: Request): Promise<{ raw: string; body: Record<string, unknown> } | Response> {
  const raw = await req.text();
  try {
    const body = raw ? JSON.parse(raw) : {};
    return { raw, body: body && typeof body === "object" ? body : {} };
  } catch {
    return fail("VALIDATION_FAILED", {}, { body: "invalid JSON" });
  }
}
