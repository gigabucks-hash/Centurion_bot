import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fetchRaw } from "../../packages/explore/src/load.ts";

// Tauri expects a fixed port in dev and a static bundle in dist/.
const host = process.env.TAURI_DEV_HOST;
// Wire types/helpers from the contracts package (v1.1.x). Only `src/wire` is used by the desktop.
const contractsWire = fileURLToPath(new URL("../../packages/contracts/src/wire/index.ts", import.meta.url));
// UX copy catalog + formatters (@centurion/i18n 0.4.2): en/id ICU JSON + format.mjs.
const i18nPkg = fileURLToPath(new URL("../../packages/i18n", import.meta.url));
const exploreSrc = fileURLToPath(new URL("../../packages/explore/src", import.meta.url));

/** Dev preview only. The installed app fetches through the desktop process, not this middleware. */
function exploreDev(): Plugin {
  return {
    name: "explore-dev",
    configureServer(server) {
      server.middlewares.use("/__explore", (req, res) => {
        const q = new URL(req.url ?? "/", "http://127.0.0.1").searchParams;
        void fetchRaw(q.get("section") ?? "", q.get("window") ?? "").then(
          (raw) => {
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify(raw));
          },
          () => {
            res.statusCode = 500;
            res.end('{"error":"unavailable","parts":[]}');
          },
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), exploreDev()],
  clearScreen: false,
  resolve: { alias: { "@centurion/contracts/wire": contractsWire, "@centurion/i18n": i18nPkg, "@explore": exploreSrc } },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: ["..", "../../packages"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  // Fonts are always emitted as files (CSP font-src 'self', no data: fonts); other small assets keep the default.
  build: { target: "es2022", outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 600, assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined) },
});
