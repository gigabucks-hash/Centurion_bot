import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bollinger, ema, macd, rsi, sma, stochRsi, vwap } from "../../../../packages/explore/src/indicators.ts";
import { fibPrices, measureOf, parseDrawings, snapOhlc } from "../../../../packages/explore/src/drawings.ts";

const closeTo = (actual: number | null, expected: number, digits = 9) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) < 10 ** -digits, `${actual} !== ${expected}`);
};

test("SMA and EMA match the hand values for a short series", () => {
  const values = [1, 2, 3, 4, 5];
  assert.deepEqual(sma(values, 3), [null, null, 2, 3, 4]);
  assert.deepEqual(ema(values, 3), [null, null, 2, 3, 4]);
  assert.deepEqual(sma([], 3), []);
});

test("Bollinger bands use the population standard deviation", () => {
  const bands = bollinger([1, 3], 2, 2);
  closeTo(bands.mid[1], 2);
  closeTo(bands.upper[1], 4);
  closeTo(bands.lower[1], 0);
  assert.equal(bands.mid[0], null);
});

test("VWAP uses typical price and starts over on the next UTC day", () => {
  const day = 1_700_000_000;
  const bars = [
    { time: day, open: 2, high: 3, low: 1, close: 2, volume: 10 },
    { time: day + 60, open: 2, high: 5, low: 1, close: 3, volume: 10 },
    { time: day + 86400, open: 8, high: 9, low: 7, close: 8, volume: 4 },
  ];
  const out = vwap(bars);
  closeTo(out[0], 2);
  closeTo(out[1], 2.5);
  closeTo(out[2], 8);
});

test("Wilder RSI matches the first two windows of a known series", () => {
  const values = [10, 11, 12, 11, 10];
  const out = rsi(values, 3);
  assert.equal(out[0], null);
  assert.equal(out[2], null);
  closeTo(out[3], 100 - 100 / 3, 6);
  closeTo(out[4], 100 - 100 / 1.8, 6);
});

test("MACD is the fast EMA minus the slow EMA, and the signal is an EMA of that line", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out = macd(values, 3, 5, 3);
  assert.equal(out[3].macd, null);
  closeTo(out[4].macd, 1);
  closeTo(out[9].macd, 1);
  assert.equal(out[5].signal, null);
  closeTo(out[6].signal, 1);
  closeTo(out[6].hist, 0);
  assert.equal(macd(values, 5, 3, 3)[9].macd, null);
});

test("Stochastic RSI sits at 100 on a strictly rising series", () => {
  const values = Array.from({ length: 40 }, (_, i) => i + 1);
  const out = stochRsi(values, 14, 14, 3, 3);
  const last = out[out.length - 1];
  closeTo(last.k, 100);
  closeTo(last.d, 100);
});

test("web and desktop chart studios stay the same file", () => {
  const web = readFileSync(new URL("../../components/charts/ChartStudio.tsx", import.meta.url), "utf8");
  const desktop = readFileSync(new URL("../../../../apps/desktop/src/components/ChartStudio.tsx", import.meta.url), "utf8");
  assert.equal(web, desktop);
});

test("Fibonacci, measure, snap, and drawing parse", () => {
  const levels = fibPrices(10, 6);
  assert.equal(levels[0].price, 6);
  assert.equal(levels[levels.length - 1].price, 10);
  closeTo(levels.find((level) => level.ratio === 0.5)?.price ?? null, 8);
  const bars = [
    { time: 100, open: 1, high: 4, low: 0.5, close: 2 },
    { time: 200, open: 2, high: 3, low: 1, close: 2.5 },
  ];
  const measured = measureOf(bars, { time: 100, price: 2 }, { time: 200, price: 3 });
  assert.equal(measured.bars, 2);
  assert.equal(measured.price, 1);
  assert.equal(measured.pct, 50);
  assert.deepEqual(snapOhlc(bars, 140, 3.8), { time: 100, price: 4 });
  const kept = parseDrawings([
    { id: "a", tool: "trend", a: { time: 1, price: 2 }, b: { time: 3, price: 4 }, locked: true },
    { id: "bad", tool: "nope", a: { time: 1, price: 2 }, b: { time: 3, price: 4 } },
    { id: "", tool: "hline", a: { time: 1, price: 2 }, b: { time: 1, price: 2 } },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].locked, true);
});
