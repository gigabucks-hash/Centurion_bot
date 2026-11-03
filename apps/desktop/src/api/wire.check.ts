/**
 * TS contract check (compile-time only; never imported by the app, so never bundled).
 * The EVENTS_SCHEMA.md / API_ENDPOINTS.md examples (contracts v1.1.3) must type-check against
 * `@centurion/contracts/wire` with `satisfies`, and the desktop view types must keep using the wire
 * value types. `npm run build` (tsc -b) fails if Backend changes a shape the desktop relies on.
 * Rust counterpart: src-tauri/src/contract_tests.rs (reads the same files at test time).
 */
import { APPROVAL_REJECT_REASONS, CONTRACTS_VERSION } from "@centurion/contracts/wire";
import type {
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  ApprovalRejectReason,
  ApprovalWire,
  ClockMessage,
  ClosePositionResponse,
  ConflictError,
  EventEnvelope,
  EventPayloads,
  EventType,
  ExitReason,
  FillSimulated,
  MarkMessage,
  OrderWire,
  PlanState,
  PortfolioSnapshot,
  PracticeReset,
  ProposalExpired,
  StrategyLifecycle,
  Venue,
} from "@centurion/contracts/wire";
import type { PickView, PositionView, Snapshot } from "./contract";

export const envelopeSample = {
  id: "k7x2m9q4:1793263320123:position.opened",
  seq: "18234",
  type: "position.opened",
  version: 1,
  workspace_id: "10000000-0000-0000-0000-00000000000a",
  strategy_id: "20000000-0000-0000-0000-00000000000a",
  ck: "k7x2m9q4",
  mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  ts: "2026-10-29T08:42:00.123Z",
  actor: "executor",
  mode: "practice",
  payload: {},
  untrusted: { name: "Example", symbol: "EXM" },
  server_now: "2026-10-29T08:42:00.151Z",
} satisfies EventEnvelope;

export const markSample = {
  mint: "7GCi...W2hr", price_usd: "0.000041230000", price_sol: "0.000000213400", liquidity_usd: 48211.5,
  slot: 301223344, ts: "2026-10-29T08:42:01.020Z", position_ids: ["4000..."], server_now: "2026-10-29T08:42:01.031Z",
} satisfies MarkMessage;
export const clockSample = { server_now: "2026-10-29T08:42:15.000Z", safe_seq: "18240" } satisfies ClockMessage;

export const expiredSample = {
  proposal_id: "30000000-0000-0000-0000-00000000000b", kind: "buy_pick", rev: 2, reason: "strategy_deleted", at: "2026-10-29T08:42:00.123Z",
} satisfies ProposalExpired;

/** EVENTS_SCHEMA.md fill example (1.1.2 FillWire + fill.simulated extras). */
export const fillSample = {
  id: "60000000-0000-0000-0000-000000000001", position_key: "abc123.0", position_id: "50000000-0000-0000-0000-000000000001",
  order_id: null, side: "buy", simulated: true, practice_epoch: 1, mark_price_sol: "0.00000025",
  exec_price_sol: "0.000000255", token_amount_raw: "980392156", sol_lamports: "250000000",
  fee_bps: 125, swap_fee_lamports: "3125000", network_fee_lamports: "25000",
  price_impact_bps: 196.08, slippage_bps: 2.04, latency_ms: 450, mid_price_sol: "0.00000025", created_at: "2026-10-29T08:42:00.123Z",
} satisfies FillSimulated;

/** EVENTS_SCHEMA.md plan_state example shape (discriminated PlanStep). */
export const planStateSample = {
  preset: "momentum_trail", current_step: 0, triggered_steps: [], trail_peak_price_sol: null,
  steps: [
    { kind: "profit_target", index: 0, triggered: false, triggered_at: null, at_gain_pct: 100, sell_portion_pct: 100, trigger_price_sol: "0.0000005" },
    { kind: "peak_trail", index: 1, triggered: false, triggered_at: null, trail_pct: 20, armed: false, peak_price_sol: "0.00000025", stop_price_sol: null },
    { kind: "loss_guard", index: 2, triggered: false, triggered_at: null, at_loss_pct: 40, sell_portion_pct: 100, trigger_price_sol: "0.00000015" },
  ],
} satisfies PlanState;

const orderSample = {
  id: "70000000-0000-0000-0000-000000000001", position_id: "50000000-0000-0000-0000-000000000001", mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  mode: "practice", side: "sell", kind: "manual_close", fraction_bps: 5000, status: "filled", reason_code: null, job_id: "9000000001",
  fill_id: null, practice_epoch: 1, created_at: "2026-10-29T08:42:00.123Z", updated_at: "2026-10-29T08:42:00.523Z",
} satisfies OrderWire;
/** Mock close response (backend/mock.rs) must be a valid ClosePositionResponse. */
export const closeSample = {
  position: {
    id: "50000000-0000-0000-0000-000000000001", position_key: "abc123.0", workspace_id: "10000000-0000-0000-0000-00000000000a", strategy_id: null,
    mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", mode: "practice", status: "open", rev: 2, practice_epoch: 1, qty_raw: "490196078000",
    decimals: 9, token_program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", cost_basis_lamports: "125000000", sol_in_lamports: "250000000",
    sol_out_lamports: "130000000", fees_lamports: "1700000", avg_entry_price_sol: "0.000000255", peak_price_sol: null, exit_price_sol: null,
    exit_reason: null, opened_at: "2026-10-29T08:40:00.000Z", closed_at: null,
    // 1.1.6 (f1b7910): our proxy URL + its `v`; null = identicon.
    logo_hash: "mocklogo1", logo_url: "https://logo.mock.invalid/v1/img/coin/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr?s=96&v=mocklogo1",
  },
  order: orderSample, order_id: orderSample.id, fill: null, job_id: "9000000001", status: "filled", replayed: false, server_now: "2026-10-29T08:42:00.600Z",
} satisfies ClosePositionResponse;

export const portfolioSample = {
  cash_lamports: "26292000000", positions_cost_lamports: "1202000000", positions_value_lamports: "1186000000",
  equity_lamports: "27478000000", peak_equity_lamports: "30000000000", drawdown_bps: 840, drawdown_pct: 8.4,
  realized_pnl_lamports: "-2506000000", unrealized_pnl_lamports: "-16000000", open_positions: 6, as_of_seq: "18233", practice_epoch: 1,
} satisfies PortfolioSnapshot;

export const resetSample = {
  epoch: 2, previous_epoch: 1, starting_balance_lamports: "30000000000",
  archived: { positions: 1, closed_open_positions: 1, fills: 2, snapshots: 3, expired_proposals: 0 },
  next_allowed_at: "2026-10-30T08:42:00.000Z", at: "2026-10-29T08:42:00.000Z",
} satisfies PracticeReset;

export const strategyPausedSample = { rev: 8, base_rev: 7, status: "paused", changed_fields: ["status"] } satisfies StrategyLifecycle;

/** API_ENDPOINTS.md §2.1 409 body (1.1.2: merge data inside `error`). */
export const conflictSample = {
  error: {
    code: "STRATEGY_REV_CONFLICT", message: "Strategy rev changed since this was based on it", request_id: "req_01J...", server_now: "2026-10-29T08:42:00.151Z",
    current_rev: 9, base_rev: 7, changed_fields: ["peak_trail_pct", "status"],
    changed_by: { actor: "0000...000a", via: "mobile", device: "iPhone15,2" },
    changed_at: "2026-10-29T08:40:12.004Z",
    current: { id: "2000...", rev: 9, name: "Yumi · AMM", status: "paused", mode: "practice", settings: {} },
  },
  server_now: "2026-10-29T08:42:00.151Z",
} satisfies ConflictError;

// ---- vocabulary the desktop maps in Rust keys.rs / ActivityFeed (compile error if renamed upstream)
export const exitReasonsUsed = ["profit_target", "loss_guard", "peak_trail", "manual", "practice_reset"] as const satisfies readonly ExitReason[];
export const venuesUsed = ["curve", "amm"] as const satisfies readonly Venue[];
export const eventTypesHandled = [
  "coin.detected", "screener.scored", "guard.result", "pick.created", "entry.armed", "entry.expired",
  "proposal.created", "proposal.approved", "proposal.rejected", "proposal.expired", "position.opened",
  "position.updated", "position.closed", "fill.simulated", "exit.triggered", "portfolio.snapshot",
  "strategy.created", "strategy.updated", "strategy.paused", "strategy.resumed", "strategy.archived",
  "strategy.deleted", "practice.reset", "proposal.updated", "account.deletion_scheduled", "account.deletion_cancelled",
  "account.deleted", "system.notice", "order.submitted", "order.filled", "order.failed",
] as const satisfies readonly EventType[];
/** Every wire type is either handled or deliberately ignored. */
type Unhandled = Exclude<keyof EventPayloads, (typeof eventTypesHandled)[number] | "guard.changed">;
export const allHandled: [Unhandled] extends [never] ? true : Unhandled = true;

// ---- view types reuse wire value types (no float for money): lamports/prices are strings
type IsString<T> = T extends string ? true : false;
export const amountsAreStrings: [
  IsString<PickView["amount_lamports"] & {}>, IsString<PositionView["pnl_lamports"]>,
  IsString<PositionView["entry_price_sol"]>, IsString<NonNullable<Snapshot["account"]["cash_lamports"]>>,
] = [true, true, true, true];

// ---- contracts 1.1.3: reject_reason (closed enum, reject only) + ApprovalWire; ConflictError.current required
/** Any 1.1.x (the Rust contract test pins the committed version to the mirror). */
export const contractsVersion11x = CONTRACTS_VERSION satisfies `1.1.${number}`;
/** What the desktop sends on Skip (Rust commands.rs `skip_reason`): not_tradeable for a WF-20 card. */
export const skipNotTradeableSample = { decision: "reject", token: "apt_x", expected_rev: 1, reject_reason: "not_tradeable" } satisfies ApprovalDecisionRequest;
export const skipNormalSample = { decision: "reject", token: "apt_x", expected_rev: 1, reject_reason: "user_declined" } satisfies ApprovalDecisionRequest;
// @ts-expect-error unknown reject_reason is not in the closed enum (server: 422 VALIDATION_FAILED)
export const badRejectReason: ApprovalRejectReason = "bored";
export const rejectReasonsUsed = ["user_declined", "not_tradeable"] as const satisfies readonly (typeof APPROVAL_REJECT_REASONS)[number][];
export const decisionResponseSample = {
  proposal_id: "p", status: "rejected", rev: 2, reject_reason: "not_tradeable", replayed: false, server_now: "2026-10-29T08:42:00.151Z",
} satisfies ApprovalDecisionResponse;
export const approvalWireSample = {
  id: "a", proposal_id: "p", workspace_id: "w", strategy_id: null, kind: "buy_pick", mode: "practice", subject: null, mint: null,
  amount_lamports: "100000000", is_first_buy: true, risk: "low", weakening: false, status: "rejected", rev: 2, expire_reason: null,
  base_rev: null, decision: "reject", reject_reason: "not_tradeable", decided_via: "desktop", decided_by: "u", payload: {},
  created_at: "2026-10-29T08:41:00.000Z", expires_at: "2026-10-29T08:42:00.000Z", decided_at: "2026-10-29T08:41:30.000Z",
  // 1.1.4 (7ba6273) quote fields: always present on the resource, null when unset.
  est_network_fee_lamports: null, priority_fee_lamports: null, swap_fee_bps: null, max_slippage_bps: null,
  min_out_raw: null, total_max_lamports: null, quote_ts: null, quote_expires_at: null,
  // 1.1.5 (ef74131): quote identity, ATA rent, sell quote outs, mint decimals/program, position for sells.
  quote_id: "1", est_ata_rent_lamports: null, expected_out_lamports: null, min_out_lamports: null,
  decimals: null, token_program: null, position_id: null,
  // 1.1.6: logo_url (f1b7910) + logo_hash (c99b114, required, nullable). mint null → both null.
  logo_hash: null, logo_url: null,
} satisfies ApprovalWire;
// @ts-expect-error ConflictError.current is required (1.1.3, matches Rust `required_non_null`)
export const conflictWithoutCurrent: ConflictError = { error: { code: "VERSION_CONFLICT", message: "m", request_id: "r", server_now: "x", current_rev: 2, base_rev: 1 }, server_now: "x" };


// coinLogo.ts PROXY_SIZES mirrors contracts LOGO_SIZES exactly (1.1.6: proxy serves 128/192 too).
import { LOGO_SIZES } from "@centurion/contracts/wire";
import { PROXY_SIZES } from "../components/coinLogo";
export const proxySizesMatch: typeof LOGO_SIZES = PROXY_SIZES;
export const logoSizesMatch: typeof PROXY_SIZES = LOGO_SIZES;
