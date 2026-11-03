import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port in dev and a static bundle in dist/.
const host = process.env.TAURI_DEV_HOST;
// Wire types/helpers from the contracts package (v1.1.x). Only `src/wire` is used by the desktop.
const contractsWire = fileURLToPath(new URL("../../packages/contracts/src/wire/index.ts", import.meta.url));
// UX copy catalog + formatters (@centurion/i18n 0.4.2): en/id ICU JSON + format.mjs.
const i18nPkg = fileURLToPath(new URL("../../packages/i18n", import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: { alias: { "@centurion/contracts/wire": contractsWire, "@centurion/i18n": i18nPkg } },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: ["..", "../../packages"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 600 },
});
