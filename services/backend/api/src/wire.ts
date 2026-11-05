// Row -> wire conversions. Rules (EVENTS_SCHEMA section 1): lamports / int64 as integer strings (node-pg
// already returns int8 as string), timestamps RFC 3339 UTC with ms, scores/percentages as JSON numbers.
import { logoUrl } from "./logo/config.ts";

export function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export interface EventRow {
  seq: string;
  id: string;
  type: string;
  version: number;
  ts: Date;
  workspace_id: string;
  strategy_id: string | null;
  ck: string | null;
  mint: string | null;
  actor: string;
  mode: string;
  payload: Record<string, unknown>;
  untrusted: Record<string, unknown>;
  /** 1.1.6: current logo content hash of `mint` (null: none / no mint). */
  logo_hash?: string | null;
}

/** Correlated lookup of the current logo hash for `<table>.mint` (coin_logos PK; null when none). */
const logoHashOf = (table: string) =>
  `(select l.logo_hash from public.coin_logos l where l.mint = ${table}.mint and l.status = 'ok') as logo_hash`;

export const EVENT_COLUMNS =
  "seq, id, type, version, ts, workspace_id, strategy_id, ck, mint, actor::text as actor, mode::text as mode, payload, untrusted, " +
  logoHashOf("events");

export function eventWire(r: EventRow, serverNow: string) {
  return {
    id: r.id,
    seq: String(r.seq),
    type: r.type,
    version: r.version,
    ts: iso(r.ts),
    workspace_id: r.workspace_id,
    strategy_id: r.strategy_id,
    ck: r.ck,
    mint: r.mint,
    // 1.1.6: logo content hash + our proxy URL for `mint` (null: no mint / no logo / proxy disabled -> identicon)
    logo_hash: r.mint ? (r.logo_hash ?? null) : null,
    logo_url: logoUrl(r.mint, r.logo_hash),
    actor: r.actor,
    mode: r.mode,
    payload: r.payload ?? {},
    untrusted: r.untrusted ?? {},
    server_now: serverNow,
  };
}

export function approvalWire(r: Record<string, unknown>) {
  return {
    id: r.id,
    proposal_id: r.id,
    workspace_id: r.workspace_id,
    strategy_id: r.strategy_id,
    kind: r.kind,
    mode: r.mode,
    subject: r.subject,
    mint: r.mint,
    logo_hash: r.mint ? ((r.logo_hash as string | null | undefined) ?? null) : null, // 1.1.6
    logo_url: logoUrl(r.mint, r.logo_hash),
    amount_lamports: str(r.amount_lamports),
    is_first_buy: r.is_first_buy,
    risk: r.risk,
    weakening: r.weakening,
    status: r.status,
    rev: r.rev,
    expire_reason: r.expire_reason,
    base_rev: r.base_rev,
    decision: r.decision,
    reject_reason: r.reject_reason ?? null,
    decided_via: r.decided_via,
    decided_by: r.decided_by,
    payload: r.payload,
    created_at: iso(r.created_at),
    expires_at: iso(r.expires_at),
    decided_at: iso(r.decided_at),
    // 1.1.4 quote (UX WF-22): integer strings / numbers / ISO, null until set
    est_network_fee_lamports: str(r.est_network_fee_lamports),
    priority_fee_lamports: str(r.priority_fee_lamports),
    swap_fee_bps: r.swap_fee_bps ?? null,
    max_slippage_bps: r.max_slippage_bps ?? null,
    min_out_raw: str(r.min_out_raw),
    total_max_lamports: str(r.total_max_lamports),
    quote_ts: iso(r.quote_ts),
    quote_expires_at: iso(r.quote_expires_at),
    // 1.1.5
    position_id: r.position_id ?? null,
    decimals: num(r.decimals),
    token_program: r.token_program ?? null,
    quote_id: str(r.quote_id) ?? "0",
    est_ata_rent_lamports: str(r.est_ata_rent_lamports),
    expected_out_lamports: str(r.expected_out_lamports),
    min_out_lamports: str(r.min_out_lamports),
  };
}

export const APPROVAL_COLUMNS =
  "id, workspace_id, strategy_id, kind::text as kind, mode::text as mode, subject, mint, amount_lamports, is_first_buy, risk, weakening, status::text as status, rev, expire_reason::text as expire_reason, base_rev, decision, reject_reason::text as reject_reason, decided_via::text as decided_via, decided_by, payload, created_at, expires_at, decided_at, est_network_fee_lamports, priority_fee_lamports, swap_fee_bps, max_slippage_bps, min_out_raw, total_max_lamports, quote_ts, quote_expires_at, position_id, quote_id, quote_refreshed_at, est_ata_rent_lamports, expected_out_lamports, min_out_lamports, (select c.decimals from public.coins c where c.mint = approvals.mint) as decimals, (select c.token_program from public.coins c where c.mint = approvals.mint) as token_program, " +
  logoHashOf("approvals");

export function portfolioWire(r: Record<string, unknown>) {
  return {
    workspace_id: r.workspace_id,
    mode: r.mode,
    practice_epoch: num(r.practice_epoch),
    ts: iso(r.ts),
    cash_lamports: str(r.cash_lamports),
    positions_cost_lamports: str(r.positions_cost_lamports),
    positions_value_lamports: str(r.positions_value_lamports),
    equity_lamports: str(r.equity_lamports),
    peak_equity_lamports: str(r.peak_equity_lamports),
    drawdown_bps: num(r.drawdown_bps),
    realized_pnl_lamports: str(r.realized_pnl_lamports),
    unrealized_pnl_lamports: str(r.unrealized_pnl_lamports),
    open_positions: num(r.open_positions),
    as_of_seq: str(r.as_of_seq),
  };
}

/** `ExitStatsRow`: {exit_reason, count, pnl_lamports (string), avg_pnl_pct, win_rate_pct, avg_hold_s}. */
export function exitStatsWire(r: Record<string, unknown>) {
  return {
    exit_reason: r.exit_reason,
    count: num(r.count) ?? 0,
    pnl_lamports: str(r.pnl_lamports) ?? "0",
    avg_pnl_pct: num(r.avg_pnl_pct),
    win_rate_pct: num(r.win_rate_pct) ?? 0,
    avg_hold_s: num(r.avg_hold_s) ?? 0,
  };
}

/**
 * 0022 `pnl_summary()`: closed-trade aggregate for the PnL report strip.
 * `win_rate_pct` / `avg_hold_s` / best / worst stay null with zero closed trades (no invented 0 %).
 */
export function pnlSummaryWire(r: Record<string, unknown>) {
  return {
    closed_count: num(r.closed_count) ?? 0,
    win_count: num(r.win_count) ?? 0,
    win_rate_pct: num(r.win_rate_pct),
    realized_pnl_lamports: str(r.realized_pnl_lamports) ?? "0",
    fees_lamports: str(r.fees_lamports) ?? "0",
    avg_hold_s: num(r.avg_hold_s),
    best_pnl_lamports: str(r.best_pnl_lamports),
    worst_pnl_lamports: str(r.worst_pnl_lamports),
  };
}

export function workspaceWire(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    rev: r.rev,
    modes_enabled: ["practice"],
    practice_epoch: num(r.practice_epoch),
    practice_start_lamports: str(r.practice_start_lamports),
    pick_proposal_ttl_seconds: num(r.pick_proposal_ttl_seconds),
    guard_proposal_ttl_seconds: num(r.guard_proposal_ttl_seconds),
    created_at: iso(r.created_at),
  };
}

/** Opaque keyset cursor `(opened_at, id)`; `ts` keeps the DB's microseconds so ties never skip rows. */
export function encodeCursor(ts: string, id: unknown): string {
  return Buffer.from(`${ts}|${String(id)}`).toString("base64url");
}
const CURSOR_ID = {
  uuid: /^[0-9a-f-]{36}$/,
  int: /^\d{1,19}$/,
  mint: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
} as const;
export type CursorIdKind = keyof typeof CURSOR_ID;

export function decodeCursor(c: string | null, kind: CursorIdKind = "uuid"): { ts: string; id: string } | null | "bad" {
  if (!c) return null;
  if (c.length > 200) return "bad";
  const s = Buffer.from(c, "base64url").toString("utf8");
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z)\|(.+)$/.exec(s);
  if (!m?.[1] || !m[2] || !CURSOR_ID[kind].test(m[2]) || Number.isNaN(Date.parse(m[1]))) return "bad";
  return { ts: m[1], id: m[2] };
}

/** SQL select-list fragment for the keyset columns (`cur_ts` keeps microseconds). */
export function cursorCols(tsExpr: string, idExpr: string): string {
  return `to_char(${tsExpr} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_ts, (${idExpr})::text as cur_id`;
}

/** Rows were fetched with `limit + 1`; returns the page and the next cursor. */
export function pageOf<R extends { cur_ts: string; cur_id: string }, T>(rows: R[], limit: number, map: (r: R) => T): { items: T[]; next_cursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { items: page.map(map), next_cursor: rows.length > limit && last ? encodeCursor(last.cur_ts, last.cur_id) : null };
}
