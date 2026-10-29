// Wallet login (SIWS) and sessions. Single-owner app: OWNER_WALLETS restricts who may sign in.
// Verification only (ed25519 over the exact message, public key = address); no key custody, no signing of
// transactions. Sessions: short-lived HS256 access token (same secret/claims the API verifies) + opaque
// rotating refresh token (sha256 stored; reuse of a rotated token revokes the whole family).
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "./errors.ts";
import { asService } from "./db.ts";
import { Router, readJson, send, type Ctx } from "./http.ts";
import type { Deps } from "./deps.ts";
import { signJwt } from "./jwt.ts";
import { RateLimiter, clientIp } from "./ratelimit.ts";
import { SIWS_CHAIN, buildMessage, hostOf, isAddress, newNonce, parseMessage, verifySignature } from "./siws.ts";

const NONCE_TTL_MS = 5 * 60_000;
const CLIENTS = new Set(["web", "mobile", "desktop"]);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();
const iso = (ms: number) => new Date(ms).toISOString();

export function registerAuth(r: Router, d: Deps, rl: RateLimiter = new RateLimiter()): void {
  const cfg = d.cfg;
  const ip = (ctx: Ctx) => clientIp(ctx.req, cfg.trustProxy);

  const enabled = () => {
    if (cfg.siwsDomains.length === 0) throw new ApiError("UNAVAILABLE", { reason: "AUTH_SIWS_DOMAINS not configured" });
  };
  /** domain must be allow-listed and, when the browser sends Origin, equal the Origin host. */
  const checkDomain = (ctx: Ctx, domain: unknown): string => {
    if (typeof domain !== "string" || !cfg.siwsDomains.includes(domain)) {
      throw new ApiError("VALIDATION_FAILED", { field: "domain", hint: "domain not allowed" });
    }
    const origin = ctx.req.headers.origin;
    if (typeof origin === "string" && origin !== "null" && hostOf(origin) !== domain) {
      throw new ApiError("VALIDATION_FAILED", { field: "domain", hint: "domain must match the Origin host" });
    }
    return domain;
  };
  const ownerOk = (address: string) => cfg.ownerWallets.length === 0 || cfg.ownerWallets.includes(address);
  const notOwner = () => new ApiError("FORBIDDEN_ROLE", { reason: "wallet_not_allowed", hint: "only the owner wallet may sign in" });

  const session = async (userId: string, client: string, family: string | null, address: string) => {
    const now = Date.now();
    const exp = Math.floor(now / 1000) + cfg.accessTtlS;
    const refresh = "srt_" + randomBytes(32).toString("base64url");
    let fam = family;
    if (!fam) {
      fam = (await asService(d.db, async (c) => {
        const f = (await c.query<{ f: string }>("select gen_random_uuid()::text as f")).rows[0]!.f;
        await c.query("select public.issue_refresh_token($1, $2, $3, $4, $5)", [userId, f, sha(refresh), client, cfg.refreshTtlS]);
        return f;
      }));
    }
    const access = signJwt({
      iss: "sentra-api", sub: userId, aud: cfg.jwtAudience || "authenticated", role: "authenticated",
      iat: Math.floor(now / 1000), exp, app_scopes: ["read", "trade"], sentra_client: client, session_id: fam,
      amr: ["siws"], wallet: address,
    }, cfg.jwtSecret);
    return { access, refresh, exp, fam };
  };
  const sessionBody = (s: { access: string; refresh: string; exp: number; fam: string }, userId: string, address: string) => ({
    data: {
      access_token: s.access, token_type: "bearer", expires_in: cfg.accessTtlS, expires_at: iso(s.exp * 1000),
      refresh_token: s.refresh, refresh_expires_in: cfg.refreshTtlS, session_id: s.fam, user_id: userId, address,
    },
  });

  // ---- SIWS nonce ---------------------------------------------------------------------------------
  r.add("POST", "/v1/auth/siws/nonce", async (ctx) => {
    enabled();
    rl.hit(`siws.nonce:ip:${ip(ctx)}`, 10, 60);
    const b = await readJson(ctx);
    if (!isAddress(b.address)) throw new ApiError("VALIDATION_FAILED", { field: "address" });
    const address = b.address;
    rl.hit(`siws.nonce:addr:${address}`, 5, 60);
    const domain = checkDomain(ctx, b.domain);
    const chain = b.chain_id ?? SIWS_CHAIN;
    if (chain !== SIWS_CHAIN) throw new ApiError("VALIDATION_FAILED", { field: "chain_id", allowed: [SIWS_CHAIN] });
    const uri = typeof b.uri === "string" ? b.uri : `https://${domain}`;
    if (uri.length > 2048 || hostOf(uri) !== domain) throw new ApiError("VALIDATION_FAILED", { field: "uri", hint: "https URI on the same domain" });
    if (!ownerOk(address)) throw notOwner();
    const nonce = newNonce();
    const row = await asService(d.db, async (c) =>
      (await c.query<{ issued_at: Date; expires_at: Date }>(
        `insert into public.siws_nonces (nonce, address, domain, issued_at, expires_at)
         values ($1, $2, $3, date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', clock_timestamp()) + make_interval(secs => $4))
         returning issued_at, expires_at`,
        [nonce, address, domain, NONCE_TTL_MS / 1000],
      )).rows[0]!);
    const f = {
      domain, address, uri, version: "1" as const, chain_id: chain, nonce,
      issued_at: row.issued_at.toISOString(), expiration_time: row.expires_at.toISOString(),
    };
    send(ctx, 200, { data: { nonce, message: buildMessage(f), issued_at: f.issued_at, expires_at: f.expiration_time } });
  });

  // ---- SIWS verify --------------------------------------------------------------------------------
  r.add("POST", "/v1/auth/siws/verify", async (ctx) => {
    enabled();
    rl.hit(`siws.verify:ip:${ip(ctx)}`, 10, 60);
    const b = await readJson(ctx);
    if (!isAddress(b.address)) throw new ApiError("VALIDATION_FAILED", { field: "address" });
    if (typeof b.message !== "string") throw new ApiError("VALIDATION_FAILED", { field: "message" });
    if (typeof b.signature !== "string" || b.signature.length > 128) throw new ApiError("VALIDATION_FAILED", { field: "signature" });
    const client = b.client ?? "web";
    if (typeof client !== "string" || !CLIENTS.has(client)) throw new ApiError("VALIDATION_FAILED", { field: "client", allowed: [...CLIENTS] });
    const address = b.address;
    rl.hit(`siws.verify:addr:${address}`, 5, 60);
    const f = parseMessage(b.message);
    if (!f || f.address !== address || f.chain_id !== SIWS_CHAIN || hostOf(f.uri) !== f.domain) {
      throw new ApiError("SIWS_NONCE_INVALID", { reason: "message" });
    }
    checkDomain(ctx, f.domain);
    if (Date.parse(f.expiration_time) <= Date.now() || Date.parse(f.issued_at) > Date.now() + 30_000) {
      throw new ApiError("SIWS_NONCE_INVALID", { reason: "expired" });
    }
    if (!ownerOk(address)) throw notOwner();
    // single use + bound to domain and address, consumed before the signature check (a bad signature burns it)
    const consumed = await asService(d.db, async (c) =>
      (await c.query<{ ok: boolean }>("select public.consume_siws_nonce($1, $2, $3) as ok", [f.nonce, address, f.domain])).rows[0]!.ok);
    if (!consumed) throw new ApiError("SIWS_NONCE_INVALID", { reason: "unknown_used_or_expired" });
    if (!verifySignature(address, b.message, b.signature)) throw new ApiError("SIWS_SIGNATURE_INVALID");
    const userId = await asService(d.db, async (c) =>
      (await c.query<{ id: string }>("select public.siws_login($1)::text as id", [address])).rows[0]!.id);
    const s = await session(userId, client, null, address);
    send(ctx, 200, sessionBody(s, userId, address));
  });

  // ---- refresh (rotation) -------------------------------------------------------------------------
  r.add("POST", "/v1/auth/session/refresh", async (ctx) => {
    rl.hit(`session.refresh:ip:${ip(ctx)}`, 30, 60);
    const b = await readJson(ctx);
    if (typeof b.refresh_token !== "string" || !/^srt_[A-Za-z0-9_-]{43}$/.test(b.refresh_token)) {
      throw new ApiError("UNAUTHENTICATED", { reason: "refresh_invalid" });
    }
    const next = "srt_" + randomBytes(32).toString("base64url");
    const out = await asService(d.db, async (c) =>
      (await c.query<{ r: Record<string, string> }>("select public.rotate_refresh_token($1, $2, $3) as r",
        [sha(b.refresh_token as string), sha(next), cfg.refreshTtlS])).rows[0]!.r);
    if (out.error === "refresh_reused") throw new ApiError("UNAUTHENTICATED", { reason: "refresh_reused" });
    const address = out.address ?? "";
    if (!ownerOk(address)) {
      await asService(d.db, (c) => c.query("select public.revoke_refresh_family($1, 'owner_removed')", [sha(next)]));
      throw notOwner();
    }
    const s = await session(out.user_id!, out.client!, out.family_id!, address);
    s.refresh = next;
    send(ctx, 200, sessionBody(s, out.user_id!, address));
  });

  r.add("POST", "/v1/auth/session/logout", async (ctx) => {
    rl.hit(`session.logout:ip:${ip(ctx)}`, 30, 60);
    const b = await readJson(ctx);
    if (typeof b.refresh_token === "string" && b.refresh_token.length <= 64) {
      await asService(d.db, (c) => c.query("select public.revoke_refresh_family($1, 'logout')", [sha(b.refresh_token as string)]));
    }
    send(ctx, 200, { data: { revoked: true } }); // same answer whether or not the token existed
  });

  // ---- dropped from the MVP (flags default off; no implementation) ---------------------------------
  const dropped = (flagOn: boolean) => async () => {
    if (!flagOn) throw new ApiError("NOT_FOUND");
    throw new ApiError("UNAVAILABLE", { reason: "not part of this build" });
  };
  for (const p of ["/v1/auth/email/otp/request", "/v1/auth/email/otp/verify"]) r.add("POST", p, dropped(cfg.emailOtpEnabled));
  for (const p of ["/v1/auth/telegram/nonce", "/v1/auth/telegram/verify"]) r.add("POST", p, dropped(cfg.telegramOidcEnabled));
}
