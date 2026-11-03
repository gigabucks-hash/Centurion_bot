// Agent (MCP + OAuth 2.1) configuration. Off unless MCP_ENABLED=true. Secrets from env only, never logged.
import { ConfigError } from "../config.ts";

export interface AgentConfig {
  enabled: boolean;
  /** Public base URL of this API (OAuth issuer), e.g. https://api.example.com (no trailing slash). */
  issuer: string;
  /** The protected resource (RFC 8707 / RFC 9728): `${issuer}/mcp`. Access tokens are bound to it. */
  resource: string;
  /** HS256 key for agent access tokens; distinct from SUPABASE_JWT_SECRET and CENTURION_SESSION_SECRET. */
  tokenSecret: string;
  /** App page that shows the consent screen (`?request_id=`). Empty -> /oauth/authorize answers JSON. */
  consentUrl: string;
  accessTtlS: number;
  refreshIdleS: number;
  /** Per-grant budget (MCP_DESIGN section 5, lead answer Q5). */
  callsPerMin: number;
  callsPerDay: number;
  writesPerMin: number;
  approvalsPerHour: number;
  /** Refused never-tool attempts in 10 min that suspend a grant. */
  refusedLimit: number;
  /** Dynamic client registrations per IP per hour. */
  registerPerHour: number;
}

function int(env: NodeJS.ProcessEnv, k: string, d: number, min: number, max: number): number {
  const raw = env[k];
  if (raw === undefined || raw.trim() === "") return d;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${k} must be an integer in ${min}..${max}`);
  return n;
}

export function loadAgentConfig(env: NodeJS.ProcessEnv, other: { jwtSecret: string; sessionSecret: string }): AgentConfig {
  const on = (env.MCP_ENABLED ?? "").trim().toLowerCase();
  const enabled = on === "true" || on === "1";
  if (on !== "" && !enabled && on !== "false" && on !== "0") throw new ConfigError("MCP_ENABLED must be true or false");
  const issuer = (env.MCP_ISSUER ?? "").trim().replace(/\/+$/, "");
  const tokenSecret = env.MCP_TOKEN_SECRET ?? "";
  const consentUrl = (env.MCP_CONSENT_URL ?? "").trim();
  if (enabled) {
    if (!/^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(issuer) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(issuer)) {
      throw new ConfigError("MCP_ISSUER must be an https origin (http only for localhost)");
    }
    if (tokenSecret.length < 32) throw new ConfigError("MCP_TOKEN_SECRET (>= 32 chars) is required when MCP_ENABLED=true");
    if (tokenSecret === other.jwtSecret || tokenSecret === other.sessionSecret) {
      throw new ConfigError("MCP_TOKEN_SECRET must differ from SUPABASE_JWT_SECRET and CENTURION_SESSION_SECRET");
    }
    if (consentUrl !== "" && !/^https?:\/\/\S+$/.test(consentUrl)) throw new ConfigError("MCP_CONSENT_URL must be a URL");
  }
  return {
    enabled,
    issuer,
    resource: `${issuer}/mcp`,
    tokenSecret,
    consentUrl,
    accessTtlS: int(env, "MCP_ACCESS_TTL_S", 600, 60, 600),
    refreshIdleS: int(env, "MCP_REFRESH_IDLE_S", 7 * 86_400, 3600, 30 * 86_400),
    callsPerMin: int(env, "MCP_BUDGET_CALLS_PER_MIN", 60, 1, 600),
    callsPerDay: int(env, "MCP_BUDGET_CALLS_PER_DAY", 5000, 1, 100_000),
    writesPerMin: int(env, "MCP_BUDGET_WRITES_PER_MIN", 20, 1, 20),
    approvalsPerHour: int(env, "MCP_BUDGET_APPROVALS_PER_HOUR", 30, 1, 30),
    refusedLimit: int(env, "MCP_REFUSED_LIMIT", 3, 1, 20),
    registerPerHour: int(env, "MCP_REGISTER_PER_HOUR", 10, 1, 10_000),
  };
}
