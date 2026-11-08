/**
 * Settings card: check the latest GitHub release and install its signed Windows update.
 *
 * Windows-only in practice: tauri-plugin-updater reads `plugins.updater.endpoints` (latest.json on
 * the newest published release) and verifies the minisign signature before installing; the app then
 * restarts through tauri-plugin-process. In `npm run dev` (plain browser) the card explains that
 * update checks live in the installed app instead of calling Tauri APIs.
 */
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { runtime } from "../api";
import { useT } from "../i18n";
import { applyDownloadEvent, compareVersions, formatBytes, isNoReleaseError, progressPct, type UpdateProgress } from "./updateCheck";

type Phase = "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "error";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function UpdateSection() {
  const t = useT();
  const inTauri = runtime === "tauri";
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<UpdateProgress>({ loaded: 0, total: null });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!inTauri) return;
    void getVersion().then(setCurrent).catch(() => setCurrent(null));
  }, [inTauri]);

  const onCheck = async () => {
    setPhase("checking");
    setErr(null);
    setUpdate(null);
    try {
      const u = await check();
      if (u && compareVersions(u.version, u.currentVersion ?? current ?? "0") > 0) {
        setCurrent(u.currentVersion ?? current);
        setUpdate(u);
        setPhase("available");
      } else {
        setPhase("current");
      }
    } catch (e) {
      setErr(errText(e));
      setPhase("error");
    }
  };

  const onInstall = async () => {
    if (!update) return;
    setErr(null);
    setProgress({ loaded: 0, total: null });
    setPhase("downloading");
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Finished") {
          setPhase("installing");
          return;
        }
        setProgress((p) => applyDownloadEvent(p, e.event, e.data));
      });
      setPhase("installing");
      await relaunch();
    } catch (e) {
      setErr(errText(e));
      setPhase("error");
    }
  };

  const pct = progressPct(progress);
  const size = formatBytes(progress.total);
  const busy = phase === "checking" || phase === "downloading" || phase === "installing";

  return (
    <div className="settings-section" data-testid="update-section">
      <div className="muted">{t("desktop.update.title")}</div>
      <div className="dim" style={{ fontSize: "var(--d-small)" }}>
        {inTauri ? t("desktop.update.note") : t("desktop.update.browser")}
      </div>
      {inTauri && current && <div className="dim mono" data-testid="update-current">{t("desktop.update.current", { version: current })}</div>}
      {inTauri && (
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button className="sm" disabled={busy} onClick={onCheck} data-testid="update-check">
            {phase === "checking" ? t("desktop.update.checking") : t("desktop.update.check")}
          </button>
          {phase === "available" && update && (
            <button className="sm primary" onClick={onInstall} data-testid="update-install">
              {t("desktop.update.download")}
            </button>
          )}
        </div>
      )}
      <div role="status" aria-live="polite" style={{ fontSize: "var(--d-small)" }}>
        {phase === "current" && <span className="dim">{t("desktop.update.none")}</span>}
        {phase === "available" && update && (
          <span className="dim mono" data-testid="update-available">{t("desktop.update.available", { version: update.version })}</span>
        )}
        {phase === "downloading" && (
          <span className="dim" data-testid="update-progress">
            {pct == null ? t("desktop.update.downloading_unknown") : t("desktop.update.downloading", { pct })}
            {size && <span className="mono"> · {size}</span>}
          </span>
        )}
        {phase === "installing" && <span className="dim">{t("desktop.update.installing")}</span>}
        {phase === "error" && (
          <span className="neg" data-testid="update-error" title={err ?? undefined}>
            {err && isNoReleaseError(err)
              ? t("desktop.update.no_release")
              : t("desktop.update.error", { message: err ?? "" })}
          </span>
        )}
      </div>
    </div>
  );
}
