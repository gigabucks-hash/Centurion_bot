// GENERATED from errors.json by scripts/gen-errors.mjs. Do not edit.
export const ERROR_CODES_VERSION = 1 as const;
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN_SCOPE"
  | "FORBIDDEN_ROLE"
  | "APPROVAL_REQUIRES_APP"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "SETTINGS_SCHEMA_INVALID"
  | "VERSION_CONFLICT"
  | "STRATEGY_REV_CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "APPROVAL_ALREADY_DECIDED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_TOKEN_INVALID"
  | "STRATEGY_RETIRED"
  | "LAST_IDENTITY"
  | "SIWS_NONCE_INVALID"
  | "SIWS_SIGNATURE_INVALID"
  | "TELEGRAM_AUTH_INVALID"
  | "OTP_INVALID"
  | "OTP_LOCKED"
  | "TWO_FACTOR_REQUIRED"
  | "CURSOR_INVALID"
  | "CURSOR_EXPIRED"
  | "REPLAY_WINDOW_EXCEEDED"
  | "MODE_NOT_ALLOWED"
  | "REAL_SOL_DISABLED"
  | "GUARD_COOLDOWN_ACTIVE"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL";
export interface ErrorCodeInfo { http: number; retryable: boolean; message: string }
export const ERROR_CODES: Record<ErrorCode, ErrorCodeInfo> = {
  UNAUTHENTICATED: { http: 401, retryable: false, message: "Missing or invalid credentials" },
  FORBIDDEN_SCOPE: { http: 403, retryable: false, message: "Token lacks the required scope (read/trade)" },
  FORBIDDEN_ROLE: { http: 403, retryable: false, message: "Workspace role does not allow this action" },
  APPROVAL_REQUIRES_APP: { http: 403, retryable: false, message: "This decision must be made in a first-party app, not via MCP" },
  NOT_FOUND: { http: 404, retryable: false, message: "Resource not found or not visible" },
  VALIDATION_FAILED: { http: 422, retryable: false, message: "Request or settings failed validation" },
  SETTINGS_SCHEMA_INVALID: { http: 422, retryable: false, message: "Strategy settings do not match the JSON Schema" },
  VERSION_CONFLICT: { http: 409, retryable: false, message: "Stale version; refetch and retry" },
  STRATEGY_REV_CONFLICT: { http: 409, retryable: false, message: "Strategy rev changed since this was based on it" },
  IDEMPOTENCY_KEY_REUSED: { http: 409, retryable: false, message: "Idempotency-Key reused with a different request body" },
  APPROVAL_ALREADY_DECIDED: { http: 409, retryable: false, message: "Approval already decided differently" },
  APPROVAL_EXPIRED: { http: 409, retryable: false, message: "Approval expired; see reason" },
  APPROVAL_TOKEN_INVALID: { http: 403, retryable: false, message: "Decision token is invalid for this approval" },
  STRATEGY_RETIRED: { http: 409, retryable: false, message: "Strategy is archived or deleted" },
  LAST_IDENTITY: { http: 409, retryable: false, message: "Cannot remove the last sign-in method" },
  SIWS_NONCE_INVALID: { http: 401, retryable: false, message: "SIWS nonce unknown, used or expired" },
  SIWS_SIGNATURE_INVALID: { http: 401, retryable: false, message: "SIWS signature does not verify" },
  TELEGRAM_AUTH_INVALID: { http: 401, retryable: false, message: "Telegram login hash invalid or expired" },
  OTP_INVALID: { http: 401, retryable: false, message: "Email code is wrong or expired" },
  OTP_LOCKED: { http: 429, retryable: true, message: "Too many attempts; locked for 15 minutes" },
  TWO_FACTOR_REQUIRED: { http: 403, retryable: false, message: "Second factor required for this action" },
  CURSOR_INVALID: { http: 400, retryable: false, message: "Malformed pagination cursor" },
  CURSOR_EXPIRED: { http: 410, retryable: false, message: "Cursor older than retention; resync from snapshot" },
  REPLAY_WINDOW_EXCEEDED: { http: 422, retryable: false, message: "Replay window exceeds the 7 day limit" },
  MODE_NOT_ALLOWED: { http: 403, retryable: false, message: "Only paper mode is allowed" },
  REAL_SOL_DISABLED: { http: 403, retryable: false, message: "Real SOL execution is disabled until Phase 7 approval" },
  GUARD_COOLDOWN_ACTIVE: { http: 409, retryable: true, message: "Guard change is in its cooldown window" },
  RATE_LIMITED: { http: 429, retryable: true, message: "Rate limit exceeded" },
  UNAVAILABLE: { http: 503, retryable: true, message: "Dependency temporarily unavailable" },
  INTERNAL: { http: 500, retryable: true, message: "Unexpected server error" },
};
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown>; request_id?: string };
}
export function isErrorCode(v: string): v is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, v);
}
