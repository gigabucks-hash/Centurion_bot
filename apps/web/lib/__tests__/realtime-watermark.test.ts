import { test } from "node:test";
import assert from "node:assert/strict";
import { initialWatermark, isBehind, noteCatchUp, noteClock, noteEvent, resumeAfter } from "../realtime-watermark.ts";

test("clock alone never advances the resume point", () => {
  const w = noteClock(initialWatermark(), "9007199254740993");
  assert.equal(w.applied, null);
  assert.equal(resumeAfter(w), null, "no events applied yet: connect from the server's start, not safe_seq");
  assert.equal(isBehind(w), false);
});

test("resume is capped by clock.safe_seq when an event arrived ahead of the clock", () => {
  // Backend N1: the SSE can expose seq 25 before safe_seq moves past 20. Reconnect must not skip 21–25.
  let w = initialWatermark("10");
  w = noteEvent(w, "25");
  w = noteClock(w, "20");
  assert.equal(resumeAfter(w), "20", "replay 21–25 rather than resume past them");
  assert.equal(isBehind(w), false, "applied is already above safe, so no REST gap fill is needed");
});

test("safe_seq beyond the applied event is a gap and keeps the applied point", () => {
  let w = initialWatermark("10");
  w = noteEvent(w, "12");
  w = noteClock(w, "18");
  assert.equal(resumeAfter(w), "12");
  assert.equal(isBehind(w), true);
});

test("applied catches up, then resume follows the applied point", () => {
  let w = noteClock(initialWatermark("10"), "18");
  w = noteEvent(w, "14");
  w = noteEvent(w, "18");
  assert.equal(isBehind(w), false);
  assert.equal(resumeAfter(w), "18");
});

test("int64 seqs above 2^53 compare exactly", () => {
  let w = initialWatermark("9007199254740992");
  w = noteEvent(w, "9007199254740994");
  w = noteClock(w, "9007199254740993");
  assert.equal(resumeAfter(w), "9007199254740993");
  w = noteClock(w, "9007199254740995");
  assert.equal(isBehind(w), true, "safe moved one past the applied event");
  assert.equal(resumeAfter(w), "9007199254740994");
});

test("malformed seqs are ignored (never Number(), never NaN)", () => {
  const w = noteClock(noteEvent(initialWatermark("5"), "nope"), "6.5");
  assert.deepEqual(w, { applied: "5", safe: null });
});

test("a late event below the applied point is deduped without moving it", () => {
  const w = noteEvent(initialWatermark("9"), "8");
  assert.equal(w.applied, "9");
});

test("an empty catch-up page advances applied only to its acknowledged cursor", () => {
  const w = noteCatchUp(noteClock(initialWatermark("10"), "18"), "18");
  assert.equal(w.applied, "18");
  assert.equal(isBehind(w), false);
  assert.equal(resumeAfter(w), "18");
});
