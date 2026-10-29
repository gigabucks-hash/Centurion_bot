// Read endpoints: coins, picks, fills, orders, jobs (4.4), guard changes and audit log (4.8). RLS applies
// (every query runs as the caller); orders are checked for visibility as the caller before order_wire().
import { ApiError } from "./errors.ts";
import { asService, asUser, requireMember } from "./db.ts";
import { send, type Router } from "./http.ts";
import { limitParam, modeParam, requireScope, seqParam, timeRange, uuidParam, UUID } from "./rules.ts";
import { authenticate, type Deps } from "./deps.ts";
import { EVENT_COLUMNS, eventWire, iso, num, str, type EventRow } from "./wire.ts";

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function mintParam(v: string | undefined): string {
  if (!v || !MINT.test(v)) throw new ApiError("NOT_FOUND");
  return v;
}
function optUuid(v: string | null, field: string): string | null {
  if (v === null) return null;
  if (!UUID.test(v)) throw new ApiError("VALIDATION_FAILED", { field });
  return v.toLowerCase();
}

/** Coin facts are trusted (from chain); name/symbol/uri stay inside `untrusted`. */
function coinWire(r: Record<string, unknown>) {
  return {
    mint: r.mint,
    decimals: num(r.decimals),
    token_program: r.token_program ?? null,
    quote_mint: r.quote_mint ?? null,
    launchpad: r.launchpad ?? null,
    venue: r.venue ?? null,
    creator: r.creator ?? null,
    first_seen_at: iso(r.first_seen_at),
    migrated_at: iso(r.migrated_at),
    untrusted: r.untrusted ?? {},
  };
}
const COIN_COLUMNS = "c.mint, c.decimals, c.token_program, c.quote_mint, c.launchpad, c.venue, c.creator, c.first_seen_at, c.migrated_at, c.untrusted";

function pickWire(r: Record<string, unknown>) {
  return {
    id: r.id, ck: r.ck, workspace_id: r.workspace_id, strategy_id: r.strategy_id, mint: r.mint, mode: r.mode,
    stage: r.stage, score: num(r.score), score_threshold: num(r.score_threshold), checks: r.checks ?? [],
    guard: r.guard ?? null, guard_verdict: r.guard_verdict ?? null, created_at: iso(r.created_at), updated_at: iso(r.updated_at),
  };
}
const PICK_COLUMNS = "id, ck, workspace_id, strategy_id, mint, mode::text as mode, stage::text as stage, score, score_threshold, checks, guard, guard_verdict, created_at, updated_at";

export function registerReads(r: Router, d: Deps): void {
  const ws0 = "/v1/workspaces/:ws";

  // ---- coins ------------------------------------------------------------------------------------
  r.add("GET", `${ws0}/coins`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const strategy = optUuid(ctx.url.searchParams.get("strategy_id"), "strategy_id");
    const { from, to } = timeRange(ctx);
    const limit = limitParam(ctx, 100, 100);
    const items = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select ${COIN_COLUMNS}, max(pk.created_at) as last_seen from public.coins c
           join public.picks pk on pk.mint = c.mint
          where pk.workspace_id = $1 and pk.mode = $2::public.trade_mode and ($3::uuid is null or pk.strategy_id = $3)
            and ($4::timestamptz is null or pk.created_at >= $4) and ($5::timestamptz is null or pk.created_at < $5)
          group by c.mint order by last_seen desc limit $6`,
        [ws, mode, strategy, from, to, limit],
      );
      return q.rows.map(coinWire);
    });
    send(ctx, 200, { items, next_cursor: null });
  });

  r.add("GET", `${ws0}/coins/:mint`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mint = mintParam(ctx.params.mint);
    const row = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(`select ${COIN_COLUMNS} from public.coins c where c.mint = $1`, [mint]);
      return q.rows[0] as Record<string, unknown> | undefined;
    });
    if (!row) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: coinWire(row) });
  });

  r.add("GET", `${ws0}/coins/:mint/timeline`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mint = mintParam(ctx.params.mint);
    const mode = modeParam(ctx);
    const strategy = optUuid(ctx.url.searchParams.get("strategy_id"), "strategy_id");
    const after = seqParam(ctx.url.searchParams.get("after_seq"), "after_seq");
    const limit = limitParam(ctx, 200, 500);
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select ${EVENT_COLUMNS} from public.events
          where workspace_id = $1 and mode = $2::public.trade_mode and mint = $3 and ($4::uuid is null or strategy_id = $4)
            and ($5::bigint is null or seq > $5) and seq <= public.events_safe_seq()
          order by seq asc limit $6`,
        [ws, mode, mint, strategy, after, limit],
      );
      return q.rows as EventRow[];
    });
    const now = new Date().toISOString();
    send(ctx, 200, { items: rows.map((e) => eventWire(e, now)), next_after_seq: rows.at(-1)?.seq ?? after, next_cursor: null });
  });

  // ---- picks ------------------------------------------------------------------------------------
  r.add("GET", `${ws0}/picks`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const strategy = optUuid(ctx.url.searchParams.get("strategy_id"), "strategy_id");
    const stage = ctx.url.searchParams.get("stage");
    if (stage !== null && !/^[a-z_]{1,24}$/.test(stage)) throw new ApiError("VALIDATION_FAILED", { field: "stage" });
    const limit = limitParam(ctx, 100, 100);
    const items = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select ${PICK_COLUMNS} from public.picks
          where workspace_id = $1 and mode = $2::public.trade_mode and ($3::uuid is null or strategy_id = $3)
            and ($4::text is null or stage::text = $4)
          order by created_at desc, id desc limit $5`,
        [ws, mode, strategy, stage, limit],
      );
      return q.rows.map(pickWire);
    });
    send(ctx, 200, { items, next_cursor: null });
  });

  r.add("GET", `${ws0}/picks/:id`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const row = await asUser(d.db, p.claims, async (c) => {
      const q = await c.query(`select ${PICK_COLUMNS} from public.picks where id = $1 and workspace_id = $2`, [id, ws]);
      return q.rows[0] as Record<string, unknown> | undefined;
    });
    if (!row) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: pickWire(row) });
  });

  // ---- fills ------------------------------------------------------------------------------------
  r.add("GET", `${ws0}/fills`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const position = optUuid(ctx.url.searchParams.get("position_id"), "position_id");
    const { from, to } = timeRange(ctx);
    const limit = limitParam(ctx, 100, 100);
    const items = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select public.fill_wire(f) || jsonb_build_object('position_id', f.position_id) as w from public.fills f
          where f.workspace_id = $1 and f.mode = $2::public.trade_mode and ($3::uuid is null or f.position_id = $3)
            and ($4::timestamptz is null or f.created_at >= $4) and ($5::timestamptz is null or f.created_at < $5)
          order by f.created_at desc, f.id desc limit $6`,
        [ws, mode, position, position ? null : from, to, limit],
      );
      return q.rows.map((x) => x.w);
    });
    send(ctx, 200, { items, next_cursor: null });
  });

  // ---- orders / jobs (poll if you do not consume the stream) ------------------------------------
  r.add("GET", `${ws0}/orders/:id`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const visible = await asUser(d.db, p.claims, async (c) => {
      const q = await c.query("select id from public.orders where id = $1 and workspace_id = $2", [id, ws]);
      return q.rowCount === 1;
    });
    if (!visible) throw new ApiError("NOT_FOUND");
    const w = await asService(d.db, async (c) => (await c.query("select public.order_wire(o) as w from public.orders o where o.id = $1", [id])).rows[0]?.w);
    send(ctx, 200, { data: w });
  });

  r.add("GET", `${ws0}/jobs/:job_id`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const jid = seqParam(ctx.params.job_id, "job_id");
    if (jid === null) throw new ApiError("NOT_FOUND");
    const row = await asUser(d.db, p.claims, async (c) => {
      const q = await c.query(
        `select id::text as id, kind, status::text as status, attempts, last_error, created_at, updated_at
           from public.jobs where id = $1 and workspace_id = $2`,
        [jid, ws],
      );
      return q.rows[0] as Record<string, unknown> | undefined;
    });
    if (!row) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: { ...row, last_error: typeof row.last_error === "string" ? row.last_error.slice(0, 200) : null, created_at: iso(row.created_at), updated_at: iso(row.updated_at) } });
  });

  // ---- guard changes and audit ------------------------------------------------------------------
  r.add("GET", `${ws0}/guard-changes`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const strategy = optUuid(ctx.url.searchParams.get("strategy_id"), "strategy_id");
    const limit = limitParam(ctx, 50, 100);
    const items = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select id, workspace_id, strategy_id, approval_id, mode::text as mode, rev, from_rev, diff, weakened_fields, impact,
                status::text as status, requested_by, cooldown_until, auto_revert_at, applied_at, reverted_at, created_at
           from public.guard_changes where workspace_id = $1 and mode = $2::public.trade_mode and ($3::uuid is null or strategy_id = $3)
          order by created_at desc, id desc limit $4`,
        [ws, mode, strategy, limit],
      );
      return q.rows.map((x) => ({
        ...x,
        cooldown_until: iso(x.cooldown_until), auto_revert_at: iso(x.auto_revert_at), applied_at: iso(x.applied_at),
        reverted_at: iso(x.reverted_at), created_at: iso(x.created_at),
      }));
    });
    send(ctx, 200, { items, next_cursor: null });
  });

  /** Owner/admin only. ip, user agent and proof hashes never leave the server. */
  r.add("GET", `${ws0}/audit-log`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const action = ctx.url.searchParams.get("action");
    if (action !== null && !/^[a-z_.]{1,64}$/.test(action)) throw new ApiError("VALIDATION_FAILED", { field: "action" });
    const { from, to } = timeRange(ctx);
    const before = seqParam(ctx.url.searchParams.get("before_id"), "before_id");
    const limit = limitParam(ctx, 100, 200);
    const items = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const ok = await c.query<{ ok: boolean }>("select public.has_workspace_role($1, '{owner,admin}') as ok", [ws]);
      if (!ok.rows[0]?.ok) throw new ApiError("FORBIDDEN_ROLE", { required: ["owner", "admin"] });
      const q = await c.query(
        `select id::text as id, mode::text as mode, actor_user, actor_kind::text as actor_kind, actor_via, action, target_type, target,
                before, after, risk, proof_kind, approval_id, request_id, device, server_now, created_at
           from public.audit_log
          where workspace_id = $1 and mode = $2::public.trade_mode and ($3::text is null or action = $3)
            and ($4::timestamptz is null or created_at >= $4) and ($5::timestamptz is null or created_at < $5)
            and ($6::bigint is null or id < $6)
          order by id desc limit $7`,
        [ws, mode, action, from, to, before, limit],
      );
      return q.rows.map((x) => ({ ...x, server_now_at: iso(x.server_now), server_now: undefined, created_at: iso(x.created_at) }));
    });
    send(ctx, 200, { items, next_before_id: items.length === limit ? items.at(-1)?.id ?? null : null, next_cursor: null });
  });

  void str;
}
