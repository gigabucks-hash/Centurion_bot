import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { core, runtime, type ConnectionView } from "../api";
import { useT } from "../i18n";
import { checkBackend, checkLoginUrl, needsRestart, type ConnectionFieldError } from "./connectionCheck";

const ERROR_KEY: Record<ConnectionFieldError, string> = {
  backend_scheme: "desktop.connection.err.scheme",
  backend_url: "desktop.connection.err.url",
  backend_loopback: "desktop.connection.err.loopback",
  backend_path: "desktop.connection.err.path",
  login_scheme: "desktop.connection.err.scheme",
  login_url: "desktop.connection.err.url",
  login_loopback: "desktop.connection.err.loopback",
};

/**
 * Koneksi paper: which API this installed app talks to. Default is the in-process mock; a saved
 * `https://…` base (or `http://` to loopback) switches the next launch to the paper API with a
 * Phantom login. The transport is built once at startup, so changing the base restarts the app;
 * changing only the login page applies immediately.
 */
export function ConnectionSection() {
  const t = useT();
  const [view, setView] = useState<ConnectionView | null>(null);
  const [backend, setBackend] = useState("");
  const [login, setLogin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (runtime !== "tauri") return;
    let alive = true;
    core
      .connectionStatus()
      .then((v) => {
        if (!alive) return;
        setView(v);
        setBackend(v.saved_backend ?? "");
        setLogin(v.login_url ?? "");
      })
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (runtime !== "tauri") {
    return (
      <div className="settings-section" data-testid="connection-browser">
        <div className="muted">{t("desktop.connection.title")}</div>
        <div className="dim" style={{ fontSize: "var(--d-small)" }}>{t("desktop.connection.browser")}</div>
      </div>
    );
  }

  const invalid = (key: string) => setErr(t(ERROR_KEY[key as ConnectionFieldError]));

  const save = async () => {
    setErr(null);
    setMsg(null);
    const b = checkBackend(backend);
    if (!b.ok) return invalid(b.error);
    const l = checkLoginUrl(login);
    if (!l.ok) return invalid(l.error);
    setBusy(true);
    try {
      const r = await core.saveConnection({ backend: b.value, login_url: l.value });
      if (r.restart_required) {
        setMsg(t("desktop.connection.saved_restart"));
        setTimeout(() => void relaunch().catch(() => {}), 1200);
      } else {
        setMsg(t("desktop.connection.saved"));
        setView(await core.connectionStatus());
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const useMock = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await core.saveConnection({ backend: null, login_url: login.trim() ? login : null });
      if (r.restart_required) {
        setMsg(t("desktop.connection.saved_restart"));
        setTimeout(() => void relaunch().catch(() => {}), 1200);
      } else {
        setMsg(t("desktop.connection.saved"));
        setBackend("");
        setView(await core.connectionStatus());
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const activeHttp = view?.active === "http";
  const parsed = checkBackend(backend);
  const willRestart = parsed.ok && needsRestart(view?.active_backend ?? null, parsed.value);

  return (
    <div className="settings-section" data-testid="connection">
      <div className="muted">{t("desktop.connection.title")}</div>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="chip" data-transport={view?.active ?? "mock"} data-testid="connection-active">
          {activeHttp ? t("desktop.connection.http") : t("desktop.connection.mock")}
        </span>
        {view?.active_backend && <span className="mono dim" style={{ fontSize: "var(--d-small)" }}>{view.active_backend}</span>}
      </div>
      {view?.env_override && (
        <div className="notice pending" role="status" data-testid="connection-env">{t("desktop.connection.env")}</div>
      )}
      {view?.error && <div className="neg" role="status" data-testid="connection-load-error">{view.error}</div>}
      <label>
        <div className="muted">{t("desktop.connection.backend.label")}</div>
        <input
          className="mono"
          value={backend}
          placeholder="https://paper.example.com"
          disabled={busy || view?.env_override}
          onChange={(e) => setBackend(e.target.value)}
          data-testid="connection-backend"
        />
        <div className="dim" style={{ fontSize: "var(--d-small)" }}>{t("desktop.connection.backend.hint")}</div>
      </label>
      <label>
        <div className="muted">{t("desktop.connection.login.label")}</div>
        <input
          className="mono"
          value={login}
          placeholder="https://app.example.com/auth/desktop"
          disabled={busy || view?.env_override}
          onChange={(e) => setLogin(e.target.value)}
          data-testid="connection-login"
        />
        <div className="dim" style={{ fontSize: "var(--d-small)" }}>{t("desktop.connection.login.hint")}</div>
      </label>
      <div className="dim" style={{ fontSize: "var(--d-small)" }}>{t("desktop.connection.note")}</div>
      {willRestart && <div className="dim" role="status" style={{ fontSize: "var(--d-small)" }} data-testid="connection-restart-hint">{t("desktop.connection.restart_hint")}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="sm primary" disabled={busy || view?.env_override} onClick={save} data-testid="connection-save">
          {t("desktop.connection.save")}
        </button>
        <button className="sm" disabled={busy || view?.env_override} onClick={useMock} data-testid="connection-mock">
          {t("desktop.connection.use_mock")}
        </button>
      </div>
      {msg && <div className="dim" role="status" data-testid="connection-msg">{msg}</div>}
      {err && <div className="neg" role="status" data-testid="connection-error">{err}</div>}
    </div>
  );
}
