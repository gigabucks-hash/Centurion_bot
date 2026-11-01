import { useEffect, useState, type ReactNode } from "react";
import { core, EVT, type AuthView } from "../api";
import { useT } from "../i18n";
import { shortMint } from "../components/format";

/**
 * Wallet-only login (SIWS) through the **system browser**. This view never touches a wallet or a key:
 * "Connect" asks Rust to open the browser; Rust receives the signed message on a loopback callback,
 * verifies it with the API and keeps the tokens in the OS keychain. Mock / dev-token builds pass through.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useT();
  const [a, setA] = useState<AuthView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let un: (() => void) | undefined;
    core.authStatus().then(setA).catch(() => setA({ mode: "mock", state: "signed_in", address: null, workspace_id: null }));
    core.on<Omit<AuthView, "mode">>(EVT.auth, (s) => setA((prev) => ({ ...(s as AuthView), mode: prev?.mode ?? "siws" }))).then((u) => (un = u));
    return () => un?.();
  }, []);
  if (!a) return null;
  if (a.mode !== "siws" || a.state === "signed_in") return <>{children}</>;
  const login = async () => {
    setErr(null);
    try {
      await core.authLogin();
    } catch (e) {
      setErr(String(e));
    }
  };
  let body: ReactNode;
  if (a.state === "wallet_not_allowed") {
    body = (
      <>
        <h1>{t("desktop.auth.not_allowed.title")}</h1>
        <p role="alert">{t("desktop.auth.not_allowed.body", { app: t("app.name"), address: a.address ? shortMint(a.address) : "" })}</p>
        <button className="primary" onClick={login}>{t("desktop.auth.try_other")}</button>
      </>
    );
  } else {
    const note =
      a.state === "waiting_for_browser" ? t("desktop.auth.waiting")
      : a.state === "failed" ? (a.code === "user_rejected" ? t("login.wallet.rejected") : t("desktop.auth.failed", { code: a.code }))
      : a.state === "signed_out" && a.reason && a.reason !== "signed_out" ? (a.reason === "user_rejected" ? t("login.wallet.rejected") : t("desktop.auth.session_ended", { reason: a.reason }))
      : null;
    body = (
      <>
        <h1>{t("desktop.auth.title", { app: t("app.name") })}</h1>
        <p className="dim">{t("desktop.auth.browser_note")}</p>
        <p className="dim">{t("login.wallet.sign_note")}</p>
        <button className="primary" disabled={a.state === "waiting_for_browser"} aria-busy={a.state === "waiting_for_browser"} onClick={login}>{t("login.button.wallet")}</button>
        {note && <p role="status" className={a.state === "failed" ? "neg" : "dim"}>{note}</p>}
      </>
    );
  }
  return (
    <main className="auth-gate" data-auth={a.state}>
      <section>{body}{err && <p className="neg">{err}</p>}</section>
    </main>
  );
}
