/**
 * Desktop-only UI types (IPC view-model). **Wire types come from the contracts package**
 * (`@sentra/contracts/wire` = packages/contracts/src/wire, v1.1.x) and are re-exported below; this
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
  IsoTs,
  Lamports,
  Mode,
  ProposalExpiredReason,
  ProposalStatus,
  RawQty,
  Uuid,
} from "@sentra/contracts/wire";

export type * from "@sentra/contracts/wire";
export { lamportsToSol, LAMPORTS_PER_SOL, CONTRACTS_VERSION, EXIT_REASONS } from "@sentra/contracts/wire";

/** Buy proposal joined with its pick + latest mark (proposal.created + pick.created + mark). */
export interface PickView {
  /** proposal_id */
  id: Uuid;
  version: number;
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

export interface PositionView {
  key: string;
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
  plan_state: unknown;
  rev: number | null;
}

export type Tone = "neutral" | "good" | "bad" | "guard" | "info";

export interface ActivityView {
  id: string;
  seq: number | null;
  ts_ms: number;
  actor: Actor;
  /** Wire event type or `local.note`. */
  kind: string;
  tone: Tone;
  mint: string | null;
  symbol: string | null;
  message: string;
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
  as_of_seq: number | null;
  epoch: number | null;
  workspace_rev: number | null;
  /** account.deletion_* banner (plain text). */
  notice: string | null;
  deleted: boolean;
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
  seq: number;
  ts: IsoTs;
  kind: string;
  actor: Actor;
}
export interface ExitReasonStatView {
  exit_reason: ExitReason;
  label: string;
  count: number;
  pnl_lamports: Lamports;
  avg_pnl_pct: number;
}

export interface SyncStatus {
  workspace_id: Uuid;
  watermark: number;
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
export interface Settings {
  theme: Theme;
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
