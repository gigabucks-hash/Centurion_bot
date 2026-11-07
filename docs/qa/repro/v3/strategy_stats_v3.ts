/**
 * BUG_HUNT_v3 - http-mode strategy cards fabricate 0.00 realized PnL.
 *
 * Reproduces the real mapper (`httpApi.listStrategies`, apps/web/lib/http-api.ts) against the exact
 * JSON the paper API returned for GET /v1/workspaces/{ws}/strategies?mode=practice at HEAD 025e488
 * (captured from the scratch stack; see _captured_strategies.json): the wire object has NO `stats`.
 *
 * Expectation per F1 (unknown money -> em dash): realizedPnlSol should be null.
 * Observed: strategyFromWire hardcodes `realizedPnlSol: 0` (http-api.ts:103), and both
 *   - apps/web/app/(app)/strategies/(list)/page.tsx:50  <Pnl sol={s.realizedPnlSol} />   (unconditional)
 *   - apps/web/app/(app)/(dashboard)/page.tsx:109       status==="draft" ? "—" : <Pnl sol={s.realizedPnlSol} />
 * then print `0.00` for a running strategy whose PnL the server never reported.
 *
 * Run from C:\cw\app:
 *   node --import ./apps/web/node_modules/tsx/dist/loader.mjs docs/qa/repro/v3/strategy_stats_v3.ts
 */
import assert from "node:assert/strict";

process.env.API_WORKSPACE_ID = "ecd6941b-265f-4b47-a4a3-7cef9e8307b3"; // gitleaks:allow — fake fixture id, not a secret

// Exact item body from the live GET (no `stats`, as the backend strategy_wire() does not emit one).
const wire = {
  id: "b7c79484-1a7e-4e95-961f-e3da8b36b5b4",
  rev: 1,
  mode: "practice",
  name: "BB v3 probe",
  status: "running",
  settings: {},
  created_at: "2026-11-06T18:00:40.427Z",
  created_by: "04d24e74-45e4-47b5-be75-74fd0222dce4",
  updated_at: "2026-11-06T18:00:40.427Z",
  archived_at: null,
  first_buy_at: null,
  workspace_id: "ecd6941b-265f-4b47-a4a3-7cef9e8307b3",
  run_started_at: "2026-11-06T18:00:40.427Z",
  real_locked: true,
  real_locked_reason: "needs_owner_approval",
  paper_progress: { days_done: 0, days_required: null, trades_done: 1, trades_required: null },
};

const calls: string[] = [];
globalThis.fetch = (async (url: string | URL | Request) => {
  calls.push(String(url));
  return new Response(JSON.stringify({ items: [wire], next_cursor: null, server_now: new Date().toISOString() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

async function main() {
  const { httpApi } = await import("../../../../apps/web/lib/http-api.ts");
  const rows = await httpApi.listStrategies("practice");

  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /\/v1\/workspaces\/ecd6941b-265f-4b47-a4a3-7cef9e8307b3\/strategies\?mode=practice&limit=100$/);
  assert.equal(rows.length, 1);
  const s = rows[0]!;
  assert.equal(s.status, "running");
  assert.equal(s.trades, 0, "server sent no trades: mapper invented 0");

  // The defect: no stats on the wire, yet the card money is a number, so <Pnl> renders it as a real 0.00.
  assert.equal(s.realizedPnlSol, 0, "DEFECT: realized PnL fabricated as 0 (expected null)");
  assert.equal(s.unrealizedPnlSol, 0, "DEFECT: unrealized PnL fabricated as 0 (expected null)");

  console.log(JSON.stringify({
    ok: true,
    defect: "P2 strategy cards show 0.00 realized/unrealized when the API omits stats",
    wire_has_stats: "stats" in wire,
    mapped: { realizedPnlSol: s.realizedPnlSol, unrealizedPnlSol: s.unrealizedPnlSol, trades: s.trades },
    renders: [
      "apps/web/app/(app)/strategies/(list)/page.tsx:50 (unconditional)",
      "apps/web/app/(app)/(dashboard)/page.tsx:109 (non-draft)",
    ],
    expected: "null -> em dash, as in contracts.ts closedTradeFromWire / pnlSummaryFromWire / Pnl.tsx:21",
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});