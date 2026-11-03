// Centurion stream contract v1.1.4 (snake_case everywhere). Mirrors services/backend/crates/common/src/event.rs,
// the SQL wire functions (position_wire, order_wire, fill_wire) and EVENTS_SCHEMA.md.
// Number rule: SOL amounts = lamport integer strings, raw token amounts = integer strings, prices = decimal
// strings, int64 ids (seq, job_id) = integer strings; percentages, ratios, bps, USD notionals, scores,
// counts, ms, rev, decimals = JSON numbers.
import type { ErrorCode } from "./errors";
import type { Base58, DecimalString, Int64String, IsoTs, Lamports, RawQty, Uuid } from "./units";

export const EVENT_SCHEMA_VERSION = 1 as const;
export const CONTRACTS_VERSION = "1.1.5" as const;

/** Any JSON value (used instead of `unknown` on the wire). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** "real" is reserved: rejected by API (REAL_SOL_DISABLED), JWT scope trade:real never issued, DB CHECK. */
export type Mode = "practice" | "real";
export type Actor = "ingest" | "screener" | "guard" | "entry" | "executor" | "exit" | "user" | "system";
/** Where a coin trades when discovered: still on a launch curve, or in an AMM pool. */
export type Venue = "curve" | "amm";
/** @deprecated v1.0 alias, removed in v1.2. Use `Venue`. */
export type CoinStream = Venue;
export type GuardVerdict = "PASS" | "WARN" | "FAIL";
export type GuardCheckStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";
/** 1.1.5 adds sell_position (sell proposals with a sell quote). */
export type ProposalKind = "buy_pick" | "guard_change" | "team_action" | "sell_position";
/** UI label for "rejected" is "Skipped". */
export type ProposalStatus = "pending" | "approved" | "rejected" | "expired";
/** Canonical wire values (exact strings). */
export type ProposalExpiredReason =
  | "timeout" | "strategy_deleted" | "strategy_archived" | "guard_failed" | "price_moved" | "practice_reset" | "account_deleted"
  /** phase7: reserved, never emitted before Phase 7 (buys paused / safety trip). */
  | "kill_switch";
export type ApprovalMode = "off" | "ask_first_buy" | "ask_every_buy";
export type RiskLevel = "low" | "medium" | "high" | "critical";
/** Derived server-side from the token / JWT claim; clients never send it. */
export type DecidedVia = "web" | "mobile" | "desktop" | "mcp" | "push";
/** sell_floor is evaluated before every other exit rule. `max_hold` also covers `time_stop_s`;
 *  `stall` (1.1.4) is `stall_exit` only (v1.0 `stall` is `no_new_high`). */
export type ExitReason =
  | "sell_floor" | "profit_target" | "loss_guard" | "peak_trail" | "max_hold" | "idle" | "sell_pressure"
  | "no_new_high" | "rug_detected" | "drawdown_halt" | "manual" | "strategy_retired" | "practice_reset"
  | "stall";
export const EXIT_REASONS: readonly ExitReason[] = [
  "sell_floor", "profit_target", "loss_guard", "peak_trail", "max_hold", "idle", "sell_pressure",
  "no_new_high", "rug_detected", "drawdown_halt", "manual", "strategy_retired", "practice_reset",
  "stall",
] as const;
export type ExitPreset =
  | "momentum_trail" | "principal_recovery" | "double_out" | "three_step_ladder" | "peak_giveback"
  | "trail_stop_only" | "incremental_trim" | "fast_half" | "fixed_thirty" | "new_high_timeout"
  | "ratchet" | "tightening_trail" | "geometric_ladder";
export type RequiredCheck =
  | "liquidity_usd" | "volume_24h_usd" | "mcap_usd" | "age_minutes_min" | "age_minutes_max"
  | "top_holders_share_pct" | "lp_burned_pct";
/** Guard check names (guard.result checks[].name, guard_checks settings keys). */
export type GuardCheckName =
  | "mint_authority" | "freeze_authority" | "lp_safety" | "top_holders_share" | "single_holder"
  | "creator_share" | "bundled_share" | "sniper_share" | "transfer_fee" | "honeypot" | "serial_creator";
export type FillSide = "buy" | "sell";
/** SPL Token or Token-2022 (from the mint account owner). */
export type TokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" | "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** wSOL mint. `quote_mint` null or this value = SOL quote. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112" as const;

/** Attacker-controlled token metadata. Render as plain text only. */
export interface Untrusted { name?: string; symbol?: string; uri?: string; image?: string; description?: string }

export interface EventEnvelope<T extends string = string, P = JsonValue> {
  /** Deterministic `<subject>:<epoch_ms>:<type>`; dedupe key. */
  id: string;
  /** int64 as an integer string (1.1.2). Monotonic, NOT gapless. Compare with BigInt. */
  seq: Int64String;
  type: T;
  version: number;
  workspace_id: Uuid;
  strategy_id: Uuid | null;
  /** Pick key (1 coin x 1 strategy). */
  ck: string | null;
  mint: Base58 | null;
  /** 1.1.6: our logo proxy URL for `mint` (see LogoUrl). Present on SSE/REST delivery (like server_now);
   *  null when the event has no mint or the proxy is disabled. Covers coin.detected, pick.created, position.*,
   *  proposal.* and every other feed item that carries a mint. */
  logo_url?: LogoUrl | null;
  /** 1.1.6: logo content hash (`v` of logo_url) for `mint`; null = no mint / no logo yet -> identicon. Same
   *  delivery as logo_url (SSE/REST). */
  logo_hash?: string | null;
  ts: IsoTs;
  actor: Actor;
  mode: Mode;
  payload: P;
  untrusted: Untrusted;
  /** Present on SSE/REST delivery; Realtime rows use created_at + clock heartbeat. */
  server_now?: IsoTs;
}

// ---------------------------------------------------------------------------
// strategy settings pieces (full schema: services/backend/config/strategy_settings.schema.json)
// ---------------------------------------------------------------------------
/** profit_targets[] item. */
export interface ProfitTarget { at_gain_pct: number; sell_portion_pct: number; giveback_pct?: number }
/** 1.1.4 `stall_exit`: window_s integer 5-86400, min_move_pct 0.01-100 (both required). */
export interface StallExit { window_s: number; min_move_pct: number }
/** exit_rules.loss_guards[] item: sell `sell_portion_pct` once price is `at_loss_pct` below ENTRY. */
export interface LossGuard { at_loss_pct: number; sell_portion_pct: number }
export interface ExitRules { label?: string; profit_targets?: ProfitTarget[]; loss_guards?: LossGuard[] }
/** Exit-related settings keys. stop_loss_pct = hard stop from ENTRY (v1.0 stopLossPct);
 *  peak_trail_pct = trailing stop from the PEAK. Both: 0 = off, else 5-49. */
export interface ExitSettings {
  exit_preset?: ExitPreset; profit_targets?: ProfitTarget[]; exit_rules?: ExitRules;
  stop_loss_pct?: number; peak_trail_pct?: number; idle_exit_seconds?: number | null;
  /** 1.1.4. Sell the whole position after this hold time, integer seconds 1-604800; null/absent = off.
   *  exit_reason `max_hold`. */
  time_stop_s?: number | null;
  /** 1.1.4. Sell the whole position when |price change| over the last `window_s` seconds is below
   *  `min_move_pct`; never before a full window since entry. null/absent = off. exit_reason `stall`. */
  stall_exit?: StallExit | null;
  sell_floors?: { enabled?: boolean; max_loss_pct?: number; liquidity_drop_pct?: number } | null;
}

// ---------------------------------------------------------------------------
// exit plan runtime state (position.updated.plan_state)
// ---------------------------------------------------------------------------
interface StepBase { index: number; triggered: boolean; triggered_at: IsoTs | null }
export type PlanStep =
  | (StepBase & { kind: "profit_target"; at_gain_pct: number; sell_portion_pct: number; trigger_price_sol: DecimalString })
  | (StepBase & { kind: "loss_guard"; at_loss_pct: number; sell_portion_pct: number; trigger_price_sol: DecimalString })
  | (StepBase & { kind: "stop_loss"; stop_loss_pct: number; stop_price_sol: DecimalString })
  | (StepBase & { kind: "peak_trail"; trail_pct: number; armed: boolean; peak_price_sol: DecimalString | null; stop_price_sol: DecimalString | null })
  | (StepBase & { kind: "giveback"; giveback_pct: number; after_step: number; peak_price_sol: DecimalString | null })
  | (StepBase & { kind: "max_hold"; deadline: IsoTs })
  | (StepBase & { kind: "idle"; idle_exit_seconds: number; last_trade_at: IsoTs | null })
  | (StepBase & { kind: "sell_floor"; max_loss_pct: number; liquidity_drop_pct: number });
export interface PlanState {
  preset: ExitPreset | "custom";
  /** Index into `steps` of the next step that can fire; null = plan finished. */
  current_step: number | null;
  triggered_steps: number[];
  trail_peak_price_sol: DecimalString | null;
  steps: PlanStep[];
}

// ---------------------------------------------------------------------------
// screener / guard
// ---------------------------------------------------------------------------
export interface ScreenerCheck { id: string; class: "venue" | "hard" | "weighted"; passed: boolean; measured: number | null; points: number; reason: string }
export interface ScreenerResult {
  passed: boolean; score: number; score_threshold: number; max_score: number; checks: ScreenerCheck[];
  /** false = practice mode cannot trade this coin at all (e.g. non-SOL quote). Then passed = false. */
  tradeable: boolean; skip_reason: ErrorCode | null; quote_mint: Base58 | null;
}
export interface GuardCheck { name: GuardCheckName | string; status: GuardCheckStatus; measured: number | null; reason: string; weight: number }

/** 1.1.4 market cap, on coin.detected / screener.scored / pick.created and the REST coin and pick.
 *  One computation (backend `common::mcap`) feeds these fields and the screener's `mcap_usd` metric,
 *  so the column and the check agree. */
export interface MarketCapFields {
  /** price (SOL per whole token) x total supply / 10^decimals, from curve or pool state; integer string.
   *  null when decimals or supply are unknown (never assumed). */
  market_cap_lamports: Lamports | null;
  /** Display-only, INDICATIVE: market_cap_lamports at the same configured SOL/USD reference the marks use
   *  (not a live feed). Equals the `measured` value of the screener's mcap_usd check. When
   *  market_cap_lamports is null it is the data source's own figure, or null. */
  mcap_usd: DecimalString | null;
  /** When the inputs were observed; null when both values are null. */
  mcap_as_of: IsoTs | null;
  /** 1.1.5: price source of market_cap_lamports: bonding curve, AMM pool, or unavailable (market_cap_lamports null). */
  mcap_source: McapSource;
}
export type McapSource = "curve" | "pool" | "unavailable";

/**
 * 1.1.6 coin logo: OUR image proxy URL, never a token-provided URI.
 * `GET /v1/img/coin/{mint}?s={LogoSize}[&fmt=webp|png]&v={logo_hash}` (API_ENDPOINTS 4.12): re-encoded WebP
 * (default) or PNG fallback (`fmt=png` or an Accept without image/webp); never SVG. 200 = image;
 * 404 LOGO_NOT_FOUND / 422 LOGO_REJECTED = show the deterministic identicon (COIN_LOGO 4), no retry per mint+v.
 * `logo_url` carries `s=96`; clients swap `s` for the smallest LOGO_SIZES entry >= px * dpr (max 192).
 * `logo_hash` null = identicon without a request. Only use `logo_url` when its origin is our API.
 */
export type LogoUrl = string;
export const LOGO_SIZES = [48, 64, 96, 128, 192] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];
export type LogoFormat = "webp" | "png";
/** Smallest size >= displayPx * dpr (192 when larger). */
export function logoSizeFor(displayPx: number, dpr = 1): LogoSize {
  const want = displayPx * dpr;
  return LOGO_SIZES.find((s) => s >= want) ?? 192;
}
/** Same logo, another size/format: rewrites `s` (and `fmt`) on a logo_url, keeping `v`. */
export function logoUrlFor(logoUrl: LogoUrl, size: LogoSize, format: LogoFormat = "webp"): LogoUrl {
  const u = logoUrl.replace(/([?&])s=\d+/, `$1s=${size}`).replace(/&fmt=(webp|png)/, "");
  return format === "png" ? `${u}&fmt=png` : u;
}
export interface CoinDetected extends MarketCapFields {
  mint: Base58; venue: Venue; launchpad: string | null; creator: Base58 | null;
  /** From the mint account (never assumed). null only while the mint account is unreadable; such coins are not filled. */
  decimals: number | null; token_program: TokenProgram | null; quote_mint: Base58 | null;
}
export interface ScreenerScored extends MarketCapFields {
  mint: Base58; passed: boolean; tradeable: boolean; skip_reason: ErrorCode | null; quote_mint: Base58 | null;
  summary: string; rejected_by: string | null; failed: string[]; result: ScreenerResult;
}
export interface GuardResult { mint: Base58; verdict: GuardVerdict; risk_score: number; reasons: string[]; checks: GuardCheck[] }
export interface PickCreated extends MarketCapFields { mint: Base58; summary: string; score: ScreenerResult; guard_verdict: GuardVerdict; guard_reasons: string[] }

/** REST coin resource (GET .../coins, .../coins/{mint}). Token name/symbol/uri stay in `untrusted`. */
export interface CoinWire extends MarketCapFields {
  mint: Base58; decimals: number | null; token_program: TokenProgram | null; quote_mint: Base58 | null;
  launchpad: string | null; venue: Venue | null; creator: Base58 | null;
  first_seen_at: IsoTs | null; migrated_at: IsoTs | null; untrusted: Record<string, unknown>;
  /** 1.1.6: `v` of the logo URL (content hash); null = no logo yet/unavailable -> identicon. */
  logo_hash: string | null;
  logo_url: LogoUrl | null;
}
/** REST pick resource (GET .../picks, .../picks/{id}); market cap as of the pick. */
export interface PickWire extends MarketCapFields {
  id: Uuid; ck: string; workspace_id: Uuid; strategy_id: Uuid; mint: Base58; mode: "practice";
  stage: string; score: number | null; score_threshold: number | null; checks: ScreenerCheck[];
  guard: unknown | null; guard_verdict: GuardVerdict | null; created_at: IsoTs; updated_at: IsoTs;
  /** 1.1.6 */
  logo_hash: string | null;
  logo_url: LogoUrl | null;
}

/** POST .../guard-impact/estimate (ships first). */
export interface StaticEstimate {
  method: "static_v1"; weakening: boolean; weakened_fields: string[]; risk_level: RiskLevel;
  max_extra_passes: number; window_evaluated: number; reasons: string[];
}
/** POST .../guard-impact (full replay, behind GUARD_REPLAY_ENABLED). */
export interface ImpactReport {
  window: string; samples: number; truncated: boolean; compute_ms: number;
  pass_before: number; pass_after: number; newly_passing: number; newly_blocked: number;
  newly_passing_rugged: number; newly_passing_labelled: number;
  newly_passing_avg_drawdown_pct: number | null; weakened_fields: string[];
}
export interface SettingsDiffEntry { field: string; before: JsonValue; after: JsonValue; weakening: boolean }

// ---------------------------------------------------------------------------
// proposals
// ---------------------------------------------------------------------------
/** 1.1.4 transaction quote for the review sheet (UX WF-22). All optional and nullable; practice values are
 *  papersim estimates (never a signed transaction). For mode=real, approve -> 409 QUOTE_MISSING_OR_STALE when
 *  the quote is missing or quote_expires_at <= server now; practice is never blocked by a missing quote. */
export interface ProposalQuoteFields {
  /** Base fee + priority fee. */
  est_network_fee_lamports?: Lamports | null;
  priority_fee_lamports?: Lamports | null;
  swap_fee_bps?: number | null;
  max_slippage_bps?: number | null;
  /** Minimum tokens out after max slippage, raw units (integer string). */
  min_out_raw?: RawQty | null;
  /** 1.1.5: rent for the owner's token account (2,039,280) when it does not exist yet, else "0". */
  est_ata_rent_lamports?: Lamports | null;
  /** Buy: the most it can cost = SOL in + est_network_fee_lamports + est_ata_rent_lamports. The network fee already
   *  includes the priority fee; the swap fee is taken from SOL in (not added). Sell: = est_network_fee_lamports. */
  total_max_lamports?: Lamports | null;
  /** 1.1.5 sell quotes: SOL out after the swap fee (taken from SOL out), and that x (1 - max slippage). */
  expected_out_lamports?: Lamports | null;
  min_out_lamports?: Lamports | null;
  /** 1.1.5: counts quote refreshes (int64 string). A refresh bumps this, never the approval rev. */
  quote_id?: Int64String;
  quote_ts?: IsoTs | null;
  quote_expires_at?: IsoTs | null;
}
export interface ProposalCreated extends ProposalQuoteFields {
  proposal_id: Uuid; kind: ProposalKind;
  /** 1.1.5: the mint's decimals and token program (null on guard_change, which has no mint). */
  decimals?: number | null; token_program?: TokenProgram | null;
  /** Approval rev (send as expected_rev). */
  rev: number;
  mint: Base58 | null;
  /** Untrusted token symbol (same text as envelope untrusted.symbol). Plain text only. */
  symbol: string | null;
  price_sol: DecimalString | null;
  expires_at: IsoTs; first_buy: boolean;
  approval_mode: ApprovalMode; amount_lamports: Lamports | null; risk_level: RiskLevel | null; summary: string;
  base_rev: number | null; weakening: boolean; diff: SettingsDiffEntry[] | null; estimate: StaticEstimate | null;
}
/** proposal.updated: a pending proposal's quote was set or refreshed. 1.1.5: `rev` is UNCHANGED (push decision
 *  tokens stay valid); `quote_id` increments. At most one per proposal per 3 s, only while pending. */
export interface ProposalUpdated extends ProposalQuoteFields {
  proposal_id: Uuid; kind: ProposalKind; rev: number; quote_id: Int64String;
  decimals: number | null; token_program: TokenProgram | null;
}
/** 1.1.3: why a proposal was rejected. Closed enum; only with decision=reject; default user_declined. */
export type ApprovalRejectReason = "user_declined" | "not_tradeable" | "price_moved" | "other";
export const APPROVAL_REJECT_REASONS: readonly ApprovalRejectReason[] = ["user_declined", "not_tradeable", "price_moved", "other"] as const;
/** proposal.approved / proposal.rejected. `reject_reason` is set on rejected, null on approved (1.1.3). */
export interface ProposalDecided {
  proposal_id: Uuid; kind: ProposalKind; rev: number; decided_by: Uuid; decided_via: DecidedVia; reason: string | null;
  reject_reason: ApprovalRejectReason | null;
}
export interface ProposalExpired { proposal_id: Uuid; kind: ProposalKind; rev: number; reason: ProposalExpiredReason; at: IsoTs }

// ---------------------------------------------------------------------------
// fills, positions, orders
// ---------------------------------------------------------------------------
/** = SQL public.fill_wire(). mid_price_sol is required (pool mid before the fill). */
export interface FillWire {
  id: Uuid; side: FillSide; simulated: true; practice_epoch: number;
  sol_lamports: Lamports; token_amount_raw: RawQty;
  exec_price_sol: DecimalString; mid_price_sol: DecimalString; price_impact_bps: number;
  slippage_bps: number; swap_fee_lamports: Lamports; network_fee_lamports: Lamports; latency_ms: number;
  created_at: IsoTs;
}
/** Position resource (= SQL public.position_wire()). Writes use If-Match: "<rev>". */
export interface PositionWire {
  /** 1.1.6 */
  logo_hash: string | null;
  logo_url: LogoUrl | null;
  id: Uuid; position_key: string; workspace_id: Uuid; strategy_id: Uuid | null; mint: Base58; mode: Mode;
  status: "open" | "closed"; rev: number; practice_epoch: number;
  qty_raw: RawQty; decimals: number | null; token_program: TokenProgram | null;
  cost_basis_lamports: Lamports; sol_in_lamports: Lamports; sol_out_lamports: Lamports; fees_lamports: Lamports;
  avg_entry_price_sol: DecimalString | null; peak_price_sol: DecimalString | null; exit_price_sol: DecimalString | null;
  exit_reason: ExitReason | null; opened_at: IsoTs; closed_at: IsoTs | null;
}
export interface PositionOpened {
  position_key: string; position_id: Uuid; rev: number; practice_epoch: number; mint: Base58;
  decimals: number; token_program: TokenProgram | null; fill: FillWire; first_buy: boolean;
}
export interface PositionUpdated {
  position_key: string; position_id: Uuid; rev: number; practice_epoch: number;
  qty_raw: RawQty; cost_basis_lamports: Lamports; avg_entry_price_sol: DecimalString | null;
  peak_price_sol: DecimalString | null; realized_lamports: Lamports;
  /** null when no mark is known yet. */
  unrealized_pnl_lamports: Lamports | null;
  plan_state: PlanState | null;
}
export interface PositionClosed {
  position_key: string; position_id: Uuid; rev: number; practice_epoch: number;
  exit_reason: ExitReason; exit_price_sol: DecimalString; sol_out_lamports: Lamports;
  pnl_lamports: Lamports; pnl_pct: number | null; hold_seconds: number;
}
export interface FillSimulated extends FillWire { position_key: string; position_id: Uuid; order_id: Uuid | null; mark_price_sol?: DecimalString; fee_bps?: number }
export interface ExitTriggered { position_key: string; rule: ExitReason; rule_index: number; sell_portion_pct: number; trigger_price_sol: DecimalString; detail: string }

export type OrderStatus = "queued" | "filled" | "failed";
/** Order resource (= SQL public.order_wire()). */
export interface OrderWire {
  id: Uuid; position_id: Uuid; mint: Base58; mode: Mode; side: FillSide; kind: "manual_close";
  fraction_bps: number; status: OrderStatus; reason_code: ErrorCode | null;
  job_id: Int64String | null; fill_id: Uuid | null; practice_epoch: number; created_at: IsoTs; updated_at: IsoTs;
}
/** Async work handle. GET /v1/workspaces/{ws}/jobs/{job_id}. */
export interface JobWire { id: Int64String; kind: string; status: "queued" | "running" | "done" | "failed" | "dead"; attempts: number; last_error: string | null; created_at: IsoTs; updated_at: IsoTs }
/** POST /v1/workspaces/{ws}/positions/{id}/close  (headers: If-Match: "<position rev>", Idempotency-Key). */
export interface ClosePositionRequest { fraction_bps?: number /* 1-10000, default 10000 */; expected_rev?: number /* only if If-Match is not sent */ }
export interface ClosePositionResponse {
  position: PositionWire; order: OrderWire; order_id: Uuid;
  /** Set only if the simulated fill completed synchronously; otherwise null and follow job_id / order.filled. */
  fill: FillWire | null; job_id: Int64String | null; status: OrderStatus; replayed: boolean; server_now: IsoTs;
}
export interface OrderSubmitted { order: OrderWire; position_id: Uuid; position_rev: number; practice_epoch: number }
export interface OrderFilled { order: OrderWire; fill: FillWire; position_id: Uuid; position_rev: number; practice_epoch: number }
/** N-05. Emitted whenever a simulated fill is rejected. Symbol travels in envelope `untrusted`. */
export interface OrderFailed {
  order_id: string; proposal_id: Uuid | null; position_id?: Uuid | null; mint: Base58; side: FillSide;
  amount_lamports: Lamports | null; qty_raw?: RawQty | null; fraction_bps?: number;
  reason_code: "SLIPPAGE_EXCEEDED" | "INSUFFICIENT_PRACTICE_BALANCE" | "GUARD_FAILED" | "UNSUPPORTED_QUOTE_MINT"
    | "POOL_STALE" | "POSITION_ALREADY_CLOSED" | "VALIDATION_FAILED" | "MODE_NOT_ALLOWED";
  detail: JsonValue; quote_mint?: Base58 | null; mode: Mode; practice_epoch?: number; server_now: IsoTs;
}

// ---------------------------------------------------------------------------
// portfolio / workspace / stats
// ---------------------------------------------------------------------------
export interface PortfolioSnapshot {
  practice_epoch: number;
  cash_lamports: Lamports; positions_cost_lamports: Lamports; positions_value_lamports: Lamports;
  equity_lamports: Lamports; peak_equity_lamports: Lamports; drawdown_bps: number; drawdown_pct: number;
  realized_pnl_lamports: Lamports; unrealized_pnl_lamports: Lamports; open_positions: number; as_of_seq: Int64String;
}
/** GET /v1/workspaces/{ws}/portfolio (= view portfolio_latest). */
export interface PortfolioWire extends PortfolioSnapshot { workspace_id: Uuid; mode: Mode; ts: IsoTs; server_now: IsoTs }
/** GET /v1/workspaces/{ws}. */
export interface WorkspaceWire {
  id: Uuid; name: string; rev: number; modes_enabled: Mode[]; practice_epoch: number;
  practice_start_lamports: Lamports; server_now: IsoTs;
}
/** GET /v1/workspaces/{ws}/stats/exit-reasons and RPC exit_stats(): one shape. */
export interface ExitStatsRow { exit_reason: ExitReason; count: number; pnl_lamports: Lamports; avg_pnl_pct: number | null; win_rate_pct: number; avg_hold_s: number }

export type GuardChangeStatus = "requested" | "cooling_down" | "applied" | "reverted" | "cancelled" | "rejected" | "expired";
/** = SQL guard_change_wire(); GET /guard-changes items and the 202 PATCH response. */
export interface GuardChangeWire {
  id: Uuid; guard_change_id: Uuid; proposal_id: Uuid | null; strategy_id: Uuid; mode: "practice";
  status: GuardChangeStatus; rev: number; from_rev: number;
  diff: { key: string; before: unknown; after: unknown; effect: "weakens" | "changes" }[];
  weakened_fields: string[]; requested_by: Uuid | null;
  cooldown_until: IsoTs | null; auto_revert_at: IsoTs | null; applied_at: IsoTs | null; created_at: IsoTs;
}
/** `202` body of PATCH /strategies/{id} when the patch weakens a guard (nothing applied). */
export interface GuardChangeProposed { proposal: ApprovalWire; guard_change: GuardChangeWire }
export interface GuardChanged {
  guard_change_id: Uuid; proposal_id: Uuid | null;
  /** rejected / expired: the proposal was rejected or ran out (24 h) before it was applied. */
  status: GuardChangeStatus;
  from_rev: number; to_rev: number | null; weakening: boolean; weakened_fields: string[];
  cooldown_until: IsoTs | null; auto_revert_at: IsoTs | null;
}
export interface EntryArmed { pick_id: Uuid; condition: string; expires_at: IsoTs }
export interface EntryExpired { pick_id: Uuid; reason: string }
/**
 * 1.1.6 per-strategy Real gate (UX v2). Present on every strategy read (`GET .../strategies`, `GET .../strategies/{id}`).
 * `mode` is the existing strategy mode (`Mode`): the UI label "Paper" = wire `practice` (nothing on the wire says
 * `paper`). Real is gated off in this phase, so `real_locked` is always `true` with `real_locked_reason`
 * `needs_owner_approval` (default) and no live path exists. `paper_progress.*_required` come from server settings
 * `centurion.real_gate.min_paper_days` / `centurion.real_gate.min_paper_trades` (env `CENTURION_REAL_GATE_MIN_PAPER_DAYS`
 * / `_TRADES`); `null` = threshold not set by the owner yet (show "not set", never assume a number).
 * days_done = whole days since the strategy's first practice buy (`first_buy_at`, 0 when none);
 * trades_done = closed practice positions of the strategy (all epochs).
 */
export type RealLockedReason = "needs_owner_approval" | "gate_not_met" | "policy" | "other";
export const REAL_LOCKED_REASONS: readonly RealLockedReason[] = ["needs_owner_approval", "gate_not_met", "policy", "other"];
export interface PaperProgress {
  days_done: number;
  days_required: number | null;
  trades_done: number;
  trades_required: number | null;
}
export interface StrategyRealGateFields {
  mode: Mode;
  /** true while the strategy may not run in Real (always true in this phase). */
  real_locked: boolean;
  /** null only when real_locked is false. */
  real_locked_reason: RealLockedReason | null;
  paper_progress: PaperProgress;
}
export interface StrategyLifecycle { rev: number; base_rev?: number; status?: string; changed_fields?: string[]; expired_proposals?: number; /** set when an approved guard_change applied the update */ proposal_id?: Uuid }
export interface PracticeReset {
  epoch: number; previous_epoch: number; starting_balance_lamports: Lamports;
  archived: { positions: number; closed_open_positions: number; fills: number; snapshots: number; expired_proposals: number };
  next_allowed_at: IsoTs; at: IsoTs;
}
export interface AccountDeletionScheduled { scheduled_for: IsoTs; grace_days: number; at: IsoTs }
export interface AccountLifecycle { at: IsoTs }
/** code = an errors.json code with kind "notice" (e.g. PRACTICE_CASH_INSUFFICIENT). */
export interface SystemNotice { code: ErrorCode; message: string }

export interface EventPayloads {
  "coin.detected": CoinDetected;
  "screener.scored": ScreenerScored;
  "guard.result": GuardResult;
  "pick.created": PickCreated;
  "entry.armed": EntryArmed;
  "entry.expired": EntryExpired;
  "proposal.created": ProposalCreated;
  "proposal.updated": ProposalUpdated;
  "proposal.approved": ProposalDecided;
  "proposal.rejected": ProposalDecided;
  "proposal.expired": ProposalExpired;
  "order.submitted": OrderSubmitted;
  "order.filled": OrderFilled;
  "order.failed": OrderFailed;
  "position.opened": PositionOpened;
  "position.updated": PositionUpdated;
  "position.closed": PositionClosed;
  "fill.simulated": FillSimulated;
  "exit.triggered": ExitTriggered;
  "portfolio.snapshot": PortfolioSnapshot;
  "guard.changed": GuardChanged;
  "strategy.created": StrategyLifecycle;
  "strategy.updated": StrategyLifecycle;
  "strategy.paused": StrategyLifecycle;
  "strategy.resumed": StrategyLifecycle;
  "strategy.archived": StrategyLifecycle;
  "strategy.deleted": StrategyLifecycle;
  "practice.reset": PracticeReset;
  "account.deletion_scheduled": AccountDeletionScheduled;
  "account.deletion_cancelled": AccountLifecycle;
  "account.deleted": AccountLifecycle;
  "system.notice": SystemNotice;
}
export type EventType = keyof EventPayloads;
export type KnownEvent = { [K in EventType]: EventEnvelope<K, EventPayloads[K]> }[EventType];
/** Clients must ignore unknown types. */
export type AnyEvent = KnownEvent | EventEnvelope<string, JsonValue>;

export function isEvent<K extends EventType>(e: EventEnvelope<string, unknown>, type: K): e is EventEnvelope<K, EventPayloads[K]> {
  return e.type === type;
}

// ---------------------------------------------------------------------------
// realtime: Broadcast + SSE
// ---------------------------------------------------------------------------
/** Broadcast channel `marks:<workspace_id>:<mode>`, and SSE `event: mark` with include=marks. Never persisted. */
export interface MarkMessage {
  mint: Base58; price_usd: DecimalString; price_sol: DecimalString; liquidity_usd: number;
  slot: number; ts: IsoTs; position_ids: Uuid[]; server_now: IsoTs;
}
/** Broadcast heartbeat, and SSE `event: clock` with include=clock (every 5 s). */
export interface ClockMessage { server_now: IsoTs; safe_seq: Int64String }

/** GET /v1/workspaces/{ws}/events/stream?mode=practice&include=marks,clock (Last-Event-ID = seq string). */
export const SSE_PATH = (ws: Uuid) => `/v1/workspaces/${ws}/events/stream` as const;
export type SseInclude = "marks" | "clock";
export interface SseQuery { mode: Mode; after_seq?: Int64String; include?: SseInclude[] }
/** SSE frames: `id:` = seq (events only), `event:` = event type | "mark" | "clock", `data:` = JSON. */
export type SseFrame =
  | { event: EventType | string; id: Int64String; data: AnyEvent }
  | { event: "mark"; id?: undefined; data: MarkMessage }
  | { event: "clock"; id?: undefined; data: ClockMessage };

export interface EventPage {
  items: AnyEvent[]; next_after_seq: Int64String | null; next_before_seq: Int64String | null;
  has_more: boolean; safe_seq: Int64String; server_now: IsoTs;
}

// ---------------------------------------------------------------------------
// approvals
// ---------------------------------------------------------------------------
export interface ApprovalDecisionRequest {
  decision: "approve" | "reject";
  /** Opaque single-use token from GET /approvals/{id} or a push payload. */
  token: string;
  /** Approval rev. REQUIRED for every channel (push too); or send If-Match: "<rev>". */
  expected_rev: number;
  reason?: string | null;
  /** 1.1.3, decision=reject only (422 VALIDATION_FAILED otherwise or on an unknown value). Default user_declined. */
  reject_reason?: ApprovalRejectReason;
  /**
   * Practice guard weakening (approval.weakening, decision=approve): `{hold_duration_ms >= 1200}`.
   * Missing -> 428 CONFIRMATION_REQUIRED; shorter, or a decision token younger than 1.2 s -> 422 HOLD_TOO_SHORT.
   */
  confirmation?: PracticeHoldProof | ConfirmationProof;
}
export interface ApprovalDecisionResponse {
  proposal_id: Uuid; status: ProposalStatus; rev: number; reject_reason: ApprovalRejectReason | null; replayed: boolean; server_now: IsoTs;
}
/** Approval resource (= SQL public.approval_wire(); also the `current` of an approval 409). */
/** = ApprovalWire (the proposal/approval resource). Quote fields (1.1.4) are always present, null when unset. */
export type ProposalWire = ApprovalWire;
export interface ApprovalWire extends Required<ProposalQuoteFields> {
  /** 1.1.6: logo content hash of `mint` (null: no mint / no logo yet). */
  logo_hash: string | null;
  /** 1.1.6: logo of `mint` (null when mint is null or the proxy is disabled). */
  logo_url: LogoUrl | null;
  /** 1.1.5 */
  decimals: number | null; token_program: TokenProgram | null; position_id: Uuid | null;
  id: Uuid; proposal_id: Uuid; workspace_id: Uuid; strategy_id: Uuid | null; kind: ProposalKind; mode: Mode;
  subject: string | null; mint: Base58 | null; amount_lamports: Lamports | null; is_first_buy: boolean;
  risk: "low" | "medium" | "high" | "critical"; weakening: boolean; status: ProposalStatus; rev: number;
  expire_reason: ProposalExpiredReason | null; base_rev: number | null; decision: "approve" | "reject" | null;
  reject_reason: ApprovalRejectReason | null; decided_via: DecidedVia | null; decided_by: Uuid | null;
  payload: { [k: string]: JsonValue }; created_at: IsoTs; expires_at: IsoTs; decided_at: IsoTs | null;
}

/** Practice guard-weakening approval: press-and-hold only (Real needs the full ConfirmationProof, Phase 7). */
export interface PracticeHoldProof { hold_duration_ms: number }
/** Real mode actions and Real guard weakening (Phase 7). */
export interface ConfirmationProof {
  challenge_id: Uuid;
  webauthn: { credential_id: string; client_data_json: string; authenticator_data: string; signature: string; user_handle: string | null };
  challenge: string;
  typed_confirmation: string;
  hold_duration_ms: number;
  device: { platform: "ios" | "android" | "web" | "macos" | "windows" | "linux"; app_version: string; model?: string; attestation?: string | null };
}

/** 1.1.5 POST .../positions/{id}/close/preview (paper estimate, 15 s TTL). */
export interface ClosePreview {
  position_id: Uuid; mint: Base58; fraction_bps: number; qty_raw: RawQty; decimals: number; token_program: TokenProgram | null;
  est_network_fee_lamports: Lamports; priority_fee_lamports: Lamports; swap_fee_bps: number; max_slippage_bps: number;
  expected_out_lamports: Lamports; min_out_lamports: Lamports; total_max_lamports: Lamports;
  quote_ts: IsoTs; quote_expires_at: IsoTs;
}

/** Standard REST wrappers: every response carries server_now. */
export interface ApiItem<T> { data: T; server_now: IsoTs }
export interface ApiList<T> { items: T[]; next_cursor: string | null; server_now: IsoTs }
/** Every error body: `error` is an object {code, message, ...details, server_now}. Never a bare string. */
export interface ApiError {
  error: { code: ErrorCode; message: string; request_id?: string; server_now: IsoTs; [detail: string]: JsonValue | undefined };
  server_now: IsoTs;
}
/** 409 STRATEGY_REV_CONFLICT / VERSION_CONFLICT / CONFIRMATION_RESTART_REQUIRED: details inside `error`. */
export interface ConflictError<T = JsonValue> {
  error: {
    code: "STRATEGY_REV_CONFLICT" | "VERSION_CONFLICT" | "CONFIRMATION_RESTART_REQUIRED";
    message: string; request_id: string; server_now: IsoTs;
    current_rev: number; base_rev: number;
    changed_fields?: string[];
    changed_by?: { actor: Uuid | null; via: string | null; device: string | null };
    changed_at?: IsoTs | null;
    /** REQUIRED on every 409 conflict: the resource as it is now (1f24d28). */
    current: T;
  };
  server_now: IsoTs;
}

/** 1.1.5: 409 QUOTE_MISSING_OR_STALE (Real approve only): details inside `error`, like the other 409s. */
export interface QuoteMissingOrStaleError {
  error: {
    code: "QUOTE_MISSING_OR_STALE"; message: string; request_id: string; server_now: IsoTs;
    reason: "missing" | "stale" | "mismatch";
    /** true when the proposal has no quote at all. */
    missing: boolean;
    quote_ts: IsoTs | null; quote_expires_at: IsoTs | null;
    quote_id: Int64String; expected_quote_id: Int64String | null;
    /** The proposal as it is now. */
    current: ApprovalWire;
  };
  server_now: IsoTs;
}

/** POST /v1/devices (device registration). */
export interface DeviceRegistration {
  device_id: string;
  platform: "ios" | "android" | "web" | "desktop";
  provider: "fcm" | "apns" | "webpush";
  token: string;
  app_version: string;
  locale: string;
}

/** Push payload after decoding (data-only; copy is rendered on the device). Never contains secrets. */
export interface PushPayload {
  v: 1;
  event: string;              // UX catalog id, e.g. "N-01"
  type: EventType;            // wire event type that caused it
  mode: Mode;
  workspace_id: Uuid;
  seq: Int64String;
  deep_link: string;          // centurion://approvals/<id> etc.
  approval_id?: Uuid;
  /** Approval rev; send it back as expected_rev. Present whenever approval_id is. */
  version?: number;
  position_id?: Uuid;
  /** practice buy_pick only: single-use decision token, bound to this device; absent for real. */
  token?: string;
  exp?: IsoTs;                // min(token expiry, approval expires_at); countdown = exp - server_now
  actions: ("approve" | "skip" | "open")[];  // "approve" only for practice + valid token
  expire_reason?: ProposalExpiredReason;
  /** 1.1.6: the coin this push is about (absent when it concerns no coin). */
  mint?: Base58;
  /** 1.1.6: logo content hash (`v`); ABSENT (never "" / "null") when there is no logo -> identicon. */
  logo_hash?: string;
  /** display variables: symbol (untrusted text), amount_lamports (integer string), reason_code, ... */
  vars: Record<string, string>;
  server_now: IsoTs;
}
/** FCM/APNs `data` as sent: EVERY value is a string. v, seq, version are base-10 integer strings;
 *  actions and vars are JSON-encoded strings. */
export type PushDataEncoded = { [K in keyof PushPayload]?: string };
export function decodePushData(d: Record<string, string>): PushPayload {
  return {
    ...(d as unknown as PushPayload),
    v: 1,
    version: d.version === undefined ? undefined : Number.parseInt(d.version, 10),
    actions: JSON.parse(d.actions ?? "[]") as PushPayload["actions"],
    vars: JSON.parse(d.vars ?? "{}") as Record<string, string>,
  };
}

/**
 * 1.1.6: logo URL from a push (or any `mint` + `logo_hash` pair) where no `logo_url` is delivered.
 * `origin` = the API origin, or LOGO_PUBLIC_BASE_URL when the deployment sets one. No hash -> null (identicon).
 */
export function coinLogoUrl(origin: string, mint: string, size: LogoSize = 96, logoHash?: string | null): LogoUrl | null {
  if (!logoHash) return null;
  return `${origin.replace(/\/+$/, "")}/v1/img/coin/${mint}?s=${size}&v=${encodeURIComponent(logoHash)}`;
}

// ---------------------------------------------------------------------------
// phase7: RESERVED for Phase 7 (Real SOL). Never emitted before Phase 7; types only (contracts 1.1.5).
// Flat fields: actor_type/user_id/device_id/device_label. Lamports integer strings, ISO UTC, full addresses.
// ---------------------------------------------------------------------------
/** phase7 */ export type Phase7ActorType = "user" | "rule" | "system";
/** phase7 */ export interface Phase7Actor { actor_type: Phase7ActorType; user_id?: Uuid | null }
/** phase7 */ export interface Phase7Device { device_id: string | null; device_label: string | null }
/** phase7 */ export type KillSwitchScope = "global" | "workspace" | "strategy";
/** phase7 */ export type KillSwitchReason = "policy_mismatch" | "loss_velocity" | "provider_error" | "other";
/** phase7: limit setting keys (daily = rolling 24 h). */
export type RealLimitSetting = "per_trade_lamports" | "daily_lamports" | "cap_lamports" | "max_positions" | "max_slippage_bps";
/** phase7: reserved reason codes for real.withdraw.failed (documented, not yet in errors.json). */
export type WithdrawFailReason =
  | "withdraw_simulation_failed" | "insufficient_balance" | "destination_not_owned" | "tx_expired" | "provider_error"
  | "user_rejected" | "other";
/** phase7 */ export interface RealSignerGranted extends Phase7Actor, Phase7Device { signer_id: string; provider: string; expires_at: IsoTs | null }
/** phase7 */ export interface RealSignerRevoked extends Phase7Actor { signer_id: string; provider: string; reason: "kill_switch" | "expiry" | "user" }
/** phase7 */ export interface RealPolicyActivated extends Phase7Actor { version: number; policy_hash: string }
/** phase7 */ export interface RealPolicyMismatch { version: number; policy_hash: string; expected_hash: string; actual_hash: string }
/** phase7: from/to typed per setting (integer strings for *_lamports, numbers otherwise). */
export interface RealLimitChanged extends Phase7Actor { setting: RealLimitSetting; from: Lamports | number; to: Lamports | number; policy_version: number }
/** phase7: a raise was requested; it activates at activates_at (24 h) and then stays (no auto-revert). Final. */
export interface RealLimitLoosenRequested extends Phase7Actor, Phase7Device {
  setting: RealLimitSetting; from: Lamports | number; to: Lamports | number; policy_version: number; activates_at: IsoTs;
}
/** phase7 */ export interface RealKillSwitchTripped extends Phase7Actor {
  scope: KillSwitchScope; target_id: Uuid | null; reason: KillSwitchReason | null; rule_id: string | null; at: IsoTs;
}
/** phase7: resume after a trip (immediate). After policy_mismatch the signer stays revoked until a manual re-grant. */
export interface RealKillSwitchCleared extends Phase7Actor, Phase7Device {
  scope: KillSwitchScope; target_id: Uuid | null; reason: KillSwitchReason | null; at: IsoTs; signer_state: "active" | "revoked";
}
/** phase7: Stop / Resume (pause new buys only; exits keep running). */
export interface RealBuysToggled extends Phase7Actor, Phase7Device { scope: KillSwitchScope; target_id: Uuid | null; at: IsoTs }
/** phase7 */ export interface RealSellAllRequested extends Phase7Actor, Phase7Device { sell_all_id: Uuid; requested_count: number; at: IsoTs }
/** phase7: failed positions stay open and keep their exit plans. */
export interface RealSellAllCompleted {
  sell_all_id: Uuid; requested_count: number; sold_count: number; failed_count: number;
  amount_out_lamports: Lamports | null; failures: { position_id: Uuid; mint: Base58; reason_code: string }[]; completed_at: IsoTs;
}
/** phase7: main-wallet change (48 h). */
export interface RealWithdrawAddressAdded extends Phase7Actor, Phase7Device { address: Base58; usable_at: IsoTs; cancel_until: IsoTs }
/** phase7 */ export interface RealWithdrawAddressEvent extends Phase7Actor { address: Base58; at: IsoTs }
/** phase7 */ export interface RealDepositDetected { amount_lamports: Lamports; balance_lamports: Lamports; tx_signature: string; slot: Int64String; at: IsoTs }
/** phase7 */ export interface RealWithdrawRequested extends Phase7Actor, Phase7Device { withdraw_id: Uuid; amount_lamports: Lamports; address: Base58; tx_signature: null }
/** phase7 */ export interface RealWithdrawConfirmed { withdraw_id: Uuid; amount_lamports: Lamports; address: Base58; tx_signature: string; slot: Int64String }
/** phase7 */ export interface RealWithdrawFailed { withdraw_id: Uuid; amount_lamports: Lamports; address: Base58; tx_signature: string | null; reason_code: WithdrawFailReason }
/** phase7: reserved event names -> payloads (NOT part of EventPayloads; nothing emits these before Phase 7). */
export interface ReservedPhase7Payloads {
  "real.signer.granted": RealSignerGranted; "real.signer.revoked": RealSignerRevoked;
  "real.policy.activated": RealPolicyActivated; "real.policy.mismatch": RealPolicyMismatch;
  "real.limit.changed": RealLimitChanged; "real.limit.loosen_requested": RealLimitLoosenRequested;
  "real.kill_switch.tripped": RealKillSwitchTripped; "real.kill_switch.cleared": RealKillSwitchCleared;
  "real.buys.paused": RealBuysToggled; "real.buys.resumed": RealBuysToggled;
  "real.sell_all.requested": RealSellAllRequested; "real.sell_all.completed": RealSellAllCompleted;
  "real.withdraw_address.added": RealWithdrawAddressAdded; "real.withdraw_address.usable": RealWithdrawAddressEvent;
  "real.withdraw_address.cancelled": RealWithdrawAddressEvent;
  "real.deposit.detected": RealDepositDetected;
  "real.withdraw.requested": RealWithdrawRequested; "real.withdraw.confirmed": RealWithdrawConfirmed;
  "real.withdraw.failed": RealWithdrawFailed;
}
export const RESERVED_PHASE7_EVENTS = [
  "real.signer.granted", "real.signer.revoked", "real.policy.activated", "real.policy.mismatch", "real.limit.changed",
  "real.limit.loosen_requested", "real.kill_switch.tripped", "real.kill_switch.cleared", "real.buys.paused", "real.buys.resumed",
  "real.sell_all.requested", "real.sell_all.completed", "real.withdraw_address.added", "real.withdraw_address.usable",
  "real.withdraw_address.cancelled", "real.deposit.detected", "real.withdraw.requested", "real.withdraw.confirmed",
  "real.withdraw.failed",
] as const satisfies readonly (keyof ReservedPhase7Payloads)[];
