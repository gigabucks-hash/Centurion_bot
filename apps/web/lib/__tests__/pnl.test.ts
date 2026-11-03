// Run: npm test  (Node ≥ 22.18 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { decimalSign, eventSignValue, pnlArrow, pnlDisplay, pnlTone, PNL_TEXT_CLASS } from "../pnl.ts";

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
test("decimalSign compares decimal strings exactly (no floats)", () => {
  for (const z of ["0", "0.00", "-0.00", "+0", "\u22120.0", "-0", "000.000", "0."]) assert.equal(decimalSign(z), 0, z);
  assert.equal(decimalSign("0.000000000000000001"), 1);
  assert.equal(decimalSign("-0.000000000000000001"), -1);
  assert.equal(decimalSign("\u22121.5"), -1);
  assert.equal(decimalSign("250000000"), 1);
  assert.equal(decimalSign("-250000000"), -1);
  assert.equal(decimalSign("1e-9"), null);
  assert.equal(decimalSign(""), null);
});

test("Pnl = @centurion/i18n pnlSol/pnlPct: exact zero '0.00' neutral; tiny '<0.000001' signed + toned", () => {
  for (const z of [{ sol: 0 }, { sol: -0 }, { sol: "0.00" }, { sol: "-0.00" }, { lamports: "0" }, { lamports: "-0" }] as const) {
    const d = pnlDisplay(z, "en", { unit: false });
    assert.deepEqual({ text: d.text, tone: d.tone, arrow: d.arrow, sign: d.sign }, { text: "0.00", tone: "neutral", arrow: "", sign: "" }, JSON.stringify(z));
  }
  assert.equal(pnlDisplay({ sol: 0 }, "en").text, "0.00\u00A0SOL");
  assert.equal(pnlDisplay({ sol: 0 }, "en", { paper: true }).text, "0.00\u00A0paper SOL");
  assert.equal(pnlDisplay({ pct: 0 }, "en").text, "0.0%");
  const pos = pnlDisplay({ sol: "0.25" }, "en", { unit: false });
  assert.deepEqual([pos.tone, pos.arrow, pos.sign], ["profit", "\u25B2", "+"]);
  assert.match(pos.text, /^\+0\.25/);
  const neg = pnlDisplay({ sol: -0.066 }, "en", { unit: false });
  assert.deepEqual([neg.tone, neg.arrow, neg.sign], ["loss", "\u25BC", "\u2212"]);
  assert.match(neg.text, /^\u22120\.066/);
  const tiny = pnlDisplay({ lamports: "-1" }, "en", { unit: false });
  assert.deepEqual([tiny.text, tiny.tone, tiny.arrow], ["\u2212<0.000001", "loss", "\u25BC"]);
  assert.equal(pnlDisplay({ sol: 1e-12 }, "en", { unit: false }).text, "+<0.000001");
  assert.equal(pnlDisplay({ pct: 0.001 }, "en").text, "+<0.1%");
  const lam = pnlDisplay({ lamports: "-250000000" }, "id", { unit: false });
  assert.equal(lam.tone, "loss");
  assert.match(lam.text, /^\u22120,25/);
  // Feed titles keep using the exact-sign helpers.
  assert.equal(pnlTone(1e-12), "profit");
});
