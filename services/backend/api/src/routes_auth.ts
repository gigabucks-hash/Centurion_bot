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
import { adminCreateWalletUser } from "./supabase_admin.ts";
import { PgRateLimiter, RateLimiter, clientIp, type Limiter } from "./ratelimit.ts";
import { SIWS_CHAIN, buildMessage, hostOf, isAddress, newNonce, parseMessage, verifySignature } from "./siws.ts";

const NONCE_TTL_MS = 5 * 60_000;
const CLIENTS = new Set(["web", "mobile", "desktop"]);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();
const iso = (ms: number) => new Date(ms).toISOString();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function registerAuth(r: Router, d: Deps): void {
  const cfg = d.cfg;
  const ip = (ctx: Ctx) => clientIp(ctx.req, cfg.trustProxy);
  // B-2: owner and session counters are shared across instances (Postgres); strangers are counted in memory so
  // rejecting them never touches the database.
  const shared: Limiter = d.limiter instanceof PgRateLimiter ? d.limiter : new PgRateLimiter(d.db);
  const strangers = new RateLimiter();

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
  // defense in depth (config already refuses to boot with an empty list): empty allowlist = nobody
  const ownerOk = (address: string) => cfg.ownerWallets.length > 0 && cfg.ownerWallets.includes(address);
  const notOwner = () => new ApiError("FORBIDDEN_ROLE", { reason: "wallet_not_allowed", hint: "only the owner wallet may sign in" });

  /**
   * Login gate (nonce + verify), before any DB or signature work.
   * - Malformed or non-allow-listed address: hard limit per IP (429 after AUTH_STRANGER_IP_PER_MIN), else 403/422.
   * - Allow-listed owner wallet: never 429. Per (address, IP), per address and a global cap are counted; any
   *   overage only delays the answer (250 ms per hit over, at most AUTH_OWNER_MAX_DELAY_MS), so a stranger who
   *   floods the owner's (public) address cannot lock the owner out.
   */
  const stranger = async (ctx: Ctx) => {
    await strangers.hit(`siws:stranger:${ip(ctx)}`, cfg.authStrangerIpPerMin, 60);
    await strangers.hit("siws:stranger:global", cfg.authGlobalPerMin, 60);
  };
  const gate = async (ctx: Ctx, route: string, address: unknown): Promise<string> => {
    if (!isAddress(address)) {
      await stranger(ctx);
      throw new ApiError("VALIDATION_FAILED", { field: "address" });
    }
    if (!ownerOk(address)) {
      await stranger(ctx);
      throw notOwner();
    }
    const [a, b, g] = await Promise.all([
      shared.count(`siws:${route}:owner:${address}:ip:${ip(ctx)}`, 60),
      shared.count(`siws:${route}:owner:${address}`, 60),
      shared.count("siws:owner:global", 60),
    ]);
    const over = Math.max(0, a.n - cfg.authOwnerIpPerMin, b.n - cfg.authOwnerPerMin, g.n - cfg.authGlobalPerMin);
    if (over > 0) {
      const ms = Math.min(cfg.authOwnerMaxDelayMs, 250 * over);
      ctx.res.setHeader("X-Sentra-Login-Delay-Ms", String(ms));
      await sleep(ms);
    }
    return address;
  };

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
    const b = await readJson(ctx);
    const address = await gate(ctx, "nonce", b.address);
    const domain = checkDomain(ctx, b.domain);
    const chain = b.chain_id ?? SIWS_CHAIN;
    if (chain !== SIWS_CHAIN) throw new ApiError("VALIDATION_FAILED", { field: "chain_id", allowed: [SIWS_CHAIN] });
    const uri = typeof b.uri === "string" ? b.uri : `https://${domain}`;
    if (uri.length > 2048 || hostOf(uri) !== domain) throw new ApiError("VALIDATION_FAILED", { field: "uri", hint: "https URI on the same domain" });
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
    const b = await readJson(ctx);
    const address = await gate(ctx, "verify", b.address);
    if (typeof b.message !== "string") throw new ApiError("VALIDATION_FAILED", { field: "message" });
    if (typeof b.signature !== "string" || b.signature.length > 128) throw new ApiError("VALIDATION_FAILED", { field: "signature" });
    const client = b.client ?? "web";
    if (typeof client !== "string" || !CLIENTS.has(client)) throw new ApiError("VALIDATION_FAILED", { field: "client", allowed: [...CLIENTS] });
    const f = parseMessage(b.message);
    if (!f || f.address !== address || f.chain_id !== SIWS_CHAIN || hostOf(f.uri) !== f.domain) {
      throw new ApiError("SIWS_NONCE_INVALID", { reason: "message" });
    }
    checkDomain(ctx, f.domain);
    if (Date.parse(f.expiration_time) <= Date.now() || Date.parse(f.issued_at) > Date.now() + 30_000) {
      throw new ApiError("SIWS_NONCE_INVALID", { reason: "expired" });
    }
    // single use + bound to domain and address, consumed before the signature check (a bad signature burns it)
    const consumed = await asService(d.db, async (c) =>
      (await c.query<{ ok: boolean }>("select public.consume_siws_nonce($1, $2, $3) as ok", [f.nonce, address, f.domain])).rows[0]!.ok);
    if (!consumed) throw new ApiError("SIWS_NONCE_INVALID", { reason: "unknown_used_or_expired" });
    if (!verifySignature(address, b.message, b.signature)) throw new ApiError("SIWS_SIGNATURE_INVALID");
    // find or create the user (production: Supabase admin API; local tests: direct insert), then the
    // owner's workspace (idempotent)
    const known = await asService(d.db, async (c) =>
      (await c.query<{ id: string | null }>("select public.siws_find_user($1)::text as id", [address])).rows[0]!.id);
    const created = known ?? (cfg.userCreate === "supabase_admin"
      ? await adminCreateWalletUser(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, address)
      : null);
    const { userId, workspaceId } = await asService(d.db, async (c) => {
      const u = (await c.query<{ id: string }>("select public.siws_login($1, $2::uuid)::text as id", [address, created])).rows[0]!.id;
      const w = (await c.query<{ ws: string }>("select public.ensure_owner_workspace($1::uuid)::text as ws", [u])).rows[0]!.ws;
      return { userId: u, workspaceId: w };
    });
    const s = await session(userId, client, null, address);
    const out = sessionBody(s, userId, address);
    send(ctx, 200, { data: { ...out.data, workspace_id: workspaceId } });
  });

  // ---- refresh (rotation) -------------------------------------------------------------------------
  r.add("POST", "/v1/auth/session/refresh", async (ctx) => {
    await shared.hit(`session.refresh:ip:${ip(ctx)}`, 30, 60);
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
    await shared.hit(`session.logout:ip:${ip(ctx)}`, 30, 60);
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
