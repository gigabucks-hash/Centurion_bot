// Desktop SIWS hand-off smoke: a fake desktop loopback receives the return; checks params, no tokens, no cookies set.
// Usage: node scripts/handoff-check.mjs [base]   (the centurion:// path is the same code with a different redirect)
import http from "node:http";
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
const got = [];
const srv = http.createServer((req, res) => { got.push(new URL(req.url, "http://127.0.0.1")); res.end("ok"); }).listen(53111, "127.0.0.1");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errs = []; page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
const state = "St4te_" + Math.random().toString(36).slice(2, 14) + "xyz";
const cb = encodeURIComponent("http://127.0.0.1:53111/siws/callback");
await page.goto(`${BASE}/auth/desktop?redirect_uri=${cb}&state=${state}&client=desktop`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}22-desktop-handoff.png` });
await page.getByRole("button", { name: /Connect Phantom/ }).click();
await page.getByTestId("siws-message").waitFor();
await page.screenshot({ path: `${OUT}22b-desktop-handoff-message.png` });
await page.getByRole("button", { name: /Sign message/ }).click();
await page.waitForURL(/127\.0\.0\.1:53111/, { timeout: 10000 });
const ok = got.at(-1);
console.log("return params:", [...ok.searchParams.keys()].join(","), "state ok:", ok.searchParams.get("state") === state);
console.log("statement:", /Sign in to Centurion Trade/.test(ok.searchParams.get("message") ?? ""));
console.log("tokens in URL:", /srt_|mat_|access_token|refresh_token/.test(ok.search));
console.log("cookies set by hand-off:", (await ctx.cookies()).filter((c) => /sentra_(at|rt)/.test(c.name)).length);
// non-owner → error=wallet_not_allowed
await page.goto(`${BASE}/auth/desktop?redirect_uri=${cb}&state=${state}`, { waitUntil: "networkidle" });
await page.getByTestId("mock-wallet").selectOption({ index: 1 });
await page.getByRole("button", { name: /Connect Phantom/ }).click();
await page.waitForURL(/127\.0\.0\.1:53111/, { timeout: 10000 });
console.log("non-owner:", got.at(-1).searchParams.get("error"));
// invalid redirect → refused, no navigation
await page.goto(`${BASE}/auth/desktop?redirect_uri=${encodeURIComponent("https://evil.example/cb")}&state=${state}`, { waitUntil: "networkidle" });
console.log("evil redirect refused:", await page.getByTestId("handoff-invalid").count() === 1);
await page.screenshot({ path: `${OUT}22c-desktop-handoff-invalid.png` });
console.log(errs.length ? "console errors:\n" + errs.join("\n") : "no console errors");
await browser.close(); srv.close();
