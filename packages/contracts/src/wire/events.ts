import type { Base58, DecimalString, IsoTs, Lamports, PctString, RawQty, Uuid } from "./units";

export const EVENT_SCHEMA_VERSION = 1 as const;

export type Mode = "paper" | "live"; // "live" reserved; rejected until Phase 7
export type Actor = "ingest" | "screener" | "guard" | "entry" | "executor" | "exit" | "user" | "system";
export type CoinStream = "bonding" | "graduated";
export type GuardVerdict = "PASS" | "WARN" | "FAIL";
export type ProposalKind = "buy_pick" | "guard_change" | "team_action";
export type ProposalStatus = "pending" | "approved" | "rejected" | "expired";
export type ProposalExpiredReason = "timeout" | "strategy_deleted" | "strategy_archived" | "guard_failed" | "price_moved";
export type ApprovalMode = "off" | "ask_first_buy" | "ask_every_buy";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type DecidedVia = "web" | "mobile" | "desktop" | "mcp" | "push";
export type ExitReason =
  | "take_profit" | "stop_loss" | "trailing_stop" | "time_out" | "inactivity" | "drain" | "stall"
  | "rug" | "sell_floor" | "loss_stop" | "manual" | "strategy_retired";
export type FillSide = "buy" | "sell";

export interface Untrusted { name?: string; symbol?: string; uri?: string; image?: string; description?: string }

export interface EventEnvelope<T extends string = string, P = unknown> {
  id: Uuid;
  /** Strictly increasing and gapless per workspace. */
  seq: number;
  type: T;
  version: number;
  workspace_id: Uuid;
  strategy_id: Uuid | null;
  ts: IsoTs;
  actor: Actor;
  mode: Mode;
  trail_key: string | null;
  payload: P;
}

export interface RuleResult { rule: string; passed: boolean; measured: string | null; threshold: string | null }
export interface WeightedRuleResult { rule: string; points: number; max_points: number; measured: string | null; threshold: string | null }
export interface GuardCheckResult { check: string; verdict: GuardVerdict; reason: string; measured?: string; threshold?: string }

export interface CoinDetected {
  mint: Base58; stream: CoinStream; source: "pumpportal" | "yellowstone" | "helius_ws";
  launchpad: string | null; pool_program: string | null; creator: Base58 | null; slot: number; decimals: number;
  price_usd: DecimalString | null; market_cap_usd: DecimalString | null; liquidity_usd: DecimalString | null;
  untrusted: Untrusted;
}
export interface ScreenerScored {
  pick_candidate_id: Uuid; mint: Base58; strategy_rev: number; passed: boolean; score: number; pass_mark: number;
  hard: RuleResult[]; weighted: WeightedRuleResult[]; rejected_by: string | null;
}
export interface GuardResult { mint: Base58; strategy_rev: number; verdict: GuardVerdict; snapshot_id: Uuid; checks: GuardCheckResult[] }
export interface PickCreated {
  pick_id: Uuid; mint: Base58; strategy_rev: number; score: number; guard_verdict: GuardVerdict;
  pick_price_usd: DecimalString;
  entry: { state: "watching" | "armed"; dip_pct: PctString; delay_seconds: number; max_up_pct: PctString | null; expires_at: IsoTs };
  untrusted: Untrusted;
}
export interface GuardImpact {
  window: { from: IsoTs; to: IsoTs }; samples: number; truncated: boolean; compute_ms: number;
  baseline: { passed: number; warn: number; fail: number }; proposed: { passed: number; warn: number; fail: number };
  newly_passed: number; newly_blocked: number;
  newly_passed_outcomes: { rugged: number; rug_rate_pct: PctString; median_max_gain_pct: PctString; median_1h_return_pct: PctString };
  risk_level: RiskLevel; weakening: boolean;
}
export interface ProposalCreated {
  proposal_id: Uuid; kind: ProposalKind; version: number; expires_at: IsoTs;
  pick_id: Uuid | null; first_buy: boolean | null; approval_mode: ApprovalMode | null;
  amount_lamports: Lamports | null; risk_level: RiskLevel; summary: string;
  base_rev: number | null; diff: Record<string, [unknown, unknown]> | null;
  weakening?: boolean; impact?: GuardImpact | null;
}
export interface ProposalDecided { proposal_id: Uuid; kind: ProposalKind; version: number; decided_by: Uuid; decided_via: DecidedVia; reason: string | null }
export interface ProposalExpired { proposal_id: Uuid; kind: ProposalKind; version: number; reason: ProposalExpiredReason; detail: string | null }
export interface PositionOpened {
  position_id: Uuid; position_key: string; pick_id: Uuid; mint: Base58; entry_price_usd: DecimalString;
  qty_raw: RawQty; sol_in_lamports: Lamports; fee_lamports: Lamports; first_buy: boolean; exit_plan: string;
}
export interface PositionUpdated {
  position_id: Uuid; qty_raw: RawQty; peak_price_usd: DecimalString; realized_lamports: Lamports; plan_state: Record<string, unknown>;
}
export interface PositionClosed {
  position_id: Uuid; exit_reason: ExitReason; exit_price_usd: DecimalString; sol_out_lamports: Lamports;
  pnl_lamports: Lamports; pnl_pct: PctString; hold_seconds: number;
}
export interface FillSimulated {
  fill_id: Uuid; position_id: Uuid; side: FillSide; simulated: true;
  mark_price_usd: DecimalString; fill_price_usd: DecimalString; qty_raw: RawQty; sol_lamports: Lamports;
  fee_bps: number; fee_lamports: Lamports; priority_fee_lamports: Lamports; slippage_bps: number;
  latency_ms: number; quote_slot: number; fill_slot: number;
}
export interface ExitTriggered { position_id: Uuid; rule: ExitReason; rule_index: number; sell_pct: PctString; trigger_price_usd: DecimalString; detail: string }
export interface PortfolioSnapshot {
  snapshot_id: Uuid; scope: "workspace" | "strategy"; cash_lamports: Lamports; invested_lamports: Lamports;
  equity_lamports: Lamports; realized_pnl_lamports: Lamports; unrealized_pnl_lamports: Lamports;
  peak_equity_lamports: Lamports; drawdown_pct: PctString; open_positions: number; as_of_seq: number;
}
export interface GuardChanged {
  guard_change_id: Uuid; proposal_id: Uuid | null; status: "applied" | "cooldown" | "reverted" | "cancelled";
  from_rev: number; to_rev: number; weakening: boolean; diff: Record<string, [unknown, unknown]>;
  cooldown_until: IsoTs | null; revert_at: IsoTs | null;
}

export interface EventPayloads {
  "coin.detected": CoinDetected;
  "screener.scored": ScreenerScored;
  "guard.result": GuardResult;
  "pick.created": PickCreated;
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
}
export type EventType = keyof EventPayloads;
export type KnownEvent = { [K in EventType]: EventEnvelope<K, EventPayloads[K]> }[EventType];
/** Clients must tolerate unknown types (forward compatibility). */
export type AnyEvent = KnownEvent | EventEnvelope<string, unknown>;

export function isEvent<K extends EventType>(e: EventEnvelope<string, unknown>, type: K): e is EventEnvelope<K, EventPayloads[K]> {
  return e.type === type;
}

/** Realtime Broadcast `marks:<workspace_id>` payload (not part of seq, never persisted). */
export interface MarkMessage {
  mint: Base58; price_usd: DecimalString; price_sol: DecimalString; liquidity_usd: DecimalString | null;
  slot: number; ts: IsoTs; position_ids: Uuid[];
}

export interface EventPage { items: AnyEvent[]; next_after_seq: number | null; next_before_seq: number | null; has_more: boolean }

/** Decision request shared by REST (Web) and the decide_approval RPC (Flutter). */
export interface ApprovalDecisionRequest {
  decision: "approve" | "reject";
  token: string;
  expected_version: number;
  reason?: string | null;
  client: DecidedVia;
}
export interface ApprovalDecisionResponse { proposal_id: Uuid; status: ProposalStatus; version: number; replayed: boolean }
