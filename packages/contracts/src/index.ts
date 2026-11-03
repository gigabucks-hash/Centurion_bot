/**
 * @centurion/contracts — DRAFT desktop view-model.
 *
 * PLACEHOLDER until the Backend API Specialist publishes the real OpenAPI/WS spec.
 * Rust mirror: apps/desktop/src-tauri/src/model.rs (#[serde(rename_all = "camelCase")]).
 * Keep both in sync until codegen replaces them.
 */

export type Mode = "practice" | "real";

export type Stage = "pending" | "approved" | "skipped" | "expired";

export interface Signal {
  id: string;
  mint: string;
  symbol: string; // untrusted token metadata: render as text only
  name: string; // untrusted
  strategy: string;
  score: number;
  passMark: number;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  ageMinutes: number;
  reasons: string[];
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
  stage: Stage;
  /** timed_out | strategy_deleted | strategy_archived | guard_failed_while_waiting | price_ran_past_limit */
  expiredReason: string | null;
}

export interface Tick {
  mint: string;
  time: number; // epoch seconds (chart time)
  price: number;
  volume: number;
}

export interface Candle {
  time: number; // epoch seconds, bucket start
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Actor names per UX SPEC §4. */
export type Actor = "screener" | "guard" | "entry" | "executor" | "exit" | "you" | "system";

export type ActivityKind =
  | "found"
  | "passed"
  | "blocked"
  | "armed"
  | "approved"
  | "skipped"
  | "expired"
  | "bought"
  | "sold"
  | "proposal"
  | "info";

export interface ActivityEvent {
  id: string; // `<mint>:<ts>:<kind>:<seq>`
  ts: number; // epoch ms
  actor: Actor;
  kind: ActivityKind;
  mint: string | null;
  symbol: string | null;
  message: string;
}

export interface Position {
  mint: string;
  symbol: string;
  strategy: string;
  qty: number;
  entryPriceUsd: number;
  lastPriceUsd: number;
  peakPriceUsd: number;
  solIn: number;
  pnlPct: number;
  openedAt: number;
}

export interface SellQuote {
  /** One-shot nonce; must be passed back to confirmSell within ttlMs. */
  nonce: string;
  mint: string;
  symbol: string;
  pct: number;
  estSolOut: number;
  ttlMs: number;
}

/** Global (OS-wide) shortcuts. Per UX: they only OPEN UI, never approve/skip/sell. */
export interface ShortcutConfig {
  focusTerminal: string; // e.g. "CommandOrControl+Shift+H"
  openApprovals: string | null; // opens the approval popup (if enabled) or focuses the terminal
}

/** "compact" = UX "Signal Terminal" density, desktop default. */
export type Density = "compact" | "comfortable";

export type Theme = "dark" | "light" | "system";

export interface Settings {
  /** Tokens: dark is DEFAULT. "system" follows the OS theme. */
  theme: Theme;
  density: Density;
  /** Small always-on-top approval window. Opt-in, OFF by default. */
  approvalPopup: boolean;
  shortcuts: ShortcutConfig;
}

export interface Snapshot {
  mode: Mode;
  connected: boolean;
  source: "mock" | "backend";
  signals: Signal[];
  positions: Position[];
  activity: ActivityEvent[];
  settings: Settings;
  paperCashSol: number;
}

/** Event channel names emitted by the desktop core (Rust app.emit). */
export const EVT = {
  signalNew: "signal:new",
  signalUpdate: "signal:update",
  ticks: "market:ticks", // payload: Tick[] (batched per engine tick)
  activity: "activity:event",
  positions: "positions:update",
  connection: "conn:status",
  settings: "settings:update",
  /** main window only: payload = signal id; open that pick with the normal (Real) confirmation */
  focusSignal: "ui:focus-signal",
  account: "account:update", // payload: paperCashSol (number)
} as const;

/** Every capability the desktop UI needs from its core. */
export interface CoreApi {
  snapshot(): Promise<Snapshot>;
  candles(mint: string): Promise<Candle[]>;
  approveSignal(id: string): Promise<void>;
  approveMany(ids: string[]): Promise<void>;
  skipSignal(id: string): Promise<void>;
  requestSell(mint: string, pct: number): Promise<SellQuote>;
  confirmSell(nonce: string): Promise<void>;
  openChartWindow(mint: string): Promise<void>;
  openActivityWindow(): Promise<void>;
  openApprovalWindow(): Promise<void>;
  /** Popup hand-off ("Buka untuk approve ↗"): focus main + open the pick there. Never approves. */
  focusMainForSignal(id: string): Promise<void>;
  hideApprovalPopup(): Promise<void>;
  setSettings(s: Settings): Promise<Settings>;
  on<T>(event: string, cb: (payload: T) => void): Promise<() => void>;
}

// ---------------------------------------------------------------------------
// Official wire contract v1 (Backend API Specialist). Namespaced so it does not
// collide with the desktop view-model above. Prefer `@centurion/contracts/wire`.
export * as wire from "./wire/index";
