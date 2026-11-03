"use client";
import { useState } from "react";
import { Laptop, ShieldX, Wallet } from "lucide-react";
import { ApiError } from "@/lib/errors";
import { deepLinkUrl, errorUrl, successUrl, type Handoff, type HandoffError } from "@/lib/auth/handoff";
import { request } from "@/lib/client";
import { MOCK_OTHER_WALLET, MOCK_OWNER_WALLET } from "@/lib/auth/allowlist";
import { mockPhantom, siwsNonce, WalletError, type SiwsChallenge } from "@/lib/auth/wallet";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui";

const isNotOwner = (e: unknown) => e instanceof ApiError && e.code === "FORBIDDEN_ROLE" && (e.details as { reason?: string }).reason === "wallet_not_allowed";

/**
 * Hand-off UI: connect (mock Phantom) → nonce + message preview → sign → return to the desktop app with the one-time
 * signed message (never tokens; this page does not call /verify). See lib/auth/handoff.ts.
 */
export function DesktopHandoff({ handoff }: { handoff: Handoff | null }) {
  const t = useT();
  const [wallet, setWallet] = useState(MOCK_OWNER_WALLET);
  const [ch, setCh] = useState<{ address: string; c: SiwsChallenge } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"sent" | HandoffError | null>(null);

  if (!handoff) {
    return (
      <Shell>
        <p role="alert" className="text-body text-semantic-loss" data-testid="handoff-invalid">{t("desktopAuth.invalid")}</p>
      </Shell>
    );
  }

  const back = (url: string, d: "sent" | HandoffError) => {
    setDone(d);
    window.location.assign(url);
  };
  // Loopback: report the error to the app. Deep link: the app's parser accepts only code+state → stay on the page.
  const fail = (e: HandoffError) => (handoff.kind === "loopback" ? back(errorUrl(handoff.redirect, handoff.state, e), e) : setDone(e));

  async function connect() {
    setBusy(true);
    try {
      const w = mockPhantom(wallet);
      const { address } = await w.connect();
      setCh({ address, c: await siwsNonce(address) });
    } catch (e) {
      if (isNotOwner(e)) fail("wallet_not_allowed");
      else if (e instanceof WalletError) fail(e.code === "not_installed" ? "not_installed" : "user_rejected");
      else fail("failed");
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    if (!ch) return;
    setBusy(true);
    try {
      const signature = await mockPhantom(ch.address).signMessage(ch.c.message);
      if (handoff!.kind === "loopback") {
        back(successUrl(handoff!.redirect, handoff!.state, { address: ch.address, message: ch.c.message, signature }), "sent");
        return;
      }
      const r = await request<{ code: string; expires_in: number }>("/api/v1/auth/siws/verify", {
        body: { address: ch.address, message: ch.c.message, signature, client: "desktop", code_challenge: handoff!.codeChallenge, code_challenge_method: "S256", state: handoff!.state },
      });
      back(deepLinkUrl(handoff!.state, r.data.code), "sent");
    } catch (e) {
      fail(isNotOwner(e) ? "wallet_not_allowed" : e instanceof WalletError ? "user_rejected" : e instanceof ApiError && e.code === "SIWS_NONCE_INVALID" ? "nonce_expired" : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      {done ? (
        <div role="status" data-testid="handoff-done" data-result={done} className="flex flex-col gap-2">
          {done === "wallet_not_allowed" ? <ShieldX className="text-semantic-loss" aria-hidden /> : <Laptop className="text-brand-primary" aria-hidden />}
          <p className="text-titleSm">{done === "sent" ? t("desktopAuth.sentTitle") : done === "wallet_not_allowed" ? t("walletLogin.deniedTitle") : t("desktopAuth.failedTitle")}</p>
          <p className="text-body text-text-secondary">{done === "wallet_not_allowed" ? t("walletLogin.deniedBody") : t("desktopAuth.returnBody")}</p>
        </div>
      ) : !ch ? (
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">{t("desktopAuth.body")}</p>
          <label className="flex flex-col gap-1 text-caption text-text-secondary">
            {t("walletLogin.mockWallet")}
            <select data-testid="mock-wallet" className="h-11 rounded-md border border-border-default bg-bg-raised px-3 text-body" value={wallet} onChange={(e) => setWallet(e.target.value)}>
              <option value={MOCK_OWNER_WALLET}>{t("walletLogin.mockOwner")}</option>
              <option value={MOCK_OTHER_WALLET}>{t("walletLogin.mockOther")}</option>
            </select>
          </label>
          <Button size="lg" className="min-h-12" loading={busy} onClick={connect}><Wallet size={16} aria-hidden /> {t("walletLogin.connect")}</Button>
          <Button variant="ghost" className="min-h-11" onClick={() => fail("user_rejected")}>{t("desktopAuth.cancel")}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-label">{t("walletLogin.previewTitle")}</p>
          <pre data-testid="siws-message" className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border-subtle bg-bg-sunken p-3 text-numSm">{ch.c.message}</pre>
          <p className="text-caption text-text-tertiary">{t("walletLogin.previewNote")}</p>
          <Button size="lg" className="min-h-12" loading={busy} onClick={sign}>{t("walletLogin.sign")}</Button>
          <Button variant="ghost" className="min-h-11" onClick={() => fail("user_rejected")}>{t("desktopAuth.cancel")}</Button>
        </div>
      )}
      <p className="mt-6 text-caption text-text-tertiary">{t("desktopAuth.noTokens")} {t("walletLogin.mockNote")}</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-surface p-6 shadow-e2 sm:p-8">
        <p className="mb-1 text-title"><span aria-hidden>◆ </span>{t.ux("app.name")}</p>
        <h1 className="mb-4 text-titleSm text-text-secondary">{t("desktopAuth.title")}</h1>
        {children}
      </div>
    </main>
  );
}
