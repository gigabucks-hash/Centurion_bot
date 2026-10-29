// Captures desktop + mobile screenshots of every page. Requires the app running on BASE (default http://localhost:3100).
// Mock only: switching to the Real SOL workspace just sets a cookie via the app's own /api/mode route.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
const exe = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();
const setMode = (mode) => ctx.request.post(`${BASE}/api/mode`, { data: { mode, holdMs: 2600 } });
const shot = async (name, opts = {}) => {
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: opts.full ?? true });
  console.log("saved", name);
};
const go = async (path, wait = 1200) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
};

await setMode("practice");

// Coin links for trail shots
await go("/coins", 800);
const closedRow = page.locator("tr", { hasText: "closed" }).first();
const coin = await ((await closedRow.count()) ? closedRow : page.locator("tr").nth(1)).locator('a[href^="/coins/"]').first().getAttribute("href");
const rejected = await page.locator("tr", { hasText: "rejected" }).first().locator('a[href^="/coins/"]').first().getAttribute("href");

await go("/"); await shot("01-overview");
await go("/strategies"); await shot("02-strategies");
await go("/strategies/new"); await shot("03-builder-new-screener");
await page.getByRole("button", { name: /Exit plan/ }).first().click(); await page.waitForTimeout(300); await shot("03b-builder-exit-plan");
await page.getByRole("button", { name: /Review & sim/ }).first().click(); await page.waitForTimeout(300); await shot("03c-builder-review");
// Edit an existing strategy and loosen the guard → diff shows "weakens"
await go("/strategies", 600);
await page.getByRole("link", { name: "Edit" }).first().click();
await page.waitForURL(/\/edit$/); await page.waitForTimeout(800);
await page.getByRole("button", { name: /Guards/ }).first().click();
await page.getByRole("radio", { name: "Loose" }).click(); await page.waitForTimeout(400);
await shot("03d-builder-edit-weakening");
await go("/activity", 6000); await shot("04-activity");
await go("/coins"); await shot("05-coins");
await go(coin, 2000); await shot("06-coin-trail-chart");
if (rejected) { await go(rejected, 1500); await shot("06b-coin-trail-rejected"); }
await go("/stats"); await shot("07-stats");
await go("/approvals"); await shot("08-approvals-practice");
await page.getByRole("button", { name: "Skip" }).first().click(); await page.waitForTimeout(300); await shot("08b-approvals-skip-reasons", { full: false });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /Review/ }).first().click(); await page.waitForTimeout(400); await shot("08c-guard-weakening-practice", { full: false });
await page.keyboard.press("Escape");

// Real SOL workspace
await setMode("real");
await go("/"); await shot("09-overview-real");
await go("/approvals"); await shot("10-approvals-real");
const boxes = page.locator('input[type="checkbox"][aria-label^="Select"]');
for (let i = 0; i < Math.min(2, await boxes.count()); i++) await boxes.nth(i).check();
await page.waitForTimeout(300); await shot("10b-approvals-real-batch", { full: false });
await page.getByRole("button", { name: /Approve selected/ }).click(); await page.waitForTimeout(400);
await shot("11-real-pick-confirm", { full: false });
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.locator("article", { hasText: "Guard change" }).getByRole("button", { name: /Review/ }).first().click();
await page.waitForTimeout(300);
await page.getByLabel("Type the strategy name to confirm").fill("Graduated scalp");
await page.getByRole("button", { name: /Verify with passkey/ }).click(); await page.waitForTimeout(900);
await shot("12-guard-weakening-real", { full: false });
await page.keyboard.press("Escape");
await setMode("practice");

// Light theme
const light = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", timezoneId: "Asia/Jakarta" });
await light.addInitScript(() => localStorage.setItem("sentra_theme", "light"));
const lp = await light.newPage();
for (const [n, p] of [["13-overview-light", "/"], ["13b-approvals-light", "/approvals"], ["13c-coin-trail-light", coin]]) {
  await lp.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" }); await lp.waitForTimeout(1500);
  await lp.screenshot({ path: `${OUT}${n}.png`, fullPage: true }); console.log("saved", n);
}

// Login + onboarding (mock auth)
const auth = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const ap = await auth.newPage();
await ap.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" }); await ap.waitForTimeout(800);
await ap.screenshot({ path: `${OUT}14-login.png` }); console.log("saved 14-login");
await ap.getByLabel("Email").fill("demo@example.com");
await ap.getByRole("button", { name: /Send 6-digit code/ }).click(); await ap.waitForTimeout(1200);
await ap.screenshot({ path: `${OUT}14b-login-otp.png` }); console.log("saved 14b-login-otp");
await ap.getByRole("button", { name: /Other methods/ }).click();
await ap.getByRole("button", { name: /Connect Solana wallet/ }).click();
await ap.getByRole("button", { name: "Phantom" }).click(); await ap.waitForTimeout(300);
await ap.screenshot({ path: `${OUT}14c-login-wallet-siws.png` }); console.log("saved 14c-login-wallet-siws");
await ap.goto(`${BASE}/welcome`, { waitUntil: "domcontentloaded" }); await ap.waitForTimeout(600);
await ap.screenshot({ path: `${OUT}15-welcome.png`, fullPage: true }); console.log("saved 15-welcome");

// Mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark", isMobile: true, hasTouch: true });
const mp = await m.newPage();
for (const [n, p] of [["16-mobile-overview", "/"], ["16b-mobile-approvals", "/approvals"], ["16c-mobile-login", "/login"]]) {
  await mp.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" }); await mp.waitForTimeout(1300);
  await mp.screenshot({ path: `${OUT}${n}.png` }); console.log("saved", n);
}
await mp.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }); await mp.waitForTimeout(1000);
await mp.getByRole("button", { name: "More" }).click(); await mp.waitForTimeout(400);
await mp.screenshot({ path: `${OUT}16d-mobile-more.png` }); console.log("saved 16d-mobile-more");

await browser.close();
