/**
 * Desktop-only UI types (IPC view-model). **Wire types come from the contracts package**
 * (`@sentra/contracts/wire` = packages/contracts/src/wire, v1.1.3) and are re-exported below; this
 * file only adds what the desktop composes on top of them.
 *
 * Rust mirror: src-tauri/src/view.rs (snake_case, same as the wire). Same value rules as the wire:
 * lamports / raw amounts = integer strings, prices = decimal strings, pct / ratio / score / USD =
 * numbers. Token metadata (`symbol`, `name`) is untrusted plain text: render only as text nodes.
 */
import type {
  Actor,
  DecimalString,
  ExitReason,
  GuardVerdict,
  Int64String,
  IsoTs,
  Lamports,
  Mode,
  PlanState,
  ProposalExpiredReason,
  ProposalStatus,
  RawQty,
  Uuid,
} from "@sentra/contracts/wire";

export type * from "@sentra/contracts/wire";
export { lamportsToSol, LAMPORTS_PER_SOL, CONTRACTS_VERSION, EXIT_REASONS, ERROR_CODES } from "@sentra/contracts/wire";
import type { I18nMsg } from "../i18n";
export type { I18nMsg };

/** int64 seq / cursor / job id strings (1.1.2): compare as BigInt, never as float. */
export const seqCmp = (a: Int64String, b: Int64String) => {
  const x = BigInt(a), y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * WF-20 tradeability (view.rs `Tradeability`, flattened). A coin with no SOL quote pair is NOT an
 * error: neutral chip, no Approve / Sell (blocked in Rust too), reason code shown for support.
 */
export interface Tradeability {
  tradeable: boolean;
  /** errors.json code, e.g. `UNSUPPORTED_QUOTE_MINT` (kind `skip`). */
  reason_code: string | null;
  quote_mint: string | null;
  /** Static label for well-known quote mints (USDC/USDT) — never token metadata. */
  quote_symbol: string | null;
}

/** WF-20 screener row: every scored coin (passed, rejected, not tradeable), newest first. */
export interface ScreenedCoin extends Tradeability {
  ck: string;
  mint: string;
  /** Untrusted metadata, plain text. */
  symbol: string;
  name: string | null;
  venue: "curve" | "amm" | null;
  strategy: string;
  score: number;
  score_threshold: number;
  max_score: number;
  passed: boolean;
  guard_verdict: GuardVerdict | null;
  status: "pick" | "pending_guard" | "rejected_score" | "rejected_guard" | "not_tradeable";
  liquidity_usd: number | null;
  /** WF-20 Mcap column, contracts 1.1.4 `MarketCapFields` (newest of coin.detected / screener.scored /
   * pick.created). `mcap_usd` is a decimal string, display-only and indicative; null → "—". */
  market_cap_lamports: Lamports | null;
  mcap_usd: DecimalString | null;
  mcap_as_of: IsoTs | null;
  decimals: number | null;
  token_program: string | null;
  ts_ms: number;
}

/** Buy proposal joined with its pick + latest mark (proposal.created + pick.created + mark). */
export interface PickView extends Tradeability {
  /** proposal_id */
  id: Uuid;
  /** Approval rev (1.1.2; was `version`). */
  rev: number;
  ck: string;
  mint: string;
  strategy_id: Uuid | null;
  strategy: string;
  /** Sanitised untrusted.symbol — plain text. */
  symbol: string;
  name: string | null;
  summary: string;
  score: number | null;
  /** v1.1 name (desktop's old `passMark`, v1.0 `pass_mark`). */
  score_threshold: number | null;
  reasons: string[];
  guard_verdict: GuardVerdict | null;
  amount_lamports: Lamports | null;
  first_buy: boolean;
  price_sol: DecimalString | null;
  price_usd: DecimalString | null;
  liquidity_usd: number | null;
  created_at: IsoTs;
  expires_at: IsoTs;
  /** Server-clock epoch ms. Countdown = expires_at_ms − serverNow(). */
  created_at_ms: number;
  expires_at_ms: number;
  status: ProposalStatus;
  expired_reason: ProposalExpiredReason | null;
}

export interface PositionView extends Tradeability {
  key: string;
  /** Server position id (1.1.2 close path `/positions/{id}/close`). */
  position_id: Uuid | null;
  ck: string | null;
  mint: string;
  strategy_id: Uuid | null;
  strategy: string;
  symbol: string;
  qty_raw: RawQty;
  cost_lamports: Lamports;
  value_lamports: Lamports;
  pnl_lamports: Lamports;
  realized_lamports: Lamports;
  pnl_pct: number;
  entry_price_sol: DecimalString;
  last_price_sol: DecimalString;
  peak_price_sol: DecimalString;
  ratio: number;
  peak_ratio: number;
  opened_at_ms: number;
  /** 1.1.2 typed exit-plan state (discriminated PlanStep), null until the first position.updated. */
  plan_state: PlanState | null;
  rev: number | null;
  /** Mint decimals (1.1.2; never assumed 6). null = unknown → no revalue. */
  decimals: number | null;
}

export type Tone = "neutral" | "good" | "bad" | "guard" | "info";

export interface ActivityView {
  id: string;
  seq: Int64String | null;
  ts_ms: number;
  actor: Actor;
  /** Wire event type or `local.note`. */
  kind: string;
  tone: Tone;
  mint: string | null;
  symbol: string | null;
  /** Plain-text fallback (Indonesian). */
  message: string;
  /** Localisable text: rendered from @sentra/i18n with `args` in the UI locale. */
  i18n?: I18nMsg;
}

export interface TickView {
  mint: string;
  /** unix seconds, server clock */
  time: number;
  price_sol: DecimalString;
}
export interface CandleView {
  time: number;
  open: DecimalString;
  high: DecimalString;
  low: DecimalString;
  close: DecimalString;
}

export interface SellQuote {
  nonce: string;
  position_key: string;
  mint: string;
  symbol: string;
  pct: number;
  est_sol_out_lamports: Lamports;
  ttl_ms: number;
}

export interface Account {
  cash_lamports: Lamports | null;
  equity_lamports: Lamports | null;
  unrealized_pnl_lamports: Lamports | null;
  drawdown_pct: number | null;
  as_of_seq: Int64String | null;
  epoch: number | null;
  workspace_rev: number | null;
  /** account.deletion_* banner (plain text). */
  notice: string | null;
  deleted: boolean;
  /** `PRACTICE_CASH_INSUFFICIENT` (kind notice): strategy entries paused until cash recovers or Practice
   *  is reset. ≠ `order.failed INSUFFICIENT_PRACTICE_BALANCE` (kind error, one order, feed line only). */
  entries_paused: string | null;
}

export interface StrategyView {
  id: Uuid;
  name: string;
  rev: number;
  status: string;
}

/** 409 on a write (STRATEGY_REV_CONFLICT / VERSION_CONFLICT / CONFIRMATION_RESTART_REQUIRED). */
export interface ConflictView {
  code: string;
  resource: string;
  resource_id: string;
  base_rev: number | null;
  current_rev: number | null;
  changed_fields: string[];
  changed_via: string | null;
  changed_at: IsoTs | null;
  restart_confirmation: boolean;
  message: string;
}

export interface TimelineItem {
  seq: Int64String;
  ts: IsoTs;
  kind: string;
  actor: Actor;
}
export interface ExitReasonStatView {
  exit_reason: ExitReason;
  label: string;
  count: number;
  pnl_lamports: Lamports;
  /** null when cost basis is zero (1.1.2). */
  avg_pnl_pct: number | null;
  win_rate_pct: number | null;
  avg_hold_s: number | null;
}

export interface SyncStatus {
  workspace_id: Uuid;
  watermark: Int64String;
  gaps_seen: number;
  resyncs: number;
  recovered: number;
  duplicates: number;
  ignored: number;
  reconnects: number;
  /** server_now − local_now (ms). */
  skew_ms: number;
}

// ---- desktop-only preferences (never on the wire)
export interface ShortcutConfig {
  focus_terminal: string;
  open_approvals: string | null;
}
export type Density = "compact" | "comfortable";
export type Theme = "dark" | "light" | "system";
/** UI language = number locale (@sentra/i18n). Default `id`. */
export type Locale = "id" | "en";
export interface Settings {
  theme: Theme;
  locale: Locale;
  density: Density;
  approval_popup: boolean;
  shortcuts: ShortcutConfig;
}

export interface Snapshot {
  mode: Mode;
  connected: boolean;
  source: "mock" | "backend";
  signals: PickView[];
  positions: PositionView[];
  activity: ActivityView[];
  screened: ScreenedCoin[];
  settings: Settings;
  account: Account;
  strategies: StrategyView[];
  sync: SyncStatus;
  contracts_version: string;
}

/** Rust → webview events (src-tauri/src/events.rs). */
export const EVT = {
  signalNew: "signal:new",
  signalUpdate: "signal:update",
  ticks: "market:ticks",
  activity: "activity:event",
  positions: "positions:update",
  connection: "conn:status",
  settings: "settings:update",
  account: "account:update",
  sync: "sync:status",
  strategies: "strategies:update",
  conflict: "write:conflict",
  focusSignal: "ui:focus-signal",
  screened: "screener:update",
} as const;
export type EvtName = (typeof EVT)[keyof typeof EVT];

export interface CoreApi {
  snapshot(): Promise<Snapshot>;
  candles(mint: string): Promise<CandleView[]>;
  approveSignal(id: string): Promise<void>;
  approveMany(ids: string[]): Promise<void>;
  skipSignal(id: string): Promise<void>;
  requestSell(positionKey: string, pct: number): Promise<SellQuote>;
  confirmSell(nonce: string): Promise<void>;
  setStrategyPaused(id: string, paused: boolean, baseRev: number): Promise<StrategyView>;
  resetPractice(): Promise<void>;
  coinTimeline(mint: string): Promise<TimelineItem[]>;
  exitReasonStats(): Promise<ExitReasonStatView[]>;
  openChartWindow(mint: string): Promise<void>;
  openActivityWindow(): Promise<void>;
  openApprovalWindow(): Promise<void>;
  focusMainForSignal(id: string): Promise<void>;
  hideApprovalPopup(): Promise<void>;
  setSettings(s: Settings): Promise<Settings>;
  on<T>(event: EvtName, cb: (payload: T) => void): Promise<() => void>;
}
