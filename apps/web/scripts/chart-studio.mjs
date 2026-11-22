/**
 * Chart tools against a dev server (CENTURION_AUTH_GATE=0). Production keeps the login gate on.
 * Enables EMA and RSI, draws a trend line, reloads, and checks the canvas is not blank.
 *
 *   E2E_BASE=http://localhost:3111 node scripts/chart-studio.mjs
 */
import { chromium } from "playwright-core";
import { setTimeout as sleep } from "node:timers/promises";

const base = process.env.E2E_BASE ?? "http://localhost:3111";
const mint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

async function launch() {
  try {
    return await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  } catch {
    return chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }
}

for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${base}/login`);
    if (res.ok || res.status === 307 || res.status === 302) break;
  } catch {
    /* still booting */
  }
  if (i === 59) throw new Error(`chart server did not answer at ${base}`);
  await sleep(1000);
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.addInitScript(() => {
    localStorage.setItem("centurion_theme", "dark");
    localStorage.setItem("centurion.onboarded.v1", "1");
  });
  await page.goto(`${base}/coins/${mint}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("[data-bars]", { timeout: 30000 });
  await page.getByRole("button", { name: "Indicators" }).click();
  await page.getByRole("checkbox", { name: "EMA", exact: true }).check();
  await page.getByRole("checkbox", { name: "RSI", exact: true }).check();
  await page.waitForFunction(() => {
    const names = document.querySelector("[data-indicators]")?.getAttribute("data-indicators") ?? "";
    return names.includes("ema") && names.includes("rsi");
  });
  await page.getByRole("button", { name: "Trend line" }).click();
  await page.waitForSelector("[data-tool='trend']");
  const host = page.locator("[data-chart-host]");
  const box = await host.boundingBox();
  if (!box) throw new Error("chart host has no box");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector("[data-drawing]");
  await page.waitForFunction(() => (localStorage.getItem("centurion.chart.v1") ?? "").includes("\"trend\""));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-bars]", { timeout: 30000 });
  await page.waitForSelector("[data-drawing]", { timeout: 15000 });
  const saved = await page.evaluate(() => localStorage.getItem("centurion.chart.v1") ?? "");
  if (!saved.includes("\"trend\"") || !saved.includes("\"ema\"")) throw new Error("drawing or EMA did not persist");
  const names = await page.locator("[data-indicators]").getAttribute("data-indicators");
  if (!names?.includes("ema") || !names.includes("rsi")) throw new Error(`indicators missing after reload: ${names}`);
  const ink = await page.evaluate(() => {
    const canvas = document.querySelector("[data-chart-host] canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const bg = `${img[0]},${img[1]},${img[2]}`;
    let count = 0;
    for (let i = 0; i < img.length; i += 16) {
      if (img[i + 3] < 16) continue;
      if (`${img[i]},${img[i + 1]},${img[i + 2]}` !== bg) count += 1;
    }
    return count;
  });
  if (ink < 50) throw new Error(`canvas looks blank (${ink} ink samples)`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 8);
  if (overflow) throw new Error("page overflows a 1280px viewport");
  console.log("chart studio ok", { ink, names });
} finally {
  await browser.close();
}
