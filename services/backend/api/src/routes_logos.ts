// GET /v1/img/coin/{mint}?s=48|64|96|128|192[&fmt=webp|png]&v={logo_hash}: coin-logo image proxy (contracts 1.1.6, docs/LOGO_PROXY.md).
// Unauthenticated by design: the response is a re-encoded copy of a PUBLIC on-chain metadata image, served for
// ANY valid mint (not only mints we track); no cookies/tokens are read and nothing per-user is involved, so it
// reveals nothing about workspaces, picks or positions. `<img>` tags cannot attach bearer tokens either.
// Abuse is bounded by per-IP limits, per-IP + global limits on cache misses (outbound work), a concurrency cap
// and the negative cache. Limits use a per-instance memory store on purpose (an unauthenticated image route must
// not turn into Postgres writes); the only DB work is the blocklist (cached in memory) and one state upsert per
// refresh.
import { ApiError } from "./errors.ts";
import { baseHeaders, serverNow, type Router } from "./http.ts";
import { RateLimiter, clientIp, type Limiter } from "./ratelimit.ts";
import { b58decode } from "./base58.ts";
import type { Deps } from "./deps.ts";
import { loadLogoConfig, setLogoWire, type LogoConfig } from "./logo/config.ts";
import { LogoService } from "./logo/service.ts";
import { PgLogoStore } from "./logo/store.ts";
import { LOGO_FORMATS, LOGO_SIZES, type LogoFormat, type LogoSize } from "./logo/transcode.ts";

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIZES = new Set<string>(LOGO_SIZES.map(String));
const HASH = /^[A-Za-z0-9_-]{8,64}$/;
const TYPES: Record<LogoFormat, string> = { webp: "image/webp", png: "image/png" };

/**
 * Output format: `fmt=webp|png` wins. Otherwise WebP, except the PNG fallback when Accept names image/png but
 * not image/webp, or refuses image/webp with q=0. No Accept / `*\/*` (native clients, fetch) = WebP. Returns [format, negotiated] (negotiated responses carry `Vary: Accept`).
 */
export function pickFormat(fmt: string | null, accept: string | undefined): [LogoFormat, boolean] | null {
  if (fmt !== null) return (LOGO_FORMATS as readonly string[]).includes(fmt) ? [fmt as LogoFormat, false] : null;
  if (accept === undefined || accept.trim() === "") return ["webp", true];
  const refusesWebp = /image\/webp\s*;\s*q=0(\.0*)?\s*(,|$)/i.test(accept);
  const png = refusesWebp || (/image\/png/i.test(accept) && !/image\/webp/i.test(accept));
  return [png ? "png" : "webp", true];
}

export const IMAGE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Referrer-Policy": "no-referrer",
};
/** Immutable only when `v` names the current content. */
export const IMMUTABLE = "public, max-age=31536000, immutable";

export interface LogoRouteOptions {
  cfg?: LogoConfig;
  service?: LogoService;
  limiter?: Limiter;
}

export function registerLogos(r: Router, d: Deps, o: LogoRouteOptions = {}): LogoService | null {
  const cfg = o.cfg ?? o.service?.cfg ?? loadLogoConfig(process.env);
  setLogoWire(cfg.enabled, cfg.publicBaseUrl);
  const svc = cfg.enabled ? (o.service ?? new LogoService(cfg, { store: new PgLogoStore(d.db) })) : null;
  const limiter = o.limiter ?? new RateLimiter();
  const short = `public, max-age=${cfg.shortMaxAgeS}`;
  const fail = (code: "LOGO_NOT_FOUND" | "LOGO_REJECTED", reason: string, cache: string) =>
    new ApiError(code, { reason }, { ...IMAGE_HEADERS, "Cache-Control": cache });

  r.add("GET", "/v1/img/coin/:mint", async (ctx) => {
    if (!svc) throw fail("LOGO_NOT_FOUND", "disabled", "no-store"); // clients show the identicon
    const ip = clientIp(ctx.req, d.cfg.trustProxy);
    await limiter.hit(`logo:ip:${ip}`, cfg.ratePerIpPerMin, 60);
    const mint = ctx.params.mint ?? "";
    if (!MINT.test(mint) || b58decode(mint)?.length !== 32) throw fail("LOGO_NOT_FOUND", "invalid_mint", "public, max-age=86400");
    const s = ctx.url.searchParams.get("s") ?? "";
    if (!SIZES.has(s)) {
      throw new ApiError("VALIDATION_FAILED", { field: "s", allowed: LOGO_SIZES }, { ...IMAGE_HEADERS, "Cache-Control": "public, max-age=86400" });
    }
    const picked = pickFormat(ctx.url.searchParams.get("fmt"), ctx.req.headers.accept);
    if (!picked) {
      throw new ApiError("VALIDATION_FAILED", { field: "fmt", allowed: LOGO_FORMATS }, { ...IMAGE_HEADERS, "Cache-Control": "public, max-age=86400" });
    }
    const [fmt, negotiated] = picked;
    const vRaw = ctx.url.searchParams.get("v");
    const v = vRaw !== null && HASH.test(vRaw) ? vRaw : null;
    const res = await svc.get(mint, Number(s) as LogoSize, fmt, async () => {
      await limiter.hit(`logo:cold:ip:${ip}`, cfg.coldPerIpPerMin, 60);
      await limiter.hit("logo:cold:all", cfg.coldGlobalPerMin, 60);
    });
    if (!res.ok) {
      throw fail(res.kind === "rejected" ? "LOGO_REJECTED" : "LOGO_NOT_FOUND", res.reason, `public, max-age=${Math.min(cfg.negativeTtlS, cfg.shortMaxAgeS)}`);
    }
    const now = serverNow();
    const headers: Record<string, string> = {
      ...baseHeaders(ctx, now),
      ...IMAGE_HEADERS,
      "Content-Type": TYPES[fmt],
      // v missing or stale: short + ETag revalidation (the next list response carries the new logo_hash)
      "Cache-Control": v === res.logoHash ? IMMUTABLE : short,
      ETag: res.etag,
      "X-Logo-Hash": res.logoHash,
      // actual pixel size served (differs from `s` only when that size exceeded the byte cap)
      "X-Logo-Size": res.file.split(".")[0]!,
      ...(negotiated ? { Vary: "Accept" } : {}),
    };
    const inm = ctx.req.headers["if-none-match"];
    if (typeof inm === "string" && inm.split(",").map((x) => x.trim()).includes(res.etag)) {
      ctx.res.writeHead(304, headers);
      return void ctx.res.end();
    }
    ctx.res.writeHead(200, { ...headers, "Content-Length": String(res.body.length) });
    ctx.res.end(res.body);
  });
  return svc;
}
