"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Loader2, Lock, Mail, Wallet } from "lucide-react";
import { request } from "@/lib/client";
import { ApiError, errorText } from "@/lib/errors";
import { useFmt, useLocale, useT } from "@/lib/i18n/client";
import { Button, cn } from "@/components/ui";
import { Mark } from "@/components/shell/Mark";
import { useNow } from "@/components/ui/client";
import { AUTH_FLAGS, anyLegacyMethod } from "@/lib/auth/flags";
import { safeNext } from "@/lib/auth/gate";
import { MOCK_OTHER_WALLET, MOCK_OWNER_WALLET } from "@/lib/auth/allowlist";
import { mockPhantom, phantomAdapter, siwsNonce, siwsVerify, WalletError, type MockWalletBehaviour, type SiwsChallenge } from "@/lib/auth/wallet";

/**
 * Sign-in. Boss decision (29 Oct 2026, via Apex): private single-owner app, Solana wallet only (Phantom + SIWS):
 * Connect Phantom → SIWS message preview → sign → verify → session; a wallet that is not on the allowlist gets
 * "Access denied". Mocked until Backend's SIWS route is live (lib/auth/wallet.ts: no wallet is contacted).
 * Email OTP, Google, Apple and Telegram stay below, each behind a build flag that is OFF (lib/auth/flags.ts).
 *
 * Legacy notes (flagged methods, SPEC §5, UX SIGN_IN_BUTTONS.md, QA-05): Nothing here talks to an IdP, wallet or mail server.
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

export function LoginScreen({ realWallet = false, localPaper = false }: { realWallet?: boolean; localPaper?: boolean }) {
  const router = useRouter();
  const t = useT();
  const [scenario, setScenario] = useState<Scenario>("success");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Method | null>(null);
  const [step, setStep] = useState<"choose" | "otp">("choose");
  const [email, setEmail] = useState("");
  const [mockWallet, setMockWallet] = useState(MOCK_OWNER_WALLET);
  const [behaviour, setBehaviour] = useState<WalletBehaviour>("ok");
  const [paperBusy, setPaperBusy] = useState(false);

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
    router.push(afterLogin());
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
        <p className="flex items-center gap-2 text-title"><Mark />{t.ux("app.name")}</p>
        <h1 className="mt-auto text-display text-text-primary">{t("walletLogin.hero")}</h1>
        <ul className="mt-6 flex flex-col gap-2 text-body text-text-secondary">
          {(["walletLogin.v1", "walletLogin.v2", "walletLogin.v3"] as const).map((k) => (
            <li key={k} className="flex gap-2"><Check size={16} className="mt-0.5 text-semantic-profit" aria-hidden /> {t(k)}</li>
          ))}
        </ul>
        <FauxDashboard />
      </section>

      <section className="flex flex-col items-center justify-center p-4 sm:p-10">
        <div className="mb-6 flex items-center gap-2 text-title lg:hidden"><Mark />{t.ux("app.name")}</div>
        <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-surface p-6 shadow-card sm:p-8">
          {step === "choose" ? (
            <>
              <h2 className="text-title">{t("walletLogin.heading")}</h2>
              <p className="mt-1 text-body text-text-secondary">{t("walletLogin.sub")}</p>
              {error && <ErrorBox text={error} />}
              <WalletFlow wallet={mockWallet} behaviour={behaviour} real={realWallet} onDone={() => router.push(afterLogin())} />
              {localPaper && (
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 w-full"
                    loading={paperBusy}
                    data-testid="local-paper-entry"
                    onClick={async () => {
                      setError(null);
                      setPaperBusy(true);
                      const res = await fetch("/api/local/paper-session", { method: "POST" });
                      setPaperBusy(false);
                      if (!res.ok) return setError(t("localLogin.paperFailed"));
                      router.push(afterLogin());
                    }}
                  >
                    {t("localLogin.paperCta")}
                  </Button>
                  <p className="text-caption text-text-secondary">{t("localLogin.paperNote")}</p>
                </div>
              )}
              {anyLegacyMethod() && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-caption text-text-tertiary">{t("walletLogin.otherMethods")}</summary>
                  <div className="mx-auto mt-4 flex w-full max-w-[400px] min-w-0 flex-col gap-3 sm:min-w-[320px]">
                    {AUTH_FLAGS.google && <GoogleButton label={t("login.google")} busy={busy === "google"} disabled={disabled("google")} onClick={() => idp("google")} />}
                    {AUTH_FLAGS.apple && <AppleButton label={t("login.apple")} busy={busy === "apple"} disabled={disabled("apple")} onClick={() => idp("apple")} />}
                    {AUTH_FLAGS.telegram && <TelegramButton label={t("login.telegram")} busy={busy === "telegram"} disabled={disabled("telegram")} onClick={() => idp("telegram")} />}
                    {AUTH_FLAGS.emailOtp && (
                      <form
                        className="flex flex-col gap-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          sendCode();
                        }}
                      >
                        <div>
                          <label htmlFor="email" className="mb-1 block text-label text-text-secondary">{t("login.email")}</label>
                          <input id="email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-10 w-full rounded-sm border border-border-default bg-bg-sunken px-3 text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus" />
                        </div>
                        <CenturionButton icon={<Mail size={16} aria-hidden />} label={t("login.sendCode")} type="submit" busy={busy === "email_otp"} disabled={disabled("email_otp")} />
                      </form>
                    )}
                  </div>
                </details>
              )}
            </>
          ) : (
            <OtpStep email={email} onBack={() => setStep("choose")} onSuccess={() => router.push(afterLogin())} />
          )}
        </div>
        {!realWallet && <WalletMockPanel wallet={mockWallet} setWallet={setMockWallet} behaviour={behaviour} setBehaviour={setBehaviour} />}
        {!realWallet && anyLegacyMethod() && <MockPanel scenario={scenario} setScenario={setScenario} />}
      </section>

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

function CenturionButton({ icon, label, onClick, busy, disabled, type = "button" }: { icon: React.ReactNode; label: string; onClick?: () => void; busy: boolean; disabled: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} className={cn(BASE, "border border-border-default bg-bg-surface text-text-primary")}>
      {busy ? <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden /> : icon}
      <span>{label}</span>
    </button>
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

type WalletBehaviour = MockWalletBehaviour | "nonce_expired" | "offline";
const BEHAVIOURS: WalletBehaviour[] = ["ok", "not_installed", "connect_rejected", "sign_rejected", "nonce_expired", "offline"];
const AFTER_LOGIN_DEFAULT = AUTH_FLAGS.onboarding ? "/welcome" : "/";
const afterLogin = () => (typeof window === "undefined" ? null : safeNext(new URLSearchParams(window.location.search).get("next"))) ?? AFTER_LOGIN_DEFAULT;
/** Backend: OWNER_WALLETS miss → 403 FORBIDDEN_ROLE {reason: "wallet_not_allowed"} at /siws/nonce (and /verify, /refresh). */
const isNotOwner = (e: unknown) => e instanceof ApiError && e.code === "FORBIDDEN_ROLE" && (e.details as { reason?: string } | undefined)?.reason === "wallet_not_allowed";
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * Wallet-only sign-in: 1 Connect Phantom → 2 SIWS message preview (server nonce) → 3 sign → verify → session.
 * 403 FORBIDDEN_ROLE {reason: wallet_not_allowed} → "Access denied" (no sign-up path in the private MVP).
 */
function WalletFlow({ wallet, behaviour, real, onDone }: { wallet: string; behaviour: WalletBehaviour; real: boolean; onDone: () => void }) {
  const t = useT();
  const [address, setAddress] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SiwsChallenge | null>(null);
  const [busy, setBusy] = useState<"connect" | "sign" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const adapter = useMemo(
    () => (real ? phantomAdapter() : mockPhantom(wallet, behaviour === "nonce_expired" || behaviour === "offline" ? "ok" : behaviour)),
    [wallet, behaviour, real],
  );
  const step = denied ? 3 : !address ? 1 : challenge ? 2 : 1;

  function reset() {
    setAddress(null);
    setChallenge(null);
    setErr(null);
    setDenied(false);
    adapter.disconnect();
  }

  async function connect() {
    setErr(null);
    setBusy("connect");
    try {
      if (!real && behaviour === "offline") throw new ApiError("OFFLINE", 0);
      const { address: a } = await adapter.connect();
      setAddress(a);
      setChallenge(await siwsNonce(a));
    } catch (e) {
      if (isNotOwner(e)) {
        setDenied(true);
        return;
      }
      setAddress(null);
      setErr(e instanceof WalletError ? t(e.code === "not_installed" ? "walletLogin.notInstalled" : "walletLogin.connectRejected") : errorText(t, e));
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!address || !challenge) return;
    setErr(null);
    setBusy("sign");
    try {
      const sig = await adapter.signMessage(challenge.message);
      // nonce_expired: send a message whose nonce the server never issued → SIWS_NONCE_INVALID.
      const message = !real && behaviour === "nonce_expired" ? challenge.message.replace(/Nonce: \w+/, "Nonce: expired0000000000") : challenge.message;
      await siwsVerify(address, message, sig);
      onDone();
    } catch (e) {
      if (e instanceof WalletError) setErr(t.ux("login.wallet.rejected"));
      else if (isNotOwner(e)) setDenied(true);
      else if (e instanceof ApiError && e.code === "SIWS_NONCE_INVALID") {
        setErr(t("login.e.nonce_expired"));
        setChallenge(await siwsNonce(address).catch(() => null));
      } else setErr(errorText(t, e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-3" data-testid="wallet-flow">
      <ol className="flex items-center gap-2 text-caption text-text-tertiary" aria-label={t("walletLogin.steps", { n: step })}>
        {(["walletLogin.step1", "walletLogin.step2", "walletLogin.step3"] as const).map((k, i) => (
          <li key={k} aria-current={step === i + 1 ? "step" : undefined} className={cn("flex items-center gap-1.5", step === i + 1 && "font-medium text-text-primary")}>
            <span className={cn("num grid h-5 w-5 place-items-center rounded-full border text-[11px]", step > i + 1 ? "border-semantic-profit text-semantic-profit" : step === i + 1 ? "border-brand-primary text-brand-primary" : "border-border-default")}>{step > i + 1 ? <Check size={11} aria-hidden /> : i + 1}</span>
            {t(k)}
            {i < 2 && <span aria-hidden className="mx-1 h-px w-4 bg-border-subtle" />}
          </li>
        ))}
      </ol>
      {err && <ErrorBox text={err} />}

      {denied ? (
        <div role="alert" className="rounded-md border border-semantic-loss/50 bg-semantic-lossContainer p-4" data-testid="access-denied">
          <p className="flex items-center gap-2 font-semibold text-semantic-loss"><Lock size={16} aria-hidden /> {t("walletLogin.deniedTitle")}</p>
          <p className="mt-1 text-body text-text-secondary">{t("walletLogin.deniedBody")}</p>
          <p className="num mt-2 break-all text-caption text-text-tertiary">{address}</p>
          <Button className="mt-3 min-h-11 w-full" variant="secondary" onClick={reset}>{t("walletLogin.disconnect")}</Button>
        </div>
      ) : !address || !challenge ? (
        <CenturionButton icon={<Wallet size={16} aria-hidden />} label={t("walletLogin.connect")} busy={busy === "connect"} disabled={busy != null} onClick={connect} />
      ) : (
        <>
          <p className="flex items-center justify-between gap-2 text-caption text-text-secondary">
            <span className="num">{t("walletLogin.connected", { address: short(address) })}</span>
            <button type="button" onClick={reset} className="min-h-11 text-brand-primary hover:underline">{t("walletLogin.disconnect")}</button>
          </p>
          <div>
            <p className="text-label">{t("walletLogin.previewTitle")}</p>
            <pre className="num mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border-subtle bg-bg-sunken p-3 text-caption text-text-secondary" data-testid="siws-message">{challenge.message}</pre>
            <p className="mt-1 text-caption text-text-tertiary">{t("walletLogin.previewNote")}</p>
          </div>
          <Button variant="primary" size="lg" className="min-h-11 w-full" loading={busy === "sign"} onClick={sign}>{busy === "sign" ? t("walletLogin.signing") : t("walletLogin.sign")}</Button>
        </>
      )}
      <p className="text-caption text-semantic-profit">{t.ux("login.wallet.sign_note")}</p>
      {!real && <p className="rounded-md bg-semantic-infoContainer px-3 py-2 text-caption text-semantic-info">{t("walletLogin.mockNote")}</p>}
    </div>
  );
}

function WalletMockPanel({ wallet, setWallet, behaviour, setBehaviour }: { wallet: string; setWallet: (w: string) => void; behaviour: WalletBehaviour; setBehaviour: (b: WalletBehaviour) => void }) {
  const t = useT();
  const sel = "h-8 rounded-sm border border-border-default bg-bg-sunken px-2 text-text-primary";
  return (
    <div className="mt-4 flex w-full max-w-md flex-col gap-2 rounded-md border border-dashed border-border-default p-3 text-caption text-text-tertiary">
      <label className="flex items-center justify-between gap-2">
        <span>{t("walletLogin.mockWallet")}</span>
        <select value={wallet} onChange={(e) => setWallet(e.target.value)} className={sel} data-testid="mock-wallet">
          <option value={MOCK_OWNER_WALLET}>{t("walletLogin.mockOwner")}</option>
          <option value={MOCK_OTHER_WALLET}>{t("walletLogin.mockOther")}</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        <span>{t("walletLogin.mockBehaviour")}</span>
        <select value={behaviour} onChange={(e) => setBehaviour(e.target.value as WalletBehaviour)} className={sel}>
          {BEHAVIOURS.map((b) => <option key={b} value={b}>{t(`walletLogin.beh.${b}`)}</option>)}
        </select>
      </label>
    </div>
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
    <svg aria-hidden viewBox="0 0 420 180" className="mt-10 w-full max-w-lg">
      <rect x="1" y="1" width="418" height="178" rx="16" fill="var(--color-bg-surface)" stroke="var(--color-border-subtle)" />
      <rect x="20" y="22" width="86" height="52" rx="10" fill="var(--color-brand-primaryContainer)" />
      <rect x="118" y="22" width="86" height="52" rx="10" fill="var(--color-semantic-profitContainer)" />
      <rect x="216" y="22" width="86" height="52" rx="10" fill="var(--color-semantic-infoContainer)" />
      <rect x="314" y="22" width="86" height="52" rx="10" fill="var(--color-brand-primary)" />
      <path d="M28 128c28-30 48-28 70-6 16 16 30 8 46-14 22-30 48-26 70 6" fill="none" stroke="var(--color-brand-primary)" strokeWidth="3" strokeLinecap="round" />
      <rect x="250" y="96" width="18" height="48" rx="4" fill="var(--color-semantic-profit)" />
      <rect x="276" y="112" width="18" height="32" rx="4" fill="var(--color-semantic-loss)" />
      <rect x="302" y="88" width="18" height="56" rx="4" fill="var(--color-brand-primary)" />
      <rect x="328" y="104" width="18" height="40" rx="4" fill="var(--color-text-tertiary)" />
    </svg>
  );
}
