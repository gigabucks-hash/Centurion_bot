import path from "node:path";
import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/security/csp";

const nextConfig: NextConfig = {
  // SECURITY (PERF_SECURITY.md §CSP): a per-request nonce CSP needs every document rendered per request, and
  // "PPR is incompatible with nonce-based CSP" (static shell scripts carry no nonce; verified on the prod build:
  // 14 blocked scripts, no hydration). This is a private, signed-in, per-user app, so static shells / CDN caching
  // give little and must not be shared anyway → Cache Components / PPR off; every route renders with its nonce.
  cacheComponents: false,
  poweredByHeader: false,
  // PERF: modern formats for next/image (brand/coin art); AVIF first, WebP fallback.
  images: { formats: ["image/avif", "image/webp"], dangerouslyAllowSVG: false },
  // SECURITY: the static security headers also on paths the proxy skips (_next/static, images, brand/).
  // The per-request nonce CSP itself is set in proxy.ts (it needs a fresh nonce per document).
  async headers() {
    return [{ source: "/:path*", headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })) }];
  },
  // QA-15: dev-only badge away from the left nav so QA screenshots stay clean.
  // CENTURION_QA_SHOTS=1 (screenshot runs) hides it entirely; otherwise bottom-right, clear of the left nav.
  devIndicators: process.env.CENTURION_QA_SHOTS === "1" ? false : { position: "bottom-right" },
  // Shared workspace packages (@centurion/design-tokens, @centurion/contracts) live in ../../packages.
  transpilePackages: ["@centurion/contracts", "@centurion/i18n"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  turbopack: {
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
