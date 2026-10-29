import { popupSupported, POPUP_DISABLED_REASON } from "./platform";
import { useState } from "react";
import { core, type Settings } from "../api";
import { useTerm } from "../state/store";
import { useHotkeys } from "../hooks/useHotkeys";

/**
 * Strategy pause/resume (practice). Each write sends `If-Match: "<rev>"` = the rev shown here;
 * if another device changed it meanwhile the backend answers 409 → conflict toast + this list
 * refreshes from the server's `current` resource, and the user can retry on the new rev.
 */
function StrategiesSection() {
  const strategies = useTerm((s) => s.strategies);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async (id: string, paused: boolean, rev: number) => {
    setBusy(id);
    setErr(null);
    try {
      await core.setStrategyPaused(id, paused, rev);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="settings-section">
      <div className="muted">Strategi (practice) · pause/resume pakai If-Match rev</div>
      {strategies.map((s) => (
        <div className="toggle-row" key={s.id}>
          {/* name is server text, rendered as plain text */}
          <span>{s.name} <span className="dim num">rev {s.rev} · {s.status}</span></span>
          <button className="sm" disabled={busy === s.id} onClick={() => toggle(s.id, s.status !== "paused", s.rev)}>
            {s.status === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
      ))}
      {err && <div className="neg" style={{ fontSize: "var(--d-small)" }}>{err}</div>}
    </div>
  );
}

/** `POST /workspaces/{ws}/practice/reset` (If-Match workspace rev): two-step confirm, Practice only. */
function PracticeResetSection() {
  const mode = useTerm((s) => s.mode);
  const epoch = useTerm((s) => s.account.epoch);
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (mode !== "practice") return null;
  const reset = async () => {
    setArmed(false);
    try {
      await core.resetPractice();
      setMsg("Practice direset ke 30 SOL.");
    } catch (e) {
      setMsg(String(e));
    }
  };
  return (
    <div className="settings-section">
      <div className="muted">Reset practice · epoch {epoch ?? "—"} (1× per 24 jam)</div>
      <div className="dim" style={{ fontSize: "var(--d-small)" }}>Menutup semua posisi paper, membatalkan pick pending, saldo kembali 30 SOL. Riwayat diarsipkan.</div>
      {!armed ? (
        <button className="sm" onClick={() => setArmed(true)}>Reset practice…</button>
      ) : (
        <span className="row" style={{ gap: 8 }}>
          <button className="sm" autoFocus onClick={() => setArmed(false)}>Batal</button>
          <button className="sm danger" onClick={reset}>Ya, reset ke 30 SOL</button>
        </span>
      )}
      {msg && <div className="dim" style={{ fontSize: "var(--d-small)" }}>{msg}</div>}
    </div>
  );
}

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
            checked={popupSupported && cfg.approval_popup}
            onChange={(e) => setCfg({ ...cfg, approval_popup: e.target.checked })}
          />
        </label>
        <label>
          <div className="muted">Global shortcut: fokus terminal</div>
          <input className="mono" value={sc.focus_terminal} onChange={(e) => setCfg({ ...cfg, shortcuts: { ...sc, focus_terminal: e.target.value } })} />
        </label>
        <label>
          <div className="muted">Global shortcut: buka approval queue</div>
          <input
            className="mono"
            value={sc.open_approvals ?? ""}
            placeholder="(off)"
            onChange={(e) => setCfg({ ...cfg, shortcuts: { ...sc, open_approvals: e.target.value.trim() ? e.target.value : null } })}
          />
        </label>
        <div className="dim" style={{ marginTop: 8, fontSize: "var(--d-small)" }}>
          Global shortcut hanya membuka UI — tidak pernah approve, skip, atau sell langsung.
        </div>
        <StrategiesSection />
        <PracticeResetSection />
        {err && <div className="neg" style={{ marginTop: 8 }}>{err}</div>}
        <div className="actions">
          <button autoFocus onClick={onClose}>Batal</button>
          <button className="primary" onClick={save}>Simpan</button>
        </div>
      </div>
    </div>
  );
}
