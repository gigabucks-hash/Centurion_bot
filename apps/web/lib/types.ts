/**
 * UI view models for the Centurion dashboard.
 *
 * Shared enums are imported from the official wire contract (@centurion/contracts/wire, v1.1.2) so
 * they cannot drift. Wire payloads (lamport / decimal strings, ISO timestamps, no floats) are
 * decoded into these view models ONLY at the API edge (lib/contracts.ts + lib/http-api.ts);
 * `Sol` numbers here are display values derived from lamport strings via BigInt math.
 */
import type {
  Actor as WireActor,
  ApprovalMode as WireApprovalMode,
  Venue as WireVenue,
  ExitPreset as WireExitPreset,
  RequiredCheck as WireRequiredCheck,
  GuardCheckName,
  EventType as WireEventType,
  ExitReason as WireExitReason,
  GuardChanged,
  Mode as WireMode,
  ProposalExpiredReason,
  ProposalKind,
  ProposalStatus,
  RiskLevel as WireRiskLevel,
  TokenProgram,
  ErrorCode,
  PaperProgress,
  RealLockedReason,
} from "@centurion/contracts/wire";

/** Unix epoch milliseconds. */
export type Timestamp = number;
/** SOL display value (decoded from wire lamport strings at the edge; never sent back on the wire). */
export type Sol = number;
/** Base58 SPL token mint address. */
export type Mint = string;

/**
 * Strategy mode (Boss 3 Nov: ONE app, each strategy runs in Paper or Real). Wire stays `practice | real`; the UI says
 * "Paper" for practice (contracts 1.1.6). Balances/portfolios stay per mode on the wire (`?mode=`), never mixed.
 */
export type TradingMode = WireMode;
export const MODE_LABEL: Record<TradingMode, string> = { practice: "Paper", real: "Real" };
export type { PaperProgress, RealLockedReason };
export type ConnectionState = "connected" | "connecting" | "disconnected";

// ---------------------------------------------------------------------------
// Workspace / team overview
// ---------------------------------------------------------------------------

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  createdAt: Timestamp;
  href?: string;
  strategyId?: string;
}

export interface EquityPoint {
  t: Timestamp;
  equitySol: Sol;
}

export interface WorkspaceOverview {
  id: string;
  name: string;
  mode: TradingMode;
  /** Real only: whether a custody wallet + 2FA are set up (mock: always false). */
  walletConnected: boolean;
  startingCashSol: Sol;
  cashSol: Sol;
  inPositionsSol: Sol;
  realizedPnlSol: Sol;
  unrealizedPnlSol: Sol;
  openPositions: number;
  /** Sum of maxOpen across running strategies. */
  openPositionsCap: number;
  runningStrategies: number;
  pausedStrategies: number;
  lossStopPct: number;
  drawdownPct: number;
  pendingApprovals: number;
  /** Pending approvals expiring in < 2 min. */
  expiringSoon: number;
  engine: { online: boolean; lastHeartbeatAt: Timestamp; version: string };
  equityCurve: EquityPoint[];
  alerts: Alert[];
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Strategy settings (subset of the 52-key schema; see lib/strategy-schema.ts)
// ---------------------------------------------------------------------------

/** Coin venue (wire `Venue`; replaces the deprecated `CoinStream`). */
export type Venue = WireVenue;
/** Per-strategy setting (ask-before-first-buy is the default). */
export type ApprovalMode = WireApprovalMode;
export type GuardPreset = "strict" | "balanced" | "loose" | "custom";
/** Wire ExitPreset subset offered as builder templates (+ "custom" = edited rungs). */
export type ExitPlanPreset = Extract<WireExitPreset, "three_step_ladder" | "trail_stop_only" | "fast_half" | "geometric_ladder"> | "custom";
/** Wire RequiredCheck (settings `required_checks`). */
export type MustHaveRule = Extract<WireRequiredCheck, "liquidity_usd" | "volume_24h_usd" | "mcap_usd" | "age_minutes_min" | "top_holders_share_pct" | "lp_burned_pct">;
/** Wire GuardCheckName subset the builder toggles (settings `guard_checks`). */
export type GuardCheck = Extract<GuardCheckName, "mint_authority" | "freeze_authority" | "bundled_share" | "creator_share" | "sniper_share" | "serial_creator" | "transfer_fee" | "honeypot">;

export interface TakeProfitRung {
  gainPct: number;
  sellPct: number;
  pullbackPct?: number | null;
}

export interface StrategySettings {
  name: string;
  mode: TradingMode;
  approvalMode: ApprovalMode;
  sizing: { budgetSol: Sol; tradeSol: Sol; maxOpen: number; lossStopPct: number };
  screener: {
    streams: Venue[];
    minAgeMinutes: number;
    maxAgeMinutes: number;
    minMarketCapUsd: number;
    maxMarketCapUsd: number;
    minLiquidityUsd: number;
    minVolume24hUsd: number;
    minHolders: number;
    minBuyers1h: number;
    minBuySellRatio: number;
    maxTop10Percent: number;
    minLpBurnPct: number;
    maxDrawdownPct: number;
    mustHave: MustHaveRule[];
    passMark: number;
  };
  guard: {
    preset: GuardPreset;
    maxDevPercent: number;
    maxBundlersPct: number;
    maxSnipersPct: number;
    checks: Record<GuardCheck, boolean>;
  };
  entry: {
    dipPct: number;
    entryDelayMinutes: number;
    entryMaxUpPct: number;
    breakout: { enabled: boolean; minutes: number; rangePct: number; buyers: number };
    activeTrading: boolean;
    rebuy: boolean;
    tradingHoursUtc: { enabled: boolean; from: number; to: number };
  };
  exit: {
    plan: ExitPlanPreset;
    takeProfits: TakeProfitRung[];
    trailingPct: number;
    stopLossPct: number;
    /** contracts 1.1.4 `time_stop_s` = minutes × 60 (1–604800 s); 0 = off (null on the wire). exit_reason max_hold. */
    timeStopMinutes: number;
    noTradeSeconds: number;
    drainDropPct: number;
    /** contracts 1.1.4 `stall_exit {window_s, min_move_pct}`; false = off (null on the wire). exit_reason stall. */
    stallExit: boolean;
    stallWindowS: number;
    stallMinMovePct: number;
  };
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export type StrategyStatus = "draft" | "running" | "paused" | "archived";

export type FunnelStage = "scanned" | "filtered" | "signaled" | "entered" | "exited";
export const FUNNEL_STAGES: FunnelStage[] = ["scanned", "filtered", "signaled", "entered", "exited"];

export interface StrategyFunnel {
  scanned: number;
  /** Passed screener + guard. */
  filtered: number;
  /** Entry condition hit (or approval requested). */
  signaled: number;
  entered: number;
  exited: number;
  rejections: { reason: string; count: number }[];
}

export interface Strategy {
  id: string;
  name: string;
  /** Per-strategy mode (wire practice|real). */
  mode: TradingMode;
  /** contracts 1.1.6 StrategyRealGateFields: true while the strategy may not run in Real (always true in this phase). */
  realLocked: boolean;
  /** null only when realLocked is false (UX v2.6: null while locked → show "other"). */
  realLockedReason: RealLockedReason | null;
  /** `*_required` null = threshold not set by the owner (show "not set", never assume a number). */
  paperProgress: PaperProgress;
  status: StrategyStatus;
  /** Active settings revision (optimistic versioning). */
  rev: number;
  settings: StrategySettings;
  openPositions: number;
  realizedPnlSol: Sol;
  unrealizedPnlSol: Sol;
  trades: number;
  wins: number;
  maxDrawdownPct: number;
  avgHoldSeconds: number;
  /** Cumulative PnL points for the sparkline. */
  pnlSpark: number[];
  funnel: StrategyFunnel;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DiffDirection = "weakens" | "strengthens" | "new" | "neutral";

export interface SettingsDiffRow {
  key: string;
  label: string;
  before: string;
  after: string;
  direction: DiffDirection;
}

export interface PublishResult {
  strategyId: string;
  /** "published" when applied directly, "needs_approval" when a guard is weakened. */
  outcome: "published" | "needs_approval";
  rev: number;
  approvalId?: string;
  /** 1.1.4 guard_change.weakened_fields of the 202 response. */
  weakenedFields?: string[];
  /** proposal.expires_at (epoch ms) for guard.weaken.pending.body {expires_at}. */
  expiresAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// Coins, positions, trail
// ---------------------------------------------------------------------------

export interface CoinMeta {
  mint: Mint;
  /** Token metadata is UNTRUSTED. Render as plain text only. */
  untrusted: { symbol: string; name: string };
  /** contracts 1.1.6 `logo_hash` (= `v` of the logo URL): null/absent = identicon, no request (lib/media.ts). */
  logoHash?: string | null;
  launchpad: string;
  venue: Venue;
  createdAt: Timestamp;
  /** From the mint account (contracts 1.1.2). Never assume 6; null while the mint account is unreadable. */
  decimals: number | null;
  tokenProgram: TokenProgram | null;
  /** null = SOL quote (or wSOL). */
  quoteMint: string | null;
  /** false = practice cannot trade this coin at all; skipReason says why (e.g. UNSUPPORTED_QUOTE_MINT). */
  tradeable: boolean;
  skipReason: ErrorCode | null;
}

export type PositionStatus = "open" | "closed";

export interface Position {
  /** `<pickKey>.<n>` */
  key: string;
  strategyId: string;
  mint: Mint;
  status: PositionStatus;
  /** Mock/display USD entry (NaN when only the SOL price is known). */
  entryPriceUsd: number;
  exitPriceUsd?: number;
  /** SOL per whole token (contract `avg_entry_price_sol` / `exit_price_sol`); null = not reported. */
  entryPriceSol?: number | null;
  exitPriceSol?: number | null;
  solIn: Sol;
  solOut: Sol;
  peakGainPct: number;
  feeBps: number;
  openedAt: Timestamp;
  closedAt?: Timestamp;
  exitReason?: ExitReason;
  pnlSol: Sol;
  pnlPct: number;
  /** The API has no mark for this row yet: render an em dash, never a fabricated 0. */
  markUnknown?: boolean;
}

export type ActorKind = WireActor;

/** Activity kinds per UX SPEC §4. */
export type EventKind =
  | "found"
  | "passed"
  | "blocked"
  | "armed"
  | "expired"
  | "proposal"
  | "approved"
  | "skipped"
  | "bought"
  | "sold";

/**
 * Feed view model of a wire `EventEnvelope` (see lib/contracts.ts `envelopeToTradeEvent`).
 * Id = envelope id `<subject>:<epoch_ms>:<type>` (dedupe key).
 */
export interface TradeEvent {
  id: string;
  /** Envelope seq: monotonic, NOT gapless. Used for paging / resume (after_seq, safe_seq). */
  seq: string; // int64 string (contracts 1.1.2): compare with BigInt via lib/seq.ts
  /** Wire event type, e.g. "position.closed". */
  type?: WireEventType;
  /** Pick key (1 coin x 1 strategy). */
  ck?: string;
  ts: Timestamp;
  kind: EventKind;
  actor: ActorKind;
  strategyId?: string;
  /** Envelope mode (wire practice|real; UI "Paper"/"Real"): the feed mixes strategies of both modes. */
  mode?: TradingMode;
  mint?: Mint;
  /** 1.1.6: from the envelope `logo_url` (null/absent = identicon). */
  logoHash?: string | null;
  symbol?: string;
  /** Short headline, e.g. "Bought 0.24 SOL". */
  message: string;
  /** Reason / detail line, e.g. "dip −8% reached". */
  reason?: string;
  /** Machine reason code, e.g. UNSUPPORTED_QUOTE_MINT ("Not tradeable"). */
  reasonCode?: string;
  solAmount?: Sol;
  pnlSol?: Sol;
  pctChange?: number;
  priceUsd?: number;
  /** For `sold`: partial take-profit vs final close. */
  partial?: boolean;
  exitReason?: ExitReason;
  checks?: CheckResult[];
  /** Settings revision whose thresholds were used (snapshot). */
  rev?: number;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  hard: boolean;
  measured: string;
  threshold: string;
}

export interface PricePoint {
  t: Timestamp;
  priceUsd: number;
}

export interface CoinTrail {
  /** contracts 1.1.4 market cap (same computation as the coin list). */
  mcap?: MarketCap;
  coin: CoinMeta;
  strategyId: string;
  strategyName: string;
  mode: TradingMode;
  score?: { value: number; passMark: number };
  /** Screener state (UNSUPPORTED_QUOTE_MINT) and the pool's quote token when it is not SOL. */
  screenerState?: ScreenerState;
  quoteSymbol?: string;
  positions: Position[];
  events: TradeEvent[];
  /** Mock price series around the trade window. */
  prices: PricePoint[];
}

/** Positions screen row (GET /positions?state=open view model). */
export interface OpenPosition {
  key: string;
  /** contracts 1.1.6 `logo_hash` (approvals: recovered from `logo_url`); null/absent = identicon (lib/media.ts). */
  logoHash?: string | null;
  strategyId: string;
  strategyName: string;
  mode: TradingMode;
  mint: Mint;
  symbol: string;
  solIn: Sol;
  entryPriceUsd: number;
  nowPriceUsd: number;
  pnlSol: Sol;
  pnlPct: number;
  openedAt: Timestamp;
  /** Share already sold by manual sells (0–100). */
  soldPct: number;
  /** Coin became untradeable (UNSUPPORTED_QUOTE_MINT): Sell is disabled. */
  screenerState?: ScreenerState;
  /** Position rev (1.1.2): manual close sends `If-Match: "<rev>"`. */
  rev: number;
  decimals: number | null;
  tokenProgram: TokenProgram | null;
  practiceEpoch: number;
  /** Strategy exit plan, for the "next action" line. */
  stopLossPct: number;
  trailingPct: number;
  /** 0025: the server had no mark+PnL for this row, so both render an em dash (never a fake 0). */
  markUnknown?: boolean;
  /** http mode has no SOL/USD rate, so the price cell stays an em dash even when the SOL mark is known. */
  priceUnknown?: boolean;
}

export interface CoinSummary {
  mint: Mint;
  symbol: string;
  strategyId: string;
  strategyName: string;
  mode: TradingMode;
  lastEventAt: Timestamp;
  status: PositionStatus | "watching" | "rejected";
  pnlSol?: Sol;
  /** UNSUPPORTED_QUOTE_MINT → "Not tradeable" (WF-20/21). */
  screenerState?: ScreenerState;
  /** contracts 1.1.4 MarketCapFields (one backend computation). usd is indicative (reference SOL price). */
  mcap?: MarketCap;
  /** contracts 1.1.6 `logo_hash`: null/absent = identicon, no request (lib/media.ts). */
  logoHash?: string | null;
}

export interface MarketCap {
  /** Integer lamport string; null when decimals/supply are unknown (never assumed). */
  lamports: string | null;
  /** Decimal string, display-only and indicative. */
  usd: string | null;
  /** When the inputs were observed; null when both are null. */
  asOf: Timestamp | null;
  /** contracts 1.1.5 mcap_source: curve / pool (indicative, computed by us) or unavailable. */
  source?: "curve" | "pool" | "unavailable";
}

// ---------------------------------------------------------------------------
// Exit stats
// ---------------------------------------------------------------------------

/** = @centurion/contracts wire `ExitReason` (v1). */
export type ExitReason = WireExitReason;

/** The contract list itself (wire.EXIT_REASONS), re-exported so UI and backend cannot drift. */
export { EXIT_REASONS } from "@centurion/contracts/wire";

export interface ExitReasonStat {
  reason: ExitReason;
  count: number;
  wins: number;
  winRate: number; // 0..1
  avgPnlSol: Sol;
  avgPnlPct: number;
  totalPnlSol: Sol;
  avgHoldSeconds: number;
}

export interface StatsFilter {
  strategyId?: string;
  mode: TradingMode;
  windowHours?: number;
}

// ---------------------------------------------------------------------------
// PnL report (0022)
// ---------------------------------------------------------------------------

/** 0022 report windows, shared by `GET /stats/pnl` and `GET /positions?state=closed`. */
export type PnlWindow = "1h" | "24h" | "7d" | "30d" | "all";

export interface PnlFilter {
  mode: TradingMode;
  strategyId?: string;
  /** Default `7d` (the report default); `all` = no range. */
  window?: PnlWindow;
  /** Closed-trade ledger page size (newest closes first); default 50 for a page, 100 for the whole-list read. */
  limit?: number;
  /** Opaque keyset cursor from a previous page (closed ledger only). */
  cursor?: string | null;
}

/**
 * 0022 `GET /stats/pnl`, decoded at the API edge. Every money field is server-computed:
 * `realizedPnlSol` is all-time for the current epoch, `realizedWindowSol` only the selected range,
 * and `totalPnlSol` is the exact lamport sum (never re-added here).
 */
export interface PnlSummary {
  mode: TradingMode;
  practiceEpoch: number | null;
  /** Range echo; null when the request used from/to. */
  window: PnlWindow | null;
  from: Timestamp | null;
  to: Timestamp | null;
  /** Mark-to-market of the open remainder (partial sells included). */
  unrealizedPnlSol: Sol | null;
  /** Closed-trade ledger, all-time (partial take-profits on still-open positions included). */
  realizedPnlSol: Sol | null;
  totalPnlSol: Sol | null;
  /** Whole exits inside the range only; may differ from the all-time value above. */
  realizedWindowSol: Sol | null;
  closedCount: number;
  winCount: number;
  /** null when closedCount = 0 — never a fake 0 %. */
  winRatePct: number | null;
  avgHoldSeconds: number | null;
  /** Reported context only: the swap fee is already inside solIn/solOut. */
  feesSol: Sol | null;
  bestPnlSol: Sol | null;
  worstPnlSol: Sol | null;
  asOfSeq: string | null;
  ts: Timestamp | null;
}

/** One closed position (`GET /positions?state=closed`); its realized PnL is frozen at close. */
export interface ClosedTrade {
  id: string;
  positionKey: string;
  strategyId: string | null;
  mode: TradingMode;
  mint: Mint;
  /** Coin symbol/logo are joined from the coin list at the page edge (the wire carries the mint only). */
  symbol: string | null;
  logoHash: string | null;
  /** Null when the wire omits the value: render an em dash, never a fabricated 0. */
  solInSol: Sol | null;
  solOutSol: Sol | null;
  /** Reported context (swap fee is already netted inside solIn/solOut); null when the wire omits it. */
  feesSol: Sol | null;
  pnlSol: Sol | null;
  pnlPct: number | null;
  holdSeconds: number | null;
  exitReason: ExitReason | null;
  openedAt: Timestamp;
  closedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Approvals (UX SPEC §3)
// ---------------------------------------------------------------------------

export type ApprovalKind = ProposalKind;
export type PickKind = "first_buy" | "buy" | "rebuy";
export type TeamActionKind = "sell_all" | "rearm_loss_stop" | "delete_strategy";

/** Wire ProposalStatus ("rejected" is labelled "Skipped") + UI-only execution states derived from position/fill events. */
export type ApprovalStatus = ProposalStatus | "executing" | "filled" | "failed";

export type ExpiredReason = ProposalExpiredReason;

export type SkipReason = "thin_liquidity" | "already_pumped" | "dev_suspicious" | "other";

export type RiskLevel = WireRiskLevel;

export interface RiskImpact {
  /** 7-day replay on own paper data. */
  coinsPassedPerDayBefore: number;
  coinsPassedPerDayAfter: number;
  rugsBefore: number;
  rugsAfter: number;
  maxDrawdownBeforePct: number;
  maxDrawdownAfterPct: number;
}

export interface PickDetail {
  pickKind: PickKind;
  score: { value: number; passMark: number };
  guard: { passed: number; total: number; note?: string };
  entry: string;
  exitPlan: string;
  budgetSol: Sol;
}

/** Screener state that makes a coin untradeable (contracts errors: UNSUPPORTED_QUOTE_MINT, 422). */
export type ScreenerState = "UNSUPPORTED_QUOTE_MINT";
export const NOT_TRADEABLE: ScreenerState = "UNSUPPORTED_QUOTE_MINT";

/** Transaction quote for the review sheet (contracts 1.1.4 ProposalQuoteFields, WF-22). Practice = papersim estimate. */
export interface ApprovalQuote {
  /** contracts 1.1.5 (pending): a re-quote sets a new id and does not bump rev. Absent on the 1.1.4 wire. */
  quoteId?: string;
  /** contracts 1.1.5 (pending): rent for a new token account; "0" when none (row hidden). */
  ataRentLamports?: string;
  networkFeeLamports?: string;
  priorityFeeLamports?: string;
  swapFeeBps?: number;
  maxSlippageBps?: number;
  /** Minimum tokens out after max slippage, raw units (integer string) + the token's decimals. */
  minOutRaw?: string;
  decimals?: number;
  totalMaxLamports?: string;
  quoteTs?: Timestamp;
  quoteExpiresAt?: Timestamp;
  /** Display-only (payload): price now vs. at pick time, SOL per whole token as decimal strings. */
  priceSol?: string;
  pickPriceSol?: string;
}

export interface Approval {
  id: string;
  /** contracts 1.1.6 `logo_hash` (approvals: recovered from `logo_url`); null/absent = identicon (lib/media.ts). */
  logoHash?: string | null;
  quote?: ApprovalQuote;
  /** Set when the coin cannot be traded (no SOL quote pair): shown as "Not tradeable", never approvable. */
  screenerState?: ScreenerState;
  /** Approval rev (contracts 1.1.2): send as `If-Match: "<rev>"` (or expected_rev). expected_version is gone. */
  rev: number;
  /** Opaque single-use decision token (apt_…), from GET /approvals/{id}. */
  decisionToken?: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  mode: TradingMode;
  strategyId?: string;
  strategyName?: string;
  mint?: Mint;
  symbol?: string;
  title: string;
  detail: string;
  amountSol?: Sol;
  risk: RiskLevel;
  requestedBy: ActorKind;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  decidedAt?: Timestamp;
  expiredReason?: ExpiredReason;
  skipReason?: SkipReason;
  skipNote?: string;
  /** Contract reject_reason (1.1.3), set once rejected. */
  rejectReason?: "user_declined" | "not_tradeable" | "price_moved" | "other";
  pick?: PickDetail;
  teamAction?: TeamActionKind;
  /** guard_change only */
  diff?: SettingsDiffRow[];
  riskImpact?: RiskImpact;
  revFrom?: number;
  revTo?: number;
  /** guard_change on Real: change takes effect at this time (cancellable). */
  cooldownEndsAt?: Timestamp;
  /** guard_change on Real: ALWAYS set (mandatory policy) = effective time + 24 h. */
  autoRevertAt?: Timestamp;
  /** Mirrors wire `guard.changed.status`. */
  guardChangeState?: Exclude<GuardChanged["status"], "requested">;
  auditId?: string;
}

export type ApprovalDecision =
  | { action: "approve"; confirmation?: { typedName?: string; secondFactor?: "mock_passkey"; holdMs: number } }
  | { action: "skip"; reason?: SkipReason; note?: string; rejectReason?: "user_declined" | "not_tradeable" | "price_moved" | "other" }
  | { action: "undo_skip" }
  | { action: "cancel_cooldown" };
