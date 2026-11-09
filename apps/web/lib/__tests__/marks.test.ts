// Run: npm test  (Node >= 22.18 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MarkMessage } from "@centurion/contracts/wire";
import { applyMark } from "../marks.ts";
import type { OpenPosition } from "../types.ts";

const mark = (over: Partial<MarkMessage>): MarkMessage =>
  ({
    mint: "So11111111111111111111111111111111111111112",
    price_usd: "150",
    price_sol: "1",
    liquidity_usd: 1000,
    slot: 1,
    ts: "2026-11-08T00:00:00.000Z",
    position_ids: [],
    server_now: "2026-11-08T00:00:00.000Z",
    ...over,
  }) as MarkMessage;

const row = (over: Partial<OpenPosition> = {}): OpenPosition => ({
  key: "p.1",
  strategyId: "s1",
  strategyName: "S",
  mode: "practice",
  mint: "So11111111111111111111111111111111111111112",
  symbol: "T",
  solIn: 1,
  entryPriceUsd: 0,
  nowPriceUsd: 0,
  pnlSol: 0,
  pnlPct: 0,
  openedAt: 0,
  soldPct: 0,
  rev: 1,
  decimals: 6,
  tokenProgram: null,
  practiceEpoch: 1,
  stopLossPct: 0,
  trailingPct: 0,
  nowPriceSol: 0.000015,
  priceUnknown: true,
  ...over,
});

test("HTTP paper row: realtime mark rescales from the SOL mark, not a fake USD rate", () => {
  const next = applyMark(row(), mark({ price_sol: "0.000018", price_usd: "999" }));
  assert.equal(next.nowPriceSol, 0.000018);
  assert.equal(next.nowPriceUsd, 0, "no SOL/USD rate: the USD cell stays unknown");
  assert.equal(next.priceUnknown, true);
  assert.ok(Math.abs(next.pnlPct - 20) < 1e-9);
  assert.ok(Math.abs(next.pnlSol - 0.2) < 1e-12);
});

test("Mock row: USD ratio still works when there is no SOL baseline", () => {
  const next = applyMark(row({ nowPriceSol: null, nowPriceUsd: 100, priceUnknown: undefined }), mark({ price_usd: "110", price_sol: "999" }));
  assert.equal(next.nowPriceUsd, 110);
  assert.ok(Math.abs(next.pnlPct - 10) < 1e-9);
  assert.ok(Math.abs(next.pnlSol - 0.1) < 1e-12);
});

test("A mark never applies to another mint or a non-positive price", () => {
  const base = row();
  const other = applyMark(base, mark({ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }));
  assert.equal(other, base, "unrelated mint returns the same object");
  const zero = applyMark(base, mark({ price_sol: "0" }));
  assert.equal(zero.nowPriceSol, 0.000015);
  const nan = applyMark(base, mark({ price_sol: "not-a-number" }));
  assert.equal(nan.nowPriceSol, 0.000015);
});

test("No baseline at all: the row is left alone (no invented number)", () => {
  const next = applyMark(row({ nowPriceSol: null, nowPriceUsd: 0 }), mark({ price_sol: "2", price_usd: "300" }));
  assert.equal(next.pnlPct, 0);
  assert.equal(next.pnlSol, 0);
  assert.equal(next.nowPriceSol, null);
});
