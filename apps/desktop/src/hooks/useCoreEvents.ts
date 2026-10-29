import { useEffect } from "react";
import { core, EVT, runtime, type ActivityEvent, type Position, type Settings, type Signal } from "../api";
import { useTerm } from "../state/store";

/** Hydrate from a snapshot, then apply pushed deltas. Every window runs this independently. */
export function useCoreEvents() {
  useEffect(() => {
    let disposed = false;
    const unsubs: Array<() => void> = [];
    const st = useTerm.getState();
    (async () => {
      const subs = await Promise.all([
        core.on<Signal>(EVT.signalNew, st.upsertSignal),
        core.on<Signal>(EVT.signalUpdate, st.upsertSignal),
        core.on<ActivityEvent>(EVT.activity, st.pushActivity),
        core.on<Position[]>(EVT.positions, st.setPositions),
        core.on<boolean>(EVT.connection, st.setConnected),
        core.on<Settings>(EVT.settings, st.setSettings),
        core.on<number>(EVT.account, st.setCash),
      ]);
      if (disposed) return subs.forEach((u) => u());
      unsubs.push(...subs);
      st.hydrate(await core.snapshot());
    })().catch((e) => useTerm.getState().reportError(e));
    return () => {
      disposed = true;
      unsubs.forEach((u) => u());
    };
  }, []);
}

/** Mirror mode/density/theme onto <html> (tokens key off data-mode / data-density / data-theme). */
export function useDocumentAttributes() {
  const mode = useTerm((s) => s.mode);
  const density = useTerm((s) => s.settings.density);
  const theme = useTerm((s) => s.settings.theme);
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
  }, [mode, density]);
  useEffect(() => {
    const root = document.documentElement;
    if (theme !== "system" || runtime !== "tauri") {
      root.dataset.theme = theme === "light" ? "light" : "dark";
      return;
    }
    let un: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      root.dataset.theme = (await w.theme()) ?? "dark";
      un = await w.onThemeChanged(({ payload }) => (root.dataset.theme = payload));
    })().catch(() => (root.dataset.theme = "dark"));
    return () => un?.();
  }, [theme]);
}
