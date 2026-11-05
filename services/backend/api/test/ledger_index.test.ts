// PF (0023): the closed ledger must be produced by the index, not by sorting the workspace's closed rows.
// These tests are plan evidence, not a claim: they run EXPLAIN on the same SQL shape the route sends,
// with the same bound parameters.
//
// Known limitation, measured on 2026-11-06 with 20k closed positions: with the `positions_select` RLS policy
// active the API read still sorts (8 ms; 0.04 ms through the index without RLS). RLS adds
// `workspace_id = any((select my_workspace_ids()))`, and a ScalarArrayOp prevents the planner from proving the
// single-workspace equality that the index order needs. That plan is therefore not asserted here; closing it
// needs a policy change or a security-definer read path (see the result report).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, WS, OTHER_WS } from "./helpers.ts";
import { createPool, type Db } from "../src/db.ts";

const STRATEGY = "20000000-0000-0000-0000-0000000000a1";
const MINT = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";
const SORT_INDEX = "positions_closed_ws_mode_sort_idx";
const CLOSE_INDEX = "positions_closed_ws_mode_close_idx";

// Verbatim shape of GET /positions in routes.ts (aliases aside): same predicates, same ORDER BY, same LIMIT.
const LEDGER = `select p.id, p.status, p.closed_at, coalesce(p.closed_at, p.opened_at) as sort_ts
  from public.positions p
 where p.workspace_id = $1 and p.mode = $2::public.trade_mode
   and ($3::public.position_status is null or p.status = $3::public.position_status)
   and ($4::uuid is null or p.strategy_id = $4)
   and p.practice_epoch = coalesce($5::int, (select practice_epoch from public.workspaces where id = $1))
   and ($6::timestamptz is null or coalesce(p.closed_at, p.opened_at) >= $6)
   and ($7::timestamptz is null or coalesce(p.closed_at, p.opened_at) < $7)
   and ($8::timestamptz is null or (coalesce(p.closed_at, p.opened_at), p.id) < ($8::timestamptz, $9::uuid))
 order by coalesce(p.closed_at, p.opened_at) desc, p.id desc
 limit $10`;

// The aggregate pnl_summary() runs over the same closed rows, but filters on closed_at, not the coalesce.
const WINDOW_SUM = `select count(*), sum(p.sol_out_lamports - p.sol_in_lamports)
  from public.positions p
 where p.workspace_id = $1 and p.status = 'closed' and p.archived_at is null
   and p.practice_epoch = (select practice_epoch from public.workspaces where id = $1)
   and p.exit_reason <> 'practice_reset'
   and p.mode = 'practice'::public.trade_mode
   and p.closed_at >= $2 and p.closed_at < $3`;

interface PlanNode {
  "Node Type": string;
  "Index Name"?: string;
  "Relation Name"?: string;
  Plans?: PlanNode[];
}

let db: Db;

function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

async function explainAsOwner(text: string, values: unknown[]): Promise<PlanNode> {
  const r = await db.query<{ "QUERY PLAN": { Plan: PlanNode }[] }>({ text: `explain (format json) ${text}`, values });
  return r.rows[0]!["QUERY PLAN"][0]!.Plan;
}



before(async () => {
  db = createPool(resetDatabase());
  // Enough closed rows that a seq scan + Sort would be the obvious alternative; one quarter in a second
  // workspace so the workspace predicate has real selectivity.
  await db.query(
    `insert into public.positions
       (position_key, strategy_id, workspace_id, mint, status, qty_raw, sol_in_lamports, sol_out_lamports,
        fees_lamports, entry_price_sol, exit_price_sol, exit_reason, opened_at, closed_at)
     select 'bulk.' || g, $1::uuid, case when g % 4 = 0 then $2::uuid else $3::uuid end, $4::text, 'closed',
            1000000, 250000000, 260000000, 400000, 0.00000025, 0.00000026, 'max_hold',
            timestamptz '2026-01-01T00:00:00Z' + (g || ' seconds')::interval,
            timestamptz '2026-01-01T00:00:00Z' + (g || ' seconds')::interval + interval '90 seconds'
       from generate_series(1, 20000) g`,
    [STRATEGY, OTHER_WS, WS, MINT],
  );
  // Open rows share the workspace and must not be reached by the closed partial index.
  await db.query(
    `insert into public.positions
       (position_key, strategy_id, workspace_id, mint, status, qty_raw, sol_in_lamports, entry_price_sol, opened_at)
     select 'open.' || g, $1::uuid, $2::uuid, $3::text, 'open', 1000000, 250000000, 0.00000025,
            timestamptz '2026-02-01T00:00:00Z' + (g || ' seconds')::interval
       from generate_series(1, 2000) g`,
    [STRATEGY, WS, MINT],
  );
  await db.query("analyze public.positions");
});

after(async () => {
  await db.end();
});

test("closed ledger first page: index order, no Sort node", async () => {
  const plan = await explainAsOwner(LEDGER, [WS, "practice", "closed", null, null, null, null, null, null, 51]);
  const all = nodes(plan);
  const indexes = all.flatMap((n) => (n["Index Name"] ? [n["Index Name"]] : []));

  assert.ok(indexes.includes(SORT_INDEX), `expected ${SORT_INDEX}, plan used: ${indexes.join(", ") || plan["Node Type"]}`);
  assert.ok(!all.some((n) => n["Node Type"] === "Sort"), "the ledger must not sort after scanning");
  assert.ok(all.some((n) => n["Node Type"] === "Limit"), "limit must stay in the plan");
});

test("closed ledger keyset page: cursor seek uses the same index, no Sort", async () => {
  const cursorTs = new Date(Date.parse("2026-01-01T05:00:00Z"));
  const plan = await explainAsOwner(LEDGER, [WS, "practice", "closed", null, null, null, null, cursorTs, "60000000-0000-0000-0000-0000000000b1", 51]);
  const all = nodes(plan);
  const indexes = all.flatMap((n) => (n["Index Name"] ? [n["Index Name"]] : []));
  assert.ok(indexes.includes(SORT_INDEX), `cursor page must seek ${SORT_INDEX}, used: ${indexes.join(", ")}`);
  assert.ok(!all.some((n) => n["Node Type"] === "Sort"), "cursor page must not sort");
});

test("closed ledger with strategy filter and window keeps index order", async () => {
  const from = new Date(Date.parse("2026-01-01T00:00:00Z"));
  const to = new Date(Date.parse("2026-01-02T00:00:00Z"));
  const plan = await explainAsOwner(LEDGER, [WS, "practice", "closed", STRATEGY, null, from, to, null, null, 51]);
  const all = nodes(plan);
  const indexes = all.flatMap((n) => (n["Index Name"] ? [n["Index Name"]] : []));
  assert.ok(indexes.includes(SORT_INDEX), `windowed page must use ${SORT_INDEX}, used: ${indexes.join(", ")}`);
  assert.ok(!all.some((n) => n["Node Type"] === "Sort"), "window filter must not force a sort");
});

test("window aggregate (pnl_summary shape) reads close-time index", async () => {
  const from = new Date(Date.parse("2026-01-01T00:00:00Z"));
  const to = new Date(Date.parse("2026-01-01T00:16:40Z"));
  const plan = await explainAsOwner(WINDOW_SUM, [WS, from, to]);
  const indexes = nodes(plan).flatMap((n) => (n["Index Name"] ? [n["Index Name"]] : []));
  assert.ok(indexes.includes(CLOSE_INDEX), `window sum must read ${CLOSE_INDEX}, used: ${indexes.join(", ")}`);
});

test("open positions do not use the closed partial index", async () => {
  const plan = await explainAsOwner(LEDGER, [WS, "practice", "open", null, null, null, null, null, null, 51]);
  const indexes = nodes(plan).flatMap((n) => (n["Index Name"] ? [n["Index Name"]] : []));
  assert.ok(!indexes.includes(SORT_INDEX), "the closed partial index must not serve open positions");
});