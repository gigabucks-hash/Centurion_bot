// Sentra stream contract v1.1 (snake_case everywhere). Mirrors services/backend/crates/common/src/event.rs and EVENTS_SCHEMA.md.
// Number rule: SOL amounts = lamport integer strings, raw token amounts = integer strings, prices = decimal
// strings; percentages, ratios, bps, USD notionals, scores = JSON numbers; counts/ms/seq/rev = integers.
import type { Base58, DecimalString, IsoTs, Lamports, RawQty, Uuid } from "./units";

export const EVENT_SCHEMA_VERSION = 1 as const;
export const CONTRACTS_VERSION = "1.1.1" as const;

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
export type ProposalExpiredReason =
  | "timeout" | "strategy_deleted" | "strategy_archived" | "guard_failed" | "price_moved" | "practice_reset" | "account_deleted";
export type ApprovalMode = "off" | "ask_first_buy" | "ask_every_buy";
export type RiskLevel = "low" | "medium" | "high" | "critical";
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

/** Attacker-controlled token metadata. Render as plain text only. */
export interface Untrusted { name?: string; symbol?: string; uri?: string; image?: string; description?: string }

export interface EventEnvelope<T extends string = string, P = unknown> {
  /** Deterministic `<subject>:<epoch_ms>:<type>`; dedupe key. */
  id: string;
  /** Global bigint identity: monotonic, NOT gapless. Resume only from a safe watermark. */
  seq: number;
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

export interface ScreenerCheck { id: string; class: "venue" | "hard" | "weighted"; passed: boolean; measured: number | null; points: number; reason: string }
export interface ScreenerResult { passed: boolean; score: number; score_threshold: number; max_score: number; checks: ScreenerCheck[] }
export interface GuardCheck { name: GuardCheckName | string; status: GuardCheckStatus; measured: number | null; reason: string; weight: number }

export interface CoinDetected { mint: Base58; venue: Venue; launchpad: string | null; creator: Base58 | null }
export interface ScreenerScored { mint: Base58; passed: boolean; summary: string; rejected_by: string | null; failed: string[]; result: ScreenerResult }
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

export interface ProposalCreated {
  proposal_id: Uuid; kind: ProposalKind; version: number; expires_at: IsoTs; first_buy: boolean;
  approval_mode: ApprovalMode; amount_lamports: Lamports | null; risk_level: RiskLevel | null; summary: string;
  base_rev: number | null; weakening: boolean; diff: unknown | null; estimate: StaticEstimate | null;
}
export interface ProposalDecided { proposal_id: Uuid; kind: ProposalKind; version: number; decided_by: Uuid; decided_via: DecidedVia; reason: string | null }
export interface ProposalExpired { proposal_id: Uuid; kind: ProposalKind; version: number; reason: ProposalExpiredReason; at: IsoTs }

export interface FillWire {
  side: FillSide; simulated: true; sol_lamports: Lamports; token_amount_raw: RawQty;
  exec_price_sol: DecimalString; mid_price_sol: DecimalString; price_impact_bps: number;
  slippage_bps: number; swap_fee_lamports: Lamports; network_fee_lamports: Lamports; latency_ms: number;
}
export interface PositionOpened { position_key: string; mint: Base58; fill: FillWire; first_buy: boolean }
export interface PositionUpdated { position_key: string; qty_raw: RawQty; peak_price_sol: DecimalString; realized_lamports: Lamports; plan_state: unknown }
export interface PositionClosed {
  position_key: string; exit_reason: ExitReason; exit_price_sol: DecimalString; sol_out_lamports: Lamports;
  pnl_lamports: Lamports; pnl_pct: number; hold_seconds: number;
}
export interface FillSimulated extends FillWire { position_key: string; mark_price_sol: DecimalString; fee_bps: number }
export interface ExitTriggered { position_key: string; rule: ExitReason; rule_index: number; sell_portion_pct: number; trigger_price_sol: DecimalString; detail: string }
export interface PortfolioSnapshot {
  cash_lamports: Lamports; positions_cost_lamports: Lamports; positions_value_lamports: Lamports;
  equity_lamports: Lamports; peak_equity_lamports: Lamports; drawdown_bps: number; drawdown_pct: number;
  realized_pnl_lamports: Lamports; unrealized_pnl_lamports: Lamports; open_positions: number; as_of_seq: number;
}
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
export interface SystemNotice { code: string; message: string }

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
export type AnyEvent = KnownEvent | EventEnvelope<string, unknown>;

export function isEvent<K extends EventType>(e: EventEnvelope<string, unknown>, type: K): e is EventEnvelope<K, EventPayloads[K]> {
  return e.type === type;
}

/** Broadcast channel `marks:<workspace_id>:<mode>`. Never persisted. */
export interface MarkMessage {
  mint: Base58; price_usd: DecimalString; price_sol: DecimalString; liquidity_usd: number;
  slot: number; ts: IsoTs; position_ids: Uuid[]; server_now: IsoTs;
}
export interface ClockMessage { server_now: IsoTs; safe_seq: number }

export interface EventPage {
  items: AnyEvent[]; next_after_seq: number | null; next_before_seq: number | null;
  has_more: boolean; safe_seq: number; server_now: IsoTs;
}

export interface ApprovalDecisionRequest {
  decision: "approve" | "reject";
  /** Opaque single-use token from GET /approvals/{id} or a push payload. */
  token: string;
  expected_version: number;
  client: DecidedVia;
  reason?: string | null;
  /** Only for real mode / guard weakening (Phase 7). */
  confirmation?: ConfirmationProof;
}
export interface ApprovalDecisionResponse { proposal_id: Uuid; status: ProposalStatus; version: number; replayed: boolean; server_now: IsoTs }

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
export interface ApiError { error: { code: string; message: string; details?: unknown; request_id: string }; server_now: IsoTs }

/** 409 STRATEGY_REV_CONFLICT / VERSION_CONFLICT / CONFIRMATION_RESTART_REQUIRED body (top level, next to `error`). */
export interface ConflictBody<T = unknown> extends ApiError {
  current_rev: number;
  base_rev: number;
  changed_fields: string[];
  changed_by: { actor: Uuid | null; via: string | null; device: string | null };
  changed_at: IsoTs | null;
  current: T;
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

/** Push data payload (data-only; copy is rendered on the device). Never contains secrets or amounts to sign. */
export interface PushPayload {
  v: 1;
  event: string;              // UX catalog id, e.g. "N-01"
  type: EventType;            // wire event type that caused it
  mode: Mode;
  workspace_id: Uuid;
  seq: number;
  deep_link: string;          // sentra://approvals/<id> etc.
  approval_id?: Uuid;
  position_id?: Uuid;
  /** practice buy_pick only: single-use decision token, bound to this device; absent for real. */
  token?: string;
  exp?: IsoTs;                // min(token expiry, approval expires_at)
  actions: ("approve" | "skip" | "open")[];  // "approve" only for practice + valid token
  expire_reason?: ProposalExpiredReason;
  vars: Record<string, string>; // display variables (coin symbol is untrusted text)
  server_now: IsoTs;
}
