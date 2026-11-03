import { connection } from "next/server";
import { fnv1a32, isMint } from "@/lib/identicon";
import { isLogoHash, isLogoSize, LOGO_HARD_MAX_BYTES, LOGO_TYPES, mockLogoHash } from "@/lib/media";
import { upstreamBase } from "@/lib/auth/upstream";

/**
 * Same-origin mirror of Backend's logo proxy (contracts 1.1.6, API_ENDPOINTS 4.12:
 * `GET /v1/img/coin/{mint}?s={48|64|96|128|192}&v={logo_hash}`, public, no tokens). Only WebP is requested (the PNG
 * fallback is for clients without WebP). HTTP mode: fetch server-side (no redirects, 4 s, PNG/WebP only, <= 16 KiB hard
 * cap) and pass through; anything else -> 404 so the client shows the identicon and does not retry that mint+v.
 * Mock: a generated SVG stand-in for mints with a mock logo_hash (mock only; the real proxy never serves SVG).
 * Responses: nosniff, sandboxing CSP, never HTML; immutable only while `v` matches.
 */
const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};
const notFound = (maxAge = 600) => new Response(null, { status: 404, headers: { ...HEADERS, "Cache-Control": `private, max-age=${maxAge}` } });

function mockLogo(mint: string): string {
  const h = fnv1a32(`${mint}:logo`);
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >>> 9) % 80)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 60%)"/><stop offset="1" stop-color="hsl(${hue2} 75% 40%)"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/><circle cx="${20 + (h % 24)}" cy="${20 + ((h >>> 5) % 24)}" r="${8 + ((h >>> 11) % 10)}" fill="rgba(255,255,255,.28)"/></svg>`;
}

export async function GET(req: Request, ctx: { params: Promise<{ mint: string }> }) {
  await connection();
  const { mint } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const s = Number(q.get("s"));
  const v = q.get("v");
  if (!isMint(mint) || !isLogoSize(s) || !isLogoHash(v)) return notFound(86400);
  const base = upstreamBase();
  if (!base) {
    if (mockLogoHash(mint) !== v) return notFound();
    return new Response(mockLogo(mint), { headers: { ...HEADERS, "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, max-age=31536000, immutable" } });
  }
  try {
    const r = await fetch(`${base}/v1/img/coin/${mint}?s=${s}&v=${encodeURIComponent(v)}`, { redirect: "error", cache: "no-store", headers: { accept: "image/webp" }, signal: AbortSignal.timeout(4000) });
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!r.ok || !LOGO_TYPES.has(type) || Number(r.headers.get("content-length") ?? "0") > LOGO_HARD_MAX_BYTES) return notFound();
    const buf = await r.arrayBuffer();
    if (buf.byteLength > LOGO_HARD_MAX_BYTES) return notFound();
    return new Response(buf, { headers: { ...HEADERS, "Content-Type": type, "Cache-Control": r.headers.get("cache-control") ?? "private, max-age=300" } });
  } catch {
    return notFound(60);
  }
}
