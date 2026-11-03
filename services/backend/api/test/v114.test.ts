// Contracts 1.1.4 over REST: time_stop_s / stall_exit settings, market cap on coins and picks.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { APPROVAL, OWNER, WS, call, startHarness, token, type Harness } from "./helpers.ts";

let h: Harness;
const S1 = "20000000-0000-0000-0000-0000000000a1";
const M1 = "Mc11LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";
const M2 = "Mc22LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";
const owner = () => token(OWNER, { client: "desktop" });

before(async () => {
  h = await startHarness();
  await h.db.query(`insert into public.coins (mint, venue, decimals, market_cap_lamports, mcap_usd, mcap_as_of)
                    values ($1, 'amm', 6, 425000000000, 212500, '2025-10-29T01:06:40Z'), ($2, 'curve', null, null, null, null)`, [M1, M2]);
  await h.db.query(`insert into public.picks (ck, workspace_id, strategy_id, mint, stage, market_cap_lamports, mcap_usd, mcap_as_of)
                    values ('mc1', $1, $2, $3, 'passed', 425000000000, 212500, '2025-10-29T01:06:40Z'), ('mc2', $1, $2, $4, 'rejected', null, null, null)`, [WS, S1, M1, M2]);
});
after(async () => {
  await h?.stop();
});

describe("contracts 1.1.4", () => {
  test("healthz reports 1.1.4", async () => {
    assert.equal((await call(h.base, "GET", "/healthz")).body.contracts_version, "1.1.6");
  });

  test("coin and pick carry market_cap_lamports (string), mcap_usd (decimal string), mcap_as_of", async () => {
    const c = await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${M1}`, { token: owner() });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.data.market_cap_lamports, "425000000000");
    assert.equal(c.body.data.mcap_usd, "212500");
    assert.equal(c.body.data.mcap_as_of, "2025-10-29T01:06:40.000Z");
    const u = await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${M2}`, { token: owner() });
    assert.deepEqual([u.body.data.market_cap_lamports, u.body.data.mcap_usd, u.body.data.mcap_as_of], [null, null, null]);
    const p = await call(h.base, "GET", `/v1/workspaces/${WS}/picks?limit=100`, { token: owner() });
    const pk = p.body.items.find((x: any) => x.mint === M1);
    assert.equal(pk.market_cap_lamports, "425000000000");
    assert.equal(pk.mcap_usd, "212500");
    const list = await call(h.base, "GET", `/v1/workspaces/${WS}/coins?window=all`, { token: owner() });
    assert.equal(list.body.items.find((x: any) => x.mint === M1).market_cap_lamports, "425000000000");
  });

  test("approvals carry the quote fields (null until set; set_approval_quote fills them)", async () => {
    const a = await call(h.base, "GET", `/v1/workspaces/${WS}/approvals/${APPROVAL}`, { token: owner() });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    for (const k of ["est_network_fee_lamports", "priority_fee_lamports", "swap_fee_bps", "max_slippage_bps", "min_out_raw", "total_max_lamports", "quote_ts", "quote_expires_at"]) {
      assert.ok(k in a.body.data && a.body.data[k] === null, k);
    }
    const st = await h.db.query("select status from public.approvals where id = $1", [APPROVAL]);
    if (st.rows[0].status !== "pending") return;
    await h.db.query(`select public.set_approval_quote($1, '{"est_network_fee_lamports":"25000","swap_fee_bps":125,"quote_ts":"2026-10-29T11:00:00Z","quote_expires_at":"2026-10-29T11:00:15Z"}')`, [APPROVAL]);
    const b = await call(h.base, "GET", `/v1/workspaces/${WS}/approvals/${APPROVAL}`, { token: owner() });
    assert.equal(b.body.data.est_network_fee_lamports, "25000");
    assert.equal(b.body.data.swap_fee_bps, 125);
    assert.equal(b.body.data.quote_expires_at, "2026-10-29T11:00:15.000Z");
    // 1.1.5: a quote refresh bumps quote_id, never rev
    assert.equal(b.body.data.rev, a.body.data.rev);
    assert.equal(BigInt(b.body.data.quote_id), BigInt(a.body.data.quote_id) + 1n);
  });

  test("time_stop_s / stall_exit validate like the SQL schema", async () => {
    const path = `/v1/workspaces/${WS}/strategies/${S1}`;
    const rev = (await call(h.base, "GET", path, { token: owner() })).body.data.rev;
    const patch = (settings_patch: object, r: number) =>
      call(h.base, "PATCH", path, { token: owner(), headers: { "idempotency-key": randomUUID(), "if-match": `"${r}"` }, body: { settings_patch } });
    for (const bad of [{ time_stop_s: 0 }, { time_stop_s: 1.5 }, { stall_exit: { window_s: 60 } }, { stall_exit: { window_s: 60, min_move_pct: 0 } }]) {
      const r = await patch(bad, rev);
      assert.equal(r.status, 422, `${JSON.stringify(bad)} -> ${JSON.stringify(r.body)}`);
      assert.equal(r.body.error.code, "VALIDATION_FAILED");
    }
    const ok = await patch({ time_stop_s: 900, stall_exit: { window_s: 120, min_move_pct: 1.5 } }, rev);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.settings.time_stop_s, 900);
    assert.deepEqual(ok.body.data.settings.stall_exit, { window_s: 120, min_move_pct: 1.5 });
    const off = await patch({ time_stop_s: null, stall_exit: null }, rev + 1);
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal("time_stop_s" in off.body.data.settings, false, "merge-patch null removes the key (off)");
  });
});
