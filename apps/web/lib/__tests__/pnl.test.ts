// Run: npm test  (Node ≥ 22.18 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventSignValue, pnlArrow, pnlTone, PNL_TEXT_CLASS } from "../pnl.ts";

test("loss is never profit-toned", () => {
  assert.equal(pnlTone(-14), "loss");
  assert.equal(PNL_TEXT_CLASS[pnlTone(-0.0001)], "text-semantic-loss");
  assert.equal(pnlArrow(-3), "▼");
});

test("profit / zero / missing", () => {
  assert.equal(pnlTone(12), "profit");
  assert.equal(pnlArrow(12), "▲");
  assert.equal(pnlTone(0), "neutral");
  assert.equal(pnlTone(undefined), "neutral");
  assert.equal(pnlArrow(0), "");
});

test("sold title follows the % shown in the title, not the overall position PnL", () => {
  // e.g. "Sold QUILL −14%" after an earlier take-profit left the position net positive
  assert.equal(pnlTone(eventSignValue({ kind: "sold", pctChange: -14, pnlSol: 0.02 })), "loss");
  assert.equal(pnlTone(eventSignValue({ kind: "sold", pnlSol: -0.05 })), "loss");
  assert.equal(pnlTone(eventSignValue({ kind: "bought", pctChange: 5 })), "neutral");
});
