// Per-strategy Paper/Real gate (contracts 1.1.6): display keys, fail-safe defaults, no Real while locked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gateView, HOLD_MS, REAL_LOCKED_REASONS } from "../src/components/strategyGate.ts";

const flat = (o, p = "", r = {}) => { for (const [k, v] of Object.entries(o)) typeof v === "string" ? (r[p + k] = v) : flat(v, `${p}${k}.`, r); return r; };
const cat = Object.fromEntries(["en", "id"].map((l) => [l, flat(JSON.parse(readFileSync(new URL(`../../../packages/i18n/${l}.json`, import.meta.url), "utf8")))]));
const has = (k) => ["en", "id"].every((l) => typeof cat[l][k] === "string");

test("reasons = contracts RealLockedReason, each with i18n copy", () => {
  const ev = readFileSync(new URL("../../../packages/contracts/src/wire/events.ts", import.meta.url), "utf8");
  const line = ev.split("\n").find((l) => l.startsWith("export type RealLockedReason"));
  assert.deepEqual([...line.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]), [...REAL_LOCKED_REASONS]);
  for (const r of REAL_LOCKED_REASONS) assert.ok(has(`strategy.real_locked_reason.${r}`), r);
});

test("locked: Real never selectable; chip + reason + progress + note; every key exists", () => {
  const cases = [
    { real_locked_reason: "needs_owner_approval", paper_progress: { days_done: 1, days_required: null, trades_done: 4, trades_required: null } },
    { real_locked_reason: "gate_not_met", paper_progress: { days_done: 3, days_required: 7, trades_done: 12, trades_required: 30 } },
    { real_locked_reason: "policy", paper_progress: { days_done: 14, days_required: 7, trades_done: 41, trades_required: 30 } },
  ];
  for (const c of cases) {
    const g = gateView({ mode: "practice", real_locked: true, ...c });
    assert.equal(g.realSelectable, false);
    assert.equal(g.modeKey, "strategy.mode.paper");
    for (const l of [g.chip, g.reason, g.a11y, g.note, ...g.progress]) assert.ok(l && has(l.key), JSON.stringify(l));
    assert.equal(g.reason.key, `strategy.real_locked_reason.${c.real_locked_reason}`);
  }
  const notSet = gateView({ mode: "practice", real_locked: true, ...cases[0] });
  assert.deepEqual(notSet.progress.map((l) => l.key), ["strategy.real_gate.days_done", "strategy.real_gate.trades_done", "strategy.real_gate.not_set"]);
  const below = gateView({ mode: "practice", real_locked: true, ...cases[1] });
  assert.deepEqual(below.progress.map((l) => l.key), ["strategy.real_gate.progress_days", "strategy.real_gate.progress_trades"]);
  assert.deepEqual(below.progress[0].args, { days_done: 3, days_required: 7 });
});

test("fail safe: missing gate fields = locked with reason other; unknown reason = other", () => {
  const g = gateView({ mode: "practice" });
  assert.equal(g.locked, true);
  assert.equal(g.realSelectable, false);
  assert.equal(g.reason.key, "strategy.real_locked_reason.other");
  assert.equal(gateView({ real_locked: true, real_locked_reason: "brand_new" }).reason.key, "strategy.real_locked_reason.other");
  const open = gateView({ mode: "practice", real_locked: false, real_locked_reason: null });
  assert.equal(open.realSelectable, true, "only an explicit real_locked=false offers the (2.5 s) Real hold");
  assert.equal(open.chip, null);
});

test("hold rules unchanged: Paper 1.2 s, Real 2.5 s; Paper label is the i18n copy", () => {
  assert.deepEqual(HOLD_MS, { practice: 1200, real: 2500 });
  assert.equal(cat.en["strategy.mode.paper"], "Paper");
  assert.equal(cat.en["mode.practice.label"], "PAPER");
  assert.match(cat.en["strategy.approval.hold_note"], /1\.2 s.*2\.5 s/);
  assert.match(cat.en["error.code.mode_not_allowed"], /approved for Real/);
});
