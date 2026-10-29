import { create } from "zustand";
import type { ActivityEvent, Mode, Position, Settings, Signal, Snapshot } from "../api";

const MAX_FEED = 500;

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  density: "compact",
  approvalPopup: false,
  shortcuts: { focusTerminal: "CommandOrControl+Shift+H", openApprovals: "CommandOrControl+Shift+A" },
};

interface TermState {
  ready: boolean;
  mode: Mode;
  source: Snapshot["source"];
  connected: boolean;
  paperCashSol: number;
  signals: Signal[];
  positions: Position[];
  activity: ActivityEvent[];
  settings: Settings;
  cursorMint: string | null;
  selectedIds: Set<string>;
  lastError: string | null;
  reportError: (e: unknown) => void;
  hydrate: (s: Snapshot) => void;
  upsertSignal: (s: Signal) => void;
  pushActivity: (e: ActivityEvent) => void;
  setPositions: (p: Position[]) => void;
  setConnected: (c: boolean) => void;
  setCash: (c: number) => void;
  setSettings: (s: Settings) => void;
  setCursor: (mint: string | null) => void;
  toggleSelected: (id: string) => void;
  clearSelected: () => void;
}

export const useTerm = create<TermState>((set) => ({
  ready: false,
  mode: "practice",
  source: "mock",
  connected: false,
  paperCashSol: 0,
  signals: [],
  positions: [],
  activity: [],
  settings: DEFAULT_SETTINGS,
  cursorMint: null,
  selectedIds: new Set(),
  lastError: null,
  reportError: (e) => set({ lastError: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }),
  hydrate: (s) =>
    set({
      ready: true,
      mode: s.mode,
      source: s.source,
      connected: s.connected,
      paperCashSol: s.paperCashSol,
      signals: s.signals,
      positions: s.positions,
      activity: s.activity.slice(0, MAX_FEED),
      settings: s.settings,
      cursorMint: pendingSorted(s.signals)[0]?.mint ?? null,
    }),
  upsertSignal: (sig) =>
    set((st) => {
      const i = st.signals.findIndex((x) => x.id === sig.id);
      const signals = i >= 0 ? st.signals.map((x, j) => (j === i ? sig : x)) : [sig, ...st.signals].slice(0, 200);
      let selectedIds = st.selectedIds;
      if (sig.stage !== "pending" && selectedIds.has(sig.id)) {
        selectedIds = new Set(selectedIds);
        selectedIds.delete(sig.id);
      }
      return { signals, selectedIds, cursorMint: st.cursorMint ?? sig.mint };
    }),
  pushActivity: (e) =>
    set((st) => (st.activity.some((x) => x.id === e.id) ? st : { activity: [e, ...st.activity].slice(0, MAX_FEED) })),
  setPositions: (positions) => set({ positions }),
  setConnected: (connected) => set({ connected }),
  setCash: (paperCashSol) => set({ paperCashSol }),
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

/** UX default sort: soonest to expire first. */
export const pendingSorted = (s: Signal[]) =>
  s.filter((x) => x.stage === "pending").sort((a, b) => a.expiresAt - b.expiresAt);
