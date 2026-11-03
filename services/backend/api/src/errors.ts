// Error envelope from packages/contracts/errors.json (single registry: code -> http, sqlstate, messages).
import { readFileSync } from "node:fs";

export interface ErrorDef {
  code: string;
  kind: "error" | "notice" | "skip";
  http: number;
  sqlstate: string;
  retryable: boolean;
  messages: { en: string; id: string };
}

const REGISTRY_PATH =
  process.env.CENTURION_ERRORS_JSON ?? new URL("../../../../packages/contracts/errors.json", import.meta.url).pathname;

const registry: Map<string, ErrorDef> = new Map(
  (JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as { codes: ErrorDef[] }).codes.map((d) => [d.code, d]),
);

export function errorDef(code: string): ErrorDef | undefined {
  return registry.get(code);
}
export function errorCodes(): string[] {
  return [...registry.keys()];
}

export type Details = Record<string, unknown>;

/** An error the API answers with. `code` must exist in errors.json. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Details;
  readonly headers: Record<string, string>;
  constructor(code: string, details: Details = {}, headers: Record<string, string> = {}) {
    const known = registry.has(code);
    super(known ? code : `INTERNAL (unknown code ${code})`);
    this.code = known ? code : "INTERNAL";
    this.status = registry.get(this.code)?.http ?? 500;
    this.details = details;
    this.headers = headers;
  }
}

export type Lang = "en" | "id";
export function pickLang(acceptLanguage: string | undefined): Lang {
  return /^\s*id\b/i.test(acceptLanguage ?? "") ? "id" : "en";
}

/** `{error: {code, message, ...details, request_id, server_now}, server_now}` (never a bare string). */
export function errorBody(e: ApiError, requestId: string, serverNow: string, lang: Lang) {
  const def = registry.get(e.code);
  const reserved = new Set(["code", "message", "request_id", "server_now"]);
  const details = Object.fromEntries(Object.entries(e.details).filter(([k]) => !reserved.has(k)));
  return {
    error: {
      code: e.code,
      message: def?.messages[lang] ?? e.code,
      ...details,
      request_id: requestId,
      server_now: serverNow,
    },
    server_now: serverNow,
  };
}

interface PgLikeError {
  code?: string;
  message?: string;
  detail?: string;
}

/** Map a Postgres error: our functions raise SQLSTATE P0<http>, MESSAGE = code, DETAIL = JSON details. */
export function fromPg(err: unknown): ApiError | undefined {
  const e = err as PgLikeError;
  if (typeof e?.code !== "string") return undefined;
  if (/^P0[45]\d\d$/.test(e.code) && e.message && registry.has(e.message)) {
    let details: Details = {};
    if (e.detail) {
      try {
        const d = JSON.parse(e.detail) as unknown;
        if (d && typeof d === "object" && !Array.isArray(d)) details = d as Details;
      } catch {
        details = { detail: e.detail };
      }
    }
    return new ApiError(e.message, details);
  }
  // settings CHECK / constraint violations: the message names the field, never data from other tenants
  if (e.code === "23514" || e.code === "22P02" || e.code === "22023") {
    return new ApiError("VALIDATION_FAILED", { reason: e.message?.slice(0, 200) });
  }
  if (e.code === "42501") return new ApiError("FORBIDDEN_ROLE");
  return undefined;
}

/** RPCs that *return* an error object (e.g. CONFIRMATION_RESTART_REQUIRED) instead of raising. */
export function fromReturnedError(r: unknown): ApiError | undefined {
  const o = r as { error?: { code?: string } & Details };
  if (o && typeof o === "object" && o.error && typeof o.error.code === "string" && registry.has(o.error.code)) {
    const { code, message: _m, server_now: _s, ...rest } = o.error;
    return new ApiError(code, rest);
  }
  return undefined;
}
