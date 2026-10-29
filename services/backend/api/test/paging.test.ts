// Keyset cursor paging for every list endpoint: limit=2 pages cover every row exactly once (ties included).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OWNER, POS, WS, call, startHarness, token, type Harness } from "./helpers.ts";

let h: Harness;
const S1 = "20000000-0000-0000-0000-0000000000a1";
const MINT = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";
const mints = ["Pg1a", "Pg1b", "Pg1c"].map((p) => p + MINT.slice(4));

before(async () => {
  h = await startHarness();
  const q = (s: string, v: unknown[] = []) => h.db.query(s, v);
  // same created_at for several rows: ties must not skip or repeat
  await q(`insert into public.strategies (workspace_id, name, status, settings, created_at)
           select $1, 'P' || g, 'paused', '{}', '2026-10-01T00:00:00Z' from generate_series(1, 5) g`, [WS]);
  for (const m of mints) await q(`insert into public.coins (mint, venue, decimals, token_program) values ($1, 'curve', 6, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')`, [m]);
  await q(`insert into public.picks (ck, workspace_id, strategy_id, mint, stage, created_at)
           select 'pg' || row_number() over (), $1, id, $2, 'passed', '2026-10-02T00:00:00Z' from public.strategies where name like 'P_'`, [WS, MINT]);
  await q(`insert into public.picks (ck, workspace_id, strategy_id, mint, stage, created_at) values
           ('pgx1', $1, $2, $3, 'passed', '2026-10-02T00:00:01Z'), ('pgx2', $1, $2, $4, 'passed', '2026-10-02T00:00:01Z')`, [WS, S1, mints[0], mints[1]]);
  await q(`insert into public.fills (position_id, workspace_id, side, sol_lamports, token_amount_raw, exec_price_sol, created_at)
           select $1, $2, 'buy', 1000000, 10, 0.0000001, '2026-10-03T00:00:00Z' from generate_series(1, 5)`, [POS, WS]);
  await q(`insert into public.guard_changes (workspace_id, strategy_id, from_rev, diff, created_at)
           select $1, $2, 1, '[]', '2026-10-04T00:00:00Z' from generate_series(1, 5)`, [WS, S1]);
  await q(`insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target)
           select $1, $2, 'user', 'web', 'paging.test', 'x', g::text from generate_series(1, 5) g`, [WS, OWNER]);
  await q(`insert into public.practice_resets (workspace_id, from_epoch, to_epoch, starting_lamports, actor_user, archived, created_at)
           select $1, g, g + 1, 30000000000, $2, '{}', '2026-09-01T00:00:00Z' from generate_series(1, 5) g`, [WS, OWNER]);
  await q(`insert into public.device_tokens (user_id, device_id, platform, provider, token, token_sha256, app_version, created_at)
           select $1, 'paging-dev-' || g, 'ios', 'apns', 'tok-' || g || repeat('x', 30), digest('tok-' || g, 'sha256'), '1.0.0', '2026-10-05T00:00:00Z'
             from generate_series(1, 5) g`, [OWNER]);
  await q(`insert into public.approvals (workspace_id, strategy_id, kind, subject, amount_lamports, expires_at)
           select $1, $2, 'buy_pick', 'pgap' || g, 1000000, now() + interval '1 hour' from generate_series(1, 5) g`, [WS, S1]);
});
after(async () => {
  await h?.stop();
});

async function walk(path: string, tok = token(OWNER, { client: "desktop" })) {
  const seen: any[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await call(h.base, "GET", `${path}${sep}limit=2${cursor ? `&cursor=${cursor}` : ""}`, { token: tok });
    assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.items.length <= 2);
    seen.push(...r.body.items);
    cursor = r.body.next_cursor;
    if (!cursor) return seen;
    assert.match(cursor, /^[A-Za-z0-9_-]+$/);
  }
  throw new Error("did not terminate");
}

describe("cursor paging", () => {
  const cases: [string, (x: any) => string, number][] = [
    [`/v1/workspaces/${WS}/strategies`, (x) => x.id, 6],
    [`/v1/workspaces/${WS}/picks`, (x) => x.id, 7],
    [`/v1/workspaces/${WS}/coins?window=all`, (x) => x.mint, 3],
    [`/v1/workspaces/${WS}/fills?window=all`, (x) => x.id, 5],
    [`/v1/workspaces/${WS}/guard-changes`, (x) => x.id, 5],
    [`/v1/workspaces/${WS}/audit-log?action=paging.test`, (x) => x.id, 5],
    [`/v1/workspaces/${WS}/practice/resets`, (x) => x.id, 5],
    [`/v1/devices`, (x) => x.id, 5],
    [`/v1/workspaces/${WS}/approvals?status=pending`, (x) => x.id, 7],
    [`/v1/workspaces/${WS}/approvals`, (x) => x.id, 7],
    [`/v1/workspaces/${WS}/strategies/${S1}/revisions`, (x) => String(x.rev), 1],
  ];
  for (const [path, idOf, n] of cases) {
    test(`${path} pages cover every row once`, async () => {
      const all = await walk(path);
      const ids = all.map(idOf);
      assert.equal(new Set(ids).size, ids.length, "no duplicates");
      assert.equal(ids.length, n, `expected ${n} rows, got ${ids.length}`);
    });
  }

  test("pending approvals page soonest-expiry first; others newest first", async () => {
    const pend = await walk(`/v1/workspaces/${WS}/approvals?status=pending`);
    for (let i = 1; i < pend.length; i++) assert.ok(Date.parse(pend[i].expires_at) >= Date.parse(pend[i - 1].expires_at));
    const picks = await walk(`/v1/workspaces/${WS}/picks`);
    for (let i = 1; i < picks.length; i++) assert.ok(Date.parse(picks[i].created_at) <= Date.parse(picks[i - 1].created_at));
  });

  test("malformed or wrong-kind cursors are 400 CURSOR_INVALID", async () => {
    const tok = token(OWNER);
    for (const c of ["nope", Buffer.from("2026-10-01T00:00:00Z|123").toString("base64url"), "x".repeat(300)]) {
      const r = await call(h.base, "GET", `/v1/workspaces/${WS}/picks?cursor=${c}`, { token: tok });
      assert.equal(r.status, 400, c);
      assert.equal(r.body.error.code, "CURSOR_INVALID");
    }
    const audit = await call(h.base, "GET", `/v1/workspaces/${WS}/audit-log?cursor=${Buffer.from(`2026-10-01T00:00:00Z|${S1}`).toString("base64url")}`, { token: tok });
    assert.equal(audit.status, 400, "uuid cursor on a bigint-keyed list");
  });
});
