// Real hold-to-confirm must reset when a silent proposal.updated changes the proposal mid-hold.
// Run: npm run test:ui (node --test, TS type-stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HoldGate, holdVersion } from "../src/components/holdGate.ts";

test("proposal.updated (rev bump) during a Real hold resets it; holding again needs the full 2.5 s", () => {
  const g = new HoldGate(2500, holdVersion({ rev: 3 }));
  g.begin(0);
  assert.deepEqual(g.tick(2000), { kind: "holding", progress: 0.8 });
  assert.equal(g.versionChanged(holdVersion({ rev: 4 })), true); // proposal.updated
  assert.deepEqual(g.tick(2600), { kind: "reset" }); // not confirmed, inline "quote changed" state
  g.begin(3000);
  assert.equal(g.tick(5000).kind, "holding"); // only 2.0 s into the new hold
  assert.deepEqual(g.tick(5500), { kind: "confirmed" });
});

test("quote_id change (1.1.5, same rev) resets too; same version and idle updates do not", () => {
  const g = new HoldGate(2500, holdVersion({ rev: 3, quote_id: "q1" }));
  assert.equal(g.versionChanged(holdVersion({ rev: 3, quote_id: "q2" })), false); // not holding → nothing to reset
  g.begin(0);
  assert.equal(g.versionChanged(holdVersion({ rev: 3, quote_id: "q2" })), false); // already the current version
  assert.equal(g.versionChanged(holdVersion({ rev: 3, quote_id: "q3" })), true);
  assert.equal(g.holding, false);
});

test("a completed hold is not undone by a later update", () => {
  const g = new HoldGate(1200, "1:");
  g.begin(0);
  assert.equal(g.tick(1200).kind, "confirmed");
  assert.equal(g.versionChanged("2:"), false);
});
