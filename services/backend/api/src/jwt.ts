// HS256 JWT verification (Supabase access tokens). Only HS256 is accepted; `none` and every other alg fail.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.ts";

export type Client = "web" | "mobile" | "desktop" | "mcp";
export interface Claims {
  sub: string;
  exp: number;
  aud?: string | string[];
  role?: string;
  app_scopes?: string[];
  sentra_client?: string;
  [k: string]: unknown;
}

export interface Principal {
  claims: Claims;
  userId: string;
  scopes: Set<string>;
  /** Channel, from the `sentra_client` claim only (never from the request body). Unknown -> web. */
  via: Client;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function b64urlJson(s: string): unknown {
  return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
}

export function verifyJwt(token: string, secret: string, audience: string, nowS = Date.now() / 1000): Claims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError("UNAUTHENTICATED");
  const [h, p, sig] = parts as [string, string, string];
  let header: { alg?: string; typ?: string };
  let claims: Claims;
  try {
    header = b64urlJson(h) as typeof header;
    claims = b64urlJson(p) as Claims;
  } catch {
    throw new ApiError("UNAUTHENTICATED");
  }
  if (header.alg !== "HS256") throw new ApiError("UNAUTHENTICATED");
  const want = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError("UNAUTHENTICATED");
  if (typeof claims.exp !== "number" || claims.exp <= nowS) throw new ApiError("UNAUTHENTICATED", { reason: "expired" });
  if (typeof claims.nbf === "number" && claims.nbf > nowS + 30) throw new ApiError("UNAUTHENTICATED");
  if (audience) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(audience)) throw new ApiError("UNAUTHENTICATED");
  }
  if (typeof claims.sub !== "string" || !UUID.test(claims.sub)) throw new ApiError("UNAUTHENTICATED");
  return claims;
}

export const SESSION_ISSUER = "sentra-api";

/**
 * Access-token verification for API requests. Tokens minted by our wallet login (iss "sentra-api") are verified
 * with our own SENTRA_SESSION_SECRET only; anything else with the Supabase JWT secret. The unverified `iss` only
 * picks the key, so a token claiming one issuer can never be accepted under the other's key.
 * `sid` (session family) must be a uuid when present; its liveness is checked per request (db.ts).
 */
export function verifyAccess(token: string, keys: { sessionSecret: string; jwtSecret: string; jwtAudience: string }, nowS = Date.now() / 1000): Claims {
  let iss: unknown;
  try {
    iss = (b64urlJson(token.split(".")[1] ?? "") as { iss?: unknown }).iss;
  } catch {
    throw new ApiError("UNAUTHENTICATED");
  }
  const ours = iss === SESSION_ISSUER;
  const secret = ours ? keys.sessionSecret : keys.jwtSecret;
  if (!secret) throw new ApiError("UNAUTHENTICATED");
  const c = verifyJwt(token, secret, keys.jwtAudience, nowS);
  if (ours && (typeof c.sid !== "string" || !UUID.test(c.sid))) throw new ApiError("UNAUTHENTICATED");
  if (c.sid !== undefined && (typeof c.sid !== "string" || !UUID.test(c.sid))) throw new ApiError("UNAUTHENTICATED");
  return c;
}

export function principal(claims: Claims): Principal {
  const raw = Array.isArray(claims.app_scopes) ? claims.app_scopes.filter((s) => typeof s === "string") : [];
  const scopes = new Set(raw);
  if (scopes.has("trade")) scopes.add("read");
  const c = claims.sentra_client;
  const via: Client = c === "mobile" || c === "desktop" || c === "mcp" ? c : "web";
  return { claims, userId: claims.sub, scopes, via };
}

export function bearer(authorization: string | undefined): string {
  const m = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/.exec(authorization ?? "");
  if (!m?.[1]) throw new ApiError("UNAUTHENTICATED");
  return m[1];
}

/** Test/dev helper: sign HS256. */
export function signJwt(claims: Record<string, unknown>, secret: string): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg: "HS256", typ: "JWT" });
  const p = enc(claims);
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
