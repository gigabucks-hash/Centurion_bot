import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port in dev and a static bundle in dist/.
const host = process.env.TAURI_DEV_HOST;
const contracts = fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: { alias: { "@sentra/contracts": contracts } },
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
