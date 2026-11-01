// CoinAvatar smoke (prod): every coin row/card shows an avatar; logos come only from our proxy; a failing logo falls
// back to the identicon; lazy + sized. Usage: node scripts/avatar-check.mjs [base]
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const offOrigin = [];
page.on("request", (r) => { if (r.resourceType() === "image" && !r.url().startsWith(BASE) && !r.url().startsWith("data:")) offOrigin.push(r.url()); });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Connect Phantom/ }).click();
await page.getByTestId("siws-message").waitFor();
await page.getByRole("button", { name: /Sign message/ }).click();
await page.waitForURL((u) => u.pathname === "/");
for (const [p, shot] of [["/", "23-avatars-overview"], ["/coins", "23b-avatars-coins"], ["/approvals", "23c-avatars-approvals"], ["/positions", "23d-avatars-positions"], ["/activity", "23e-avatars-activity"]]) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" }); await page.waitForTimeout(700);
  const s = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-testid="coin-avatar"]')];
    return { n: els.length, logo: els.filter((e) => e.dataset.kind === "logo").length, lazy: els.filter((e) => e.tagName === "IMG" && e.getAttribute("loading") === "lazy").length,
      unsized: els.filter((e) => !(e.getAttribute("width") && e.getAttribute("height"))).length, srcs: els.filter((e) => e.tagName === "IMG").slice(0, 2).map((e) => new URL(e.src).pathname) };
  });
  console.log(p, JSON.stringify(s));
  await page.screenshot({ path: `${OUT}${shot}.png`, fullPage: false });
}
const href = await page.locator('a[href^="/coins/"]').first().getAttribute("href");
await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
console.log("trail header avatar:", await page.locator("h1 [data-testid=coin-avatar]").count(), "eager:", await page.locator('h1 img[data-testid=coin-avatar][loading="eager"]').count());
await page.screenshot({ path: `${OUT}23f-avatar-trail-header.png` });
// failure → identicon
await page.route("**/api/v1/media/coin-logo/**", (r) => r.abort());
await page.goto(`${BASE}/coins`, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
console.log("after logo failures:", JSON.stringify(await page.evaluate(() => { const els = [...document.querySelectorAll('[data-testid="coin-avatar"]')]; return { n: els.length, identicon: els.filter((e) => e.dataset.kind === "identicon").length }; })));
console.log("off-origin image requests:", offOrigin.length);
await browser.close();
