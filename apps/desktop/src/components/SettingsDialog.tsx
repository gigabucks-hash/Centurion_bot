import { popupSupported, POPUP_DISABLED_REASON } from "./platform";
import { useState } from "react";
import { core, type Settings } from "../api";
import { useTerm } from "../state/store";
import { useHotkeys } from "../hooks/useHotkeys";

/** Desktop settings: theme, density, opt-in approval popup, global shortcuts (open-only, never trade). */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const current = useTerm((s) => s.settings);
  const setSettings = useTerm((s) => s.setSettings);
  const [cfg, setCfg] = useState<Settings>(current);
  const [err, setErr] = useState<string | null>(null);
  useHotkeys({ escape: onClose });

  const save = async () => {
    try {
      setSettings(await core.setSettings(cfg));
      onClose();
    } catch (e) {
      setErr(String(e));
    }
  };
  const sc = cfg.shortcuts;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Pengaturan desktop</h3>
        <label>
          <div className="muted">Tema</div>
          <select value={cfg.theme} onChange={(e) => setCfg({ ...cfg, theme: e.target.value as Settings["theme"] })}>
            <option value="dark">Dark (default)</option>
            <option value="light">Light</option>
            <option value="system">Ikuti OS</option>
          </select>
        </label>
        <label>
          <div className="muted">Density</div>
          <select value={cfg.density} onChange={(e) => setCfg({ ...cfg, density: e.target.value as Settings["density"] })}>
            <option value="compact">Compact · Signal Terminal (default desktop)</option>
            <option value="comfortable">Comfortable · Calm Ledger</option>
          </select>
        </label>
        <label className="toggle-row" aria-disabled={!popupSupported || undefined} style={popupSupported ? undefined : { opacity: 0.6 }}>
          <span>
            <div>Popup approval selalu di atas{popupSupported ? "" : " (tidak tersedia)"}</div>
            <div className="dim" style={{ fontSize: "var(--d-small)" }}>
              {popupSupported ? "Window kecil di atas app lain; muncul saat ada pick baru. Approve/Skip saja, tanpa Sell." : POPUP_DISABLED_REASON}
            </div>
          </span>
          <input
            type="checkbox"
            disabled={!popupSupported}
            checked={popupSupported && cfg.approvalPopup}
            onChange={(e) => setCfg({ ...cfg, approvalPopup: e.target.checked })}
          />
        </label>
        <label>
          <div className="muted">Global shortcut: fokus terminal</div>
          <input className="mono" value={sc.focusTerminal} onChange={(e) => setCfg({ ...cfg, shortcuts: { ...sc, focusTerminal: e.target.value } })} />
        </label>
        <label>
          <div className="muted">Global shortcut: buka approval queue</div>
          <input
            className="mono"
            value={sc.openApprovals ?? ""}
            placeholder="(off)"
            onChange={(e) => setCfg({ ...cfg, shortcuts: { ...sc, openApprovals: e.target.value.trim() ? e.target.value : null } })}
          />
        </label>
        <div className="dim" style={{ marginTop: 8, fontSize: "var(--d-small)" }}>
          Global shortcut hanya membuka UI — tidak pernah approve, skip, atau sell langsung.
        </div>
        {err && <div className="neg" style={{ marginTop: 8 }}>{err}</div>}
        <div className="actions">
          <button autoFocus onClick={onClose}>Batal</button>
          <button className="primary" onClick={save}>Simpan</button>
        </div>
      </div>
    </div>
  );
}
