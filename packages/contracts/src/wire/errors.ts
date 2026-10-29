// GENERATED from errors.json by scripts/gen-errors.mjs. Do not edit.
export const ERROR_CODES_VERSION = 4 as const;
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
  | "UNSUPPORTED_QUOTE_MINT"
  | "SLIPPAGE_EXCEEDED"
  | "INSUFFICIENT_PRACTICE_BALANCE"
  | "GUARD_FAILED"
  | "POOL_STALE"
  | "POSITION_ALREADY_CLOSED"
  | "INVALID_FRACTION"
  | "PRACTICE_CASH_INSUFFICIENT"
  | "JOB_DEAD_LETTERED"
  | "SOURCE_DEGRADED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL";
export type ErrorLocale = "en" | "id";
/** sqlstate = what Supabase RPC errors carry (PostgrestException.code); MESSAGE = the code itself. */
export type ErrorKind = "error" | "notice" | "skip";
export interface ErrorCodeInfo { kind: ErrorKind; http: number; sqlstate: string; retryable: boolean; messages: Record<ErrorLocale, string> }
export const ERROR_CODES: Record<ErrorCode, ErrorCodeInfo> = {
  UNAUTHENTICATED: { kind: "error", http: 401, sqlstate: "P0401", retryable: false, messages: { en: "Missing or invalid credentials", id: "Kredensial tidak ada atau tidak valid" } },
  FORBIDDEN_SCOPE: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "Token lacks the required scope (read/trade)", id: "Token tidak memiliki cakupan yang diperlukan (read/trade)" } },
  FORBIDDEN_ROLE: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "Workspace role does not allow this action", id: "Peran di workspace tidak mengizinkan tindakan ini" } },
  APPROVAL_REQUIRES_APP: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "This decision must be made in a first-party app, not via MCP", id: "Keputusan ini harus dibuat di aplikasi resmi, bukan lewat MCP" } },
  NOT_FOUND: { kind: "error", http: 404, sqlstate: "P0404", retryable: false, messages: { en: "Resource not found or not visible", id: "Data tidak ditemukan atau tidak dapat diakses" } },
  VALIDATION_FAILED: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Request or settings failed validation", id: "Permintaan atau pengaturan gagal divalidasi" } },
  SETTINGS_SCHEMA_INVALID: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Strategy settings do not match the JSON Schema", id: "Pengaturan strategi tidak sesuai skema" } },
  VERSION_CONFLICT: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Stale rev; refetch and retry", id: "Data sudah berubah; muat ulang lalu coba lagi" } },
  STRATEGY_REV_CONFLICT: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Strategy rev changed since this was based on it", id: "Strategi sudah berubah sejak usulan ini dibuat" } },
  IDEMPOTENCY_KEY_REUSED: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Idempotency-Key reused with a different request body", id: "Idempotency-Key dipakai ulang dengan isi permintaan yang berbeda" } },
  APPROVAL_ALREADY_DECIDED: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Approval already decided", id: "Usulan ini sudah diputuskan" } },
  APPROVAL_EXPIRED: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Approval expired; see reason", id: "Usulan sudah kedaluwarsa; lihat alasannya" } },
  APPROVAL_TOKEN_INVALID: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "Decision token is invalid for this approval", id: "Token keputusan tidak berlaku untuk usulan ini" } },
  STRATEGY_RETIRED: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Strategy is archived or deleted", id: "Strategi sudah diarsipkan atau dihapus" } },
  LAST_LOGIN_METHOD: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "The last login method cannot be unlinked", id: "Metode login terakhir tidak dapat dilepas" } },
  SIWS_NONCE_INVALID: { kind: "error", http: 401, sqlstate: "P0401", retryable: false, messages: { en: "SIWS nonce unknown, used or expired", id: "Nonce SIWS tidak dikenal, sudah dipakai, atau kedaluwarsa" } },
  SIWS_SIGNATURE_INVALID: { kind: "error", http: 401, sqlstate: "P0401", retryable: false, messages: { en: "SIWS signature does not verify", id: "Tanda tangan SIWS tidak valid" } },
  OTP_INVALID: { kind: "error", http: 401, sqlstate: "P0401", retryable: false, messages: { en: "Email code is wrong or expired", id: "Kode email salah atau kedaluwarsa" } },
  OTP_LOCKED: { kind: "error", http: 429, sqlstate: "P0429", retryable: true, messages: { en: "Too many attempts; locked for 15 minutes", id: "Terlalu banyak percobaan; dikunci selama 15 menit" } },
  TWO_FACTOR_REQUIRED: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "Second factor required for this action", id: "Tindakan ini memerlukan faktor kedua" } },
  CURSOR_INVALID: { kind: "error", http: 400, sqlstate: "P0400", retryable: false, messages: { en: "Malformed pagination cursor", id: "Kursor halaman tidak valid" } },
  CURSOR_EXPIRED: { kind: "error", http: 410, sqlstate: "P0410", retryable: false, messages: { en: "Cursor older than retention; resync from snapshot", id: "Kursor melewati masa simpan; sinkronkan ulang dari snapshot" } },
  REPLAY_WINDOW_EXCEEDED: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Replay window exceeds the 7 day limit", id: "Rentang replay melebihi batas 7 hari" } },
  MODE_NOT_ALLOWED: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "Only practice mode is allowed; real mode is not enabled", id: "Hanya mode practice yang diizinkan; mode real belum aktif" } },
  REAL_SOL_DISABLED: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "Real SOL execution is disabled until Phase 7 approval", id: "Eksekusi Real SOL dinonaktifkan sampai Fase 7 disetujui" } },
  GUARD_COOLDOWN_ACTIVE: { kind: "error", http: 409, sqlstate: "P0409", retryable: true, messages: { en: "Guard change is in its cooldown window", id: "Perubahan guard masih dalam masa jeda" } },
  CONFIRMATION_REQUIRED: { kind: "error", http: 428, sqlstate: "P0428", retryable: false, messages: { en: "This action needs a proof-of-confirmation (WebAuthn + typed name + hold)", id: "Tindakan ini perlu konfirmasi (WebAuthn + ketik nama + tahan)" } },
  CONFIRMATION_INVALID: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "Confirmation challenge unknown, used, expired or bound to another change", id: "Konfirmasi tidak dikenal, sudah dipakai, kedaluwarsa, atau untuk perubahan lain" } },
  WEBAUTHN_INVALID: { kind: "error", http: 403, sqlstate: "P0403", retryable: false, messages: { en: "WebAuthn assertion failed verification", id: "Verifikasi WebAuthn gagal" } },
  TYPED_CONFIRMATION_MISMATCH: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Typed confirmation does not match the strategy name", id: "Teks konfirmasi tidak sama dengan nama strategi" } },
  HOLD_TOO_SHORT: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Hold-to-confirm duration below the required minimum", id: "Durasi tahan-untuk-konfirmasi kurang dari batas minimum" } },
  REPLAY_UNAVAILABLE: { kind: "error", http: 503, sqlstate: "P0503", retryable: true, messages: { en: "Full replay disabled or over its 2 s budget; use the static estimate", id: "Replay penuh tidak tersedia atau melebihi 2 detik; gunakan estimasi statis" } },
  PRECONDITION_REQUIRED: { kind: "error", http: 428, sqlstate: "P0428", retryable: false, messages: { en: "Write needs If-Match: <rev> or expected_rev", id: "Penulisan butuh If-Match: <rev> atau expected_rev" } },
  CONFIRMATION_RESTART_REQUIRED: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Resource changed under a Real SOL confirmation; the full confirmation must be redone", id: "Data berubah saat konfirmasi Real SOL; ulangi konfirmasi dari awal" } },
  REAUTH_REQUIRED: { kind: "error", http: 401, sqlstate: "P0401", retryable: false, messages: { en: "Re-authenticate (within the last 5 minutes) to continue", id: "Login ulang (dalam 5 menit terakhir) untuk melanjutkan" } },
  WALLET_ROLE_CONFLICT: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "A login wallet cannot be a trading wallet (and vice versa)", id: "Dompet login tidak boleh menjadi dompet trading (dan sebaliknya)" } },
  RESET_COOLDOWN: { kind: "error", http: 429, sqlstate: "P0429", retryable: true, messages: { en: "Practice reset allowed once per 24 h; see details.next_allowed_at", id: "Reset practice hanya sekali per 24 jam; lihat details.next_allowed_at" } },
  ACCOUNT_DELETION_PENDING: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Account deletion already scheduled", id: "Penghapusan akun sudah dijadwalkan" } },
  ACCOUNT_DELETION_BLOCKED: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Close Real SOL positions and withdraw the trading wallet first", id: "Tutup posisi Real SOL dan tarik dompet trading terlebih dahulu" } },
  DEVICE_TOKEN_INVALID: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Device registration payload invalid", id: "Data pendaftaran perangkat tidak valid" } },
  AUTH_TG_INVALID: { kind: "error", http: 401, sqlstate: "P0401", retryable: false, messages: { en: "Telegram id_token failed verification (signature, iss, aud, exp, iat or nonce)", id: "Verifikasi id_token Telegram gagal" } },
  AUTH_TG_REPLAY: { kind: "error", http: 401, sqlstate: "P0401", retryable: false, messages: { en: "Telegram nonce or id_token already used", id: "Nonce atau id_token Telegram sudah pernah dipakai" } },
  AUTH_TG_NO_PROFILE: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Telegram id_token lacks the profile claims (id); request the profile scope", id: "id_token Telegram tidak memuat data profil; minta scope profile" } },
  UNSUPPORTED_QUOTE_MINT: { kind: "skip", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Pool is quoted in a mint other than SOL; practice mode simulates SOL-quoted pools only (prices are never converted)", id: "Pool memakai token kuotasi selain SOL; mode practice hanya mendukung pool SOL" } },
  SLIPPAGE_EXCEEDED: { kind: "error", http: 409, sqlstate: "P0409", retryable: true, messages: { en: "Simulated fill slipped past the order's max slippage", id: "Simulasi fill melewati batas slippage order" } },
  INSUFFICIENT_PRACTICE_BALANCE: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Practice balance too low for this order", id: "Saldo practice tidak cukup untuk order ini" } },
  GUARD_FAILED: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Guard checks failed when the order was about to fill", id: "Pemeriksaan guard gagal saat order akan dieksekusi" } },
  POOL_STALE: { kind: "error", http: 503, sqlstate: "P0503", retryable: true, messages: { en: "Pool state missing, empty or older than the freshness limit; retried after refresh", id: "Data pool tidak ada, kosong, atau terlalu lama; dicoba lagi setelah diperbarui" } },
  POSITION_ALREADY_CLOSED: { kind: "error", http: 409, sqlstate: "P0409", retryable: false, messages: { en: "Position is already closed", id: "Posisi sudah ditutup" } },
  INVALID_FRACTION: { kind: "error", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "fraction_bps must be an integer from 1 to 10000", id: "Porsi penjualan harus 1 sampai 10000 bps" } },
  PRACTICE_CASH_INSUFFICIENT: { kind: "notice", http: 422, sqlstate: "P0422", retryable: false, messages: { en: "Practice cash is too low for the next entry; entries pause until cash recovers or you reset practice", id: "Saldo practice tidak cukup untuk entry berikutnya; entry dijeda sampai saldo pulih atau practice direset" } },
  JOB_DEAD_LETTERED: { kind: "notice", http: 500, sqlstate: "P0500", retryable: false, messages: { en: "A background job failed after all retries; support has been notified", id: "Tugas latar belakang gagal setelah semua percobaan; tim support sudah diberi tahu" } },
  SOURCE_DEGRADED: { kind: "notice", http: 503, sqlstate: "P0503", retryable: true, messages: { en: "A market data source is degraded; new picks may be delayed", id: "Sumber data pasar sedang terganggu; pick baru mungkin tertunda" } },
  RATE_LIMITED: { kind: "error", http: 429, sqlstate: "P0429", retryable: true, messages: { en: "Rate limit exceeded", id: "Batas permintaan terlampaui" } },
  UNAVAILABLE: { kind: "error", http: 503, sqlstate: "P0503", retryable: true, messages: { en: "Dependency temporarily unavailable", id: "Layanan pendukung sedang tidak tersedia" } },
  INTERNAL: { kind: "error", http: 500, sqlstate: "P0500", retryable: true, messages: { en: "Unexpected server error", id: "Terjadi kesalahan server" } },
};
export function errorMessage(code: ErrorCode, locale: ErrorLocale = "en"): string {
  return ERROR_CODES[code].messages[locale];
}
/** REST error body. error is ALWAYS an object; details are flattened into it (e.g. current_rev). */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; request_id?: string; server_now: string; [detail: string]: import("./events").JsonValue | undefined };
  server_now: string;
}
export function isErrorCode(v: string): v is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, v);
}
