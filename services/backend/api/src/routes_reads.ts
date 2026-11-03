// Read endpoints: coins, picks, fills, orders, jobs (4.4), guard changes and audit log (4.8). RLS applies
// (every query runs as the caller); orders are checked for visibility as the caller before order_wire().
import { ApiError } from "./errors.ts";
import { asService, asUser, requireMember } from "./db.ts";
import { send, type Router } from "./http.ts";
import { cursorParam, limitParam, modeParam, requireScope, seqParam, timeRange, uuidParam, UUID } from "./rules.ts";
import { authenticate, type Deps } from "./deps.ts";
import { logoUrl } from "./logo/config.ts";
import { EVENT_COLUMNS, cursorCols, eventWire, iso, num, pageOf, str, type EventRow } from "./wire.ts";

type Page = Record<string, any> & { cur_ts: string; cur_id: string };

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
    // 1.1.6: content hash of the current proxied logo (null: none yet / unavailable) + our proxy URL
    logo_hash: r.logo_hash ?? null,
    logo_url: logoUrl(r.mint, r.logo_hash),
    ...mcapWire(r),
  };
}

/** 1.1.4 market cap: lamports integer string, indicative USD decimal string, observation time. */
function mcapWire(r: Record<string, unknown>) {
  return {
    market_cap_lamports: r.market_cap_lamports == null ? null : String(r.market_cap_lamports),
    mcap_usd: r.mcap_usd == null ? null : String(r.mcap_usd),
    mcap_as_of: iso(r.mcap_as_of),
    // 1.1.5: where the market cap came from; null market_cap_lamports = unavailable
    mcap_source: r.market_cap_lamports == null ? "unavailable" : r.venue === "curve" ? "curve" : "pool",
  };
}
const COIN_COLUMNS = "c.mint, c.decimals, c.token_program, c.quote_mint, c.launchpad, c.venue, c.creator, c.first_seen_at, c.migrated_at, c.untrusted, c.market_cap_lamports, c.mcap_usd, c.mcap_as_of, (select l.logo_hash from public.coin_logos l where l.mint = c.mint and l.status = 'ok') as logo_hash";

function pickWire(r: Record<string, unknown>) {
  return {
    id: r.id, ck: r.ck, workspace_id: r.workspace_id, strategy_id: r.strategy_id, mint: r.mint, mode: r.mode,
    stage: r.stage, score: num(r.score), score_threshold: num(r.score_threshold), checks: r.checks ?? [],
    guard: r.guard ?? null, guard_verdict: r.guard_verdict ?? null, created_at: iso(r.created_at), updated_at: iso(r.updated_at),
    logo_hash: r.logo_hash ?? null, // 1.1.6
    logo_url: logoUrl(r.mint, r.logo_hash),
    ...mcapWire(r),
  };
}
const PICK_COLUMNS = "id, ck, workspace_id, strategy_id, mint, mode::text as mode, stage::text as stage, score, score_threshold, checks, guard, guard_verdict, created_at, updated_at, market_cap_lamports, mcap_usd, mcap_as_of, (select cv.venue from public.coins cv where cv.mint = picks.mint) as venue, (select l.logo_hash from public.coin_logos l where l.mint = picks.mint and l.status = 'ok') as logo_hash";

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
    const limit = limitParam(ctx, 50, 100);
    const cur = cursorParam(ctx, "mint");
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select x.*, ${cursorCols("x.last_seen", "x.mint")} from (
           select ${COIN_COLUMNS}, max(pk.created_at) as last_seen from public.coins c
             join public.picks pk on pk.mint = c.mint
            where pk.workspace_id = $1 and pk.mode = $2::public.trade_mode and ($3::uuid is null or pk.strategy_id = $3)
              and ($4::timestamptz is null or pk.created_at >= $4) and ($5::timestamptz is null or pk.created_at < $5)
            group by c.mint) x
          where ($6::timestamptz is null or (x.last_seen, x.mint) < ($6::timestamptz, $7::text))
          order by x.last_seen desc, x.mint desc limit $8`,
        [ws, mode, strategy, from, to, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      return q.rows as Page[];
    });
    send(ctx, 200, pageOf(rows, limit, coinWire));
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
    const limit = limitParam(ctx, 50, 100);
    const cur = cursorParam(ctx);
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select ${PICK_COLUMNS}, ${cursorCols("created_at", "id")} from public.picks
          where workspace_id = $1 and mode = $2::public.trade_mode and ($3::uuid is null or strategy_id = $3)
            and ($4::text is null or stage::text = $4)
            and ($5::timestamptz is null or (created_at, id) < ($5::timestamptz, $6::uuid))
          order by created_at desc, id desc limit $7`,
        [ws, mode, strategy, stage, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      return q.rows as Page[];
    });
    send(ctx, 200, pageOf(rows, limit, pickWire));
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
    const limit = limitParam(ctx, 50, 100);
    const cur = cursorParam(ctx);
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select public.fill_wire(f) || jsonb_build_object('position_id', f.position_id) as w, ${cursorCols("f.created_at", "f.id")}
           from public.fills f
          where f.workspace_id = $1 and f.mode = $2::public.trade_mode and ($3::uuid is null or f.position_id = $3)
            and ($4::timestamptz is null or f.created_at >= $4) and ($5::timestamptz is null or f.created_at < $5)
            and ($6::timestamptz is null or (f.created_at, f.id) < ($6::timestamptz, $7::uuid))
          order by f.created_at desc, f.id desc limit $8`,
        [ws, mode, position, position ? null : from, to, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      return q.rows as Page[];
    });
    send(ctx, 200, pageOf(rows, limit, (x) => x.w));
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
    const status = ctx.url.searchParams.get("status");
    if (status !== null && !/^[a-z_]{1,16}$/.test(status)) throw new ApiError("VALIDATION_FAILED", { field: "status" });
    const limit = limitParam(ctx, 50, 100);
    const cur = cursorParam(ctx);
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select public.guard_change_wire(g) as w, ${cursorCols("g.created_at", "g.id")} from public.guard_changes g
          where g.workspace_id = $1 and g.mode = $2::public.trade_mode and ($3::uuid is null or g.strategy_id = $3)
            and ($4::text is null or g.status::text = $4)
            and ($5::timestamptz is null or (g.created_at, g.id) < ($5::timestamptz, $6::uuid))
          order by g.created_at desc, g.id desc limit $7`,
        [ws, mode, strategy, status, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      return q.rows as Page[];
    });
    send(ctx, 200, pageOf(rows, limit, (x) => x.w));
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
    const cur = cursorParam(ctx, "int");
    const limit = limitParam(ctx, 50, 100);
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const ok = await c.query<{ ok: boolean }>("select public.has_workspace_role($1, '{owner,admin}') as ok", [ws]);
      if (!ok.rows[0]?.ok) throw new ApiError("FORBIDDEN_ROLE", { required: ["owner", "admin"] });
      const q = await c.query(
        `select id::text as id, mode::text as mode, actor_user, actor_kind::text as actor_kind, actor_via, action, target_type, target,
                before, after, risk, proof_kind, approval_id, request_id, device, server_now, created_at,
                ${cursorCols("created_at", "id")}
           from public.audit_log
          where workspace_id = $1 and mode = $2::public.trade_mode and ($3::text is null or action = $3)
            and ($4::timestamptz is null or created_at >= $4) and ($5::timestamptz is null or created_at < $5)
            and ($6::bigint is null or id < $6) and ($7::bigint is null or id < $7::bigint)
          order by id desc limit $8`,
        [ws, mode, action, from, to, before, cur?.id ?? null, limit + 1],
      );
      return q.rows as Page[];
    });
    const out = pageOf(rows, limit, ({ cur_ts: _t, cur_id: _i, server_now, ...x }) => ({ ...x, server_now_at: iso(server_now), created_at: iso(x.created_at) }));
    send(ctx, 200, { ...out, next_before_id: out.next_cursor ? ((out.items.at(-1) as Record<string, unknown> | undefined)?.id ?? null) : null });
  });

  void str;
}
