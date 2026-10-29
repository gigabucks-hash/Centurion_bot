// GENERATED from errors.json by scripts/gen-errors.mjs. Do not edit.
export const ERROR_CODES_VERSION = 2 as const;
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
  | "LAST_LOGIN_METHOD"
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
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_INVALID"
  | "WEBAUTHN_INVALID"
  | "TYPED_CONFIRMATION_MISMATCH"
  | "HOLD_TOO_SHORT"
  | "REPLAY_UNAVAILABLE"
  | "PRECONDITION_REQUIRED"
  | "CONFIRMATION_RESTART_REQUIRED"
  | "REAUTH_REQUIRED"
  | "WALLET_ROLE_CONFLICT"
  | "RESET_COOLDOWN"
  | "ACCOUNT_DELETION_PENDING"
  | "ACCOUNT_DELETION_BLOCKED"
  | "DEVICE_TOKEN_INVALID"
  | "AUTH_TG_INVALID"
  | "AUTH_TG_REPLAY"
  | "AUTH_TG_NO_PROFILE"
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
  LAST_LOGIN_METHOD: { http: 422, retryable: false, message: "The last login method cannot be unlinked" },
  SIWS_NONCE_INVALID: { http: 401, retryable: false, message: "SIWS nonce unknown, used or expired" },
  SIWS_SIGNATURE_INVALID: { http: 401, retryable: false, message: "SIWS signature does not verify" },
  TELEGRAM_AUTH_INVALID: { http: 401, retryable: false, message: "Legacy Telegram widget payload invalid (superseded by AUTH_TG_INVALID)" },
  OTP_INVALID: { http: 401, retryable: false, message: "Email code is wrong or expired" },
  OTP_LOCKED: { http: 429, retryable: true, message: "Too many attempts; locked for 15 minutes" },
  TWO_FACTOR_REQUIRED: { http: 403, retryable: false, message: "Second factor required for this action" },
  CURSOR_INVALID: { http: 400, retryable: false, message: "Malformed pagination cursor" },
  CURSOR_EXPIRED: { http: 410, retryable: false, message: "Cursor older than retention; resync from snapshot" },
  REPLAY_WINDOW_EXCEEDED: { http: 422, retryable: false, message: "Replay window exceeds the 7 day limit" },
  MODE_NOT_ALLOWED: { http: 403, retryable: false, message: "Only paper mode is allowed" },
  REAL_SOL_DISABLED: { http: 403, retryable: false, message: "Real SOL execution is disabled until Phase 7 approval" },
  GUARD_COOLDOWN_ACTIVE: { http: 409, retryable: true, message: "Guard change is in its cooldown window" },
  CONFIRMATION_REQUIRED: { http: 428, retryable: false, message: "This action needs a proof-of-confirmation (WebAuthn + typed name + hold)" },
  CONFIRMATION_INVALID: { http: 403, retryable: false, message: "Confirmation challenge unknown, used, expired or bound to another change" },
  WEBAUTHN_INVALID: { http: 403, retryable: false, message: "WebAuthn assertion failed verification" },
  TYPED_CONFIRMATION_MISMATCH: { http: 422, retryable: false, message: "Typed confirmation does not match the strategy name" },
  HOLD_TOO_SHORT: { http: 422, retryable: false, message: "Hold-to-confirm duration below the required minimum" },
  REPLAY_UNAVAILABLE: { http: 503, retryable: true, message: "Full replay disabled or over its 2 s budget; use the static estimate" },
  PRECONDITION_REQUIRED: { http: 428, retryable: false, message: "Write needs If-Match: <rev> or expected_rev / expected_version" },
  CONFIRMATION_RESTART_REQUIRED: { http: 409, retryable: false, message: "Resource changed under a Real SOL confirmation; the full confirmation must be redone" },
  REAUTH_REQUIRED: { http: 401, retryable: false, message: "Re-authenticate (within the last 5 minutes) to continue" },
  WALLET_ROLE_CONFLICT: { http: 409, retryable: false, message: "A login wallet cannot be a trading wallet (and vice versa)" },
  RESET_COOLDOWN: { http: 429, retryable: true, message: "Practice reset allowed once per 24 h; see details.next_allowed_at" },
  ACCOUNT_DELETION_PENDING: { http: 409, retryable: false, message: "Account deletion already scheduled" },
  ACCOUNT_DELETION_BLOCKED: { http: 409, retryable: false, message: "Close Real SOL positions and withdraw the trading wallet first" },
  DEVICE_TOKEN_INVALID: { http: 422, retryable: false, message: "Device registration payload invalid" },
  AUTH_TG_INVALID: { http: 401, retryable: false, message: "Telegram id_token failed verification (signature, iss, aud, exp, iat or nonce)" },
  AUTH_TG_REPLAY: { http: 401, retryable: false, message: "Telegram nonce or id_token already used" },
  AUTH_TG_NO_PROFILE: { http: 422, retryable: false, message: "Telegram id_token lacks the profile claims (id); request the profile scope" },
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
