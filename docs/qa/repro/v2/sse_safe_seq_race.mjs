// BUG_HUNT_v2 — SSE resume/gap: `events_safe_seq()` can publish the seq of an in-flight event.
//
// 0001_init.sql:629-637 computes
//   coalesce(min(seq) - 1 where xid >= pg_snapshot_xmin(...), max(seq), 0)
// The `where xid >= xmin` subquery can only see rows the reader's snapshot can see, so an
// UNCOMMITTED row with seq X is skipped and a later committed row X+1 makes safe_seq = X.
// FeedHub/sse advance their cursor to safe_seq when a page is empty, so X is never delivered
// after it commits: one event is lost on the live feed.
//
// Run from C:\cw\app (uses services/backend/api/node_modules/pg):
//   $env:PGDATABASE='bug_hunt_v2'; node docs/qa/repro/v2/sse_safe_seq_race.mjs
// SCRATCH DATABASE ONLY. Events are append-only; cleanup is disposal of the dedicated database.
// Never point this at a shared database. See BUG_HUNT_v2.md for setup/rollback.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire("file:///C:/cw/app/services/backend/api/package.json");
const { Client } = require("pg");

const cfg = {
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "bug_hunt_v2",
};
if (cfg.database !== "bug_hunt_v2") {
  throw new Error("Refusing non-scratch database: use bug_hunt_v2 only");
}
// A fresh workspace per run keeps the page empty (no rows left by earlier runs).
const WS = randomUUID();
const USER = randomUUID();
const RUN = Date.now().toString(36);

const connect = async () => {
  const c = new Client(cfg);
  await c.connect();
  return c;
};
const reader = await connect();
const slow = await connect(); // holds an uncommitted event
const fast = await connect(); // commits the next event

const ev = (id, type = "order.failed") => ({
  text: `insert into public.events (id, workspace_id, ts, type, actor, mode, payload)
        values ($1, $2, now(), $3, 'system', 'practice', '{}'::jsonb) returning seq::text as seq`,
  values: [id, WS, type],
});

let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
};

try {
  await reader.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER]);
  await reader.query(
    `insert into public.workspaces (id, name, owner_id) values ($1, 'sse safe-seq repro', $2)
     on conflict (id) do nothing`,
    [WS, USER],
  );

  // 1. A slow transaction takes the next seq but does not commit.
  await slow.query("begin");
  const x = (await slow.query(ev(`sserace-${RUN}:1:order.failed`))).rows[0].seq;

  // 2. A second writer commits the next seq.
  const y = (await fast.query(ev(`sserace-${RUN}:2:order.failed`))).rows[0].seq;
  check(BigInt(y) === BigInt(x) + 1n, "the two events took consecutive seqs", `X=${x} X+1=${y}`);

  // 3. The reader asks for the safe watermark.
  const safe = (await reader.query("select public.events_safe_seq()::text as s")).rows[0].s;
  check(BigInt(safe) < BigInt(x), "safe_seq stays below the in-flight seq", `safe=${safe} X=${x}`);

  // 4. What the feed would emit up to `safe`, then advance its cursor to it.
  const page = (
    await reader.query(
      `select seq::text as seq from public.events
        where workspace_id = $1 and mode = 'practice' and seq > $2::bigint and seq <= $3::bigint
        order by seq asc limit 500`,
      [WS, "0", safe],
    )
  ).rows.map((r) => r.seq);
  check(!page.includes(x), "the feed page does not contain the in-flight event (expected)");
  const cursor = page.length ? page[page.length - 1] : safe;

  // 5. The slow transaction commits. The event is now real ...
  await slow.query("commit");
  const visible = (
    await reader.query("select seq::text as seq from public.events where workspace_id = $1 and seq = $2::bigint", [WS, x])
  ).rows.length;
  check(visible === 1, "the event is committed and visible after commit");

  // 6. ... but resume from the published cursor skips it forever.
  const after = (
    await reader.query(
      `select seq::text as seq from public.events
        where workspace_id = $1 and mode = 'practice' and seq > $2::bigint
        order by seq asc limit 500`,
      [WS, cursor],
    )
  ).rows.map((r) => r.seq);
  check(after.includes(x), `resume from cursor ${cursor} still returns the event`, `got=${after.join(",")}`);
} finally {
  // public.events is append-only (forbid_mutation trigger) and the workspace has an FK from it, so the
  // two fixture events stay in this scratch database. Use a dedicated DB (bug_hunt_v2), never a shared one.
  await slow.query("rollback").catch(() => {});
  await slow.end();
  await fast.end();
  await reader.end();
}

console.log(
  failed === 0
    ? "\nSSE SAFE-SEQ: OK (no race)"
    : `\nSSE SAFE-SEQ: BUG CONFIRMED (${failed} failed check(s): a committed event can be skipped by resume)`,
);
process.exitCode = failed === 0 ? 0 : 1;
