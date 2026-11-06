// 0025: GET /positions carries a per-row mark for open positions.
// Additive to 1.1.6: mark_price_sol / unrealized_pnl_lamports / as_of are null
// when the mark is unknown (never 0); closed rows keep them null.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OWNER, POS, WS, call, startHarness, token, type Harness } from "./helpers.ts";

let h: Harness;
before(async () => {
  h = await startHarness();
});
after(async () => {
  await h?.stop();
});

const owner = () => token(OWNER, { client: "desktop" });
const MINT = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump"; // seed coin, decimals 6
const OBSERVED = "2026-11-06T01:02:03.456Z";

async function openPosition(): Promise<any> {
  const r = await call(h.base, "GET", `/v1/workspaces/${WS}/positions/${POS}`, { token: owner() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data;
}

describe("open position marks", () => {
  test("unknown mark: null, never 0; as_of null", async () => {
    const p = await openPosition();
    assert.equal(p.status, "open");
    assert.equal(p.mark_price_sol, null);
    assert.equal(p.unrealized_pnl_lamports, null);
    assert.equal(p.as_of, null);

    const list = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=open`, { token: owner() });
    assert.equal(list.status, 200);
    const row = list.body.items.find((x: any) => x.id === POS);
    assert.equal(row.mark_price_sol, null);
    assert.equal(row.unrealized_pnl_lamports, null);
    assert.equal(row.as_of, null);
  });

  test("open row: mark / unrealized / as_of from the latest SOL pool state", async () => {
    // 15 SOL / 1,000,000 whole tokens = 0.000015 SOL per token.
    await h.db.query(
      `insert into public.pool_states (mint, venue, sol_reserve, token_reserve, quote_mint, slot, observed_at)
       values ($1, 'curve', 15, 1000000, 'So11111111111111111111111111111111111111112', 7, $2)
       on conflict (mint) do update set sol_reserve = excluded.sol_reserve,
         token_reserve = excluded.token_reserve, quote_mint = excluded.quote_mint,
         slot = excluded.slot, observed_at = excluded.observed_at`,
      [MINT, OBSERVED],
    );
    const p = await openPosition();
    assert.equal(p.mark_price_sol, "0.000015000000000000");
    // qty 1,000,000,000 raw at 6 decimals = 1000 tokens -> 15,000,000 lamports; cost 250,000,000.
    assert.equal(p.unrealized_pnl_lamports, "-235000000");
    assert.equal(p.as_of, OBSERVED);
    // realized keys stay null on an open row
    assert.equal(p.pnl_lamports, null);
    assert.equal(p.hold_seconds, null);
  });

  test("closed row never carries an open mark", async () => {
    const closed = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed`, { token: owner() });
    const row = closed.body.items[0];
    assert.equal(row.mark_price_sol, null);
    assert.equal(row.unrealized_pnl_lamports, null);
    assert.equal(row.as_of, null);
    assert.equal(row.pnl_lamports, "100000000");
  });

  test("non-SOL quote and zero reserves are unknown marks", async () => {
    await h.db.query(
      `update public.pool_states set quote_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' where mint = $1`,
      [MINT],
    );
    let p = await openPosition();
    assert.equal(p.mark_price_sol, null);
    assert.equal(p.unrealized_pnl_lamports, null);
    assert.equal(p.as_of, null);

    await h.db.query(
      `update public.pool_states set quote_mint = 'So11111111111111111111111111111111111111112', token_reserve = 0 where mint = $1`,
      [MINT],
    );
    p = await openPosition();
    assert.equal(p.mark_price_sol, null);
    assert.equal(p.unrealized_pnl_lamports, null);
  });
});