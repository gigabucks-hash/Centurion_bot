/**
 * Contract error codes (packages/contracts/errors.json v4 via @sentra/contracts/wire) → typed ApiError → UI copy.
 * Copy (i18n 0.4.3): `errors.map.json` `codes[code].key` → UX copy in en/id; unmapped codes → `error.code.internal`.
 * (errors.json v4 `messages` stay server-side, e.g. in the mock BFF's `error.message`.)
 * Never show the raw server `message` string from a response body.
 */
import { ERROR_CODES, isErrorCode, type ErrorCode } from "@sentra/contracts/wire";
import ERRORS_MAP from "@sentra/i18n/errors.map.json";
import type { MessageKey, T } from "./i18n";

export type ClientErrorCode = ErrorCode | "UNKNOWN" | "OFFLINE";

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
    /** Full error body (409 bodies carry merge data: current_rev, changed_fields, current, ...). */
    readonly body: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ApiError";
  }
  /** 1.1.2: details are flattened into `error` (e.g. `error.current_rev`, `error.retry_after_s`). */
  get details(): Record<string, unknown> {
    return ((this.body.error as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  }
  get retryable(): boolean {
    return this.code === "OFFLINE" || (isErrorCode(this.code) && ERROR_CODES[this.code].retryable);
  }
}

/** Builds an ApiError from a contract error body `{error: {code, message, ...details, server_now}, server_now}`. */
export function toApiError(status: number, body: unknown): ApiError {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = (b.error as { code?: string } | undefined)?.code;
  return new ApiError(code && isErrorCode(code) ? code : "UNKNOWN", status, b);
}

export function errorKey(code: ClientErrorCode): MessageKey {
  return `apiError.${code}` as MessageKey;
}

/** Localized message for any thrown value. */
export function errorText(t: T, e: unknown): string {
  if (e instanceof ApiError) return codeText(t, e.code);
  if (e instanceof TypeError) return t(errorKey("OFFLINE"));
  return codeText(t, "UNKNOWN");
}

export function httpStatus(code: ErrorCode): number {
  return ERROR_CODES[code].http;
}

/** UX key for a contract code via @sentra/i18n 0.4.3 errors.map.json (`codes[code].key`); unknown → `error.code.internal`. */
export function errorUxKey(code: string): string {
  const m = ERRORS_MAP as { unknown: string; codes: Record<string, { key: string }> };
  return m.codes[code]?.key ?? m.unknown;
}

/**
 * Localized copy for an error code (i18n 0.4.3): errors.map.json → UX key → t.ux (en/id). Codes the map does not
 * know (and our client-only UNKNOWN) fall back to `error.code.internal`; OFFLINE keeps our app copy.
 */
/** Codes newer than errors.map.json that we cover with app copy (apiError.*) until UX maps them. */
const APP_ONLY_CODES = new Set<string>(["GUARD_WEAKEN_REQUIRES_APPROVAL"]);

export function codeText(t: T, code: ClientErrorCode): string {
  if (code === "OFFLINE") return t(errorKey(code));
  if (APP_ONLY_CODES.has(code) && !(ERRORS_MAP as { codes: Record<string, unknown> }).codes[code]) return t(`apiError.${code}` as never);
  return t.ux(errorUxKey(code) as never);
}
