import { popupSupported, POPUP_DISABLED_REASON } from "./platform";
import { useEffect, useRef, useState } from "react";
import { Settings as SettingsGlyph } from "lucide-react";
import { core, type PatchOutcome, type Settings } from "../api";
import { useTerm } from "../state/store";
import { useHotkeys } from "../hooks/useHotkeys";
import { errorCodeOf, errorDetails, errorText, parseIsoTs, useLang, useT } from "../i18n";
import { fmtTime } from "./format";
import { HoldButton } from "./HoldButton";
import { Icon } from "./Icon";
import { gateView, HOLD_MS, type Line } from "./strategyGate";
import { RealMoneySection } from "./RealMoneySection";
import { UpdateSection } from "./UpdateSection";
import { ConnectionSection } from "./ConnectionSection";
import type { StrategyView } from "../api";

/** Wire strategy status → @centurion/i18n `strategy.status.*` (unknown → raw value never shown: "—"). */
const STATUS_KEY: Record<string, string> = { active: "strategy.status.running", running: "strategy.status.running", paused: "strategy.status.paused", draft: "strategy.status.draft" };

/**
 * Per-strategy mode (contracts 1.1.6). Wire `practice` = "Paper". Real is gated: while `real_locked` the Real
 * option is disabled and shows its reason + Paper progress; it can never be chosen. If a future server unlocks a
 * strategy, Real still needs the 2.5 s hold, and this build answers `MODE_NOT_ALLOWED` (no Real path, never
 * `trade:real`). MODE_NOT_ALLOWED is shown as a neutral notice (errors.map.json copy), never as a crash.
 */
function StrategyMode({ s }: { s: StrategyView }) {
  const t = useT();
  const lang = useLang();
  const [notice, setNotice] = useState<{ text: string; tone: "notice" | "error" } | null>(null);
  const g = gateView(s);
  const tl = (l: Line | null) => (l ? t(l.key, l.args) : "");
  const toReal = async () => {
    setNotice(null);
    try {
      await core.setStrategyMode(s.id, "real", HOLD_MS.real);
    } catch (e) {
      setNotice({ text: errorText(e, lang), tone: errorCodeOf(e) === "MODE_NOT_ALLOWED" ? "notice" : "error" });
    }
  };
  const realLabel = g.a11y ? t(g.a11y.key, { reason: t(String(g.a11y.args?.reason ?? "")) }) : undefined;
  return (
    <div className="strategy-mode" data-locked={g.locked || undefined} data-testid={`strategy-mode-${s.id}`}>
      <span className="muted">{t("strategy.mode.label")}</span>
      <span className="seg" role="radiogroup" aria-label={t("strategy.mode.label")}>
        <button className="sm" role="radio" aria-checked={s.mode === "practice"} tabIndex={-1}>{t("strategy.mode.paper")}</button>
        {g.realSelectable ? (
          <HoldButton ms={HOLD_MS.real} className="sm danger" onConfirm={toReal}>{t("mode.switch.to_real.hold")}</HoldButton>
        ) : (
          <button className="sm" role="radio" aria-checked={s.mode === "real"} disabled aria-disabled="true" aria-label={realLabel} title={realLabel}>
            <span aria-hidden="true">🔒 </span>{t("strategy.mode.real")}
          </button>
        )}
      </span>
      {g.locked && (
        <>
          <span className="chip lock" data-reason={s.real_locked_reason ?? "other"}>{tl(g.chip)} · {tl(g.reason)}</span>
          <div className="dim gate-progress">{g.progress.map(tl).join(" · ")}</div>
          <div className="dim" style={{ fontSize: "var(--d-small)" }}>{tl(g.note)}</div>
        </>
      )}
      {notice && <div className={notice.tone === "notice" ? "notice pending" : "neg"} role="status" data-code={notice.tone}>{notice.text}</div>}
    </div>
  );
}

/**
 * Strategy pause/resume (practice). Each write sends `If-Match: "<rev>"` = the rev shown here;
 * if another device changed it meanwhile the backend answers 409 → conflict toast + this list
 * refreshes from the server's `current` resource, and the user can retry on the new rev.
 */
function StrategiesSection({ focusStrategyId }: { focusStrategyId?: string | null }) {
  const strategies = useTerm((s) => s.strategies);
  const t = useT();
  const lang = useLang();
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusStrategyId || !focusRef.current) return;
    // `View bot` from a receipt lands here: scroll the row into view and focus it, never a write.
    focusRef.current.scrollIntoView({ block: "center" });
    focusRef.current.focus();
  }, [focusStrategyId, strategies.length]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async (id: string, paused: boolean, rev: number) => {
    setBusy(id);
    setErr(null);
    try {
      await core.setStrategyPaused(id, paused, rev);
    } catch (e) {
      setErr(errorText(e, lang));
    } finally {
      setBusy(null);
    }
  };
  // 1.1.4: PATCH settings. Loosening a guard → 202 + proposal: shown as "waiting for approval" (pending
  // tone, guard.weaken.pending.*), never as success; nothing changed until the proposal is approved.
  const [fit, setFit] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<{ id: string; o: PatchOutcome } | null>(null);
  const save = async (id: string) => {
    const v = Number(fit[id]);
    if (!Number.isInteger(v) || v < 0 || v > 115) return setErr("score_threshold 0–115");
    setBusy(id);
    setErr(null);
    setOutcome(null);
    try {
      setOutcome({ id, o: await core.patchStrategy(id, { score_threshold: v }) });
    } catch (e) {
      setErr(errorText(e, lang));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="settings-section">
      <div className="muted">{t("strategy.list.title")} · {t("strategy.mode.paper")}</div>
      <div className="dim" style={{ fontSize: "var(--d-small)" }}>{t("strategy.mode.scope_note")} {t("strategy.approval.hold_note")}</div>
      {strategies.map((s) => (
        <div
          className="toggle-row"
          key={s.id}
          data-strategy-id={s.id}
          tabIndex={s.id === focusStrategyId ? -1 : undefined}
          ref={s.id === focusStrategyId ? focusRef : undefined}
        >
          {/* name is server text, rendered as plain text */}
          <span>{s.name} <span className="dim num">rev {s.rev} · {STATUS_KEY[s.status] ? t(STATUS_KEY[s.status]) : "—"}</span></span>
          <span className="row" style={{ gap: 4 }}>
            <input className="sm num" style={{ width: 56 }} inputMode="numeric" aria-label={`Fit threshold ${s.name}`} placeholder="fit" value={fit[s.id] ?? ""} onChange={(e) => setFit({ ...fit, [s.id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })} />
            <button className="sm ghost" disabled={busy === s.id || !fit[s.id]} onClick={() => save(s.id)}>Simpan</button>
            <button className="sm" disabled={busy === s.id} onClick={() => toggle(s.id, s.status !== "paused", s.rev)}>
              {s.status === "paused" ? "Resume" : "Pause"}
            </button>
          </span>
          <StrategyMode s={s} />
          {outcome?.id === s.id && (outcome.o.status === "pending_approval" ? (
            <div className="notice pending" role="status" data-outcome="pending_approval">
              <b>{t("guard.weaken.pending.title")}</b>
              <div>{t("guard.weaken.pending.body", { expires_at: fmtTime(Date.parse(outcome.o.expires_at)) })}</div>
              <div className="dim mono">{outcome.o.fields.join(", ")}</div>
            </div>
          ) : (
            <div className="dim num" role="status" data-outcome="applied">rev {outcome.o.rev}</div>
          ))}
        </div>
      ))}
      {err && <div className="neg" style={{ fontSize: "var(--d-small)" }}>{err}</div>}
    </div>
  );
}

/** SIWS builds only: revoke the refresh token on the server and clear the keychain entry. */
function SessionSection() {
  const t = useT();
  const [siws, setSiws] = useState<string | null>(null);
  useEffect(() => void core.authStatus().then((a) => a.mode === "siws" && a.state === "signed_in" && setSiws(a.address ?? "")).catch(() => {}), []);
  if (siws == null) return null;
  return (
    <div className="settings-section toggle-row">
      <span className="mono dim">{siws}</span>
      <button className="sm" onClick={() => core.authLogout()}>{t("desktop.auth.sign_out")}</button>
    </div>
  );
}

/** `POST /workspaces/{ws}/practice/reset` (If-Match workspace rev): two-step confirm, Practice only. */
function PracticeResetSection() {
  const mode = useTerm((s) => s.mode);
  const epoch = useTerm((s) => s.account.epoch);
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 429 RESET_COOLDOWN (+ Retry-After): a product limit, not a failure → neutral text, button off
  // until the server's next_allowed_at (or now + retry_after_s).
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [isErr, setIsErr] = useState(false);
  const lang = useLang();
  if (mode !== "practice") return null;
  const coolingDown = cooldownUntil != null && cooldownUntil > Date.now();
  const reset = async () => {
    setArmed(false);
    try {
      await core.resetPractice();
      setCooldownUntil(null);
      setIsErr(false);
      setMsg("Practice direset ke 30 SOL.");
    } catch (e) {
      const cd = errorCodeOf(e) === "RESET_COOLDOWN";
      if (cd) {
        const d = errorDetails(e);
        const at = parseIsoTs(d.next_allowed_at); // ISO 8601 UTC IsoTs; shown in local time by errorText
        setCooldownUntil(at ?? Date.now() + Number(d.retry_after_s ?? 0) * 1000);
      }
      setIsErr(!cd);
      setMsg(errorText(e, lang));
    }
  };
  return (
    <div className="settings-section">
      <div className="muted">Reset practice · epoch {epoch ?? "—"} (1× per 24 jam)</div>
      <div className="dim" style={{ fontSize: "var(--d-small)" }}>Menutup semua posisi paper, membatalkan pick pending, saldo kembali 30 SOL. Riwayat diarsipkan.</div>
      {!armed ? (
        <button className="sm" disabled={coolingDown} title={coolingDown ? msg ?? undefined : undefined} onClick={() => setArmed(true)}>Reset practice…</button>
      ) : (
        <span className="row" style={{ gap: 8 }}>
          <button className="sm" autoFocus onClick={() => setArmed(false)}>Batal</button>
          <button className="sm danger" onClick={reset}>Ya, reset ke 30 SOL</button>
        </span>
      )}
      {msg && <div className={isErr ? "neg" : "dim"} role="status" style={{ fontSize: "var(--d-small)" }}>{msg}</div>}
    </div>
  );
}

/** Desktop settings: theme, density, opt-in approval popup, global shortcuts (open-only, never trade). */
export function SettingsDialog({ onClose, focusStrategyId }: { onClose: () => void; focusStrategyId?: string | null }) {
  const current = useTerm((s) => s.settings);
  const setSettings = useTerm((s) => s.setSettings);
  const [cfg, setCfg] = useState<Settings>(current);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  useHotkeys({ escape: onClose });

  const save = async () => {
    try {
      setSettings(await core.setSettings(cfg));
      onClose();
    } catch (e) {
      setErr(errorText(e, cfg.locale));
    }
  };
  const sc = cfg.shortcuts;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3><Icon glyph={SettingsGlyph} size={20} /> Pengaturan desktop</h3>
        <label>
          <div className="muted">Tema</div>
          <select value={cfg.theme} onChange={(e) => setCfg({ ...cfg, theme: e.target.value as Settings["theme"] })}>
            <option value="dark">Dark (default)</option>
            <option value="light">Light</option>
            <option value="system">Ikuti OS</option>
          </select>
        </label>
        <label>
          <div className="muted">{t("settings.language.label")}</div>
          <select value={cfg.locale} onChange={(e) => setCfg({ ...cfg, locale: e.target.value as Settings["locale"] })} data-testid="locale">
            <option value="id">Bahasa Indonesia (id-ID)</option>
            <option value="en">English (en-US)</option>
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
        <RealMoneySection />
        <StrategiesSection focusStrategyId={focusStrategyId} />
        <ConnectionSection />
        <SessionSection />
        <PracticeResetSection />
        <UpdateSection />
        {err && <div className="neg" style={{ marginTop: 8 }}>{err}</div>}
        <div className="actions">
          <button autoFocus onClick={onClose}>{t("common.action.cancel")}</button>
          <button className="primary" onClick={save}>Simpan</button>
        </div>
      </div>
    </div>
  );
}
