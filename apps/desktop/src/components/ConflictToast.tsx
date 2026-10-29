import { useEffect } from "react";
import { useT } from "../i18n";
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
  const t = useT();
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => clear(null), 8000);
    return () => clearTimeout(t);
  }, [c, clear]);
  if (!c) return null;
  return (
    <div className="toast conflict" role="alert">
      <b>{c.resource === "strategy" ? t("conflict.banner.title") : `${LABEL[c.resource] ?? c.resource} diubah di ${c.changed_via ?? "perangkat lain"}`}</b>
      <div className="dim num">
        {c.code} · rev {c.base_rev ?? "?"} → {c.current_rev ?? "?"}
      </div>
      {c.changed_fields.length > 0 && <div className="dim">{t("conflict.banner.fields", { fields: c.changed_fields.join(", ") })}</div>}
      <div>{c.restart_confirmation ? "Ulangi konfirmasi dari awal." : "Data sudah dimuat ulang — periksa lalu ulangi perubahanmu."}</div>
      <button className="ghost close" aria-label="Tutup" onClick={() => clear(null)}>×</button>
    </div>
  );
}
