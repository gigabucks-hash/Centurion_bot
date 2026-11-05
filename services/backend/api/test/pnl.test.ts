// 0022: PnL card / report backend — realized fields on closed positions, windowed ledger,
// /stats/pnl summary, and one realized definition shared by REST, /stats and the position.closed event.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OUTSIDER, OWNER, POS, WS, call, startHarness, token, type Harness } from "./helpers.ts";

let h: Harness;
before(async () => {
  h = await startHarness();
});
after(async () => {
  await h?.stop();
});

const owner = () => token(OWNER, { client: "desktop" });
const isIso = (s: unknown) => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s);
const OLD = "60000000-0000-0000-0000-0000000000b2";

/** A second closed trade, nine days old and a loss, so range filters and win rate have something to exclude. */
async function seedOldClosed(): Promise<void> {
  await h.db.query(
    `insert into public.positions
       (id, position_key, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports, sol_out_lamports,
        cost_basis_lamports, fees_lamports, entry_price_sol, exit_price_sol, status, exit_reason,
        opened_at, closed_at)
     values ($1, 'pnlold.2', '20000000-0000-0000-0000-0000000000a1', $2,
             'Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 0, 200000000, 150000000,
             0, 2500000, '0.0000002', '0.00000015', 'closed', 'loss_guard',
             now() - interval '10 days', now() - interval '9 days')`,
    [OLD, WS],
  );
}

describe("closed-trade ledger", () => {
  test("closed rows carry realized pnl / pct / hold; open rows carry null", async () => {
    const closed = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed`, { token: owner() });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.items.length, 1);
    const p = closed.body.items[0];
    assert.equal(p.status, "closed");
    assert.equal(p.pnl_lamports, "100000000", "600000000 sol_out - 500000000 sol_in");
    assert.equal(p.pnl_pct, 20);
    assert.equal(p.hold_seconds, 90);
    assert.equal(p.exit_reason, "profit_target");
    assert.equal(p.fees_lamports, "0");

    const open = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=open`, { token: owner() });
    const o = open.body.items[0];
    assert.equal(o.pnl_lamports, null);
    assert.equal(o.pnl_pct, null);
    assert.equal(o.hold_seconds, null);
  });

  test("?window= filters by closed_at and orders newest close first; cursor pages by close time", async () => {
    await seedOldClosed();
    const week = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed&window=7d`, { token: owner() });
    assert.equal(week.status, 200);
    assert.deepEqual(week.body.items.map((x: any) => x.pnl_lamports), ["100000000"], "9-day-old loss excluded");

    const all = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed&window=all`, { token: owner() });
    assert.deepEqual(all.body.items.map((x: any) => x.id), ["60000000-0000-0000-0000-0000000000a2", OLD], "newest close first");

    const page1 = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed&window=all&limit=1`, { token: owner() });
    assert.equal(page1.body.items[0].id, "60000000-0000-0000-0000-0000000000a2");
    assert.ok(page1.body.next_cursor);
    const page2 = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed&window=all&limit=1&cursor=${page1.body.next_cursor}`, { token: owner() });
    assert.equal(page2.body.items[0].id, OLD, "cursor follows closed_at, so no row is skipped");

    const future = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed&from=2099-01-01T00:00:00Z`, { token: owner() });
    assert.equal(future.body.items.length, 0);

    const bad = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed&window=3m`, { token: owner() });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error.code, "VALIDATION_FAILED");
  });
});

describe("GET /stats/pnl", () => {
  test("7d default: snapshot realized/unrealized/total + windowed closed-trade stats", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl`, { token: token(OWNER, { scopes: ["read"] }) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = r.body.data;
    assert.equal(d.mode, "practice");
    assert.equal(d.practice_epoch, 0);
    assert.equal(d.window, "7d");
    assert.ok(isIso(d.from));
    assert.equal(d.to, null);
    assert.equal(d.unrealized_pnl_lamports, "-50000000");
    assert.equal(d.realized_pnl_lamports, "100000000");
    assert.equal(d.total_pnl_lamports, "50000000", "total is the exact lamport sum, not a float");
    assert.equal(d.realized_pnl_window_lamports, "100000000");
    assert.equal(d.closed_count, 1);
    assert.equal(d.win_count, 1);
    assert.equal(d.win_rate_pct, 100);
    assert.equal(d.avg_hold_s, 90);
    assert.equal(d.fees_lamports, "0");
    assert.equal(d.best_pnl_lamports, "100000000");
    assert.equal(d.worst_pnl_lamports, "100000000");
    assert.equal(d.as_of_seq, "1");
    assert.ok(isIso(d.ts));
  });

  test("window=all includes the older loss; win rate is the closed-trade ratio", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?window=all`, { token: owner() });
    const d = r.body.data;
    assert.equal(d.window, "all");
    assert.equal(d.closed_count, 2);
    assert.equal(d.win_count, 1);
    assert.equal(d.win_rate_pct, 50);
    assert.equal(d.realized_pnl_window_lamports, "50000000", "100000000 - 50000000");
    assert.equal(d.fees_lamports, "2500000");
    assert.equal(d.best_pnl_lamports, "100000000");
    assert.equal(d.worst_pnl_lamports, "-50000000");
    assert.equal(d.realized_pnl_lamports, "100000000", "snapshot (all-time) is unchanged by the range");
  });

  test("an empty range returns zeros and null stats, never a fake 0 %", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?from=2099-01-01T00:00:00Z`, { token: owner() });
    const d = r.body.data;
    assert.equal(d.window, null);
    assert.equal(d.closed_count, 0);
    assert.equal(d.win_count, 0);
    assert.equal(d.win_rate_pct, null);
    assert.equal(d.avg_hold_s, null);
    assert.equal(d.best_pnl_lamports, null);
    assert.equal(d.worst_pnl_lamports, null);
    assert.equal(d.realized_pnl_window_lamports, "0");
    assert.equal(d.fees_lamports, "0");
  });

  test("scope, membership and params", async () => {
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?strategy_id=nope`, { token: owner() })).status, 422);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?window=1y`, { token: owner() })).status, 422);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl`, { token: token(OWNER, { scopes: [] }) })).status, 403);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl`, { token: token(OUTSIDER) })).status, 404);
  });
});

describe("one realized definition", () => {
  test("a close emits position.closed with pnl = sol_out - sol_in and the REST receipt matches", async () => {
    const queued = await call(h.base, "POST", `/v1/workspaces/${WS}/positions/${POS}/close`, {
      token: owner(),
      headers: { "if-match": '"1"', "idempotency-key": "pnl-close-key-0001" },
      body: {},
    });
    assert.equal(queued.status, 200, JSON.stringify(queued.body));
    const orderId = queued.body.order_id;

    // sol_out 300M, sol_in 250M, fees 5,005,000 (swap 5M + network 5k).
    // pnl must be 50M: the swap fee is already netted out of sol_out, so fees are reported, never subtracted again.
    const r = await h.db.query(
      "select public.complete_order_fill($1, 1000000000, 300000000, 0.0000003, 0.0000003, 0, 0, 5000000, 5000, 100) as r",
      [orderId],
    );
    assert.equal(r.rows[0].r.position.status, "closed");

    const ev = await h.db.query(
      "select payload from public.events where type = 'position.closed' order by seq desc limit 1",
    );
    assert.equal(ev.rows[0].payload.pnl_lamports, "50000000");
    assert.equal(Number(ev.rows[0].payload.pnl_pct), 20);
    assert.ok(Number(ev.rows[0].payload.hold_seconds) >= 0);

    const receipt = await call(h.base, "GET", `/v1/workspaces/${WS}/positions/${POS}`, { token: owner() });
    assert.equal(receipt.body.data.pnl_lamports, "50000000", "receipt and event cannot disagree");
    assert.equal(receipt.body.data.pnl_pct, 20);
    assert.equal(receipt.body.data.fees_lamports, "5005000");

    const stats = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?window=all`, { token: owner() });
    assert.equal(stats.body.data.realized_pnl_window_lamports, "100000000", "100M - 50M + 50M ledger sum");
    assert.equal(stats.body.data.closed_count, 3);
  });
});

describe("mode and practice-epoch isolation", () => {
  test("real mode is refused; a practice reset hides the archived epoch from summary and ledger", async () => {
    const real = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?mode=real`, { token: owner() });
    assert.equal(real.status, 403);
    assert.equal(real.body.error.code, "REAL_SOL_DISABLED");

    const before = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?window=all`, { token: owner() });
    assert.equal(before.body.data.closed_count, 3);

    // Same state reset_practice leaves behind: every position archived, workspaces.practice_epoch + 1,
    // and a fresh zero snapshot stamped with the new epoch.
    await h.db.query("update public.positions set archived_at = now() where workspace_id = $1 and archived_at is null", [WS]);
    await h.db.query("update public.workspaces set practice_epoch = practice_epoch + 1 where id = $1", [WS]);
    await h.db.query(
      `insert into public.portfolio_snapshots (workspace_id, ts, cash_lamports, positions_cost_lamports,
         positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports,
         unrealized_pnl_lamports, open_positions, as_of_seq)
       values ($1, now(), 30000000000, 0, 0, 30000000000, 30000000000, 0, 0, 0, 0, 0)`,
      [WS],
    );

    const archived = await h.db.query(
      "select count(*)::int as n from public.positions where workspace_id = $1 and archived_at is not null",
      [WS],
    );
    assert.ok(archived.rows[0].n >= 3, "the closed ledger of the old epoch still exists, archived");

    const after = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?window=all`, { token: owner() });
    const d = after.body.data;
    assert.equal(d.practice_epoch, 1);
    assert.equal(d.closed_count, 0, "old-epoch closes never count in the new epoch");
    assert.equal(d.realized_pnl_window_lamports, "0");
    assert.equal(d.realized_pnl_lamports, "0");
    assert.equal(d.unrealized_pnl_lamports, "0");
    assert.equal(d.total_pnl_lamports, "0");
    assert.equal(d.win_rate_pct, null);
    assert.equal(d.avg_hold_s, null);

    const ledger = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=closed&window=all`, { token: owner() });
    assert.equal(ledger.body.items.length, 0, "the closed ledger is current-epoch only");

    // A close in the new epoch is the only one the report sees.
    await h.db.query(
      `insert into public.positions
         (id, position_key, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports, sol_out_lamports,
          cost_basis_lamports, fees_lamports, entry_price_sol, exit_price_sol, status, exit_reason,
          opened_at, closed_at)
       values ('60000000-0000-0000-0000-0000000000c1', 'pnlnew.1', '20000000-0000-0000-0000-0000000000a1', $1,
               'Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 0, 100000000, 120000000,
               0, 0, '0.0000001', '0.00000012', 'closed', 'profit_target',
               now() - interval '60 seconds', now())`,
      [WS],
    );
    const fresh = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/pnl?window=all`, { token: owner() });
    assert.equal(fresh.body.data.closed_count, 1);
    assert.equal(fresh.body.data.realized_pnl_window_lamports, "20000000");
    assert.equal(fresh.body.data.win_rate_pct, 100);
  });
});
