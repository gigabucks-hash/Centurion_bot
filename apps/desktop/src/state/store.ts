import { create } from "zustand";
import type { Account, ActivityView, ConflictView, Mode, PickView, PositionView, ScreenedCoin, Settings, Snapshot, StrategyView, SyncStatus } from "../api";

const MAX_FEED = 500;
const MAX_SCREENED = 150;

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  density: "compact",
  approval_popup: false,
  locale: "id",
  shortcuts: { focus_terminal: "CommandOrControl+Shift+H", open_approvals: "CommandOrControl+Shift+A" },
};

const EMPTY_ACCOUNT: Account = {
  cash_lamports: null, equity_lamports: null, unrealized_pnl_lamports: null, drawdown_pct: null,
  as_of_seq: null, epoch: null, workspace_rev: null, notice: null, deleted: false, entries_paused: null,
};

interface TermState {
  ready: boolean;
  mode: Mode;
  source: Snapshot["source"];
  contractsVersion: string;
  connected: boolean;
  account: Account;
  sync: SyncStatus | null;
  /** server_now − local_now (ms), measured in Rust from every `server_now`. */
  skewMs: number;
  signals: PickView[];
  positions: PositionView[];
  activity: ActivityView[];
  /** WF-20 screener rows (passed, rejected, not tradeable). */
  screened: ScreenedCoin[];
  strategies: StrategyView[];
  settings: Settings;
  /** Last 409 on a write: conflict toast (auto-dismiss) — the data is already refreshed. */
  conflict: ConflictView | null;
  cursorMint: string | null;
  selectedIds: Set<string>;
  lastError: string | null;
  reportError: (e: unknown) => void;
  hydrate: (s: Snapshot) => void;
  upsertSignal: (s: PickView) => void;
  pushActivity: (e: ActivityView) => void;
  upsertScreened: (c: ScreenedCoin) => void;
  setPositions: (p: PositionView[]) => void;
  setConnected: (c: boolean) => void;
  setAccount: (a: Account) => void;
  setSync: (s: SyncStatus) => void;
  setStrategies: (s: StrategyView[]) => void;
  setConflict: (c: ConflictView | null) => void;
  setSettings: (s: Settings) => void;
  setCursor: (mint: string | null) => void;
  toggleSelected: (id: string) => void;
  clearSelected: () => void;
}

export const useTerm = create<TermState>((set) => ({
  ready: false,
  mode: "practice",
  source: "mock",
  contractsVersion: "",
  connected: false,
  account: EMPTY_ACCOUNT,
  sync: null,
  skewMs: 0,
  signals: [],
  positions: [],
  activity: [],
  screened: [],
  strategies: [],
  settings: DEFAULT_SETTINGS,
  conflict: null,
  cursorMint: null,
  selectedIds: new Set(),
  lastError: null,
  reportError: (e) => set({ lastError: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }),
  hydrate: (s) =>
    set({
      ready: true,
      mode: s.mode,
      source: s.source,
      contractsVersion: s.contracts_version,
      connected: s.connected,
      account: s.account,
      sync: s.sync,
      skewMs: s.sync.skew_ms,
      signals: s.signals,
      positions: s.positions,
      activity: s.activity.slice(0, MAX_FEED),
      screened: (s.screened ?? []).slice(0, MAX_SCREENED),
      strategies: s.strategies,
      settings: s.settings,
      cursorMint: pendingSorted(s.signals)[0]?.mint ?? null,
    }),
  upsertSignal: (sig) =>
    set((st) => {
      const i = st.signals.findIndex((x) => x.id === sig.id);
      const signals = i >= 0 ? st.signals.map((x, j) => (j === i ? sig : x)) : [sig, ...st.signals].slice(0, 200);
      let selectedIds = st.selectedIds;
      if (sig.status !== "pending" && selectedIds.has(sig.id)) {
        selectedIds = new Set(selectedIds);
        selectedIds.delete(sig.id);
      }
      return { signals, selectedIds, cursorMint: st.cursorMint ?? sig.mint };
    }),
  pushActivity: (e) =>
    set((st) => (st.activity.some((x) => x.id === e.id) ? st : { activity: [e, ...st.activity].slice(0, MAX_FEED) })),
  upsertScreened: (c) =>
    set((st) => {
      const i = st.screened.findIndex((x) => x.mint === c.mint);
      return { screened: i >= 0 ? st.screened.map((x, j) => (j === i ? c : x)) : [c, ...st.screened].slice(0, MAX_SCREENED) };
    }),
  setPositions: (positions) => set({ positions }),
  setConnected: (connected) => set({ connected }),
  setAccount: (account) => set({ account }),
  setSync: (sync) => set({ sync, skewMs: sync.skew_ms }),
  setStrategies: (strategies) => set({ strategies }),
  setConflict: (conflict) => set({ conflict }),
  setSettings: (settings) => set({ settings }),
  setCursor: (cursorMint) => set({ cursorMint }),
  toggleSelected: (id) =>
    set((st) => {
      const n = new Set(st.selectedIds);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { selectedIds: n };
    }),
  clearSelected: () => set({ selectedIds: new Set() }),
}));

/** Server-clock "now" (C6 closed): local clock + skew measured from `server_now`. */
export const serverNow = () => Date.now() + useTerm.getState().skewMs;

/** UX default sort: soonest to expire first. */
export const pendingSorted = (s: PickView[]) =>
  s.filter((x) => x.status === "pending").sort((a, b) => a.expires_at_ms - b.expires_at_ms);
