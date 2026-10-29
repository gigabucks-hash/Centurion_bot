import { useEffect, useRef } from "react";

/** Keys: "a", "shift+a", "enter", "escape", "arrowdown", "space", ",". */
/** Return `false` to leave the event unconsumed (native behaviour continues). */
export type KeyMap = Record<string, (e: KeyboardEvent) => unknown>;

export function keyName(e: KeyboardEvent): string {
  if (e.key === " ") return "space";
  const k = e.key.toLowerCase();
  return e.shiftKey && /^[a-z]$/.test(k) ? `shift+${k}` : k;
}

/**
 * Window-local hotkeys (only when this window is focused). Ignores typing in inputs,
 * Ctrl/Cmd/Alt combos and auto-repeat so a held key never fires Approve twice.
 */
export function useHotkeys(map: KeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const name = keyName(e);
      // C13/C14: Space/Enter on a focused control keep their native meaning (activate button,
      // toggle checkbox, follow link) — never hijacked by window hotkeys.
      if ((name === "space" || name === "enter") && t?.closest("button, a, summary, [role=button], [role=checkbox], [role=switch]")) return;
      const fn = ref.current[name];
      if (fn && fn(e) !== false) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
