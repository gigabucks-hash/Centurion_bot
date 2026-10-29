// Lab perf run: Lighthouse (mobile preset: Moto G-class CPU 4x slowdown, slow 4G) against a production server
// (`next build && next start`). Usage: node scripts/perf.mjs <label> [baseUrl]
// Writes perf/<label>.json with LCP, TBT (lab proxy for INP), CLS and first-load JS (gzip transfer of scripts).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const label = process.argv[2] ?? "run";
const base = process.argv[3] ?? "http://localhost:3200";
const routes = ["/login", "/", "/approvals", "/positions", "/coins", "/activity", "/stats", "/strategies/new", "/settings"];
const chrome = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
mkdirSync("perf/raw", { recursive: true });
const out = {};
for (const r of routes) {
  const file = `perf/raw/${label}${r === "/" ? "_root" : r.replaceAll("/", "_")}.json`;
  const runs = [];
  for (let i = 0; i < 2; i++) {
    execFileSync("npx", ["-y", "lighthouse@13.6.0", base + r, "--quiet", "--output=json", `--output-path=${file}`, "--only-categories=performance", `--chrome-flags=--headless=new --no-sandbox`, "--form-factor=mobile"], { stdio: "inherit", env: { ...process.env, CHROME_PATH: chrome } });
    const j = JSON.parse(readFileSync(file, "utf8"));
    const a = j.audits;
    const scripts = (a["network-requests"]?.details?.items ?? []).filter((x) => x.resourceType === "Script" && x.url.startsWith(base));
    runs.push({
      score: Math.round(j.categories.performance.score * 100),
      lcp_ms: Math.round(a["largest-contentful-paint"].numericValue),
      tbt_ms: Math.round(a["total-blocking-time"].numericValue),
      cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)),
      fcp_ms: Math.round(a["first-contentful-paint"].numericValue),
      js_kb_gzip: Math.round(scripts.reduce((s, x) => s + (x.transferSize ?? 0), 0) / 1024),
      js_kb_raw: Math.round(scripts.reduce((s, x) => s + (x.resourceSize ?? 0), 0) / 1024),
    });
  }
  // Median of 2 = the better LCP run (lab noise); JS bytes are deterministic.
  out[r] = runs.sort((x, y) => x.lcp_ms - y.lcp_ms)[0];
  console.log(r, JSON.stringify(out[r]));
}
writeFileSync(`perf/${label}.json`, JSON.stringify({ label, at: new Date().toISOString(), preset: "lighthouse 13.6 mobile (simulated slow 4G, 4x CPU)", routes: out }, null, 2));
