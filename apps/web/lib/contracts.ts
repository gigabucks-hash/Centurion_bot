/**
 * Edge mappers between the contract wire format (@centurion/contracts/wire, v1.1.2) and the UI view models in
 * lib/types.ts. Rule: lamports / decimals stay strings on the wire; they become JS numbers only here, at the
 * edge, right before formatting. Nothing outside lib/contracts.ts, lib/http-api.ts and the mock BFF builds
 * wire objects.
 */
import { lamportsToSol, type Actor, type AnyEvent, type EventEnvelope, type EventPage, type ExitReason, type Lamports, type Mode } from "@centurion/contracts/wire";
import { APPROVAL_REJECT_REASONS, type ApprovalRejectReason, type ApprovalWire, type DecidedVia } from "@centurion/contracts/wire";
import type { DecimalString, ErrorCode, ExitStatsRow, MarketCapFields, PnlSummary as PnlSummaryWire, PositionWire, ProposalStatus, ProposalUpdated, TokenProgram } from "@centurion/contracts/wire";
import { REAL_LOCKED_REASONS, type PaperProgress, type RealLockedReason, type StrategyRealGateFields } from "@centurion/contracts/wire";
import { pctToFractionBps } from "@centurion/i18n/format";
/** Contracts pin for apps/web (Apex, 3 Nov): @centurion/contracts 1.1.6 at commit 4e0d7f3 (+ additive c99b114 logo_hash). */
export const CONTRACTS_PIN = { version: "1.1.6", commit: "4e0d7f3" } as const;
import { logoHashFromWire, logoHashOf, wireLogo } from "./media";
import { safeSymbol } from "./untrusted";
import { cmpSeq, maxSeq, minSeq, seqGt, seqLt, type Seq } from "./seq";
import type { Approval, SkipReason, ClosedTrade, CoinMeta, CoinSummary, EventKind, ExitReasonStat, GuardCheck, OpenPosition, PnlSummary, ScreenerState, Strategy, StrategySettings, TradeEvent } from "./types";

/** SOL (UI number) → lamports integer string. Rounds to the lamport; never emits an exponent. */
export function solToLamports(sol: number): Lamports {
  const neg = sol < 0;
  const [w, f = ""] = Math.abs(sol).toFixed(9).split(".");
  const v = BigInt(w) * 1_000_000_000n + BigInt((f + "000000000").slice(0, 9));
  return (neg && v !== 0n ? `-${v}` : `${v}`) as Lamports;
}

/** Lamports string → SOL number for display only (exact to 9 dp via the contract helper). */
export function lamportsToSolNumber(l: Lamports | null | undefined): number | undefined {
  return l == null ? undefined : Number(lamportsToSol(l));
}

/** Feed kind ↔ envelope type (EVENTS_SCHEMA §2). */
export const KIND_TO_TYPE: Record<EventKind, string> = {
  found: "coin.detected",
  passed: "screener.scored",
  blocked: "guard.result",
  armed: "entry.armed",
  expired: "proposal.expired",
  proposal: "proposal.created",
  approved: "proposal.approved",
  skipped: "proposal.rejected",
  bought: "position.opened",
  sold: "position.closed",
};
const TYPE_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_TYPE).map(([k, v]) => [v, k])) as Record<string, EventKind>;
TYPE_TO_KIND["exit.triggered"] = "sold";

/**
 * Mock-only payload for feed rows. Real payloads (PositionOpened, PositionClosed, …) carry more; the fields
 * below are the subset the feed renders, under contract names where one exists.
 */
export interface FeedPayload {
  summary: string;
  reason?: string;
  reason_code?: string;
  sol_lamports?: Lamports;
  pnl_lamports?: Lamports;
  pnl_pct?: number;
  price_usd?: string;
  partial?: boolean;
  exit_reason?: ExitReason;
  rev?: number;
}

export function tradeEventToEnvelope(e: TradeEvent, ctx: { workspaceId: string; mode: Mode }): EventEnvelope<string, FeedPayload> {
  const type = e.type ?? (e.kind === "sold" && e.partial ? "exit.triggered" : KIND_TO_TYPE[e.kind]);
  return {
    id: e.id,
    seq: e.seq,
    type,
    version: 1,
    workspace_id: ctx.workspaceId,
    strategy_id: e.strategyId ?? null,
    ck: e.ck ?? (e.mint && e.strategyId ? `${e.strategyId}:${e.mint}` : null),
    mint: e.mint ?? null,
    ts: new Date(e.ts).toISOString(),
    actor: e.actor as Actor,
    mode: ctx.mode,
    // 1.1.6: every envelope that carries a mint also carries our logo proxy URL.
    ...(e.mint ? wireLogo(e.mint) : {}),
    payload: {
      summary: e.message,
      reason: e.reason,
      ...(e.reasonCode ? { reason_code: e.reasonCode } : {}),
      sol_lamports: e.solAmount != null ? solToLamports(e.solAmount) : undefined,
      pnl_lamports: e.pnlSol != null ? solToLamports(e.pnlSol) : undefined,
      pnl_pct: e.pctChange,
      price_usd: e.priceUsd != null ? String(e.priceUsd) : undefined,
      partial: e.partial,
      exit_reason: e.exitReason,
      rev: e.rev,
    },
    untrusted: e.symbol ? { symbol: e.symbol } : {},
  };
}

/** Returns null for unknown event types (clients must ignore them). */
export function envelopeToTradeEvent(env: AnyEvent | EventEnvelope<string, FeedPayload>): TradeEvent | null {
  const kind = TYPE_TO_KIND[env.type];
  if (!kind) return null;
  const p = (env.payload ?? {}) as Partial<FeedPayload> & { pnl_lamports?: Lamports; exit_reason?: ExitReason; pnl_pct?: number };
  return {
    id: env.id,
    seq: env.seq,
    type: env.type as TradeEvent["type"],
    ck: env.ck ?? undefined,
    ts: Date.parse(env.ts),
    kind,
    actor: env.actor,
    strategyId: env.strategy_id ?? undefined,
    mode: env.mode,
    mint: env.mint ?? undefined,
    logoHash: logoHashOf(env as { logo_hash?: unknown; logo_url?: unknown }, env.mint),
    // Untrusted token metadata is display-only text, never markup.
    symbol: typeof env.untrusted?.symbol === "string" ? safeSymbol(env.untrusted.symbol) || undefined : undefined,
    message: p.summary ?? env.type,
    reason: p.reason,
    ...(p.reason_code ? { reasonCode: p.reason_code } : {}),
    solAmount: lamportsToSolNumber(p.sol_lamports),
    pnlSol: lamportsToSolNumber(p.pnl_lamports),
    pctChange: p.pnl_pct,
    priceUsd: p.price_usd != null ? Number(p.price_usd) : undefined,
    partial: p.partial ?? (env.type === "exit.triggered" ? true : undefined),
    exitReason: p.exit_reason,
    rev: p.rev,
  };
}

/** Page through events by seq (int64 strings, compared with BigInt). Gaps are allowed (monotonic, not gapless). */
export function pageEvents<E extends { seq: Seq }>(all: E[], q: { after_seq?: Seq | null; before_seq?: Seq | null; limit?: number }, serverNow: string): Omit<EventPage, "items"> & { items: E[] } {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const asc = [...all].sort((a, b) => cmpSeq(a.seq, b.seq));
  const safe = asc.length ? asc[asc.length - 1].seq : "0";
  let items: E[];
  let hasMore: boolean;
  if (q.after_seq != null) {
    const after = q.after_seq;
    const rest = asc.filter((e) => seqGt(e.seq, after));
    items = rest.slice(0, limit);
    hasMore = rest.length > limit;
  } else {
    const before = q.before_seq;
    const rest = asc.filter((e) => before == null || seqLt(e.seq, before)).reverse();
    items = rest.slice(0, limit);
    hasMore = rest.length > limit;
  }
  const seqs = items.map((e) => e.seq);
  return {
    items,
    next_after_seq: maxSeq(seqs) ?? q.after_seq ?? null,
    next_before_seq: minSeq(seqs),
    has_more: hasMore,
    safe_seq: safe,
    server_now: serverNow,
  };
}

// ---------------------------------------------------------------------------
// Approvals (contracts 1.1.3): the official `ApprovalWire` (= SQL public.approval_wire(), also the `current` of
// an approval 409). Everything the UI shows beyond the contract fields (title, pick, diff, guard cooldown, …)
// travels in the contract's free-form `payload` object, documented below as `ApprovalPayload` (mock-defined).
// GET /approvals/{id} adds the single-use decision_token next to the resource.
// ---------------------------------------------------------------------------

export type { ApprovalWire, ApprovalRejectReason };
export { APPROVAL_REJECT_REASONS };

/** GET /approvals/{id} item: the resource plus its single-use decision token. */
export type ApprovalItemWire = ApprovalWire & { decision_token?: string; decision_token_expires_at?: string };

/** Display-only extras inside ApprovalWire.payload (mock-defined; Backend owns the real payload per kind). */
export interface ApprovalPayload {
  title: string;
  detail: string;
  strategy_name: string | null;
  untrusted: { symbol?: string };
  requested_by: Actor;
  execution: "executing" | "filled" | "failed" | null;
  screener_state: string | null;
  skip_reason: string | null;
  skip_note: string | null;
  to_rev: number | null;
  guard_change: { status: Approval["guardChangeState"] | null; cooldown_until: string | null; auto_revert_at: string | null } | null;
  team_action: string | null;
  audit_id: string | null;
  pick?: Approval["pick"];
  diff?: Approval["diff"];
  risk_impact?: Approval["riskImpact"];
  /** Display-only quote context: token decimals and SOL prices (now / at pick time). */
  quote_extra?: { decimals?: number; price_sol?: string; pick_price_sol?: string };
}

/**
 * Skip chip → contract reject_reason (1.1.3, decision=reject only). Not tradeable → not_tradeable;
 * "already pumped" = the price ran away → price_moved; the other chips → other; no chip → user_declined.
 * The chip itself still goes in the free-text `reason` so the audit keeps the detail.
 */
export function rejectReasonFor(o: { notTradeable?: boolean; skipReason?: SkipReason | null }): ApprovalRejectReason {
  if (o.notTradeable) return "not_tradeable";
  switch (o.skipReason) {
    case undefined:
    case null:
      return "user_declined";
    case "already_pumped":
      return "price_moved";
    default:
      return "other";
  }
}

const iso = (t?: number) => (t == null ? null : new Date(t).toISOString());
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : undefined);
const DECIDED: Partial<Record<ProposalStatus, "approve" | "reject">> = { approved: "approve", rejected: "reject" };

export function approvalToWire(a: Approval, extra: { workspaceId?: string; decidedVia?: DecidedVia | null; rejectReason?: ApprovalRejectReason | null } = {}): ApprovalWire {
  const exec = a.status === "executing" || a.status === "filled" || a.status === "failed" ? a.status : null;
  const status: ProposalStatus = exec ? "approved" : (a.status as ProposalStatus);
  const payload: ApprovalPayload = {
    title: a.title,
    detail: a.detail,
    strategy_name: a.strategyName ?? null,
    untrusted: a.symbol ? { symbol: a.symbol } : {},
    requested_by: a.requestedBy,
    execution: exec,
    screener_state: a.screenerState ?? null,
    skip_reason: a.skipReason ?? null,
    skip_note: a.skipNote ?? null,
    to_rev: a.revTo ?? null,
    guard_change: a.kind === "guard_change" ? { status: a.guardChangeState ?? null, cooldown_until: iso(a.cooldownEndsAt), auto_revert_at: iso(a.autoRevertAt) } : null,
    team_action: a.teamAction ?? null,
    audit_id: a.auditId ?? null,
    ...(a.pick ? { pick: a.pick } : {}),
    ...(a.diff ? { diff: a.diff } : {}),
    ...(a.riskImpact ? { risk_impact: a.riskImpact } : {}),
    ...(a.quote ? { quote_extra: { decimals: a.quote.decimals, price_sol: a.quote.priceSol, pick_price_sol: a.quote.pickPriceSol } } : {}),
  };
  const decision = DECIDED[status] ?? null;
  const q = a.quote;
  return {
    id: a.id,
    proposal_id: a.id,
    workspace_id: extra.workspaceId ?? "ws_mock",
    strategy_id: a.strategyId ?? null,
    kind: a.kind,
    mode: a.mode,
    subject: a.symbol ?? a.strategyName ?? null,
    mint: a.mint ?? null,
    amount_lamports: a.amountSol != null ? solToLamports(a.amountSol) : null,
    is_first_buy: a.pick?.pickKind === "first_buy",
    risk: a.risk,
    weakening: a.kind === "guard_change",
    status,
    rev: a.rev,
    expire_reason: a.expiredReason ?? null,
    base_rev: a.revFrom ?? null,
    decision,
    reject_reason: decision === "reject" ? (extra.rejectReason ?? a.rejectReason ?? rejectReasonFor({ notTradeable: a.screenerState === "UNSUPPORTED_QUOTE_MINT", skipReason: a.skipReason })) : null,
    decided_via: decision ? (extra.decidedVia ?? "web") : null,
    decided_by: null,
    payload: payload as unknown as ApprovalWire["payload"],
    // contracts 1.1.4 quote fields (review sheet, WF-22): null when there is no quote.
    est_network_fee_lamports: (q?.networkFeeLamports ?? null) as Lamports | null,
    priority_fee_lamports: (q?.priorityFeeLamports ?? null) as Lamports | null,
    swap_fee_bps: q?.swapFeeBps ?? null,
    max_slippage_bps: q?.maxSlippageBps ?? null,
    min_out_raw: (q?.minOutRaw ?? null) as never,
    total_max_lamports: (q?.totalMaxLamports ?? null) as Lamports | null,
    quote_ts: iso(q?.quoteTs),
    quote_expires_at: iso(q?.quoteExpiresAt),
    // contracts 1.1.5: quote_id counts refreshes (never bumps rev); ATA rent; mint decimals/program.
    quote_id: (q?.quoteId ?? "0") as never,
    est_ata_rent_lamports: (q?.ataRentLamports ?? (q ? "0" : null)) as Lamports | null,
    expected_out_lamports: null,
    min_out_lamports: null,
    decimals: q?.decimals ?? null,
    token_program: null,
    position_id: null,
    // 1.1.6 (c99b114): logo_hash + logo_url (with &v=) on approvals.
    ...wireLogo(a.mint),
    created_at: iso(a.createdAt)!,
    expires_at: iso(a.expiresAt)!,
    decided_at: iso(a.decidedAt),
  };
}

export function approvalFromWire(w: ApprovalItemWire): Approval {
  const p = (w.payload ?? {}) as unknown as Partial<ApprovalPayload>;
  const sym = p.untrusted?.symbol;
  return {
    id: w.id,
    rev: w.rev,
    // logo_hash (c99b114); older 1.1.6 servers (4e0d7f3) only sent logo_url → recover `v` from it.
    logoHash: logoHashOf(w as { logo_hash?: unknown; logo_url?: unknown }, w.mint),
    decisionToken: w.decision_token,
    kind: w.kind,
    status: p.execution ?? w.status,
    mode: w.mode,
    strategyId: w.strategy_id ?? undefined,
    strategyName: p.strategy_name ?? undefined,
    mint: w.mint ?? undefined,
    // Untrusted token text: plain text only, clipped.
    symbol: typeof sym === "string" ? safeSymbol(sym) || undefined : undefined,
    title: p.title ?? w.subject ?? w.kind,
    detail: p.detail ?? "",
    amountSol: lamportsToSolNumber(w.amount_lamports),
    risk: w.risk,
    requestedBy: p.requested_by ?? "system",
    createdAt: ms(w.created_at)!,
    expiresAt: ms(w.expires_at)!,
    decidedAt: ms(w.decided_at),
    expiredReason: w.expire_reason ?? undefined,
    ...(p.screener_state === "UNSUPPORTED_QUOTE_MINT" ? { screenerState: "UNSUPPORTED_QUOTE_MINT" as const } : {}),
    skipReason: (p.skip_reason ?? undefined) as Approval["skipReason"],
    skipNote: p.skip_note ?? undefined,
    rejectReason: w.reject_reason ?? undefined,
    pick: p.pick,
    teamAction: (p.team_action ?? undefined) as Approval["teamAction"],
    diff: p.diff,
    riskImpact: p.risk_impact,
    revFrom: w.base_rev ?? undefined,
    revTo: p.to_rev ?? undefined,
    cooldownEndsAt: ms(p.guard_change?.cooldown_until),
    autoRevertAt: ms(p.guard_change?.auto_revert_at),
    guardChangeState: p.guard_change?.status ?? undefined,
    auditId: p.audit_id ?? undefined,
    ...(quoteFromWire(w, p) ? { quote: quoteFromWire(w, p) } : {}),
  };
}

/** proposal.updated (1.1.4) → in-place patch: new rev + new quote (decimals/price display extras kept from the item). */
export function applyProposalUpdated(a: Approval, u: ProposalUpdated): Approval {
  // 1.1.5: rev is unchanged by a re-quote; quote_id (int64 string) increments. Ignore older/equal quote ids and older revs.
  if (a.id !== u.proposal_id || u.rev < a.rev) return a;
  const prev = a.quote?.quoteId != null ? BigInt(a.quote.quoteId) : -1n;
  const next = typeof u.quote_id === "string" && /^\d{1,19}$/.test(u.quote_id) ? BigInt(u.quote_id) : null;
  if (u.rev === a.rev && (next == null || next <= prev)) return a;
  const q = quoteFromWire(u as unknown as ApprovalItemWire, { quote_extra: { decimals: u.decimals ?? a.quote?.decimals, price_sol: a.quote?.priceSol, pick_price_sol: a.quote?.pickPriceSol } });
  return { ...a, rev: u.rev, ...(q ? { quote: q } : {}) };
}

function quoteFromWire(w: ApprovalItemWire, p: Partial<ApprovalPayload>): Approval["quote"] | undefined {
  const x = w as Partial<ApprovalWire> & Record<string, unknown>;
  const has = x.est_network_fee_lamports != null || x.swap_fee_bps != null || x.max_slippage_bps != null || x.total_max_lamports != null;
  if (!has) return undefined;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    networkFeeLamports: str(x.est_network_fee_lamports), priorityFeeLamports: str(x.priority_fee_lamports), swapFeeBps: num(x.swap_fee_bps), maxSlippageBps: num(x.max_slippage_bps),
    minOutRaw: str(x.min_out_raw), totalMaxLamports: str(x.total_max_lamports), quoteTs: ms(str(x.quote_ts)), quoteExpiresAt: ms(str(x.quote_expires_at)),
    // 1.1.5 (pending, additive): read when present so the review sheet already keys holds by quote_id.
    quoteId: str(x.quote_id)?.slice(0, 20), ataRentLamports: str(x.est_ata_rent_lamports),
    decimals: typeof x.decimals === "number" ? x.decimals : p.quote_extra?.decimals, priceSol: p.quote_extra?.price_sol, pickPriceSol: p.quote_extra?.pick_price_sol,
  };
}

/** sha256 hex of the canonical JSON of the exact change (proof-of-confirmation payload_hash). */
export async function payloadHash(change: unknown): Promise<string> {
  const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
  const bytes = new TextEncoder().encode(JSON.stringify(canon(change)));
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Strategy settings ↔ wire (services/backend/config/strategy_settings.schema.json, v1.1 flat snake_case).
// The builder keeps a grouped form model (StrategySettings); this is the only place that knows both.
// SOL = lamport strings, percentages = numbers.
// ---------------------------------------------------------------------------

export type WireSettings = Record<string, unknown> & {
  name: string;
  approval_mode: StrategySettings["approvalMode"];
  bankroll_lamports: Lamports;
  ticket_lamports: Lamports;
  max_concurrent_positions: number;
  venues: StrategySettings["screener"]["streams"];
  exit_preset?: string;
};

/** Form → wire (flat snake_case keys only from the schema; the guard preset name is UI-only and dropped). */
export function settingsToWire(s: StrategySettings): WireSettings {
  const sc = s.screener;
  const ex = s.exit;
  return {
    name: s.name,
    approval_mode: s.approvalMode,
    bankroll_lamports: solToLamports(s.sizing.budgetSol),
    ticket_lamports: solToLamports(s.sizing.tradeSol),
    max_concurrent_positions: s.sizing.maxOpen,
    [s.mode === "real" ? "real_drawdown_halt_pct" : "practice_drawdown_halt_pct"]: s.sizing.lossStopPct,
    venues: [...sc.streams],
    age_minutes_min: sc.minAgeMinutes,
    age_minutes_max: sc.maxAgeMinutes,
    mcap_usd_min: sc.minMarketCapUsd,
    mcap_usd_max: sc.maxMarketCapUsd,
    liquidity_usd_min: sc.minLiquidityUsd,
    volume_24h_usd_min: sc.minVolume24hUsd,
    holder_count_min: sc.minHolders,
    unique_buyers_1h_min: sc.minBuyers1h,
    buy_to_sell_ratio_min: sc.minBuySellRatio,
    top_holders_share_pct_max: sc.maxTop10Percent,
    lp_burned_pct_min: sc.minLpBurnPct,
    off_high_pct_max: sc.maxDrawdownPct,
    required_checks: [...sc.mustHave],
    score_threshold: sc.passMark,
    creator_share_pct_max: s.guard.maxDevPercent,
    bundled_share_pct_max: s.guard.maxBundlersPct,
    sniper_share_pct_max: s.guard.maxSnipersPct,
    guard_checks: Object.fromEntries(Object.entries(s.guard.checks).map(([k, v]) => [k, { enabled: v }])),
    entry_discount_pct: s.entry.dipPct,
    observe_before_entry_minutes: s.entry.entryDelayMinutes,
    skip_if_risen_pct: s.entry.entryMaxUpPct,
    range_break_entry: s.entry.breakout.enabled ? { window_minutes: s.entry.breakout.minutes, range_pct: s.entry.breakout.rangePct, buyers_min: s.entry.breakout.buyers } : null,
    liveness_gate: s.entry.activeTrading ? { enabled: true } : null,
    reentry: s.entry.rebuy ? { enabled: true } : null,
    entry_hours_utc: s.entry.tradingHoursUtc.enabled ? { from: s.entry.tradingHoursUtc.from, to: s.entry.tradingHoursUtc.to } : null,
    ...(ex.plan !== "custom" ? { exit_preset: ex.plan } : {}),
    profit_targets: ex.takeProfits.map((r) => ({ at_gain_pct: r.gainPct, sell_portion_pct: r.sellPct, ...(r.pullbackPct != null ? { giveback_pct: r.pullbackPct } : {}) })),
    // 1.1.2: two distinct exits. stop_loss_pct = hard stop from ENTRY (v1.0 exit.stopLossPct);
    // peak_trail_pct = trailing stop from the PEAK. Both 0 = off, else 5–49.
    stop_loss_pct: ex.stopLossPct,
    peak_trail_pct: ex.trailingPct,
    // Deterministic floors stay on with the server default max_loss_pct (35); only the liquidity floor is set here.
    sell_floors: { enabled: true, liquidity_drop_pct: 80 },
    // contracts 1.1.4: time stop (exit_reason max_hold) and stall exit (exit_reason stall); null = off.
    time_stop_s: ex.timeStopMinutes > 0 ? Math.round(ex.timeStopMinutes * 60) : null,
    stall_exit: ex.stallExit ? { window_s: Math.round(ex.stallWindowS), min_move_pct: ex.stallMinMovePct } : null,
    idle_exit_seconds: ex.noTradeSeconds || null,
    sell_pressure_exit: ex.drainDropPct ? { fall_pct: ex.drainDropPct, window_minutes: 5 } : null,
  };
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Wire → form (inverse of settingsToWire; unknown keys are ignored, missing ones take `fallback`). */
export function settingsFromWire(w: WireSettings, fallback: StrategySettings): StrategySettings {
  const f = fallback;
  const mode = f.mode;
  const pt = (w.profit_targets as { at_gain_pct: number; sell_portion_pct: number; giveback_pct?: number }[] | undefined) ?? [];
  const gc = (w.guard_checks as Record<string, { enabled?: boolean }> | null | undefined) ?? {};
  const hours = w.entry_hours_utc as { from: number; to: number } | null | undefined;
  const rb = w.range_break_entry as { window_minutes: number; range_pct: number; buyers_min: number } | null | undefined;
  return {
    name: String(w.name ?? f.name),
    mode,
    approvalMode: w.approval_mode ?? f.approvalMode,
    sizing: {
      budgetSol: lamportsToSolNumber(w.bankroll_lamports) ?? f.sizing.budgetSol,
      tradeSol: lamportsToSolNumber(w.ticket_lamports) ?? f.sizing.tradeSol,
      maxOpen: num(w.max_concurrent_positions, f.sizing.maxOpen),
      lossStopPct: num(w[mode === "real" ? "real_drawdown_halt_pct" : "practice_drawdown_halt_pct"], f.sizing.lossStopPct),
    },
    screener: {
      streams: (w.venues as StrategySettings["screener"]["streams"]) ?? f.screener.streams,
      minAgeMinutes: num(w.age_minutes_min, f.screener.minAgeMinutes),
      maxAgeMinutes: num(w.age_minutes_max, f.screener.maxAgeMinutes),
      minMarketCapUsd: num(w.mcap_usd_min, f.screener.minMarketCapUsd),
      maxMarketCapUsd: num(w.mcap_usd_max, f.screener.maxMarketCapUsd),
      minLiquidityUsd: num(w.liquidity_usd_min, f.screener.minLiquidityUsd),
      minVolume24hUsd: num(w.volume_24h_usd_min, f.screener.minVolume24hUsd),
      minHolders: num(w.holder_count_min, f.screener.minHolders),
      minBuyers1h: num(w.unique_buyers_1h_min, f.screener.minBuyers1h),
      minBuySellRatio: num(w.buy_to_sell_ratio_min, f.screener.minBuySellRatio),
      maxTop10Percent: num(w.top_holders_share_pct_max, f.screener.maxTop10Percent),
      minLpBurnPct: num(w.lp_burned_pct_min, f.screener.minLpBurnPct),
      maxDrawdownPct: num(w.off_high_pct_max, f.screener.maxDrawdownPct),
      mustHave: (w.required_checks as StrategySettings["screener"]["mustHave"]) ?? f.screener.mustHave,
      passMark: num(w.score_threshold, f.screener.passMark),
    },
    guard: {
      preset: f.guard.preset,
      maxDevPercent: num(w.creator_share_pct_max, f.guard.maxDevPercent),
      maxBundlersPct: num(w.bundled_share_pct_max, f.guard.maxBundlersPct),
      maxSnipersPct: num(w.sniper_share_pct_max, f.guard.maxSnipersPct),
      checks: Object.fromEntries(Object.keys(f.guard.checks).map((k) => [k, gc[k]?.enabled ?? f.guard.checks[k as GuardCheck]])) as Record<GuardCheck, boolean>,
    },
    entry: {
      dipPct: num(w.entry_discount_pct, f.entry.dipPct),
      entryDelayMinutes: num(w.observe_before_entry_minutes, f.entry.entryDelayMinutes),
      entryMaxUpPct: num(w.skip_if_risen_pct, f.entry.entryMaxUpPct),
      breakout: rb ? { enabled: true, minutes: rb.window_minutes, rangePct: rb.range_pct, buyers: rb.buyers_min } : { ...f.entry.breakout, enabled: false },
      activeTrading: w.liveness_gate != null,
      rebuy: w.reentry != null,
      tradingHoursUtc: hours ? { enabled: true, from: hours.from, to: hours.to } : { ...f.entry.tradingHoursUtc, enabled: false },
    },
    exit: {
      plan: (w.exit_preset as StrategySettings["exit"]["plan"]) ?? "custom",
      takeProfits: pt.map((r) => ({ gainPct: r.at_gain_pct, sellPct: r.sell_portion_pct, ...(r.giveback_pct != null ? { pullbackPct: r.giveback_pct } : {}) })),
      trailingPct: num(w.peak_trail_pct, f.exit.trailingPct),
      stopLossPct: num(w.stop_loss_pct, f.exit.stopLossPct),
      // 1.1.4 time_stop_s (seconds, null/absent = off) → minutes; absent key keeps the fallback (older servers).
      timeStopMinutes: "time_stop_s" in w ? (typeof w.time_stop_s === "number" ? w.time_stop_s / 60 : 0) : f.exit.timeStopMinutes,
      noTradeSeconds: num(w.idle_exit_seconds, 0),
      drainDropPct: num((w.sell_pressure_exit as { fall_pct?: number } | null)?.fall_pct, 0),
      ...stallFromWire(w, f.exit),
    },
  };
}

function stallFromWire(w: WireSettings, f: StrategySettings["exit"]): Pick<StrategySettings["exit"], "stallExit" | "stallWindowS" | "stallMinMovePct"> {
  if (!("stall_exit" in w)) return { stallExit: f.stallExit, stallWindowS: f.stallWindowS, stallMinMovePct: f.stallMinMovePct };
  const x = w.stall_exit as { window_s?: number; min_move_pct?: number } | null;
  return x ? { stallExit: true, stallWindowS: num(x.window_s, f.stallWindowS), stallMinMovePct: num(x.min_move_pct, f.stallMinMovePct) } : { stallExit: false, stallWindowS: f.stallWindowS, stallMinMovePct: f.stallMinMovePct };
}

/** JSON-merge `settings_patch` (only changed top-level keys) for PATCH /strategies/{id}. */
export function settingsPatch(base: WireSettings, next: WireSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (JSON.stringify(base[k]) !== JSON.stringify(next[k])) out[k] = k in next ? next[k] : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prices (v1.1): `*_price_sol` decimal strings, never floats or exponent notation.
// ---------------------------------------------------------------------------
/** Mock SOL/USD reference used only to derive SOL prices from the mock's USD prices. */
export const MOCK_SOL_USD = 150;

/** Number → plain decimal string ("0.000000123", never "1.23e-7"); up to 18 decimals, trailing zeros trimmed. */
export function toDecimalString(n: number, maxDecimals = 18): DecimalString {
  if (!Number.isFinite(n)) throw new RangeError("not finite");
  const fixed = Math.abs(n).toFixed(maxDecimals);
  const [i, d = ""] = fixed.split(".");
  const frac = d.replace(/0+$/, "");
  const s = frac ? `${i}.${frac}` : i;
  return (n < 0 && s !== "0" ? "-" : "") + s;
}

export const usdToPriceSol = (usd: number): DecimalString => toDecimalString(usd / MOCK_SOL_USD, 15);
export const priceSolToNumber = (s: DecimalString): number => Number(s);

// ---------------------------------------------------------------------------
// Contracts 1.1.2: coins (tradeable / skip_reason / decimals / token_program), positions + manual close,
// exit-stats rows.
// ---------------------------------------------------------------------------

/** Wire fields that decide whether a coin can be traded at all (ScreenerScored / ScreenerResult, 1.1.2). */
export interface TradeableWire { tradeable: boolean; skip_reason: ErrorCode | string | null }

/**
 * UI screener state from the wire. `tradeable: false` + `skip_reason: "UNSUPPORTED_QUOTE_MINT"` → "Not tradeable"
 * (WF-20/21). Any other untradeable reason is not a "Not tradeable" chip yet (no UX state; open item).
 */
export function screenerStateOf(w: TradeableWire): ScreenerState | undefined {
  return !w.tradeable && w.skip_reason === "UNSUPPORTED_QUOTE_MINT" ? "UNSUPPORTED_QUOTE_MINT" : undefined;
}

/** GET /coins item (mock). Contract fields + display extras (untrusted symbol, status) documented as mock. */
export interface CoinWire {
  mint: string; venue: CoinMeta["venue"]; launchpad: string | null;
  decimals: number | null; token_program: TokenProgram | null; quote_mint: string | null;
  tradeable: boolean; skip_reason: ErrorCode | null;
  untrusted: { symbol?: string; name?: string };
  /** mock display extras */
  strategy_id: string; strategy_name: string; mode: Mode; status: CoinSummary["status"]; last_event_at: string; pnl_lamports: Lamports | null;
}
/** + contracts 1.1.4 MarketCapFields (coins and picks). */
export type CoinWireWithMcap = CoinWire & MarketCapFields;

export function coinToWire(c: CoinMeta, s: CoinSummary): CoinWire {
  return {
    mint: c.mint, venue: c.venue, launchpad: c.launchpad, decimals: c.decimals, token_program: c.tokenProgram, quote_mint: c.quoteMint,
    tradeable: c.tradeable, skip_reason: c.skipReason, untrusted: { symbol: c.untrusted.symbol, name: c.untrusted.name },
    strategy_id: s.strategyId, strategy_name: s.strategyName, mode: s.mode, status: s.status, last_event_at: new Date(s.lastEventAt).toISOString(),
    pnl_lamports: s.pnlSol != null ? solToLamports(s.pnlSol) : null,
    ...mcapToWire(s.mcap),
    ...wireLogo(c.mint),
  } as CoinWireWithMcap;
}

export const mcapToWire = (m?: CoinSummary["mcap"]): MarketCapFields => ({
  mcap_source: m?.source ?? (m?.lamports ? "curve" : "unavailable"),
  market_cap_lamports: m?.lamports ?? null, mcap_usd: m?.usd ?? null, mcap_as_of: m?.asOf != null ? new Date(m.asOf).toISOString() : null,
});
/** Lenient: absent fields (pre-1.1.4 servers) → undefined; strings validated as integer / decimal. */
export function mcapFromWire(w: Partial<MarketCapFields>): CoinSummary["mcap"] {
  if (!("market_cap_lamports" in w) && !("mcap_usd" in w)) return undefined;
  const lamports = typeof w.market_cap_lamports === "string" && /^\d+$/.test(w.market_cap_lamports) ? w.market_cap_lamports : null;
  // eslint-disable-next-line security/detect-unsafe-regex -- linear, length-capped
  const usd = typeof w.mcap_usd === "string" && w.mcap_usd.length <= 40 && /^\d+(\.\d+)?$/.test(w.mcap_usd) ? w.mcap_usd : null;
  const asOf = typeof w.mcap_as_of === "string" ? Date.parse(w.mcap_as_of) : NaN;
  const source = w.mcap_source === "curve" || w.mcap_source === "pool" || w.mcap_source === "unavailable" ? w.mcap_source : undefined;
  return { lamports, usd, asOf: Number.isFinite(asOf) ? asOf : null, ...(source ? { source } : {}) };
}

export function coinSummaryFromWire(w: CoinWire): CoinSummary {
  return {
    mint: w.mint, symbol: safeSymbol(w.untrusted.symbol ?? ""), strategyId: w.strategy_id, strategyName: w.strategy_name, mode: w.mode,
    lastEventAt: Date.parse(w.last_event_at), status: w.status, pnlSol: lamportsToSolNumber(w.pnl_lamports),
    screenerState: screenerStateOf(w),
    mcap: mcapFromWire(w as Partial<MarketCapFields>),
    logoHash: logoHashFromWire((w as { logo_hash?: unknown }).logo_hash),
  };
}

/**
 * UI percent of the remaining quantity → contract `fraction_bps` (1–10000) via @centurion/i18n 0.4.3
 * `pctToFractionBps` (throws RangeError INVALID_FRACTION outside 0.01–100 %). `sell_pct` is gone (1.1.2).
 */
export const pctToBps = (pct: number): number => pctToFractionBps(pct);

/** PositionWire (contract) + mock display extras (symbol, strategy name, mark, PnL, sold share). */
export type PositionWireView = PositionWire & {
  untrusted: { symbol?: string }; strategy_name: string;
  mark_price_sol: DecimalString; unrealized_pnl_lamports: Lamports; pnl_pct: number; sold_bps: number;
  stop_loss_pct: number; peak_trail_pct: number;
};


export function positionToWire(p: OpenPosition, workspaceId: string): PositionWireView {
  const remaining = 1 - p.soldPct / 100;
  const dec = p.decimals ?? 6;
  const qty = p.entryPriceUsd > 0 ? (p.solIn * MOCK_SOL_USD * remaining) / p.entryPriceUsd : 0;
  return {
    id: p.key, position_key: p.key, workspace_id: workspaceId, strategy_id: p.strategyId, mint: p.mint, mode: p.mode,
    ...wireLogo(p.mint),
    status: "open", rev: p.rev, practice_epoch: p.practiceEpoch,
    qty_raw: BigInt(Math.round(qty * 10 ** Math.min(dec, 9))).toString() + "0".repeat(Math.max(0, dec - 9)),
    decimals: p.decimals, token_program: p.tokenProgram,
    cost_basis_lamports: solToLamports(p.solIn * remaining), sol_in_lamports: solToLamports(p.solIn),
    sol_out_lamports: solToLamports(p.solIn * (1 - remaining) * (1 + p.pnlPct / 100)), fees_lamports: solToLamports((p.solIn * 125) / 10_000),
    avg_entry_price_sol: usdToPriceSol(p.entryPriceUsd), peak_price_sol: null, exit_price_sol: null,
    exit_reason: null, opened_at: new Date(p.openedAt).toISOString(), closed_at: null,
    untrusted: { symbol: p.symbol }, strategy_name: p.strategyName,
    mark_price_sol: usdToPriceSol(p.nowPriceUsd), unrealized_pnl_lamports: solToLamports(p.pnlSol), pnl_pct: p.pnlPct,
    sold_bps: Math.round(p.soldPct * 100), stop_loss_pct: p.stopLossPct, peak_trail_pct: p.trailingPct,
  };
}

export function positionFromWire(w: PositionWireView): OpenPosition {
  return {
    key: w.position_key, strategyId: w.strategy_id ?? "", strategyName: w.strategy_name, mode: w.mode, mint: w.mint,
    logoHash: logoHashFromWire(w.logo_hash),
    symbol: safeSymbol(w.untrusted.symbol ?? ""),
    solIn: lamportsToSolNumber(w.sol_in_lamports) ?? 0,
    entryPriceUsd: Number(w.avg_entry_price_sol ?? "0") * MOCK_SOL_USD, nowPriceUsd: Number(w.mark_price_sol) * MOCK_SOL_USD,
    pnlSol: lamportsToSolNumber(w.unrealized_pnl_lamports) ?? 0, pnlPct: w.pnl_pct, openedAt: Date.parse(w.opened_at),
    soldPct: w.sold_bps / 100, stopLossPct: w.stop_loss_pct, trailingPct: w.peak_trail_pct,
    rev: w.rev, decimals: w.decimals, tokenProgram: w.token_program, practiceEpoch: w.practice_epoch,
  };
}

/** Exit-stats row (1.1.2, one shape for REST and RPC exit_stats()). Totals stay lamport strings so they reconcile. */
export function exitStatToWire(s: ExitReasonStat): ExitStatsRow {
  return {
    exit_reason: s.reason, count: s.count, pnl_lamports: solToLamports(s.totalPnlSol),
    avg_pnl_pct: s.count ? s.avgPnlPct : null, win_rate_pct: Math.round(s.winRate * 1000) / 10, avg_hold_s: s.avgHoldSeconds,
  };
}

export function exitStatFromWire(w: ExitStatsRow): ExitReasonStat {
  const total = lamportsToSolNumber(w.pnl_lamports) ?? 0;
  return {
    reason: w.exit_reason, count: w.count, wins: Math.round((w.win_rate_pct / 100) * w.count), winRate: w.win_rate_pct / 100,
    avgPnlSol: w.count ? total / w.count : 0, avgPnlPct: w.avg_pnl_pct ?? 0, totalPnlSol: total, avgHoldSeconds: w.avg_hold_s,
  };
}

/**
 * 0022 `GET /stats/pnl` → view model. Money is decoded once (exact lamport strings → display SOL); a null
 * portfolio value stays null so the card can say "not reported" instead of inventing 0.
 */
export function pnlSummaryFromWire(w: PnlSummaryWire): PnlSummary {
  const sol = (l: string | null | undefined) => (l == null ? null : lamportsToSolNumber(l) ?? null);
  return {
    mode: w.mode, practiceEpoch: w.practice_epoch, window: w.window, from: w.from ? Date.parse(w.from) : null,
    to: w.to ? Date.parse(w.to) : null,
    unrealizedPnlSol: sol(w.unrealized_pnl_lamports),
    realizedPnlSol: sol(w.realized_pnl_lamports),
    totalPnlSol: sol(w.total_pnl_lamports),
    realizedWindowSol: sol(w.realized_pnl_window_lamports),
    closedCount: w.closed_count, winCount: w.win_count,
    winRatePct: w.win_rate_pct, avgHoldSeconds: w.avg_hold_s,
    feesSol: sol(w.fees_lamports),
    bestPnlSol: sol(w.best_pnl_lamports), worstPnlSol: sol(w.worst_pnl_lamports),
    asOfSeq: w.as_of_seq, ts: w.ts ? Date.parse(w.ts) : null,
  };
}

/**
 * 0022 closed `PositionWire` → ledger row. `pnl_lamports` is the server's realized result
 * (`sol_out - sol_in`); never recompute it from the prices. Symbol/logo come from the coin join.
 */
export function closedTradeFromWire(w: PositionWire): ClosedTrade {
  const solIn = lamportsToSolNumber(w.sol_in_lamports) ?? null;
  const pnl = lamportsToSolNumber(w.pnl_lamports) ?? null;
  // F1: a missing wire value stays null (em dash), never 0 and never a value inferred from other fields
  // when either input is missing — a fabricated 0.00 reads as a real result.
  const solOut = lamportsToSolNumber(w.sol_out_lamports) ?? (solIn != null && pnl != null ? solIn + pnl : null);
  return {
    id: w.id, positionKey: w.position_key, strategyId: w.strategy_id, mode: w.mode, mint: w.mint,
    symbol: null, logoHash: logoHashFromWire(w.logo_hash) ?? null,
    solInSol: solIn, solOutSol: solOut,
    feesSol: lamportsToSolNumber(w.fees_lamports) ?? null,
    pnlSol: pnl, pnlPct: w.pnl_pct ?? null, holdSeconds: w.hold_seconds ?? null,
    exitReason: w.exit_reason ?? null,
    openedAt: Date.parse(w.opened_at),
    closedAt: Date.parse(w.closed_at ?? w.opened_at),
  };
}

/**
 * contracts 1.1.6 per-strategy Real gate (StrategyRealGateFields) on every strategy read. Lenient decode: a server
 * without the fields (pre-1.1.6) or a bad value reads as LOCKED (fail closed: Real is never offered by accident).
 * `real_locked_reason` null while locked → "other" (UX HANDOFF v2.6).
 */
export function realGateFromWire(w: Partial<StrategyRealGateFields> | null | undefined): Pick<Strategy, "realLocked" | "realLockedReason" | "paperProgress"> {
  const locked = w?.real_locked !== false;
  const reason = REAL_LOCKED_REASONS.includes(w?.real_locked_reason as RealLockedReason) ? (w!.real_locked_reason as RealLockedReason) : null;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
  const req = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const p = (w?.paper_progress ?? {}) as Partial<PaperProgress>;
  return {
    realLocked: locked,
    realLockedReason: locked ? (reason ?? "other") : null,
    paperProgress: { days_done: n(p.days_done), days_required: req(p.days_required), trades_done: n(p.trades_done), trades_required: req(p.trades_required) },
  };
}
export const realGateToWire = (s: Pick<Strategy, "mode" | "realLocked" | "realLockedReason" | "paperProgress">): StrategyRealGateFields => ({
  mode: s.mode, real_locked: s.realLocked, real_locked_reason: s.realLocked ? s.realLockedReason ?? "other" : null, paper_progress: { ...s.paperProgress },
});
