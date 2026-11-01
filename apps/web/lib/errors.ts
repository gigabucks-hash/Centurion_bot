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

/** errors.map.json per-code presentation (i18n 0.4.6+, additive; all optional). */
type MapEntry = { key: string; tone?: "error" | "warning" | "pending" | "info"; title_key?: string; cta_key?: string; inline_key?: string; modes?: string[] };

export type ErrorPresentation = {
  /** toast = transient; inline = next to the control that failed (no toast); banner = persistent status (pending/info, not an error). */
  surface: "toast" | "inline" | "banner";
  tone: "error" | "warning" | "pending" | "info";
  key: string;
  titleKey?: string;
  ctaKey?: string;
  inlineKey?: string;
};

/**
 * Drives error UI from @sentra/i18n errors.map.json (0.4.6: tone/title_key/cta_key/inline_key/modes) instead of
 * per-screen ifs: `inline_key` → inline (with `cta_key` as its action), tone pending/info → banner, else toast.
 * A code whose `modes` excludes the current mode is not blocking there → downgraded to an info toast.
 */
export function errorPresentation(code: ClientErrorCode, mode?: "practice" | "real"): ErrorPresentation {
  const m = (ERRORS_MAP as unknown as { unknown: string; codes: Record<string, MapEntry> }).codes[code];
  if (!m) return { surface: "toast", tone: code === "OFFLINE" ? "warning" : "error", key: errorUxKey(code) };
  const tone = m.tone ?? "error";
  const base = { key: m.key, titleKey: m.title_key, ctaKey: m.cta_key, inlineKey: m.inline_key };
  if (mode && m.modes && !m.modes.includes(mode)) return { ...base, surface: "toast", tone: "info" };
  if (m.inline_key) return { ...base, surface: "inline", tone };
  if (tone === "pending" || tone === "info") return { ...base, surface: "banner", tone };
  return { ...base, surface: "toast", tone };
}

/** Toast kind for a presentation tone. */
export function toastKind(p: ErrorPresentation): "error" | "warning" | "info" {
  return p.tone === "error" ? "error" : p.tone === "warning" ? "warning" : "info";
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
const APP_ONLY_CODES = new Set<string>(["GUARD_WEAKEN_REQUIRES_APPROVAL", "QUOTE_MISSING_OR_STALE"]);

export function codeText(t: T, code: ClientErrorCode): string {
  if (code === "OFFLINE") return t(errorKey(code));
  if (APP_ONLY_CODES.has(code) && !(ERRORS_MAP as { codes: Record<string, unknown> }).codes[code]) return t(`apiError.${code}` as never);
  return t.ux(errorUxKey(code) as never);
}
