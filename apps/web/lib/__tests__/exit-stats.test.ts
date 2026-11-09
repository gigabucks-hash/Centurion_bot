import { test } from "node:test";
import assert from "node:assert/strict";
import { computeExitStats, exitSamples } from "../mock/data.ts";
import { EXIT_REASONS } from "@centurion/contracts/wire";

// The stats table renders a bucket's derived metrics. A reason with no closed trades has no win rate,
// no average PnL and no average hold: those must stay null (the UI prints an em dash), never 0.
test("an exit reason with no closed trades has null averages, not zeros", () => {
  const onlyManual = exitSamples.filter((x) => x.reason === "manual");
  assert.ok(onlyManual.length > 0, "the demo data must contain at least one manual close");
  const stats = computeExitStats(onlyManual);

  const empty = stats.filter((s) => s.count === 0);
  assert.ok(empty.length > 0, "filtering to one reason must leave the other reasons empty");
  for (const row of empty) {
    assert.equal(row.winRate, null, `${row.reason}: win rate must be null`);
    assert.equal(row.avgPnlSol, null, `${row.reason}: average PnL must be null`);
    assert.equal(row.avgPnlPct, null, `${row.reason}: average PnL % must be null`);
    assert.equal(row.avgHoldSeconds, null, `${row.reason}: average hold must be null`);
    assert.equal(row.totalPnlSol, 0, `${row.reason}: a bucket with no trades totals 0`);
  }

  const manual = stats.find((s) => s.reason === "manual");
  assert.equal(manual?.count, onlyManual.length);
  assert.equal(typeof manual?.avgPnlPct, "number");
  assert.equal(stats.length, EXIT_REASONS.length);
});