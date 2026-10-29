// Row -> wire conversions. Rules (EVENTS_SCHEMA section 1): lamports / int64 as integer strings (node-pg
// already returns int8 as string), timestamps RFC 3339 UTC with ms, scores/percentages as JSON numbers.
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
}

export const EVENT_COLUMNS =
  "seq, id, type, version, ts, workspace_id, strategy_id, ck, mint, actor::text as actor, mode::text as mode, payload, untrusted";

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
  };
}

export const APPROVAL_COLUMNS =
  "id, workspace_id, strategy_id, kind::text as kind, mode::text as mode, subject, mint, amount_lamports, is_first_buy, risk, weakening, status::text as status, rev, expire_reason::text as expire_reason, base_rev, decision, reject_reason::text as reject_reason, decided_via::text as decided_via, decided_by, payload, created_at, expires_at, decided_at";

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
export function decodeCursor(c: string | null): { ts: string; id: string } | null | "bad" {
  if (!c) return null;
  const s = Buffer.from(c, "base64url").toString("utf8");
  const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\|([0-9a-f-]{36})$/.exec(s);
  return m?.[1] && m[2] ? { ts: m[1], id: m[2] } : "bad";
}
