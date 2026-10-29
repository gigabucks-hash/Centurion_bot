// Sentra stream contract v1.1.2 (snake_case everywhere). Mirrors services/backend/crates/common/src/event.rs,
// the SQL wire functions (position_wire, order_wire, fill_wire) and EVENTS_SCHEMA.md.
// Number rule: SOL amounts = lamport integer strings, raw token amounts = integer strings, prices = decimal
// strings, int64 ids (seq, job_id) = integer strings; percentages, ratios, bps, USD notionals, scores,
// counts, ms, rev, decimals = JSON numbers.
import type { ErrorCode } from "./errors";
import type { Base58, DecimalString, Int64String, IsoTs, Lamports, RawQty, Uuid } from "./units";

export const EVENT_SCHEMA_VERSION = 1 as const;
export const CONTRACTS_VERSION = "1.1.2" as const;

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
export type ProposalKind = "buy_pick" | "guard_change" | "team_action";
/** UI label for "rejected" is "Skipped". */
export type ProposalStatus = "pending" | "approved" | "rejected" | "expired";
/** Canonical wire values (exact strings). */
export type ProposalExpiredReason =
  | "timeout" | "strategy_deleted" | "strategy_archived" | "guard_failed" | "price_moved" | "practice_reset" | "account_deleted";
export type ApprovalMode = "off" | "ask_first_buy" | "ask_every_buy";
export type RiskLevel = "low" | "medium" | "high" | "critical";
/** Derived server-side from the token / JWT claim; clients never send it. */
export type DecidedVia = "web" | "mobile" | "desktop" | "mcp" | "push";
/** sell_floor is evaluated before every other exit rule. */
export type ExitReason =
  | "sell_floor" | "profit_target" | "loss_guard" | "peak_trail" | "max_hold" | "idle" | "sell_pressure"
  | "no_new_high" | "rug_detected" | "drawdown_halt" | "manual" | "strategy_retired" | "practice_reset";
export const EXIT_REASONS: readonly ExitReason[] = [
  "sell_floor", "profit_target", "loss_guard", "peak_trail", "max_hold", "idle", "sell_pressure",
  "no_new_high", "rug_detected", "drawdown_halt", "manual", "strategy_retired", "practice_reset",
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
/** exit_rules.loss_guards[] item: sell `sell_portion_pct` once price is `at_loss_pct` below ENTRY. */
export interface LossGuard { at_loss_pct: number; sell_portion_pct: number }
export interface ExitRules { label?: string; profit_targets?: ProfitTarget[]; loss_guards?: LossGuard[] }
/** Exit-related settings keys. stop_loss_pct = hard stop from ENTRY (v1.0 stopLossPct);
 *  peak_trail_pct = trailing stop from the PEAK. Both: 0 = off, else 5-49. */
export interface ExitSettings {
  exit_preset?: ExitPreset; profit_targets?: ProfitTarget[]; exit_rules?: ExitRules;
  stop_loss_pct?: number; peak_trail_pct?: number; idle_exit_seconds?: number | null;
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

export interface CoinDetected {
  mint: Base58; venue: Venue; launchpad: string | null; creator: Base58 | null;
  /** From the mint account (never assumed). null only while the mint account is unreadable; such coins are not filled. */
  decimals: number | null; token_program: TokenProgram | null; quote_mint: Base58 | null;
}
export interface ScreenerScored {
  mint: Base58; passed: boolean; tradeable: boolean; skip_reason: ErrorCode | null; quote_mint: Base58 | null;
  summary: string; rejected_by: string | null; failed: string[]; result: ScreenerResult;
}
export interface GuardResult { mint: Base58; verdict: GuardVerdict; risk_score: number; reasons: string[]; checks: GuardCheck[] }
export interface PickCreated { mint: Base58; summary: string; score: ScreenerResult; guard_verdict: GuardVerdict; guard_reasons: string[] }

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
export interface ProposalCreated {
  proposal_id: Uuid; kind: ProposalKind;
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
export interface ProposalDecided { proposal_id: Uuid; kind: ProposalKind; rev: number; decided_by: Uuid; decided_via: DecidedVia; reason: string | null }
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

export interface GuardChanged {
  guard_change_id: Uuid; proposal_id: Uuid | null;
  status: "requested" | "cooling_down" | "applied" | "reverted" | "cancelled";
  from_rev: number; to_rev: number | null; weakening: boolean; weakened_fields: string[];
  cooldown_until: IsoTs | null; auto_revert_at: IsoTs | null;
}
export interface EntryArmed { pick_id: Uuid; condition: string; expires_at: IsoTs }
export interface EntryExpired { pick_id: Uuid; reason: string }
export interface StrategyLifecycle { rev: number; base_rev?: number; status?: string; changed_fields?: string[]; expired_proposals?: number }
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
  /** Only for real mode / guard weakening (Phase 7). */
  confirmation?: ConfirmationProof;
}
export interface ApprovalDecisionResponse { proposal_id: Uuid; status: ProposalStatus; rev: number; replayed: boolean; server_now: IsoTs }

export interface ConfirmationProof {
  challenge_id: Uuid;
  webauthn: { credential_id: string; client_data_json: string; authenticator_data: string; signature: string; user_handle: string | null };
  challenge: string;
  typed_confirmation: string;
  hold_duration_ms: number;
  device: { platform: "ios" | "android" | "web" | "macos" | "windows" | "linux"; app_version: string; model?: string; attestation?: string | null };
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
    message: string; request_id?: string; server_now: IsoTs;
    current_rev: number; base_rev: number;
    changed_fields?: string[];
    changed_by?: { actor: Uuid | null; via: string | null; device: string | null };
    changed_at?: IsoTs | null;
    current: T;
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
  deep_link: string;          // sentra://approvals/<id> etc.
  approval_id?: Uuid;
  /** Approval rev; send it back as expected_rev. Present whenever approval_id is. */
  version?: number;
  position_id?: Uuid;
  /** practice buy_pick only: single-use decision token, bound to this device; absent for real. */
  token?: string;
  exp?: IsoTs;                // min(token expiry, approval expires_at); countdown = exp - server_now
  actions: ("approve" | "skip" | "open")[];  // "approve" only for practice + valid token
  expire_reason?: ProposalExpiredReason;
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
