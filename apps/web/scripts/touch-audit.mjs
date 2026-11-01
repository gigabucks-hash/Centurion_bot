// Touch-target audit (WCAG 2.5.5 AAA / Apple HIG 44 px): signs in with the mock wallet on a touch phone viewport
// and lists visible interactive elements whose hit box is < 44×44 CSS px. Usage: node scripts/touch-audit.mjs [base]
import { chromium, devices } from "playwright-core";
const BASE = process.argv[2] ?? "http://localhost:3200";
const MIN = 44;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
const login = await (async () => {
  const r = await page.evaluate((min) => [...document.querySelectorAll("button,a[href],input,select,summary,[role=button],[role=tab],[role=switch]")]
    .filter((e) => e.offsetParent !== null).map((e) => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height, t: e.tagName, l: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("name") || "").trim().slice(0, 40) }; })
    .filter((x) => x.w < min || x.h < min), MIN);
  return r;
})();
await page.getByRole("button", { name: /Connect Phantom/ }).click();
await page.getByTestId("siws-message").waitFor();
await page.getByRole("button", { name: /Sign message/ }).click();
await page.waitForURL((u) => u.pathname === "/");
const routes = ["/", "/approvals", "/coins", "/positions", "/strategies", "/strategies/new", "/stats", "/settings"];
const all = { "/login": login };
for (const p of routes) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  all[p] = await page.evaluate((min) => [...document.querySelectorAll("button,a[href],input:not([type=hidden]),select,summary,[role=button],[role=tab],[role=switch]")]
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed")
    .map((e) => {
      // a small visual control is fine when its <label>/wrapper hit box is ≥ 44 px
      const hit = e.closest("label") ?? e;
      const b = hit.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), t: e.tagName.toLowerCase() + (e.type ? `[${e.type}]` : ""), l: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 40) };
    })
    .filter((x) => x.w > 0 && (x.w < min || x.h < min)), MIN);
}
let n = 0;
for (const [p, list] of Object.entries(all)) {
  if (!list.length) continue;
  n += list.length;
  console.log(`\n${p} (${list.length})`);
  const seen = new Set();
  for (const x of list) { const k = `${x.t} ${x.l} ${x.w}×${x.h}`; if (!seen.has(k)) { seen.add(k); console.log("  ", k); } }
}
console.log(n ? `\n${n} targets < ${MIN}px` : `all interactive targets ≥ ${MIN}px`);
await browser.close();
