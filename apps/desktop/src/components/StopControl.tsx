import { useEffect, useState } from "react";
import { core, EVT, type StopResult } from "../api";
import { useHotkeys } from "../hooks/useHotkeys";
import { errorText, useLang, useT } from "../i18n";
import { useTerm } from "../state/store";

type Source = "ui" | "tray" | "shortcut";

/**
 * STOP: pause every running strategy in the current mode. The button here, the tray item and the
 * app-shortcut quick action all open this confirm; only the confirm calls the Rust `stop_trading` command.
 */
export function StopControl() {
  const t = useT();
  const lang = useLang();
  const mode = useTerm((s) => s.mode);
  const running = useTerm((s) => s.strategies.filter((x) => x.status !== "paused").length);
  const [ask, setAsk] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let un: (() => void) | undefined;
    core.on<Source>(EVT.stopRequest, (src) => setAsk(src === "tray" || src === "shortcut" ? src : "ui")).then((u) => (un = u));
    return () => un?.();
  }, []);
  const real = mode === "real";
  const confirm = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      const r: StopResult = await core.stopTrading(mode, ask, "STOP");
      const fail = r.failed.map(([id, code]) => `${id.slice(0, 8)} ${code}`).join(", ");
      setMsg({ ok: !fail, text: [t("desktop.stop.done", { count: r.paused.length }), fail && t("desktop.stop.failed", { list: fail })].filter(Boolean).join(" · ") });
      setAsk(null);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, lang) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="sm danger stop-btn" data-action="stop" onClick={() => setAsk("ui")} title={real ? t("kill_switch.action.open") : t("desktop.stop.title_practice")}>
        ■ {t("kill_switch.action.engage")}
      </button>
      {msg && <span className={msg.ok ? "dim" : "neg"} role="status">{msg.text}</span>}
      {ask && <StopDialog real={real} running={running} busy={busy} onCancel={() => setAsk(null)} onConfirm={confirm} />}
    </>
  );
}

function StopDialog({ real, running, busy, onCancel, onConfirm }: { real: boolean; running: number; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const t = useT();
  useHotkeys({ escape: onCancel });
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="stop-title">
      <div className="modal">
        <h3 id="stop-title">{real ? t("kill_switch.dialog.title") : t("desktop.stop.title_practice")}</h3>
        <p>{real ? t("kill_switch.dialog.effect.buys") : t("desktop.stop.effect_practice")}</p>
        <p className="dim num">{running} running</p>
        <div className="actions">
          <button autoFocus onClick={onCancel}>{t("common.action.cancel")}<kbd>Esc</kbd></button>
          <button className="danger" disabled={busy} aria-busy={busy} data-action="stop-confirm" onClick={onConfirm}>{t("kill_switch.action.engage")}</button>
        </div>
      </div>
    </div>
  );
}
