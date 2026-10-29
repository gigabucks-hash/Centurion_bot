// Contracts 1.1.5: quote_id without rev bumps, POST .../quote (coalesced 3 s), auto-refresh on GET, decimals and
// token_program on ApprovalWire, ATA rent in total_max, sell close preview, mcap_source, expected_quote_id.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OWNER, POS, WS, call, startHarness, token, type Harness } from "./helpers.ts";

const M1 = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump"; // seeded, decimals 6, open position POS
const M2 = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"; // no position -> ATA rent
const Q1 = "30000000-0000-0000-0000-0000000115a1";
const Q2 = "30000000-0000-0000-0000-0000000115a2";

describe("contracts 1.1.5 quotes", () => {
  let h: Harness;
  const tok = () => token(OWNER);
  before(async () => {
    h = await startHarness();
    await h.db.query(`insert into public.coins (mint, venue, decimals, token_program) values ($1, 'amm', 9, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')`, [M2]);
    for (const [m, s, t] of [[M1, 30, 1_073_000_000], [M2, 85.5, 206_900_000]] as const) {
      await h.db.query("select public.upsert_pool_state($1, 'curve', $2, $3, null, 1, now())", [m, s, t]);
    }
    await h.db.query(
      `insert into public.approvals (id, workspace_id, strategy_id, kind, subject, mint, amount_lamports, expires_at) values
        ($1, $3, '20000000-0000-0000-0000-0000000000a1', 'buy_pick', 'q115a', $4, 50000000, now() + interval '10 minutes'),
        ($2, $3, '20000000-0000-0000-0000-0000000000a1', 'buy_pick', 'q115b', $5, 50000000, now() + interval '10 minutes')`,
      [Q1, Q2, WS, M2, M1]);
  });
  after(async () => h.stop());
  const base = (id: string) => `/v1/workspaces/${WS}/approvals/${id}`;
  const backdate = (id: string) => h.db.query(
    "update public.approvals set quote_refreshed_at = quote_refreshed_at - interval '4 seconds', quote_id = quote_id + 1 where id = $1", [id]);

  test("GET refreshes a missing quote; rent when the token account does not exist; decimals + token_program", async () => {
    const g = await call(h.base, "GET", base(Q1), { token: tok() });
    assert.equal(g.status, 200, JSON.stringify(g.body));
    const a = g.body.data;
    assert.equal(a.quote_id, "1");
    assert.equal(a.rev, 1, "rev unchanged by the refresh");
    assert.equal(a.decimals, 9);
    assert.equal(a.token_program, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    assert.equal(a.est_ata_rent_lamports, "2039280");
    assert.equal(a.est_network_fee_lamports, "25000");
    assert.equal(a.total_max_lamports, String(50_000_000 + 25_000 + 2_039_280));
    assert.ok(/^\d+$/.test(a.min_out_raw) && a.min_out_raw !== "0");
    const b = (await call(h.base, "GET", base(Q2), { token: tok() })).body.data;
    assert.equal(b.est_ata_rent_lamports, "0", "open position in the mint = token account exists");
    assert.equal(b.total_max_lamports, String(50_000_000 + 25_000));
  });

  test("POST quote: coalesced within 3 s, then quote_id + 1 with rev unchanged and one proposal.updated each", async () => {
    const q = await call(h.base, "POST", `${base(Q1)}/quote`, { token: tok(), body: {} });
    assert.equal(q.status, 200, JSON.stringify(q.body));
    assert.equal(q.body.data.quote_id, "1", "coalesced");
    await backdate(Q1); // quote_id now 2 (test-only bump keeps the guard's +1 rule)
    const q2 = await call(h.base, "POST", `${base(Q1)}/quote`, { token: tok(), body: {} });
    assert.equal(q2.body.data.quote_id, "3");
    assert.equal(q2.body.data.rev, 1);
    const ev = await h.db.query("select payload from public.events where type = 'proposal.updated' and payload ->> 'proposal_id' = $1 order by seq", [Q1]);
    assert.equal(ev.rows.length, 2);
    assert.equal(ev.rows[1].payload.quote_id, "3");
    assert.equal(ev.rows[1].payload.rev, 1);
    assert.equal(ev.rows[1].payload.decimals, 9);
    assert.equal((await call(h.base, "POST", `${base(Q1)}/quote`, { token: tok(), body: { x: 1 } })).status, 422);
    assert.equal((await call(h.base, "POST", `${base(Q1)}/quote`, { token: token(OWNER, { scopes: ["read"] }), body: {} })).status, 403);
  });

  test("a decision token issued before a refresh still works (rev unchanged); practice ignores expected_quote_id", async () => {
    const g = await call(h.base, "GET", base(Q2), { token: tok() });
    const t = g.body.data.decision_token as string;
    await backdate(Q2);
    assert.equal((await call(h.base, "POST", `${base(Q2)}/quote`, { token: tok(), body: {} })).body.data.quote_id, "3");
    const bad = await call(h.base, "POST", `${base(Q2)}/decision`, {
      token: tok(), headers: { "idempotency-key": "k115-bad-0000000001" },
      body: { decision: "approve", token: t, expected_rev: 1, expected_quote_id: "x1" },
    });
    assert.equal(bad.status, 422);
    const ok = await call(h.base, "POST", `${base(Q2)}/decision`, {
      token: tok(), headers: { "idempotency-key": "k115-ok-00000000001" },
      body: { decision: "approve", token: t, expected_rev: 1, expected_quote_id: "1" },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.status, "approved");
    const late = await call(h.base, "POST", `${base(Q2)}/quote`, { token: tok(), body: {} });
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, "APPROVAL_ALREADY_DECIDED");
  });

  test("no or old pool state -> 503 POOL_STALE", async () => {
    await h.db.query("update public.pool_states set observed_at = now() - interval '5 minutes' where mint = $1", [M2]);
    await backdate(Q1);
    const r = await call(h.base, "POST", `${base(Q1)}/quote`, { token: tok(), body: {} });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, "POOL_STALE");
    assert.equal(r.body.error.reason, "too_old");
    await h.db.query("update public.pool_states set observed_at = now() where mint = $1", [M2]);
  });

  test("close preview: expected SOL out and min_out_lamports, 15 s TTL, strict body", async () => {
    const path = `/v1/workspaces/${WS}/positions/${POS}/close/preview`;
    const r = await call(h.base, "POST", path, { token: tok(), body: { fraction_bps: 5000, max_slippage_bps: 300 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const q = r.body.data;
    assert.equal(q.qty_raw, "500000000");
    assert.equal(q.decimals, 6);
    const gross = 30 * 500 / (1_073_000_000 + 500);
    const want = Math.floor(gross * (1 - 0.0125) * 1e9);
    assert.equal(q.expected_out_lamports, String(want));
    assert.equal(q.min_out_lamports, String(Math.floor(want * 0.97)));
    assert.equal(q.total_max_lamports, "25000");
    assert.equal(Date.parse(q.quote_expires_at) - Date.parse(q.quote_ts), 15_000);
    assert.equal((await call(h.base, "POST", path, { token: tok(), body: { sell_pct: 50 } })).status, 422);
    assert.equal((await call(h.base, "POST", path, { token: tok(), body: { fraction_bps: 0 } })).status, 422);
  });

  test("mcap_source on coins: unavailable when market_cap_lamports is null, else curve|pool", async () => {
    await h.db.query("update public.coins set market_cap_lamports = 1000, mcap_as_of = now() where mint = $1", [M1]);
    const src = async (m: string) => (await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${m}?mode=practice`, { token: tok() })).body.data?.mcap_source;
    assert.equal(await src(M1), "curve");
    assert.equal(await src(M2), "unavailable");
    await h.db.query("update public.coins set venue = 'amm' where mint = $1", [M1]);
    assert.equal(await src(M1), "pool");
  });
});
