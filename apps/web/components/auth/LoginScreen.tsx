"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Loader2, Lock, Mail, Wallet } from "lucide-react";
import { request } from "@/lib/client";
import { ApiError, errorText } from "@/lib/errors";
import { useFmt, useLocale, useT } from "@/lib/i18n/client";
import { Button, cn } from "@/components/ui";
import { Dialog, useNow } from "@/components/ui/client";

/**
 * MOCK sign-in (SPEC §5, UX SIGN_IN_BUTTONS.md, QA-05). Nothing here talks to an IdP, wallet or mail server.
 * - One equal-size stack (40 px tall, 320–400 px wide, 12 px gaps, radius 6): Google, Apple, [Telegram], "or", Email, Wallet.
 *   Telegram is hidden (not disabled) while AUTH_TELEGRAM_OIDC_ENABLED is off (NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED=true shows it).
 * - QA-05 official buttons: Google = Google Identity Services rendered button when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set
 *   (theme filled_black/outline, size large, rectangular, continue_with, UI locale); without a client id (mock build)
 *   the documented custom button with the unmodified standard "G" from Google's pre-approved asset bundle.
 *   Apple = Apple's own rendered button image (official button endpoint, localized, White on dark / Black on light).
 *   Telegram = hidden while the flag is off; when on, the Telegram Login library renders its own widget.
 * - Loading: spinner inside the pressed button, label kept, the other buttons disabled.
 * - Email OTP and Sign-In With Solana go through the mock contract endpoints (/api/v1/auth/email/otp/*, /api/v1/auth/siws/*).
 *   Mock code 123456; the mock "signature" is a literal string (no wallet access, no window.solana).
 */

type Method = "google" | "apple" | "telegram" | "email_otp" | "wallet_siws";
type Scenario = "success" | "popup_blocked" | "idp_cancelled" | "telegram_invalid" | "wallet_missing" | "sign_rejected" | "nonce_expired" | "account_disabled" | "offline";
const SCENARIOS: Scenario[] = ["success", "popup_blocked", "idp_cancelled", "telegram_invalid", "wallet_missing", "sign_rejected", "nonce_expired", "account_disabled", "offline"];
const TELEGRAM_ENABLED = process.env.NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED === "true";
const MOCK_ADDRESS = "MockSignInWa11et1111111111111111111111111111";

export function LoginScreen() {
  const router = useRouter();
  const t = useT();
  const [scenario, setScenario] = useState<Scenario>("success");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Method | null>(null);
  const [step, setStep] = useState<"choose" | "otp">("choose");
  const [email, setEmail] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);

  const scenarioError = (relevant: Scenario[]): string | null => {
    if (scenario === "offline") return t("login.e.offline");
    if (scenario === "account_disabled") return t("login.e.account_disabled");
    if (!relevant.includes(scenario)) return null;
    if (scenario === "telegram_invalid") return t("apiError.AUTH_TG_INVALID");
    return t(`login.e.${scenario}` as "login.e.generic");
  };

  async function idp(method: "google" | "apple" | "telegram") {
    setError(null);
    setBusy(method);
    await new Promise((r) => setTimeout(r, 500));
    const e = scenarioError(method === "telegram" ? ["telegram_invalid", "idp_cancelled", "popup_blocked"] : ["popup_blocked", "idp_cancelled"]);
    if (e) {
      setBusy(null);
      return setError(e);
    }
    const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method }) });
    setBusy(null);
    if (!res.ok) return setError(t("login.failed"));
    router.push("/welcome");
  }

  async function sendCode() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t("login.emailInvalid"));
    const e = scenarioError([]);
    if (e) return setError(e);
    setBusy("email_otp");
    try {
      await request("/api/v1/auth/email/otp/request", { body: { email } });
      setStep("otp");
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  }

  const disabled = (m: Method) => busy != null && busy !== m;

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="hidden flex-col border-r border-border-subtle bg-bg-surface p-10 lg:flex">
        <p className="text-title">◆ Sentra <span className="text-caption text-text-tertiary">{t("login.workingName")}</span></p>
        <h1 className="mt-auto text-display text-text-primary">{t("login.hero")}</h1>
        <ul className="mt-6 flex flex-col gap-2 text-body text-text-secondary">
          {(["login.v1", "login.v2", "login.v3"] as const).map((k) => (
            <li key={k} className="flex gap-2"><Check size={16} className="mt-0.5 text-semantic-profit" aria-hidden /> {t(k)}</li>
          ))}
        </ul>
        <FauxDashboard />
      </section>

      <section className="flex flex-col items-center justify-center p-4 sm:p-10">
        <div className="mb-6 text-title lg:hidden">◆ Sentra</div>
        <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-surface p-6 shadow-e2 sm:p-8">
          {step === "choose" ? (
            <>
              <h2 className="text-title">{t("login.heading")}</h2>
              <p className="mt-1 text-body text-text-secondary">{t("login.sub")}</p>
              {error && <ErrorBox text={error} />}
              <div className="mx-auto mt-5 flex w-full max-w-[400px] min-w-0 flex-col gap-3 sm:min-w-[320px]">
                <GoogleButton label={t("login.google")} busy={busy === "google"} disabled={disabled("google")} onClick={() => idp("google")} />
                <AppleButton label={t("login.apple")} busy={busy === "apple"} disabled={disabled("apple")} onClick={() => idp("apple")} />
                {TELEGRAM_ENABLED && <TelegramButton label={t("login.telegram")} busy={busy === "telegram"} disabled={disabled("telegram")} onClick={() => idp("telegram")} />}

                <Divider label={t("login.or")} />

                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendCode();
                  }}
                >
                  <div>
                    <label htmlFor="email" className="mb-1 block text-label text-text-secondary">{t("login.email")}</label>
                    <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-10 w-full rounded-sm border border-border-default bg-bg-sunken px-3 text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus" />
                  </div>
                  <SentraButton icon={<Mail size={16} aria-hidden />} label={t("login.sendCode")} type="submit" busy={busy === "email_otp"} disabled={disabled("email_otp")} />
                </form>
                <SentraButton
                  icon={<Wallet size={16} aria-hidden />}
                  label={t("login.wallet")}
                  busy={busy === "wallet_siws"}
                  disabled={disabled("wallet_siws")}
                  onClick={() => {
                    setError(null);
                    const e = scenarioError(["wallet_missing"]);
                    if (e) return setError(e);
                    setWalletOpen(true);
                  }}
                />
                <p className="text-caption text-semantic-profit">{t("login.signNote")}</p>
              </div>
              <p className="mt-6 text-caption text-text-tertiary">{t("login.terms")}</p>
              <p className="mt-2 text-label text-mode-practice">{t("login.practiceFirst")}</p>
            </>
          ) : (
            <OtpStep email={email} onBack={() => setStep("choose")} onSuccess={() => router.push("/welcome")} />
          )}
        </div>
        <MockPanel scenario={scenario} setScenario={setScenario} />
      </section>

      <SiwsDialog
        open={walletOpen}
        scenario={scenario}
        onClose={() => setWalletOpen(false)}
        onDone={(err) => {
          setWalletOpen(false);
          if (err) setError(err);
          else router.push("/welcome");
        }}
      />
    </div>
  );
}

const TELEGRAM_PLACEHOLDER = "bg-bg-raised text-text-primary shadow-[inset_0_0_0_1px_var(--color-border-default)]";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const BASE =
  "relative flex h-10 w-full items-center justify-center gap-2.5 rounded-sm px-3 text-[14px] leading-5 font-medium transition outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:brightness-[1.08] enabled:active:brightness-[0.92]";

type BrandProps = { label: string; onClick: () => void; busy: boolean; disabled: boolean };

/**
 * Google. With a client id: the GIS-rendered button (always current with Google's guideline). Mock build: custom
 * button per the branding guideline (dark #131314 / #8E918F stroke / #E3E3E3 text, light #FFFFFF / #747775 /
 * #1F1F1F; Google Sans Medium 14/20; 12 · 10 · 12 padding; standard-colour G at bundle size 20 px).
 */
function GoogleButton(p: BrandProps) {
  const locale = useLocale();
  const gis = useRef<HTMLDivElement>(null);
  const [gisReady, setGisReady] = useState(false);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const el = gis.current;
    const render = () => {
      const g = (window as unknown as { google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (e: HTMLElement, o: object) => void } } } }).google;
      if (!g || !el) return;
      g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: () => p.onClick() });
      const light = document.documentElement.dataset.theme === "light";
      g.accounts.id.renderButton(el, { theme: light ? "outline" : "filled_black", size: "large", shape: "rectangular", text: "continue_with", locale, width: el.clientWidth || 320 });
      setGisReady(true);
    };
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
    return () => s.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  if (GOOGLE_CLIENT_ID) return <div ref={gis} className={cn("flex h-10 w-full justify-center", !gisReady && "rounded-sm bg-bg-raised")} data-brand="google" aria-label={p.label} />;
  return (
    <button
      type="button"
      data-brand="google"
      onClick={p.onClick}
      disabled={p.disabled || p.busy}
      aria-busy={p.busy || undefined}
      className={cn(
        BASE,
        "gap-[10px] px-3 font-[\"Google_Sans\",Roboto,Arial,sans-serif] bg-[#131314] text-[#E3E3E3] shadow-[inset_0_0_0_1px_#8E918F] in-data-[theme=light]:bg-[#FFFFFF] in-data-[theme=light]:text-[#1F1F1F] in-data-[theme=light]:shadow-[inset_0_0_0_1px_#747775]",
      )}
    >
      {p.busy ? <Loader2 size={20} className="shrink-0 animate-spin" aria-hidden /> : (
        // eslint-disable-next-line @next/next/no-img-element -- brand asset must ship unmodified (no re-encoding)
        <img src="/brand/google/g-logo.svg" width={20} height={20} alt="" aria-hidden className="shrink-0" />
      )}
      <span>{p.label}</span>
    </button>
  );
}

const APPLE_LOCALE = { en: "en_US", id: "id_ID" } as const;
const appleImg = (color: "white" | "black", locale: "en" | "id") =>
  `https://appleid.cdn-apple.com/appleid/button?height=40&width=352&type=continue&color=${color}&border=false&border_radius=6&scale=2&locale=${APPLE_LOCALE[locale]}`;

/**
 * Apple: the button artwork comes from Apple's own button endpoint (system-rendered title, localized), White on the
 * dark theme and Black on light, never redrawn. If the image cannot load (offline), the plain localized title shows.
 */
function AppleButton(p: BrandProps) {
  const locale = useLocale();
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      data-brand="apple"
      onClick={p.onClick}
      disabled={p.disabled || p.busy}
      aria-busy={p.busy || undefined}
      aria-label={p.label}
      className={cn(BASE, "overflow-hidden px-0 bg-[#FFFFFF] text-[#000000] in-data-[theme=light]:bg-[#000000] in-data-[theme=light]:text-[#FFFFFF]")}
    >
      {p.busy && <Loader2 size={18} className="absolute left-3 shrink-0 animate-spin" aria-hidden />}
      {failed ? (
        <span>{p.label}</span>
      ) : (
        <>
          {/* eslint-disable @next/next/no-img-element -- Apple-rendered button artwork, served by Apple, not re-encoded */}
          <img src={appleImg("white", locale)} alt="" aria-hidden width={352} height={40} onError={() => setFailed(true)} className="h-10 w-auto max-w-full object-contain in-data-[theme=light]:hidden" />
          <img src={appleImg("black", locale)} alt="" aria-hidden width={352} height={40} onError={() => setFailed(true)} className="hidden h-10 w-auto max-w-full object-contain in-data-[theme=light]:block" />
          {/* eslint-enable @next/next/no-img-element */}
        </>
      )}
    </button>
  );
}

/** Telegram stand-in (flag off by default → not rendered). When enabled the Telegram Login library draws its widget. */
function TelegramButton(p: BrandProps) {
  return (
    <button type="button" data-brand="telegram" onClick={p.onClick} disabled={p.disabled || p.busy} aria-busy={p.busy || undefined} className={cn(BASE, TELEGRAM_PLACEHOLDER)}>
      {p.busy && <Loader2 size={18} className="shrink-0 animate-spin" aria-hidden />}
      <span>{p.label}</span>
    </button>
  );
}

function SentraButton({ icon, label, onClick, busy, disabled, type = "button" }: { icon: React.ReactNode; label: string; onClick?: () => void; busy: boolean; disabled: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} className={cn(BASE, "border border-border-default bg-bg-surface text-text-primary")}>
      {busy ? <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden /> : icon}
      <span>{label}</span>
    </button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-caption text-text-tertiary">
      <span className="h-px flex-1 bg-border-subtle" /> {label} <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-semantic-loss/50 bg-semantic-lossContainer px-3 py-2 text-body text-semantic-loss">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {text}
    </p>
  );
}

const OTP_TTL = 10 * 60_000;
const RESEND_AFTER = 60_000;
const MAX_ATTEMPTS = 5;

function OtpStep({ email, onBack, onSuccess }: { email: string; onBack: () => void; onSuccess: () => void }) {
  const t = useT();
  const f = useFmt();
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const now = useNow(1000) ?? sentAt;
  const left = OTP_TTL - (now - sentAt);
  const expired = left <= 0;
  const locked = lockedUntil != null && now < lockedUntil;
  const canResend = now - sentAt >= RESEND_AFTER && !locked;

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  async function submit(code: string) {
    if (locked || expired) return;
    setBusy(true);
    try {
      await request("/api/v1/auth/email/otp/verify", { body: { email, code } });
      onSuccess();
    } catch (e) {
      setDigits(Array(6).fill(""));
      setTimeout(() => refs.current[0]?.focus(), 0);
      if (e instanceof ApiError && e.code === "OTP_LOCKED") {
        const s = Number((e.details as { retry_after_s?: number }).retry_after_s ?? 900);
        setLockedUntil(now + s * 1000);
        setAttemptsLeft(0);
        setErr(t("login.locked", { minutes: Math.ceil(s / 60) }));
      } else if (e instanceof ApiError && e.code === "OTP_INVALID") {
        const d = (e.details as { attempts_left?: number; expired?: boolean });
        if (d?.expired) setErr(t("login.otpExpired"));
        else {
          setAttemptsLeft(d?.attempts_left ?? 0);
          setErr(t("login.wrongCode", { n: d?.attempts_left ?? 0 }));
        }
      } else setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split("");
      setDigits([...next, ...Array(6 - next.length).fill("")]);
      if (next.length === 6) submit(next.join(""));
      else refs.current[next.length]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d)) submit(next.join(""));
  };

  return (
    <>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary"><ArrowLeft size={14} aria-hidden /> {t("login.otherMethods")}</button>
      <h2 className="text-title">{t("login.otpTitle")}</h2>
      <p className="mt-1 text-body text-text-secondary">
        {t("login.otpSentTo", { email })} <span className={cn("num", left < 120_000 && "text-semantic-loss")}>{t("login.otpExpires", { time: f.countdown(Math.max(0, left)) })}</span>
      </p>
      <p className="mt-2 rounded-md bg-semantic-infoContainer px-3 py-2 text-caption text-semantic-info">{t("login.otpMock")}</p>
      {err && <ErrorBox text={err} />}
      {expired && <ErrorBox text={t("login.otpExpired")} />}
      <fieldset className="mt-5" disabled={locked || expired || busy}>
        <legend className="sr-only">{t("login.otpLegend")}</legend>
        <div className="flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={d}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={t("login.digit", { n: i + 1 })}
              maxLength={6}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
              className="num h-14 w-full min-w-0 rounded-md border border-border-default bg-bg-sunken text-center text-numLg outline-none focus:outline-2 focus:outline-border-focus disabled:opacity-50"
            />
          ))}
        </div>
      </fieldset>
      {locked && <p className="mt-3 flex items-center gap-1.5 text-caption text-semantic-loss"><Lock size={12} aria-hidden /> {t("login.tryAgainIn")} <span className="num">{f.countdown((lockedUntil ?? 0) - now)}</span></p>}
      <div className="mt-4 flex items-center justify-between text-caption">
        <span className="num text-text-tertiary">{t("login.attempts", { n: MAX_ATTEMPTS - attemptsLeft, max: MAX_ATTEMPTS })}</span>
        <button
          disabled={!canResend}
          onClick={async () => {
            await request("/api/v1/auth/email/otp/request", { body: { email } }).catch(() => {});
            setSentAt(Date.now());
            setErr(null);
            setDigits(Array(6).fill(""));
          }}
          className="text-brand-primary disabled:text-text-disabled"
        >
          {canResend ? t("login.resend") : t("login.resendIn", { time: f.countdown(RESEND_AFTER - (now - sentAt)) })}
        </button>
      </div>
    </>
  );
}

function SiwsDialog({ open, scenario, onClose, onDone }: { open: boolean; scenario: Scenario; onClose: () => void; onDone: (error: string | null) => void }) {
  const t = useT();
  const [wallet, setWallet] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const tm = setTimeout(() => {
      setWallet(null);
      setMsg(null);
    }, 0);
    return () => clearTimeout(tm);
  }, [open]);

  async function choose(w: string) {
    setWallet(w);
    try {
      const { data } = await request<{ message: string }>("/api/v1/auth/siws/nonce", { body: { address: MOCK_ADDRESS, domain: window.location.host, uri: window.location.origin, chain_id: "solana:mainnet" } });
      setMsg(data);
    } catch (e) {
      onDone(errorText(t, e));
    }
  }

  async function sign() {
    if (!msg) return;
    if (scenario === "sign_rejected") return onDone(t("login.e.sign_rejected"));
    setBusy(true);
    try {
      // nonce_expired scenario: send a message whose nonce the server does not know → SIWS_NONCE_INVALID.
      const message = scenario === "nonce_expired" ? msg.message.replace(/Nonce: \w+/, "Nonce: expired0000000000") : msg.message;
      await request("/api/v1/auth/siws/verify", { body: { address: MOCK_ADDRESS, message, signature: "mock-signature" } });
      onDone(null);
    } catch (e) {
      onDone(e instanceof ApiError && e.code === "SIWS_NONCE_INVALID" ? t("login.e.nonce_expired") : errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("login.siwsTitle")} initialFocusRef={cancelRef}>
      {!wallet ? (
        <>
          <p className="text-body text-text-secondary">{t("login.chooseWallet")}</p>
          <div className="mt-4 grid gap-2">
            {["Phantom", "Solflare", "Backpack", "Mobile Wallet Adapter"].map((w) => (
              <Button key={w} variant="secondary" size="lg" onClick={() => choose(w)}>{w}</Button>
            ))}
          </div>
          <Button ref={cancelRef} variant="ghost" className="mt-3 w-full" onClick={onClose}>{t("common.cancel")}</Button>
        </>
      ) : (
        <>
          <p className="text-body text-text-secondary">{t("login.willSign", { wallet })}</p>
          <pre className="num mt-3 whitespace-pre-wrap break-all rounded-md border border-border-subtle bg-bg-sunken p-3 text-caption text-text-secondary">{msg?.message ?? "…"}</pre>
          <p className="mt-2 text-caption text-text-tertiary">{t("login.signinWalletNote")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button ref={cancelRef} variant="secondary" size="lg" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" size="lg" onClick={sign} loading={busy} disabled={!msg}>{t("login.simulate")}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function MockPanel({ scenario, setScenario }: { scenario: Scenario; setScenario: (s: Scenario) => void }) {
  const t = useT();
  return (
    <div className="mt-4 w-full max-w-md rounded-md border border-dashed border-border-default p-3 text-caption text-text-tertiary">
      <label className="flex items-center justify-between gap-2">
        <span>{t("login.scenario")}</span>
        <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)} className="h-8 rounded-sm border border-border-default bg-bg-sunken px-2 text-text-primary">
          {SCENARIOS.map((s) => <option key={s} value={s}>{t(`login.sc.${s}`)}</option>)}
        </select>
      </label>
    </div>
  );
}

function FauxDashboard() {
  return (
    <div aria-hidden className="mt-10 overflow-hidden rounded-lg border border-border-subtle bg-bg-canvas p-4 blur-[2px]">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-md bg-bg-raised" />)}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="col-span-2 h-28 rounded-md bg-bg-raised" />
        <div className="h-28 rounded-md bg-bg-raised" />
      </div>
    </div>
  );
}
