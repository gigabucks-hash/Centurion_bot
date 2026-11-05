// Browser repro for BUG_HUNT_v1 F3/F4 on /pnl (mock data source).
// Run while `npm run dev` is serving http://localhost:3100:
//   node docs/qa/repro/pnl_ui_repro.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire("file:///C:/cw/app/apps/web/package.json");
const { chromium } = require("playwright-core");

const BASE = process.env.BASE ?? "http://localhost:3100";
const shotDir = fileURLToPath(new URL("./shots/", import.meta.url));
mkdirSync(shotDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();
const go = async (p) => {
  await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
};

// Mock wallet sign-in (the screenshots script relies on the same flow).
await go("/login?next=%2Fpnl%3Fwindow%3D1h");
await page.getByTestId("wallet-flow").getByRole("button", { name: /Connect Phantom|Hubungkan/i }).click();
await page.getByTestId("wallet-flow").getByRole("button", { name: /Sign message|Tandatangani/i }).click();
await page.waitForTimeout(2000);

// F3: ?window=1h is a valid server range (lib/pnl-report.ts:8,23) but the range select
// (components/PnlFilters.tsx:26-31) has no 1h option.
await go("/pnl?window=1h");
console.log("url after load        =", page.url());
const selects = page.locator("main select, select");
const count = await selects.count();
for (let i = 0; i < count; i++) {
  const info = await selects.nth(i).evaluate((el) => ({
    aria: el.getAttribute("aria-label"),
    value: el.value,
    selectedIndex: el.selectedIndex,
    text: el.selectedOptions[0]?.textContent?.trim() ?? null,
  }));
  console.log(`select[${i}]            =`, JSON.stringify(info));
}
await page.screenshot({ path: `${shotDir}pnl-window-1h.png` });

// F4: the mode tab link on /pnl drops window and strategy (page.tsx:96).
await go("/pnl?window=30d");
const tabs = await page.locator('a[href^="/pnl"]').evaluateAll((as) =>
  as.map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute("href") })),
);
console.log("links starting /pnl   =", JSON.stringify(tabs));

await browser.close();