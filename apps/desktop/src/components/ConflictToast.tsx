import { useEffect } from "react";
import { useTerm } from "../state/store";

const LABEL: Record<string, string> = {
  strategy: "Strategi",
  workspace: "Workspace",
  position: "Posisi",
};

/**
 * 409 conflict toast (UX REVISION_CONFLICT). The data has already been refreshed from the
 * server's `current` resource; the user re-applies on the new rev. CONFIRMATION_RESTART_REQUIRED
 * (Real SOL, Phase 7) asks to redo the whole confirmation.
 */
export function ConflictToast() {
  const c = useTerm((s) => s.conflict);
  const clear = useTerm((s) => s.setConflict);
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => clear(null), 8000);
    return () => clearTimeout(t);
  }, [c, clear]);
  if (!c) return null;
  return (
    <div className="toast conflict" role="alert">
      <b>{LABEL[c.resource] ?? c.resource} diubah di {c.changed_via ?? "perangkat lain"}</b>
      <div className="dim num">
        {c.code} · rev {c.base_rev ?? "?"} → {c.current_rev ?? "?"}
        {c.changed_fields.length ? ` · ${c.changed_fields.join(", ")}` : ""}
      </div>
      <div>{c.restart_confirmation ? "Ulangi konfirmasi dari awal." : "Data sudah dimuat ulang — periksa lalu ulangi perubahanmu."}</div>
      <button className="ghost close" aria-label="Tutup" onClick={() => clear(null)}>×</button>
    </div>
  );
}
