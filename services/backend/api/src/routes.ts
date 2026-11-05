// REST endpoints (packages/contracts/API_ENDPOINTS.md, contracts 1.1.4). Practice mode only.
import { ApiError } from "./errors.ts";
import { asService, asUser, requireMember, type Db, type Tx } from "./db.ts";
import { Router, readJson, send, type Ctx } from "./http.ts";
import { authenticate, type Deps } from "./deps.ts";
import {
  cursorParam, expectedRev, idempotencyKey, limitParam, modeParam, requireRev, requireScope, seqParam, timeRange, uuidParam,
} from "./rules.ts";
import {
  APPROVAL_COLUMNS, EVENT_COLUMNS, approvalWire, cursorCols, decodeCursor, encodeCursor, pageOf, eventWire, exitStatsWire,
  pnlSummaryWire, portfolioWire, workspaceWire, type EventRow,
} from "./wire.ts";
import { streamEvents } from "./sse.ts";
import { registerStrategies } from "./routes_strategies.ts";
import { registerReads } from "./routes_reads.ts";
import { registerAccount } from "./routes_account.ts";
import { registerAuth } from "./routes_auth.ts";
import { autoRefresh, registerQuotes } from "./routes_quote.ts";
import { registerLogos } from "./routes_logos.ts";
import { logoUrl } from "./logo/config.ts";

export const CONTRACTS_VERSION = "1.1.6";
/** Product name (user facing). Crate/package/DB names keep the codename "centurion". */
export const PRODUCT_NAME = "Centurion Trade";
/** 1.1.3: closed enum, only with decision=reject (default user_declined, applied in SQL). */
export const APPROVAL_REJECT_REASONS = ["user_declined", "not_tradeable", "price_moved", "other"] as const;

export { authenticate, type Deps } from "./deps.ts";

const etag = (rev: unknown) => ({ ETag: `"${String(rev)}"` });
/** 1.1.6: positions come from SQL position_wire(); logo_hash is joined in the query, logo_url built here. */
const withLogo = (w: Record<string, unknown>) => ({ ...w, logo_hash: w.logo_hash ?? null, logo_url: logoUrl(w.mint, w.logo_hash) });
const LOGO_HASH_OF_P = "jsonb_build_object('logo_hash', (select l.logo_hash from public.coin_logos l where l.mint = p.mint and l.status = 'ok'))";

export function buildRouter(d: Deps): Router {
  const r = new Router();
  /** Ingest bytes/day meter (UTC day, per source); null when the meter table is unavailable. */
  const ingestBytesToday = async () => {
    try {
      const q = await d.db.query(
        `select source, bytes::text as bytes, frames::text as frames from public.ingest_bytes_daily
          where day = (now() at time zone 'utc')::date order by source`,
      );
      return {
        day_utc: new Date().toISOString().slice(0, 10),
        sources: Object.fromEntries(q.rows.map((r) => [r.source, { bytes: r.bytes, frames: r.frames }])),
      };
    } catch {
      return null;
    }
  };
  const health = async (ctx: Ctx, ready: boolean) => {
    let db = "ok";
    let ingest: Awaited<ReturnType<typeof ingestBytesToday>> = null;
    if (ready) {
      try {
        await d.db.query("select 1");
      } catch {
        db = "down";
      }
      if (db !== "ok") throw new ApiError("UNAVAILABLE", { db });
      ingest = await ingestBytesToday();
    }
    send(ctx, 200, {
      service: `${PRODUCT_NAME} API`,
      product: PRODUCT_NAME,
      mode: "practice",
      real_enabled: false,
      modes_enabled: ["practice"],
      live_executor: "disabled",
      contracts_version: CONTRACTS_VERSION,
      ...(ready ? { db, ingest_bytes_today: ingest } : {}),
    });
  };
  r.add("GET", "/healthz", (ctx) => health(ctx, false));
  r.add("GET", "/readyz", (ctx) => health(ctx, true));
  // 1.1.6 coin-logo image proxy (unauthenticated, own limits; off unless LOGO_PROXY_ENABLED=true)
  registerLogos(r, d);

  // ---- workspace --------------------------------------------------------------------------------
  r.add("GET", "/v1/workspaces/:ws", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const row = await asUser(d.db, p.claims, async (c) => {
      const q = await c.query("select * from public.workspaces where id = $1 and deleted_at is null", [ws]);
      return q.rows[0] as Record<string, unknown> | undefined;
    });
    if (!row) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: workspaceWire(row) }, etag(row.rev));
  });

  // ---- positions --------------------------------------------------------------------------------
  r.add("GET", "/v1/workspaces/:ws/positions", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const q = ctx.url.searchParams;
    const state = q.get("state");
    if (state !== null && state !== "open" && state !== "closed") {
      throw new ApiError("VALIDATION_FAILED", { field: "state", allowed: ["open", "closed"] });
    }
    const strategy = q.get("strategy_id");
    if (strategy !== null && !/^[0-9a-f-]{36}$/i.test(strategy)) throw new ApiError("VALIDATION_FAILED", { field: "strategy_id" });
    const epochRaw = q.get("epoch");
    const epoch = epochRaw === null ? null : Number(epochRaw);
    if (epoch !== null && (!Number.isInteger(epoch) || epoch < 0)) throw new ApiError("VALIDATION_FAILED", { field: "epoch" });
    const cur = decodeCursor(q.get("cursor"));
    if (cur === "bad") throw new ApiError("CURSOR_INVALID", { field: "cursor" });
    const limit = limitParam(ctx, 50, 100);
    // 0022: the PnL report filters the closed ledger by close time. `window`/`from`/`to` are optional:
    // without them the list keeps its historical "everything, newest first" behaviour. For closed rows the
    // range and the order are on `closed_at` (a report is ordered by when the trade closed, not opened).
    const ranged = q.has("window") || q.has("from") || q.has("to");
    const { from, to } = ranged ? timeRange(ctx) : { from: null, to: null };
    const byClosed = state === "closed";
    const sortCol = byClosed ? "coalesce(p.closed_at, p.opened_at)" : "p.opened_at";
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const res = await c.query(
        `select public.position_wire(p) || ${LOGO_HASH_OF_P} as w, p.id,
                to_char(${sortCol} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_ts
           from public.positions p
          where p.workspace_id = $1 and p.mode = $2::public.trade_mode
            and ($3::text is null or p.status::text = $3)
            and ($4::uuid is null or p.strategy_id = $4)
            and p.practice_epoch = coalesce($5::int, (select practice_epoch from public.workspaces where id = $1))
            and ($6::timestamptz is null or ${sortCol} >= $6)
            and ($7::timestamptz is null or ${sortCol} < $7)
            and ($8::timestamptz is null or (${sortCol}, p.id) < ($8::timestamptz, $9::uuid))
          order by ${sortCol} desc, p.id desc
          limit $10`,
        [ws, mode, state, strategy, epoch, from, to, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      return res.rows as { w: Record<string, unknown>; cur_ts: string; id: string }[];
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    send(ctx, 200, {
      items: page.map((x) => withLogo(x.w)),
      next_cursor: rows.length > limit && last ? encodeCursor(last.cur_ts, last.id) : null,
    });
  });

  r.add("GET", "/v1/workspaces/:ws/positions/:id", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const w = await asUser(d.db, p.claims, async (c) => {
      const res = await c.query(`select public.position_wire(p) || ${LOGO_HASH_OF_P} as w from public.positions p where p.id = $1 and p.workspace_id = $2`, [id, ws]);
      return res.rows[0]?.w as Record<string, unknown> | undefined;
    });
    if (!w) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: withLogo(w) }, etag(w.rev));
  });

  /** Manual sell (practice only). SQL close_position(): role, mode, fraction, rev, idempotency. */
  r.add("POST", "/v1/workspaces/:ws/positions/:id/close", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    modeParam(ctx, body.mode);
    if ("sell_pct" in body) throw new ApiError("VALIDATION_FAILED", { field: "sell_pct", reason: "removed in 1.1.2; use fraction_bps" });
    const f = body.fraction_bps ?? 10000;
    if (typeof f !== "number" || !Number.isInteger(f)) throw new ApiError("INVALID_FRACTION", { range: "1-10000" });
    const rev = expectedRev(ctx, body);
    const key = idempotencyKey(ctx);
    const out = await asUser(d.db, p.claims, async (c) => {
      await inWorkspace(c, "positions", id, ws);
      const res = await c.query("select public.close_position($1, $2, $3, $4) as r", [id, rev, key, f]);
      return res.rows[0]?.r as Record<string, unknown>;
    });
    send(ctx, 200, out, out.replayed === true ? { "Idempotent-Replayed": "true" } : {});
  });

  // ---- approvals --------------------------------------------------------------------------------
  r.add("GET", "/v1/workspaces/:ws/approvals", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const q = ctx.url.searchParams;
    const status = q.get("status");
    if (status !== null && !["pending", "approved", "rejected", "expired"].includes(status)) {
      throw new ApiError("VALIDATION_FAILED", { field: "status" });
    }
    const kind = q.get("kind");
    if (kind !== null && !/^[a-z_]{1,32}$/.test(kind)) throw new ApiError("VALIDATION_FAILED", { field: "kind" });
    const limit = limitParam(ctx, 50, 100);
    const cur = cursorParam(ctx);
    // status=pending: soonest expiry first (keyset on expires_at asc); otherwise newest first (created_at desc)
    const pending = status === "pending";
    const tsCol = pending ? "expires_at" : "created_at";
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const res = await c.query(
        `select ${APPROVAL_COLUMNS}, ${cursorCols(tsCol, "id")} from public.approvals
          where workspace_id = $1 and mode = $2::public.trade_mode
            and ($3::text is null or status::text = $3) and ($4::text is null or kind::text = $4)
            and ($5::timestamptz is null or (${tsCol}, id) ${pending ? ">" : "<"} ($5::timestamptz, $6::uuid))
          order by ${tsCol} ${pending ? "asc" : "desc"}, id ${pending ? "asc" : "desc"}
          limit $7`,
        [ws, mode, status, kind, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      return res.rows as (Record<string, unknown> & { cur_ts: string; cur_id: string })[];
    });
    send(ctx, 200, pageOf(rows, limit, approvalWire));
  });

  /** Detail; members with `trade` get a fresh single-use decision token while the approval is pending. */
  r.add("GET", "/v1/workspaces/:ws/approvals/:id", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const row = await asUser(d.db, p.claims, async (c) => {
      const res = await c.query(`select ${APPROVAL_COLUMNS} from public.approvals where id = $1 and workspace_id = $2`, [id, ws]);
      return res.rows[0] as Record<string, unknown> | undefined;
    });
    if (!row) throw new ApiError("NOT_FOUND");
    // 1.1.5: a missing or stale quote on a pending buy/sell proposal is refreshed on read (coalesced, 3 s)
    const cur = await autoRefresh(d, row);
    let token: string | null = null;
    let tokenExp: string | null = null;
    if (row.status === "pending" && p.scopes.has("trade")) {
      try {
        const t = await asService(d.db, async (c) => {
          const res = await c.query("select token, expires_at from public.issue_approval_token($1, $2, $3::public.decided_via)", [id, p.userId, p.via]);
          return res.rows[0] as { token: string; expires_at: Date } | undefined;
        });
        token = t?.token ?? null;
        tokenExp = t ? t.expires_at.toISOString() : null;
      } catch (e) {
        if (!(e instanceof ApiError) || !["FORBIDDEN_ROLE", "APPROVAL_EXPIRED"].includes(e.code)) throw e;
      }
    }
    send(ctx, 200, { data: { ...approvalWire(cur), decision_token: token, decision_token_expires_at: tokenExp } }, etag(cur.rev));
  });

  /** SQL decide_approval(): actor = auth.uid(), via = JWT `centurion_client` (or push token); never the body. */
  r.add("POST", "/v1/workspaces/:ws/approvals/:id/decision", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    const decision = body.decision;
    if (decision !== "approve" && decision !== "reject") {
      throw new ApiError("VALIDATION_FAILED", { field: "decision", allowed: ["approve", "reject"] });
    }
    const rr = body.reject_reason ?? null;
    if (rr !== null) {
      if (decision !== "reject") throw new ApiError("VALIDATION_FAILED", { field: "reject_reason", hint: "only with decision=reject" });
      if (typeof rr !== "string" || !(APPROVAL_REJECT_REASONS as readonly string[]).includes(rr)) {
        throw new ApiError("VALIDATION_FAILED", { field: "reject_reason", allowed: [...APPROVAL_REJECT_REASONS] });
      }
    }
    if (typeof body.token !== "string" || body.token.length > 64) throw new ApiError("APPROVAL_TOKEN_INVALID");
    // Practice guard weakening: `confirmation.hold_duration_ms` >= 1200 (API_ENDPOINTS 4.6); SQL also checks
    // that the decision token is at least 1.2 s old. Real proofs (WebAuthn, typed name, 2FA) are Phase 7.
    const conf = body.confirmation;
    let holdMs: number | null = null;
    if (conf !== undefined && conf !== null) {
      const h = typeof conf === "object" ? (conf as Record<string, unknown>).hold_duration_ms : undefined;
      if (typeof h !== "number" || !Number.isInteger(h) || h < 0 || h > 600_000) {
        throw new ApiError("VALIDATION_FAILED", { field: "confirmation.hold_duration_ms" });
      }
      holdMs = h;
    }
    // 1.1.5: the quote the user reviewed (integer string). Required for a Real approve; practice ignores it.
    const eq = body.expected_quote_id ?? null;
    if (eq !== null && (typeof eq !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(eq))) {
      throw new ApiError("VALIDATION_FAILED", { field: "expected_quote_id", hint: "integer string" });
    }
    const rev = expectedRev(ctx, body);
    const key = idempotencyKey(ctx);
    const out = await asUser(d.db, p.claims, async (c) => {
      await inWorkspace(c, "approvals", id, ws);
      const res = await c.query("select public.decide_approval($1, $2, $3, $4, $5, $6, $7, $8::bigint) as r", [id, body.token, decision, rev, key, rr, holdMs, eq]);
      return res.rows[0]?.r as Record<string, unknown>;
    });
    const { server_now, ...data } = out;
    send(ctx, 200, { data, server_now }, {
      ...etag(data.rev),
      ...(data.replayed === true ? { "Idempotent-Replayed": "true" } : {}),
    });
  });

  // ---- portfolio and stats ----------------------------------------------------------------------
  r.add("GET", "/v1/workspaces/:ws/portfolio/overview", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const row = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const res = await c.query("select * from public.portfolio_latest where workspace_id = $1 and mode = $2::public.trade_mode", [ws, mode]);
      return res.rows[0] as Record<string, unknown> | undefined;
    });
    send(ctx, 200, { data: row ? portfolioWire(row) : null });
  });

  r.add("GET", "/v1/workspaces/:ws/stats/exit-reasons", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const strategy = ctx.url.searchParams.get("strategy_id");
    if (strategy !== null && !/^[0-9a-f-]{36}$/i.test(strategy)) throw new ApiError("VALIDATION_FAILED", { field: "strategy_id" });
    const { from, to } = timeRange(ctx);
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const res = await c.query(
        "select exit_reason::text as exit_reason, count, pnl_lamports, avg_pnl_pct, win_rate_pct, avg_hold_s from public.exit_stats($1, $2, $3::public.trade_mode, $4, $5)",
        [ws, strategy, mode, from, to],
      );
      return res.rows as Record<string, unknown>[];
    });
    send(ctx, 200, { items: rows.map(exitStatsWire), next_cursor: null });
  });

  /**
   * 0022: PnL card/report summary. One call for the strip the apps render.
   * - unrealized / realized / total come from portfolio_latest (current mode + practice epoch, all-time).
   * - realized_pnl_window_lamports and the closed-trade stats come from pnl_summary() over the range,
   *   default 7d (the report default). The two realized numbers may legitimately differ: the portfolio
   *   value also includes partial take-profits on positions that are still open and closes outside the
   *   range; the windowed value only counts whole exits inside it.
   */
  r.add("GET", "/v1/workspaces/:ws/stats/pnl", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const q = ctx.url.searchParams;
    const strategy = q.get("strategy_id");
    if (strategy !== null && !/^[0-9a-f-]{36}$/i.test(strategy)) throw new ApiError("VALIDATION_FAILED", { field: "strategy_id" });
    const { from, to } = timeRange(ctx, "7d");
    const window = q.has("from") || q.has("to") ? null : (q.get("window") ?? "7d");
    const out = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const s = await c.query(
        "select * from public.pnl_summary($1, $2, $3::public.trade_mode, $4, $5)",
        [ws, strategy, mode, from, to],
      );
      const pf = await c.query(
        "select * from public.portfolio_latest where workspace_id = $1 and mode = $2::public.trade_mode",
        [ws, mode],
      );
      const w = await c.query("select practice_epoch from public.workspaces where id = $1", [ws]);
      return {
        summary: (s.rows[0] ?? {}) as Record<string, unknown>,
        portfolio: (pf.rows[0] ?? null) as Record<string, unknown> | null,
        epoch: (w.rows[0]?.practice_epoch ?? null) as number | null,
      };
    });
    const summary = pnlSummaryWire(out.summary);
    const pf = out.portfolio ? portfolioWire(out.portfolio) : null;
    const realized = pf?.realized_pnl_lamports ?? null;
    const unrealized = pf?.unrealized_pnl_lamports ?? null;
    const total = realized !== null && unrealized !== null ? (BigInt(realized) + BigInt(unrealized)).toString() : null;
    send(ctx, 200, {
      data: {
        mode,
        practice_epoch: out.epoch,
        window,
        from,
        to,
        unrealized_pnl_lamports: unrealized,
        realized_pnl_lamports: realized,
        total_pnl_lamports: total,
        realized_pnl_window_lamports: summary.realized_pnl_lamports,
        closed_count: summary.closed_count,
        win_count: summary.win_count,
        win_rate_pct: summary.win_rate_pct,
        avg_hold_s: summary.avg_hold_s,
        fees_lamports: summary.fees_lamports,
        best_pnl_lamports: summary.best_pnl_lamports,
        worst_pnl_lamports: summary.worst_pnl_lamports,
        as_of_seq: pf?.as_of_seq ?? null,
        ts: pf?.ts ?? null,
      },
    });
  });

  // ---- events (REST page + SSE) -----------------------------------------------------------------
  r.add("GET", "/v1/workspaces/:ws/events", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const q = ctx.url.searchParams;
    const after = seqParam(q.get("after_seq"), "after_seq");
    const before = seqParam(q.get("before_seq"), "before_seq");
    if (after !== null && before !== null) throw new ApiError("VALIDATION_FAILED", { reason: "after_seq and before_seq are exclusive" });
    const types = q.get("types");
    const typeList = types ? types.split(",").filter(Boolean) : null;
    if (typeList && !typeList.every((t) => /^[a-z_]+(\.[a-z_]+)?$/.test(t))) throw new ApiError("VALIDATION_FAILED", { field: "types" });
    const limit = limitParam(ctx, 100, 500);
    const { rows, safe } = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const s = await c.query<{ s: string }>("select public.events_safe_seq()::text as s");
      const safe = s.rows[0]?.s ?? "0";
      const res = await c.query(
        `select ${EVENT_COLUMNS} from public.events
          where workspace_id = $1 and mode = $2::public.trade_mode and seq <= $3::bigint
            and ($4::bigint is null or seq > $4) and ($5::bigint is null or seq < $5)
            and ($6::text[] is null or type = any ($6))
          order by seq ${before !== null ? "desc" : "asc"} limit $7`,
        [ws, mode, safe, after, before, typeList, limit],
      );
      return { rows: res.rows as EventRow[], safe };
    });
    const now = new Date().toISOString();
    const items = rows.map((e) => eventWire(e, now));
    const seqs = rows.map((e) => BigInt(e.seq));
    const max = seqs.length ? seqs.reduce((a, b) => (a > b ? a : b)) : null;
    const min = seqs.length ? seqs.reduce((a, b) => (a < b ? a : b)) : null;
    send(ctx, 200, {
      items,
      next_after_seq: before === null ? (max?.toString() ?? after ?? safe) : null,
      next_before_seq: before !== null && rows.length === limit && min !== null ? min.toString() : null,
      safe_seq: safe,
      next_cursor: null,
    });
  });

  r.add("GET", "/v1/workspaces/:ws/events/stream", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    await streamEvents(ctx, d, p, ws, mode);
  });

  registerStrategies(r, d);
  registerReads(r, d);
  registerAccount(r, d);
  registerAuth(r, d);
  registerQuotes(r, d);

  // removed in 1.1.2 (moved under the workspace)
  r.add("GET", "/v1/events/stream", async () => {
    throw new ApiError("NOT_FOUND", { moved_to: "/v1/workspaces/{ws}/events/stream" });
  });

  return r;
}

/** The resource must belong to the workspace in the path (RLS already hides other tenants). */
async function inWorkspace(c: Tx, table: "positions" | "approvals", id: string, ws: string): Promise<void> {
  const res = await c.query<{ workspace_id: string }>(`select workspace_id from public.${table} where id = $1`, [id]);
  if (res.rows[0]?.workspace_id !== ws) throw new ApiError("NOT_FOUND");
}

