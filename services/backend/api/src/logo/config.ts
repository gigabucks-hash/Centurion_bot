// Coin-logo proxy configuration (docs/LOGO_PROXY.md). Off unless LOGO_PROXY_ENABLED=true; when on it fails
// closed on missing RPC / cache dir / transcoder. The RPC URL may carry an API key: never logged.
import { fileURLToPath } from "node:url";

export interface LogoConfig {
  enabled: boolean;
  /** Solana JSON-RPC used read-only for getAccountInfo (Metaplex metadata PDA). */
  rpcUrl: string;
  /** Pinned gateways: `ipfs://<cid>/<path>` -> `<gw><cid>/<path>`, `ar://<id>` -> `<gw><id>`. https, '/'-terminated. */
  ipfsGateways: string[];
  arweaveGateways: string[];
  cacheDir: string;
  transcoderBin: string;
  /** Optional absolute origin for `logo_url` (https://api.example). Empty = API-relative path. */
  publicBaseUrl: string;
  ttlS: number;
  negativeTtlS: number;
  maxBytes: number;
  maxJsonBytes: number;
  connectTimeoutMs: number;
  totalTimeoutMs: number;
  transcodeTimeoutMs: number;
  concurrency: number;
  /** Cache-Control max-age when `v` is missing/stale, and for errors. */
  shortMaxAgeS: number;
  ratePerIpPerMin: number;
  coldPerIpPerMin: number;
  coldGlobalPerMin: number;
}

export class LogoConfigError extends Error {}

function int(env: NodeJS.ProcessEnv, k: string, d: number, min: number, max: number): number {
  const raw = env[k];
  if (raw === undefined || raw.trim() === "") return d;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new LogoConfigError(`${k} must be an integer in ${min}..${max}`);
  return n;
}

function gateways(env: NodeJS.ProcessEnv, k: string): string[] {
  const xs = (env[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return xs.map((g) => {
    let u: URL;
    try {
      u = new URL(g);
    } catch {
      throw new LogoConfigError(`${k}: not a URL: ${JSON.stringify(g.slice(0, 80))}`);
    }
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) {
      throw new LogoConfigError(`${k}: gateways must be plain https URLs`);
    }
    return u.href.endsWith("/") ? u.href : u.href + "/";
  });
}

const DEFAULT_BIN = fileURLToPath(new URL("../../../target/release/centurion-logo", import.meta.url));

export function loadLogoConfig(env: NodeJS.ProcessEnv = process.env): LogoConfig {
  const v = (env.LOGO_PROXY_ENABLED ?? "").trim().toLowerCase();
  if (v !== "" && !["true", "false", "1", "0"].includes(v)) throw new LogoConfigError("LOGO_PROXY_ENABLED must be true or false");
  const enabled = v === "true" || v === "1";
  const rpcUrl = (env.LOGO_RPC_URL ?? env.HELIUS_RPC_URL ?? "").trim();
  const cacheDir = (env.LOGO_CACHE_DIR ?? "").trim();
  const publicBaseUrl = (env.LOGO_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (publicBaseUrl && !/^https?:\/\/[^\s/?#]+$/.test(publicBaseUrl)) throw new LogoConfigError("LOGO_PUBLIC_BASE_URL must be an origin (scheme://host[:port])");
  if (enabled) {
    if (!/^https?:\/\//.test(rpcUrl)) throw new LogoConfigError("refusing to start: LOGO_PROXY_ENABLED=true needs LOGO_RPC_URL (or HELIUS_RPC_URL)");
    if (!cacheDir.startsWith("/")) throw new LogoConfigError("refusing to start: LOGO_PROXY_ENABLED=true needs an absolute LOGO_CACHE_DIR");
  }
  return {
    enabled,
    rpcUrl,
    ipfsGateways: gateways(env, "LOGO_IPFS_GATEWAYS"),
    arweaveGateways: gateways(env, "LOGO_ARWEAVE_GATEWAYS"),
    cacheDir,
    transcoderBin: (env.LOGO_TRANSCODER_BIN ?? "").trim() || DEFAULT_BIN,
    publicBaseUrl,
    ttlS: int(env, "LOGO_CACHE_TTL_S", 30 * 86_400, 60, 365 * 86_400),
    negativeTtlS: int(env, "LOGO_NEGATIVE_TTL_S", 3_600, 10, 7 * 86_400),
    maxBytes: int(env, "LOGO_MAX_BYTES", 2 * 1024 * 1024, 1024, 2 * 1024 * 1024),
    maxJsonBytes: int(env, "LOGO_MAX_JSON_BYTES", 256 * 1024, 1024, 1024 * 1024),
    connectTimeoutMs: int(env, "LOGO_CONNECT_TIMEOUT_MS", 3_000, 50, 30_000),
    totalTimeoutMs: int(env, "LOGO_TOTAL_TIMEOUT_MS", 8_000, 100, 60_000),
    transcodeTimeoutMs: int(env, "LOGO_TRANSCODE_TIMEOUT_MS", 5_000, 100, 60_000),
    concurrency: int(env, "LOGO_CONCURRENCY", 4, 1, 64),
    shortMaxAgeS: int(env, "LOGO_SHORT_MAX_AGE_S", 300, 0, 86_400),
    ratePerIpPerMin: int(env, "LOGO_RATE_IP_PER_MIN", 600, 1, 100_000),
    coldPerIpPerMin: int(env, "LOGO_COLD_IP_PER_MIN", 30, 1, 10_000),
    coldGlobalPerMin: int(env, "LOGO_COLD_GLOBAL_PER_MIN", 120, 1, 100_000),
  };
}

// ---- logo_url on wire objects (contracts 1.1.6) -----------------------------------------------------------
let wireState: { enabled: boolean; base: string } = { enabled: false, base: "" };

/** Called once by registerLogos(); wire helpers read it synchronously. */
export function setLogoWire(enabled: boolean, publicBaseUrl: string): void {
  wireState = { enabled, base: publicBaseUrl };
}

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HASH = /^[A-Za-z0-9_-]{8,64}$/;
/** Default size carried in `logo_url`; clients set `s` to 48/64/96 for their display size (UX COIN_LOGO §2). */
export const LOGO_DEFAULT_SIZE = 96;

/**
 * `logo_url` for a mint: our proxy URL (`/v1/img/coin/{mint}?s=96[&v={logo_hash}]`), or null when the proxy is
 * disabled or there is no mint. Pure: no I/O.
 */
export function logoUrl(mint: unknown, logoHash?: unknown): string | null {
  if (!wireState.enabled || typeof mint !== "string" || !MINT.test(mint)) return null;
  const v = typeof logoHash === "string" && HASH.test(logoHash) ? `&v=${logoHash}` : "";
  return `${wireState.base}/v1/img/coin/${mint}?s=${LOGO_DEFAULT_SIZE}${v}`;
}
