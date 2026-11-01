// Prod CSP smoke: wallet sign-in (mock) → visit every route → report CSP violations, console errors and whether
// the app hydrated (a client-only action works). Usage: node scripts/csp-check.mjs [base]
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "http://localhost:3200";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy|Refused to/.test(m.text())) problems.push(`[${page.url()}] ${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`[${page.url()}] pageerror: ${String(e).slice(0, 300)}`));
await page.goto(`${BASE}/positions`, { waitUntil: "networkidle" });
console.log("gate →", new URL(page.url()).pathname + new URL(page.url()).search);
await page.getByRole("button", { name: /Connect Phantom/ }).click();
await page.getByTestId("siws-message").waitFor({ timeout: 10000 });
await page.getByRole("button", { name: /Sign message/ }).click();
await page.waitForURL((u) => u.pathname === "/positions", { timeout: 15000 });
console.log("signed in →", new URL(page.url()).pathname);
const cookies = await ctx.cookies();
console.log("cookies:", cookies.map((c) => `${c.name}(httpOnly=${c.httpOnly},path=${c.path},sameSite=${c.sameSite})`).join(" "));
console.log("document.cookie sees:", JSON.stringify(await page.evaluate(() => document.cookie)));
console.log("localStorage keys:", JSON.stringify(await page.evaluate(() => Object.keys(localStorage))));
for (const p of ["/", "/approvals", "/coins", "/positions", "/strategies", "/strategies/new", "/stats", "/settings"]) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
}
// coin detail (lightweight-charts) + hydration check
await page.goto(`${BASE}/coins`, { waitUntil: "networkidle" });
const href = await page.locator('a[href^="/coins/"]').first().getAttribute("href");
await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("chart canvas:", await page.locator("canvas").count());
// silent refresh endpoint + logout
const r = await page.evaluate(async () => (await fetch("/api/v1/auth/session/refresh", { method: "POST" })).status);
console.log("refresh status:", r);
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const signOut = page.getByRole("button", { name: /Sign out/ }).first();
await signOut.click();
await page.waitForURL((u) => u.pathname === "/login", { timeout: 10000 });
const after = await page.request.get(`${BASE}/api/v1/workspaces/ws_mock/approvals?mode=practice`);
console.log("after logout API:", after.status());
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join("\n") : "no CSP violations / console errors");
await browser.close();
