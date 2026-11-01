import { connection } from "next/server";
import { fnv1a, isMint } from "@/lib/identicon";
import { LOGO_FILE, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/media";
import { upstreamBase } from "@/lib/auth/upstream";

/**
 * Same-origin mirror of Backend's logo proxy (contracts 1.1.6 `GET /v1/logos/{mint}/{size}.{webp|png}`, public, no
 * tokens). HTTP mode: fetch it server-side (no redirects, 4 s, PNG/WebP only, ≤ 256 KB) and pass it through; anything
 * else → 404 so the client shows the identicon. Mock: a generated SVG "logo" for ~2/3 of mints, 404 for the rest
 * (exercises the fallback). Responses: nosniff, sandboxing CSP, never HTML.
 */
const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};
const notFound = (maxAge = 600) => new Response(null, { status: 404, headers: { ...HEADERS, "Cache-Control": `private, max-age=${maxAge}` } });

function mockLogo(mint: string): string | null {
  const h = fnv1a(`${mint}:logo`);
  if (h % 3 === 0) return null;
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >>> 9) % 80)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 60%)"/><stop offset="1" stop-color="hsl(${hue2} 75% 40%)"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/><circle cx="${20 + (h % 24)}" cy="${20 + ((h >>> 5) % 24)}" r="${8 + ((h >>> 11) % 10)}" fill="rgba(255,255,255,.28)"/></svg>`;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/v1/logos/[mint]/[file]">) {
  await connection();
  const { mint, file } = await ctx.params;
  if (!isMint(mint) || !LOGO_FILE.test(file)) return notFound(86400);
  const base = upstreamBase();
  if (!base) {
    const svg = mockLogo(mint);
    return svg ? new Response(svg, { headers: { ...HEADERS, "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, max-age=86400" } }) : notFound();
  }
  try {
    const r = await fetch(`${base}/v1/logos/${mint}/${file}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000) });
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!r.ok || !LOGO_TYPES.has(type) || Number(r.headers.get("content-length") ?? "0") > LOGO_MAX_BYTES) return notFound();
    const buf = await r.arrayBuffer();
    if (buf.byteLength > LOGO_MAX_BYTES) return notFound();
    return new Response(buf, { headers: { ...HEADERS, "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return notFound(60);
  }
}
