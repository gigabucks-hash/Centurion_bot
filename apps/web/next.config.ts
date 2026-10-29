import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // QA-15: dev-only badge away from the left nav so QA screenshots stay clean.
  // SENTRA_QA_SHOTS=1 (screenshot runs) hides it entirely; otherwise bottom-right, clear of the left nav.
  devIndicators: process.env.SENTRA_QA_SHOTS === "1" ? false : { position: "bottom-right" },
  // Shared workspace packages (@sentra/design-tokens, @sentra/contracts) live in ../../packages.
  transpilePackages: ["@sentra/contracts", "@sentra/i18n"],
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
