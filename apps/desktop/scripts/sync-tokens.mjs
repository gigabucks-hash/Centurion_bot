// Copy Sentra design tokens into the desktop app.
// Source priority: @sentra/design-tokens tokens/tauri.css (UX: "use tauri.css for apps/desktop";
// dark + Compact default) → legacy fallbacks. Fails (exit 1) and keeps the current copy if none found.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const candidates = [
  here("../../../packages/design-tokens/tokens/tauri.css"),
  here("../../../packages/design-tokens/tokens/tokens.css"),
  "/workspace/ux-solbot/tokens/tauri.css",
];
const src = candidates.find(existsSync);
if (!src) {
  console.error("No tokens.css found in:\n  " + candidates.join("\n  ") + "\nKeeping the existing synced copy.");
  process.exit(1);
}
const dst = here("../src/design/sentra-tokens.css");
copyFileSync(src, dst);
writeFileSync(dst, `/* SYNCED COPY of ${src} — do not edit, run \`npm run sync:tokens\`. */\n` + readFileSync(dst, "utf8"));
console.log(`tokens synced from ${src}`);
