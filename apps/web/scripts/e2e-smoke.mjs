/**
 * Key-flow smoke against a running web server (next start or next dev).
 * Covers login, both themes, and the auth gate. No wallet, no network beyond the app.
 *
 *   E2E_BASE=http://127.0.0.1:3100 node scripts/e2e-smoke.mjs
 */
import { chromium } from "playwright-core";
import { setTimeout as sleep } from "node:timers/promises";

const base = process.env.E2E_BASE ?? "http://127.0.0.1:3100";

async function waitForLogin() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/login`);
      if (res.ok) return;
    } catch {
      /* server still booting */
    }
    await sleep(1000);
  }
  throw new Error(`login did not answer at ${base}`);
}

await waitForLogin();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  const title = await page.title();
  const body = await page.locator("body").innerText();
  if (!/Centurion/i.test(title) && !/wallet|dompet|trading bot/i.test(body)) {
    throw new Error(`login screen did not render (title=${title})`);
  }

  await page.evaluate(() => localStorage.setItem("centurion_theme", "light"));
  await page.reload({ waitUntil: "domcontentloaded" });
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "light") {
    throw new Error("light theme did not apply");
  }
  await page.evaluate(() => localStorage.setItem("centurion_theme", "dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") {
    throw new Error("dark theme did not apply");
  }

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) throw new Error(`unsigned visit should land on login, got ${page.url()}`);
  await page.goto(`${base}/explore`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) throw new Error(`explore should stay behind login, got ${page.url()}`);
  await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) throw new Error(`settings should stay behind login, got ${page.url()}`);
  console.log("e2e smoke ok");
} finally {
  await browser.close();
}
