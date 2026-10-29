// Copy Sentra design tokens into the desktop app.
// Source priority: @sentra/design-tokens tokens/tauri.css (UX: "use tauri.css for apps/desktop";
// dark + Compact default) → legacy fallbacks. Fails (exit 1) and keeps the current copy if none found.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
// Guard: drop unmatched closing braces (tauri.css v0.2.0 has one stray "}" after the light theme
// block — reported to UX). Anything else malformed is left for the CSS build to reject.
let depth = 0, dropped = 0, css = "";
for (const ch of readFileSync(src, "utf8")) {
  if (ch === "{") depth++;
  if (ch === "}") { if (depth === 0) { dropped++; continue; } depth--; }
  css += ch;
}
if (dropped) console.warn(`warning: removed ${dropped} unmatched "}" from ${src} (fix upstream in design-tokens build.py)`);
writeFileSync(dst, `/* SYNCED COPY of ${src} — do not edit, run \`npm run sync:tokens\`. */\n` + css);
console.log(`tokens synced from ${src}`);
