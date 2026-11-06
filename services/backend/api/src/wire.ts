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

/** Time bounds a keyset walk is pinned to (`null` = open-ended). */
export interface CursorRange {
  from: string | null;
  to: string | null;
}

/**
 * Opaque keyset cursor `(opened_at, id)`; `ts` keeps the DB's microseconds so ties never skip rows.
 * A ranged page also freezes its bounds and the `window` it came from, so page 2 cannot silently shift
 * a relative window (`window=7d` recomputed later drops the oldest rows) and a cursor cannot be replayed
 * against another range.
 */
export function encodeCursor(ts: string, id: unknown, range?: CursorRange | null, window?: string | null): string {
  const base = `${ts}|${String(id)}`;
  if (!range) return Buffer.from(base).toString("base64url");
  return Buffer.from(`${base}|${range.from ?? ""}|${range.to ?? ""}|${window ?? ""}`).toString("base64url");
}
const CURSOR_ID = {
  // canonical 8-4-4-4-12 hex only: a 36-character run of hyphens passed the old check and reached `$9::uuid`.
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  int: /^\d{1,19}$/,
  mint: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
} as const;
export type CursorIdKind = keyof typeof CURSOR_ID;

export const CURSOR_WINDOWS = new Set(["1h", "24h", "7d", "30d", "all"]);

export interface Cursor {
  ts: string;
  id: string;
  /** Range frozen on page 1; `null` for a cursor that is not range-bound. */
  range: CursorRange | null;
  /** `window` key the frozen range came from; `null` for explicit `from`/`to` or an unbounded list. */
  window: string | null;
}

export function decodeCursor(c: string | null, kind: CursorIdKind = "uuid"): Cursor | null | "bad" {
  if (!c) return null;
  // ts + id + from + to + window, each part bounded; the cap keeps a forged cursor from being huge.
  if (c.length > 320) return "bad";
  const s = Buffer.from(c, "base64url").toString("utf8");
  const parts = s.split("|");
  if (parts.length !== 2 && parts.length !== 5) return "bad";
  const [ts, id, from = "", to = "", w = ""] = parts;
  if (!ts || !id || !CURSOR_ID[kind].test(id) || Number.isNaN(Date.parse(ts))) return "bad";
  if (parts.length === 2) return { ts, id, range: null, window: null };
  if (w && !CURSOR_WINDOWS.has(w)) return "bad";
  if (from && Number.isNaN(Date.parse(from))) return "bad";
  if (to && Number.isNaN(Date.parse(to))) return "bad";
  return { ts, id, range: { from: from || null, to: to || null }, window: w || null };
}

/** SQL select-list fragment for the keyset columns (`cur_ts` keeps microseconds). */
export function cursorCols(tsExpr: string, idExpr: string): string {
  return `to_char(${tsExpr} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_ts, (${idExpr})::text as cur_id`;
}

/**
 * Rows were fetched with `limit + 1`; returns the page and the next cursor. Pass `range` (and the
 * `window` it came from) for a ranged list so the next page reuses the exact same bounds and echoes them
 * as `range_from`/`range_to` (additive; clients that ignore them are unaffected).
 */
export function pageOf<R extends { cur_ts: string; cur_id: string }, T>(
  rows: R[],
  limit: number,
  map: (r: R) => T,
  range?: CursorRange | null,
  window?: string | null,
): { items: T[]; next_cursor: string | null; range_from?: string | null; range_to?: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const next = rows.length > limit && last ? encodeCursor(last.cur_ts, last.cur_id, range ?? null, window ?? null) : null;
  if (!range) return { items: page.map(map), next_cursor: next };
  return { items: page.map(map), next_cursor: next, range_from: range.from, range_to: range.to };
}
