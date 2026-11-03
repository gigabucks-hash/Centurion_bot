// OAuth 2.1 primitives on node:crypto only: PKCE S256, agent access tokens (HS256, audience = MCP resource),
// opaque refresh tokens / codes, and optional DPoP (RFC 9449) proofs.
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cverify, type JsonWebKey } from "node:crypto";

export const b64u = (b: Buffer) => b.toString("base64url");
export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest();
export const opaque = (bytes = 32) => b64u(randomBytes(bytes));

/** PKCE S256 only: BASE64URL(SHA256(verifier)) == challenge. Verifier 43-128 unreserved chars (RFC 7636 4.1). */
export function pkceOk(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(b64u(sha256(verifier)));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface AgentClaims {
  iss: string;
  sub: string;
  aud: string;
  centurion_client: "mcp";
  ws: string;
  grant_id: string;
  client_id: string;
  scope: string;
  jti: string;
  iat: number;
  exp: number;
  cnf?: { jkt: string };
}

export function signHs256(claims: object, secret: string, typ = "at+jwt"): string {
  const enc = (o: unknown) => b64u(Buffer.from(JSON.stringify(o)));
  const h = enc({ alg: "HS256", typ });
  const p = enc(claims);
  return `${h}.${p}.${b64u(createHmac("sha256", secret).update(`${h}.${p}`).digest())}`;
}

/** Verify an agent access token. Returns null on any failure (caller answers 401 + WWW-Authenticate). */
export function verifyAgentToken(tok: string, secret: string, resource: string, nowS = Date.now() / 1000): AgentClaims | null {
  const parts = tok.split(".");
  if (parts.length !== 3) return null;
  try {
    const h = JSON.parse(Buffer.from(parts[0]!, "base64url").toString()) as { alg?: string; typ?: string };
    if (h.alg !== "HS256" || h.typ !== "at+jwt") return null;
    const want = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
    const got = Buffer.from(parts[2]!, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const c = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as AgentClaims;
    if (c.aud !== resource || c.centurion_client !== "mcp" || typeof c.exp !== "number" || c.exp <= nowS) return null;
    if (typeof c.grant_id !== "string" || typeof c.sub !== "string" || typeof c.ws !== "string") return null;
    return c;
  } catch {
    return null;
  }
}

// ---- DPoP (optional; lead answer Q3: bind when the client sends a proof, never require it) -------------

export interface DpopProof {
  jkt: string;
  jti: string;
  iat: number;
}

function thumbprint(jwk: JsonWebKey): string | null {
  let canon: string;
  if (jwk.kty === "EC" && jwk.crv === "P-256" && jwk.x && jwk.y) canon = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  else if (jwk.kty === "OKP" && jwk.crv === "Ed25519" && jwk.x) canon = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  else return null;
  return b64u(sha256(canon));
}

/**
 * Validate a DPoP proof JWT for (method, url). `accessToken` given -> `ath` must match it.
 * Returns the key thumbprint, or a string reason on failure. Replay (jti) is checked by the caller.
 */
export function verifyDpop(proof: string, method: string, url: string, accessToken?: string, nowS = Date.now() / 1000): DpopProof | string {
  const parts = proof.split(".");
  if (parts.length !== 3) return "malformed";
  try {
    const h = JSON.parse(Buffer.from(parts[0]!, "base64url").toString()) as { typ?: string; alg?: string; jwk?: JsonWebKey };
    const p = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as { jti?: unknown; htm?: unknown; htu?: unknown; iat?: unknown; ath?: unknown };
    if (h.typ !== "dpop+jwt" || !h.jwk || (h.alg !== "ES256" && h.alg !== "EdDSA")) return "header";
    if ("d" in h.jwk) return "private key in jwk";
    const jkt = thumbprint(h.jwk);
    if (!jkt) return "unsupported key";
    const key = createPublicKey({ key: h.jwk, format: "jwk" });
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    const sig = Buffer.from(parts[2]!, "base64url");
    const ok = h.alg === "ES256"
      ? cverify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, sig)
      : cverify(null, data, key, sig);
    if (!ok) return "signature";
    if (typeof p.jti !== "string" || p.jti.length < 8 || p.jti.length > 128) return "jti";
    if (p.htm !== method) return "htm";
    if (typeof p.htu !== "string" || p.htu.split(/[?#]/)[0] !== url) return "htu";
    if (typeof p.iat !== "number" || Math.abs(p.iat - nowS) > 60) return "iat";
    if (accessToken !== undefined && p.ath !== b64u(sha256(accessToken))) return "ath";
    return { jkt, jti: p.jti, iat: p.iat };
  } catch {
    return "malformed";
  }
}
