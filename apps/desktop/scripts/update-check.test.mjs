// Update card helpers: `npm run test:ui` (node --test strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDownloadEvent, compareVersions, formatBytes, progressPct } from "../src/components/updateCheck.ts";

test("compareVersions: numeric per segment, so 0.10.0 beats 0.9.0", () => {
  assert.equal(compareVersions("0.2.0", "0.1.0"), 1);
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("v0.2.0", "0.2.1"), -1);
  assert.equal(compareVersions("0.2", "0.2.0"), 0);
});

test("download progress: Started sets the total, Progress accumulates, Finished keeps it", () => {
  let p = applyDownloadEvent({ loaded: 0, total: null }, "Started", { contentLength: 1000 });
  assert.deepEqual(p, { loaded: 0, total: 1000 });
  p = applyDownloadEvent(p, "Progress", { chunkLength: 250 });
  p = applyDownloadEvent(p, "Progress", { chunkLength: 250 });
  assert.deepEqual(p, { loaded: 500, total: 1000 });
  assert.equal(progressPct(p), 50);
  assert.deepEqual(applyDownloadEvent(p, "Finished", {}), p);
});

test("unknown download size stays null, never a fake 0 or 100%", () => {
  const p = applyDownloadEvent({ loaded: 0, total: null }, "Started", { contentLength: null });
  assert.equal(progressPct(p), null);
  assert.equal(formatBytes(p.total), null);
  assert.equal(progressPct({ loaded: 10, total: 0 }), null);
});

test("progress is clamped to 100 and formatted sizes are human", () => {
  assert.equal(progressPct({ loaded: 1200, total: 1000 }), 100);
  assert.equal(formatBytes(900), "900 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
});