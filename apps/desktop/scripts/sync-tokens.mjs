// Copy Centurion design tokens into the desktop app.
// Source priority: @centurion/design-tokens tokens/tauri.css (UX: "use tauri.css for apps/desktop";
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
const dst = here("../src/design/centurion-tokens.css");
// The full copy carries the approved G1-blue palette (0.3.4). `--full` replaces the main copy; the subset
// below stays palette-free on purpose.
if (process.argv.includes("--full")) {
  copyFileSync(src, dst);
  // Copy normalizes EOL to LF: the repo index is LF, and the source checkout may be CRLF. Without this a
  // regen rewrites every line and hides the real token diff.
  const body = readFileSync(dst, "utf8").replace(/\r\n/g, "\n");
  // Header uses a repo-relative label so a build on someone else's machine does not bake a local path in.
  const label = src.split(/[\\/]/).slice(-3).join("/");
  writeFileSync(dst, `/* SYNCED COPY of ${label} — do not edit, run \`npm run sync:tokens -- --full\`. */\n` + body);
  console.log(`tokens synced from ${src}`);
} else {
  console.log("main token copy kept; pass --full to replace it with the approved G1-blue 0.3.4 palette");
}

// ---- Subset kept for the approved G1-blue 0.3.4 rollout: extra tokens applied to desktop chrome/dialogs,
// extracted per selector so the main copy can be regenerated without dragging the whole palette in.
// Extracts only the listed custom properties from tauri.css, per selector, into centurion-tokens-subset.css.
const SUBSET = [
  "--color-bg-chrome", "--color-scrim-sheet", "--shadow-card", "--shadow-dialog", "--color-semantic-onWarning",
  "--coin-logo-ring", "--coin-logo-size-sm", "--coin-logo-size-md", "--coin-logo-size-lg", "--coin-logo-not-tradeable-opacity",
  "--color-identicon-fg", ...Array.from({ length: 12 }, (_, i) => `--color-identicon-${i}`),
];
export function extractSubset(css, names) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(css)); ) {
    const sel = m[1].trim().split("\n").pop().trim();
    if (!/^(:root|\[data-theme="(dark|light)"\])/.test(sel)) continue;
    const decls = m[2].split(";").map((d) => d.trim()).filter((d) => names.some((n) => d.startsWith(n + ":")));
    if (decls.length) out.push(`${sel} {\n${decls.map((d) => `  ${d};`).join("\n")}\n}`);
  }
  return out.join("\n");
}
const full = here("../../../packages/design-tokens/tokens/tauri.css");
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && existsSync(full)) {
  const pkgVer = JSON.parse(readFileSync(here("../../../packages/design-tokens/package.json"), "utf8")).version;
  const body = extractSubset(readFileSync(full, "utf8"), SUBSET);
  const missing = SUBSET.filter((n) => !body.includes(n + ":"));
  if (missing.length) { console.error("subset tokens missing in tauri.css: " + missing.join(", ")); process.exit(1); }
  writeFileSync(here("../src/design/centurion-tokens-subset.css"),
    `/* GENERATED SUBSET of @centurion/design-tokens ${pkgVer} tokens/tauri.css by scripts/sync-tokens.mjs — do not edit.\n` +
    `   Only: ${SUBSET.length} approved tokens (0.3.4 chrome/scrim/shadows/onWarning + coin logo). No G1-blue palette. */\n${body}\n`);
  console.log(`subset (${SUBSET.length} tokens) synced from design-tokens ${pkgVer}`);
}
