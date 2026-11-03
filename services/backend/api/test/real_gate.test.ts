// Contracts 1.1.6: per-strategy Real gate fields on strategy reads. Real stays locked; thresholds are config-only.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OWNER, WS, call, startHarness, token, type Harness } from "./helpers.ts";
import { paperDaysDone } from "../src/real_gate.ts";
import { loadConfig, ConfigError } from "../src/config.ts";

const S1 = "20000000-0000-0000-0000-0000000000a1";
const path = (s = "") => `/v1/workspaces/${WS}/strategies${s}`;
const BASE = { TRADING_MODE: "paper", DATABASE_URL: "postgres://x", SUPABASE_JWT_SECRET: "s".repeat(32) };

describe("real gate config", () => {
  test("thresholds are null unless set; validated when set", () => {
    const c = loadConfig(BASE);
    assert.equal(c.realGateMinPaperDays, null);
    assert.equal(c.realGateMinPaperTrades, null);
    const d = loadConfig({ ...BASE, CENTURION_REAL_GATE_MIN_PAPER_DAYS: "7", CENTURION_REAL_GATE_MIN_PAPER_TRADES: "30" });
    assert.equal(d.realGateMinPaperDays, 7);
    assert.equal(d.realGateMinPaperTrades, 30);
    assert.throws(() => loadConfig({ ...BASE, CENTURION_REAL_GATE_MIN_PAPER_DAYS: "0" }), ConfigError);
    assert.throws(() => loadConfig({ ...BASE, CENTURION_REAL_GATE_MIN_PAPER_TRADES: "x" }), ConfigError);
  });
  test("paperDaysDone: whole days since first buy, 0 when none / future", () => {
    const now = Date.parse("2026-11-03T12:00:00.000Z");
    assert.equal(paperDaysDone(null, now), 0);
    assert.equal(paperDaysDone("2026-11-03T13:00:00.000Z", now), 0);
    assert.equal(paperDaysDone("2026-11-02T12:00:01.000Z", now), 0);
    assert.equal(paperDaysDone("2026-10-27T12:00:00.000Z", now), 7);
  });
});

for (const [label, env, days, trades] of [
  ["unset thresholds", {}, null, null],
  ["configured thresholds", { CENTURION_REAL_GATE_MIN_PAPER_DAYS: "7", CENTURION_REAL_GATE_MIN_PAPER_TRADES: "30" }, 7, 30],
] as const) {
  describe(`strategy reads carry the Real gate (${label})`, () => {
    let h: Harness;
    before(async () => {
      h = await startHarness({ ...env });
      await h.db.query("update public.strategies set first_buy_at = now() - interval '3 days 2 hours' where id = $1", [S1]);
    });
    after(async () => {
      await h?.stop();
    });
    const check = (w: any) => {
      assert.equal(w.mode, "practice");
      assert.equal(w.real_locked, true);
      assert.equal(w.real_locked_reason, "needs_owner_approval");
      assert.deepEqual(w.paper_progress, { days_done: 3, days_required: days, trades_done: 1, trades_required: trades });
    };
    test("GET /strategies/{id} and the list", async () => {
      const g = await call(h.base, "GET", path(`/${S1}`), { token: token(OWNER) });
      assert.equal(g.status, 200, JSON.stringify(g.body));
      check(g.body.data);
      const l = await call(h.base, "GET", path("?mode=practice"), { token: token(OWNER) });
      assert.equal(l.status, 200, JSON.stringify(l.body));
      const s1 = l.body.items.find((x: any) => x.id === S1);
      assert.ok(s1, "S1 in list");
      check(s1);
      for (const x of l.body.items) assert.equal(x.real_locked, true);
    });
  });
}
