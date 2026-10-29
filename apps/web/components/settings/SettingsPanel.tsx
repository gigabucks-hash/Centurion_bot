"use client";
/**
 * Settings (UX SETTINGS.md / WF-17·18). Sections: Profile (+ account deletion), Sign-in methods (last-method lock),
 * Trading wallet (separate, Real accent), Mode & defaults, Practice (reset to 30 SOL), Notifications (+ this
 * browser's push registration), Security (2FA, sessions & devices), Appearance, Language.
 * Mock build: every call goes to this app's in-memory BFF. No identity provider, wallet or push service is contacted,
 * and nothing secret is stored (the device id is an install id, the push token a placeholder).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Link2, ShieldCheck, Wallet } from "lucide-react";
import {
  cancelDeletionClient, deviceId, fetchDeletion, fetchDevices, fetchPracticeReset, registerDeviceClient, requestDeletionClient,
  resetPracticeClient, revokeDeviceClient, type DeletionState, type DeviceWire, type PracticeResetResult,
} from "@/lib/client";
import { ApiError, errorText } from "@/lib/errors";
import { createFmt } from "@/lib/format";
import { LOCALES } from "@/lib/i18n";
import { useFmt, useLocale, useT } from "@/lib/i18n/client";
import type { ApprovalMode } from "@/lib/types";
import { Badge, Button, Card, cn } from "@/components/ui";
import { HoldButton, Segmented, Toggle, useNow, useToast } from "@/components/ui/client";

type Method = "google" | "apple" | "telegram" | "email_otp" | "wallet_siws";
const METHODS: { id: Method; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "telegram", label: "Telegram" },
  { id: "email_otp", label: "Email" },
  { id: "wallet_siws", label: "Wallet (Sign in with Solana)" },
];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle py-2 first:border-t-0">
      <span className="min-w-40 flex-1 text-body text-text-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {hint ? <p className="w-full text-caption text-text-tertiary">{hint}</p> : null}
    </div>
  );
}

export function SettingsPanel({ signedInWith }: { signedInWith: Method | null }) {
  const t = useT();
  const f = useFmt();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const fail = (e: unknown) => toast({ kind: "error", text: errorText(t, e) });

  // Sign-in methods (local mock state).
  const [linked, setLinked] = useState<Set<Method>>(() => new Set([signedInWith ?? "google"]));
  const [unlinking, setUnlinking] = useState<Method | null>(null);

  // Defaults & notifications (local preferences; non-secret).
  const [approvalDefault, setApprovalDefault] = useState<ApprovalMode>("ask_first_buy");
  const [emailOn, setEmailOn] = useState(true);
  const [popup, setPopup] = useState(false);
  const [practiceActions, setPracticeActions] = useState(false);
  const [twoFa, setTwoFa] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // Server-backed mock resources.
  const [practice, setPractice] = useState<PracticeResetResult | null>(null);
  const [deletion, setDeletion] = useState<DeletionState | null>(null);
  const [devices, setDevices] = useState<DeviceWire[]>([]);
  const [myDevice, setMyDevice] = useState<string | null>(null);

  useEffect(() => {
    const tm = setTimeout(() => {
      setMyDevice(deviceId());
      setTheme((localStorage.getItem("sentra_theme") as "dark" | "light" | null) ?? (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
    }, 0);
    fetchPracticeReset().then(setPractice).catch(() => {});
    fetchDeletion().then(setDeletion).catch(() => {});
    fetchDevices().then(setDevices).catch(() => {});
    return () => clearTimeout(tm);
  }, []);

  const thisDevice = devices.find((d) => d.device_id === myDevice);
  const cooldownUntil = practice?.next_allowed_at ? Date.parse(practice.next_allowed_at) : null;
  const now = useNow(30_000);
  const onCooldown = cooldownUntil != null && now != null && cooldownUntil > now;
  const start = f.lamports(practice?.starting_balance_lamports ?? "30000000000");

  function applyTheme(v: "dark" | "light" | "system") {
    setTheme(v);
    const resolved = v === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : v;
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem("sentra_theme", resolved);
    } catch {
      /* ignore */
    }
  }

  async function setLocale(l: string) {
    if (l === locale) return;
    await fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: l }) });
    router.refresh();
  }

  async function doReset() {
    try {
      const r = await resetPracticeClient();
      setPractice(r);
      toast({ kind: "success", text: t("settings.practiceDone", { epoch: r.epoch, start: f.lamports(r.starting_balance_lamports) }) });
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESET_COOLDOWN") {
        const next = (e.details as { next_allowed_at?: string }).next_allowed_at ?? null;
        setPractice((p) => (p ? { ...p, next_allowed_at: next } : p));
      }
      fail(e);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t.ux("settings.section.profile")}>
        <Row label={t("settings.profileName")}><span className="text-body">Yuma</span></Row>
        <Row label={t("settings.timezone")}><span className="num text-body">Asia/Jakarta (WIB, UTC+7)</span></Row>
        <div className="mt-3 rounded-md border border-semantic-loss/40 p-3">
          <p className="text-label font-semibold text-semantic-loss">{t("settings.deleteTitle")}</p>
          <p className="mt-1 text-caption text-text-secondary">{t("settings.deleteBody")}</p>
          <div className="mt-2">
            {deletion?.state === "pending_deletion" ? (
              <div className="flex flex-wrap items-center gap-2" role="status">
                <Badge tone="warning">{t("settings.deleteScheduled", { scheduled_for: f.dateTime(Date.parse(deletion.scheduled_for!)) })}</Badge>
                <Button size="sm" variant="secondary" onClick={() => cancelDeletionClient().then(setDeletion).catch(fail)}>{t("settings.deleteCancel")}</Button>
              </div>
            ) : (
              <HoldButton durationMs={2500} variant="warning" onConfirm={() => requestDeletionClient().then(setDeletion).catch(fail)} hint={t("settings.deleteConfirm")}>
                {t("settings.deleteCta")}
              </HoldButton>
            )}
          </div>
        </div>
      </Card>

      <Card title={t.ux("settings.section.login_methods")}>
        {METHODS.map((m) => {
          const isLinked = linked.has(m.id);
          const last = isLinked && linked.size === 1;
          return (
            <Row key={m.id} label={m.label} hint={m.id === "wallet_siws" ? t.ux("settings.login.wallet_note") : last ? t.ux("settings.login.last_method_lock") : undefined}>
              {isLinked ? <Badge tone="profit"><Check size={12} aria-hidden /> {t.ux("settings.login.linked")}</Badge> : null}
              {isLinked ? (
                unlinking === m.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-caption">{t("settings.unlinkConfirm", { method: m.label })}</span>
                    <Button size="sm" variant="danger" onClick={() => { setLinked((s) => { const n = new Set(s); n.delete(m.id); return n; }); setUnlinking(null); }}>{t.ux("settings.login.unlink")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setUnlinking(null)}>{t("common.cancel")}</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" disabled={last} aria-disabled={last} onClick={() => setUnlinking(m.id)}>{t.ux("settings.login.unlink")}</Button>
                )
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setLinked((s) => new Set(s).add(m.id))}><Link2 size={14} aria-hidden /> {t.ux("settings.login.link")}</Button>
              )}
            </Row>
          );
        })}
      </Card>

      <section data-mode="real" className="rounded-lg border border-mode-real/50 bg-bg-surface p-4" aria-labelledby="trading-wallet-h">
        <h2 id="trading-wallet-h" className="flex items-center gap-2 text-titleSm text-mode-real"><Wallet size={16} aria-hidden /> {t.ux("settings.wallet.title")}</h2>
        <p className="mt-2 text-body">{t.ux("settings.wallet.not_connected")}</p>
        <p className="mt-1 text-caption text-text-secondary">{t.ux("settings.wallet.separate_note")}</p>
        <Button className="mt-3" size="sm" variant="real" disabled title={t("apiError.REAL_SOL_DISABLED")}>{t("settings.connectTrading")}</Button>
      </section>

      <Card title={t.ux("settings.section.mode_defaults")}>
        <Row label={t.ux("settings.mode.default_new_strategy")}><Badge tone="info">{t("mode.practice")}</Badge></Row>
        <Row label={t.ux("settings.mode.default_approval")} hint={t("settings.realMin")}>
          <Segmented<ApprovalMode>
            size="sm"
            label={t.ux("settings.mode.default_approval")}
            value={approvalDefault}
            onChange={setApprovalDefault}
            options={(["off", "ask_first_buy", "ask_every_buy"] as const).map((v) => ({ value: v, label: t(`approvalMode.${v}`) }))}
          />
        </Row>
      </Card>

      <Card title={t("settings.practiceTitle")}>
        <p className="text-body text-text-secondary">{t("settings.practiceBody", { start })}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <HoldButton durationMs={1200} variant="practice" disabled={onCooldown} onConfirm={doReset} hint={t("settings.practiceHold")}>
            {t("settings.practiceReset")}
          </HoldButton>
          {practice ? <span className="num text-caption text-text-tertiary">epoch {practice.epoch}</span> : null}
        </div>
        {onCooldown ? <p className="mt-2 text-caption text-semantic-warning" role="status">{t("settings.practiceCooldown", { time: f.dateTime(cooldownUntil!) })}</p> : null}
      </Card>

      <Card title={t.ux("settings.section.notifications")}>
        <Row label={t.ux("settings.notif.push")} hint={thisDevice ? t("settings.devicePushOn") : t("settings.devicePushOff")}>
          {thisDevice ? (
            <Button size="sm" variant="ghost" onClick={() => revokeDeviceClient().then(() => fetchDevices().then(setDevices)).catch(fail)}>{t("settings.deviceRemove")}</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => registerDeviceClient(locale === "id" ? "id-ID" : "en-US").then(() => fetchDevices().then(setDevices)).catch(fail)}>{t("settings.deviceRegister")}</Button>
          )}
        </Row>
        <Toggle checked={emailOn} onChange={setEmailOn} label={t.ux("settings.notif.email")} />
        <Toggle checked={popup} onChange={setPopup} label={t.ux("settings.notif.desktop_popup")} hint={t("settings.popupNote")} />
        <Toggle checked={practiceActions} onChange={setPracticeActions} label={t.ux("settings.notif.practice_actions")} />
      </Card>

      <Card title={t.ux("settings.section.security")}>
        <Toggle checked={twoFa} onChange={setTwoFa} label={t.ux("settings.security.2fa")} />
        <p className="mt-3 text-label">{t.ux("settings.security.sessions")}</p>
        <ul className="mt-1">
          {devices.length === 0 ? <li className="text-caption text-text-tertiary">{t("settings.devicePushOff")}</li> : null}
          {devices.map((d) => (
            <li key={d.id} className="flex min-h-12 flex-wrap items-center gap-2 border-t border-border-subtle py-1 first:border-t-0">
              <ShieldCheck size={14} className="text-text-tertiary" aria-hidden />
              <span className="text-body">{d.platform} · {d.provider} · v{d.app_version}</span>
              {d.device_id === myDevice ? <Badge tone="info">{t.ux("settings.security.this_device")}</Badge> : null}
              <span className="num ml-auto text-caption text-text-tertiary">{f.dateTime(Date.parse(d.last_seen_at))}</span>
              {d.device_id === myDevice ? (
                <Button size="sm" variant="ghost" onClick={() => revokeDeviceClient().then(() => fetchDevices().then(setDevices)).catch(fail)}>{t.ux("settings.security.sign_out_device")}</Button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-text-tertiary">{t.ux("settings.security.audit")}: {t("common.mockBuild")}</p>
      </Card>

      <Card title={t.ux("settings.section.appearance")}>
        <Row label={t.ux("settings.appearance.theme.label")}>
          <Segmented size="sm" label={t.ux("settings.appearance.theme.label")} value={theme} onChange={applyTheme} options={(["dark", "light", "system"] as const).map((v) => ({ value: v, label: t.ux(`settings.appearance.theme.${v}`) }))} />
        </Row>
        <Row label={t.ux("settings.appearance.density.label")}>
          <Segmented size="sm" label={t.ux("settings.appearance.density.label")} value={density} onChange={setDensity} options={(["comfortable", "compact"] as const).map((v) => ({ value: v, label: t.ux(`settings.appearance.density.${v}`) }))} />
        </Row>
      </Card>

      <Card title={t.ux("settings.section.language")}>
        <Row label={t.ux("settings.language.label")} hint={t.ux("settings.language.number_format", { example: createFmt(locale, "real").sol(1234.56) })}>
          <div role="radiogroup" aria-label={t.ux("settings.language.label")} className="inline-flex gap-1.5">
            {LOCALES.map((l) => (
              <button key={l} type="button" role="radio" aria-checked={locale === l} onClick={() => setLocale(l)} className={cn("min-h-10 rounded-md border px-3 text-label", locale === l ? "border-brand-primary bg-brand-primaryContainer text-brand-onPrimaryContainer" : "border-border-default text-text-secondary hover:text-text-primary")}>
                {l === "en" ? "English" : "Bahasa Indonesia"}
              </button>
            ))}
          </div>
        </Row>
      </Card>

      <p className="flex items-center gap-2 text-caption text-text-tertiary lg:col-span-2"><AlertTriangle size={12} aria-hidden /> {t("settings.mockNote")}</p>
    </div>
  );
}
