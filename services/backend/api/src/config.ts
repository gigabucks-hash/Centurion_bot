// Runtime configuration. Secrets come from the environment only and are never logged.
export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  /** Supabase JWT secret (HS256). */
  jwtSecret: string;
  /** Expected `aud` claim (Supabase: "authenticated"). Empty = not checked. */
  jwtAudience: string;
  /** SSE: DB poll interval, clock frame interval, heartbeat comment interval (ms). */
  ssePollMs: number;
  sseClockMs: number;
  sseHeartbeatMs: number;
  /** Postgres NOTIFY channel carrying mark prices for `include=marks`. */
  marksChannel: string;
}

export class ConfigError extends Error {}

function int(env: NodeJS.ProcessEnv, k: string, d: number, min: number, max: number): number {
  const raw = env[k];
  if (raw === undefined || raw.trim() === "") return d;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${k} must be an integer in ${min}..${max}`);
  return n;
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
  const marksChannel = env.SSE_MARKS_CHANNEL ?? "sentra_marks";
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
  };
}
