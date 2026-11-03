// Runtime configuration. Secrets come from the environment only and are never logged.
import { isAddress } from "./siws.ts";
export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  /** Supabase JWT secret (HS256). */
  jwtSecret: string;
  /**
   * Our own HS256 key for access tokens minted by wallet login (iss "centurion-api"). Independent of the Supabase
   * project's JWT secret / signing keys. Required (>= 32 chars, != SUPABASE_JWT_SECRET) when SIWS is enabled.
   */
  sessionSecret: string;
  /** Expected `aud` claim (Supabase: "authenticated"). Empty = not checked. */
  jwtAudience: string;
  /** SSE: DB poll interval, clock frame interval, heartbeat comment interval (ms). */
  ssePollMs: number;
  sseClockMs: number;
  sseHeartbeatMs: number;
  /** Postgres NOTIFY channel carrying mark prices for `include=marks`. */
  marksChannel: string;
  /** Account deletion grace, server-side only (7-30, default 7). */
  accountDeletionGraceDays: number;
  /** SSE: how often each stream re-checks workspace membership (ms). */
  sseMemberCheckMs: number;
  /** SIWS: domains (host[:port]) allowed in the signed message. Empty = SIWS login disabled. */
  siwsDomains: string[];
  /** Optional owner allowlist (base58 addresses). Empty = any wallet may sign in. */
  ownerWallets: string[];
  /** Session lifetimes: access token (short-lived) and rotating refresh token. */
  accessTtlS: number;
  refreshTtlS: number;
  /** Take the client IP from the first X-Forwarded-For hop (only behind a trusted proxy). */
  trustProxy: boolean;
  /** Dropped from the MVP; routes answer 404 while off (default). No implementation behind them. */
  emailOtpEnabled: boolean;
  /** How SIWS creates a new auth user: Supabase admin API (production) or a direct auth.users insert (local tests). */
  userCreate: "supabase_admin" | "direct";
  /** Supabase project URL + service-role key (admin API). From env only; never logged. */
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  telegramOidcEnabled: boolean;
  /** Write-route limits per minute (per IP, per user, per user-or-IP and route) and the counter store. */
  rateLimitWriteIpPerMin: number;
  rateLimitWriteUserPerMin: number;
  rateLimitWriteRoutePerMin: number;
  rateLimitStore: "memory" | "postgres";
  /** SIWS statement v1 ("Centurion") accepted until this epoch ms (AUTH_SIWS_LEGACY_STATEMENT_UNTIL, default
   *  2026-11-05T12:00:00Z = 7 days after the rename); AUTH_SIWS_LEGACY_STATEMENT=false ends it now. */
  siwsLegacyStatementUntil: number;
  /** Login limits (B-2). Strangers: hard 429 per IP. Owner wallets: never 429, soft delay up to authOwnerMaxDelayMs. */
  authStrangerIpPerMin: number;
  authOwnerIpPerMin: number;
  authOwnerPerMin: number;
  authGlobalPerMin: number;
  authOwnerMaxDelayMs: number;
  /**
   * Per-strategy Real gate thresholds (contracts 1.1.6 `paper_progress.*_required`; settings
   * `centurion.real_gate.min_paper_days` / `min_paper_trades`). No values are approved yet: unset = null ("not set").
   * Display only: Real stays locked regardless (no live path exists).
   */
  realGateMinPaperDays: number | null;
  realGateMinPaperTrades: number | null;
}

function flag(env: NodeJS.ProcessEnv, k: string): boolean {
  const v = (env[k] ?? "").trim().toLowerCase();
  if (v === "" || v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  throw new ConfigError(`${k} must be true or false`);
}

function userCreate(env: NodeJS.ProcessEnv): Pick<Config, "userCreate" | "supabaseUrl" | "supabaseServiceRoleKey"> {
  const mode = (env.AUTH_USER_CREATE ?? "supabase_admin").trim();
  if (mode !== "supabase_admin" && mode !== "direct") throw new ConfigError("AUTH_USER_CREATE must be supabase_admin or direct");
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (mode === "supabase_admin" && (env.AUTH_SIWS_DOMAINS ?? "").trim() !== "") {
    if (!/^https?:\/\/[^\s/]+$/.test(url)) throw new ConfigError("SUPABASE_URL is required for AUTH_USER_CREATE=supabase_admin");
    if (key.length < 20) throw new ConfigError("SUPABASE_SERVICE_ROLE_KEY is required for AUTH_USER_CREATE=supabase_admin");
  }
  if (mode === "direct" && (env.NODE_ENV ?? "") === "production") {
    throw new ConfigError("AUTH_USER_CREATE=direct is for local tests only (NODE_ENV=production)");
  }
  return { userCreate: mode, supabaseUrl: url, supabaseServiceRoleKey: key };
}

function store(env: NodeJS.ProcessEnv): "memory" | "postgres" {
  const s = (env.RATE_LIMIT_STORE ?? "memory").trim();
  if (s !== "memory" && s !== "postgres") throw new ConfigError("RATE_LIMIT_STORE must be memory or postgres");
  return s;
}

/** B-1 fail closed: SIWS enabled (AUTH_SIWS_DOMAINS set) requires a non-empty, valid OWNER_WALLETS. */
function siwsConfig(env: NodeJS.ProcessEnv): { siwsDomains: string[]; ownerWallets: string[] } {
  const siwsDomains = list(env, "AUTH_SIWS_DOMAINS", /^[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/);
  const ownerWallets = list(env, "OWNER_WALLETS", B58);
  for (const w of ownerWallets) {
    if (!isAddress(w)) throw new ConfigError(`refusing to start: OWNER_WALLETS entry is not a 32-byte base58 address: ${JSON.stringify(String(w).slice(0, 64))}`);
  }
  if (siwsDomains.length > 0 && ownerWallets.length === 0) {
    throw new ConfigError("refusing to start: AUTH_SIWS_DOMAINS is set but OWNER_WALLETS is empty (wallet login fails closed)");
  }
  return { siwsDomains, ownerWallets };
}

function sessionSecret(env: NodeJS.ProcessEnv, jwtSecret: string): string {
  const s = env.CENTURION_SESSION_SECRET ?? "";
  if ((env.AUTH_SIWS_DOMAINS ?? "").trim() === "" && s === "") return "";
  if (s.length < 32) throw new ConfigError("refusing to start: CENTURION_SESSION_SECRET (>= 32 chars) is required when AUTH_SIWS_DOMAINS is set");
  if (s === jwtSecret) throw new ConfigError("CENTURION_SESSION_SECRET must differ from SUPABASE_JWT_SECRET");
  return s;
}

function legacyUntil(env: NodeJS.ProcessEnv): number {
  if ((env.AUTH_SIWS_LEGACY_STATEMENT ?? "true").trim() === "false") return 0;
  const s = env.AUTH_SIWS_LEGACY_STATEMENT_UNTIL ?? "2026-11-05T12:00:00Z";
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new ConfigError("AUTH_SIWS_LEGACY_STATEMENT_UNTIL must be an ISO timestamp");
  return t;
}

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function list(env: NodeJS.ProcessEnv, k: string, re: RegExp): string[] {
  const xs = (env[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const x of xs) if (!re.test(x)) throw new ConfigError(`${k}: invalid entry ${JSON.stringify(x.slice(0, 64))}`);
  return xs;
}

export class ConfigError extends Error {}

function int(env: NodeJS.ProcessEnv, k: string, d: number, min: number, max: number): number {
  const raw = env[k];
  if (raw === undefined || raw.trim() === "") return d;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${k} must be an integer in ${min}..${max}`);
  return n;
}

/** Optional integer: unset/empty = null (no default value is assumed). */
function optInt(env: NodeJS.ProcessEnv, k: string, min: number, max: number): number | null {
  const raw = env[k];
  if (raw === undefined || raw.trim() === "") return null;
  return int(env, k, 0, min, max);
}

/** Practice mode only: anything but TRADING_MODE=paper refuses to start (no real-SOL path exists). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.TRADING_MODE ?? "";
  if (mode !== "paper") {
    throw new ConfigError(`refusing to start: TRADING_MODE must be "paper" (got ${JSON.stringify(mode)})`);
  }
  const real = (env.REAL_TRADING_ENABLED ?? "").trim().toLowerCase();
  if (real !== "" && real !== "false" && real !== "0") {
    throw new ConfigError("refusing to start: REAL_TRADING_ENABLED is set; real trading does not exist before Phase 7");
  }
  const databaseUrl = env.DATABASE_URL ?? "";
  if (!databaseUrl) throw new ConfigError("DATABASE_URL is required");
  const jwtSecret = env.SUPABASE_JWT_SECRET ?? "";
  if (jwtSecret.length < 32) throw new ConfigError("SUPABASE_JWT_SECRET is required (>= 32 chars)");
  const marksChannel = env.SSE_MARKS_CHANNEL ?? "centurion_marks";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(marksChannel)) throw new ConfigError("SSE_MARKS_CHANNEL must be a plain identifier");
  return {
    host: env.API_HOST ?? "0.0.0.0",
    port: int(env, "API_PORT", 8080, 0, 65535),
    databaseUrl,
    jwtSecret,
    jwtAudience: env.SUPABASE_JWT_AUD ?? "authenticated",
    ssePollMs: int(env, "SSE_POLL_MS", 500, 20, 60_000),
    sseClockMs: int(env, "SSE_CLOCK_MS", 5_000, 50, 60_000),
    sseHeartbeatMs: int(env, "SSE_HEARTBEAT_MS", 15_000, 50, 120_000),
    marksChannel,
    accountDeletionGraceDays: int(env, "ACCOUNT_DELETION_GRACE_DAYS", 7, 7, 30),
    sseMemberCheckMs: int(env, "SSE_MEMBER_CHECK_MS", 30_000, 50, 600_000),
    ...siwsConfig(env),
    sessionSecret: sessionSecret(env, jwtSecret),
    accessTtlS: int(env, "AUTH_ACCESS_TTL_S", 900, 60, 3600),
    refreshTtlS: int(env, "AUTH_REFRESH_TTL_S", 30 * 86_400, 3600, 90 * 86_400),
    trustProxy: flag(env, "TRUST_PROXY"),
    emailOtpEnabled: flag(env, "AUTH_EMAIL_OTP_ENABLED"),
    ...userCreate(env),
    telegramOidcEnabled: flag(env, "AUTH_TELEGRAM_OIDC_ENABLED"),
    rateLimitWriteIpPerMin: int(env, "RATE_LIMIT_WRITE_IP_PER_MIN", 300, 1, 100_000),
    rateLimitWriteUserPerMin: int(env, "RATE_LIMIT_WRITE_USER_PER_MIN", 120, 1, 100_000),
    rateLimitWriteRoutePerMin: int(env, "RATE_LIMIT_WRITE_ROUTE_PER_MIN", 60, 1, 100_000),
    rateLimitStore: store(env),
    siwsLegacyStatementUntil: legacyUntil(env),
    authStrangerIpPerMin: int(env, "AUTH_STRANGER_IP_PER_MIN", 10, 1, 10_000),
    authOwnerIpPerMin: int(env, "AUTH_OWNER_IP_PER_MIN", 30, 1, 10_000),
    authOwnerPerMin: int(env, "AUTH_OWNER_PER_MIN", 60, 1, 10_000),
    authGlobalPerMin: int(env, "AUTH_GLOBAL_PER_MIN", 600, 1, 100_000),
    authOwnerMaxDelayMs: int(env, "AUTH_OWNER_MAX_DELAY_MS", 3_000, 0, 10_000),
    realGateMinPaperDays: optInt(env, "CENTURION_REAL_GATE_MIN_PAPER_DAYS", 1, 3650),
    realGateMinPaperTrades: optInt(env, "CENTURION_REAL_GATE_MIN_PAPER_TRADES", 1, 1_000_000),
  };
}
