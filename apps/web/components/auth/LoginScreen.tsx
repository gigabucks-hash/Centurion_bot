"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Lock, Mail, Wallet } from "lucide-react";
import { fmtCountdown } from "@/lib/format";
import { Button, cn } from "@/components/ui";
import { Dialog, useNow } from "@/components/ui/client";

/**
 * MOCK login UI (SPEC §5). Nothing here talks to an IdP, wallet or mail server.
 * - IdP buttons simulate OAuth / Telegram outcomes (incl. edge cases via the mock scenario picker).
 * - Email OTP: 6 digits, TTL 10 min, max 5 attempts → 15 min lock, resend after 60 s. Mock code: 123456.
 * - Wallet: shows the Sign-In With Solana message preview; signing is simulated. No window.solana access.
 * Only a non-secret "signed in via <method>" marker cookie is set.
 */

type Method = "google" | "apple" | "telegram" | "email_otp" | "wallet_siws";
type Scenario = "success" | "popup_blocked" | "idp_cancelled" | "telegram_invalid" | "wallet_missing" | "sign_rejected" | "nonce_expired" | "account_disabled" | "offline";
const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "success", label: "Success (new account)" },
  { id: "popup_blocked", label: "Popup blocked" },
  { id: "idp_cancelled", label: "Provider cancelled" },
  { id: "telegram_invalid", label: "Telegram hash invalid" },
  { id: "wallet_missing", label: "Wallet not installed" },
  { id: "sign_rejected", label: "Signature rejected" },
  { id: "nonce_expired", label: "Nonce expired" },
  { id: "account_disabled", label: "Account disabled" },
  { id: "offline", label: "Offline" },
];
const ERR: Partial<Record<Scenario, string>> = {
  popup_blocked: "The sign-in popup was blocked. Allow popups for this site and try again.",
  idp_cancelled: "Sign-in was cancelled. You can try again or pick another method.",
  telegram_invalid: "Telegram couldn't verify this login (invalid hash). Please try again.",
  wallet_missing: "No Solana wallet found. Install Phantom, Solflare or Backpack, or use another method.",
  sign_rejected: "You declined the signature request. Nothing was signed.",
  nonce_expired: "This sign-in request expired (5 min). Start again to get a fresh message.",
  account_disabled: "This account is disabled. Contact support.",
  offline: "You're offline. Check your connection and try again.",
};
const MOCK_CODE = "123456";
const OTP_TTL = 10 * 60_000;
const RESEND_AFTER = 60_000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

export function LoginScreen() {
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("success");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Method | null>(null);
  const [step, setStep] = useState<"choose" | "otp">("choose");
  const [email, setEmail] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);

  const fail = (methodScenarios: Scenario[]) => {
    if (scenario === "offline" || scenario === "account_disabled" || methodScenarios.includes(scenario)) {
      setError(ERR[scenario] ?? "Something went wrong.");
      return true;
    }
    return false;
  };

  async function complete(method: Method) {
    setBusy(method);
    setError(null);
    await new Promise((r) => setTimeout(r, 500));
    const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method }) });
    setBusy(null);
    if (!res.ok) return setError("Sign-in failed (mock).");
    router.push("/welcome");
  }

  const idp = (method: Method, relevant: Scenario[]) => () => {
    setError(null);
    if (fail(relevant)) return;
    complete(method);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="hidden flex-col border-r border-border-subtle bg-bg-surface p-10 lg:flex">
        <p className="text-title">◆ Sentra <span className="text-caption text-text-tertiary">(working name)</span></p>
        <h1 className="mt-auto text-display text-text-primary">A calm Solana trading bot, with risk always in view.</h1>
        <ul className="mt-6 flex flex-col gap-2 text-body text-text-secondary">
          <li className="flex gap-2"><Check size={16} className="mt-0.5 text-semantic-profit" /> Start in Practice: 30 paper SOL, no wallet needed</li>
          <li className="flex gap-2"><Check size={16} className="mt-0.5 text-semantic-profit" /> Guards and the approval queue protect every buy</li>
          <li className="flex gap-2"><Check size={16} className="mt-0.5 text-semantic-profit" /> Real SOL only after a custody wallet + 2FA</li>
        </ul>
        <FauxDashboard />
      </section>

      <section className="flex flex-col items-center justify-center p-4 sm:p-10">
        <div className="mb-6 text-title lg:hidden">◆ Sentra</div>
        <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-surface p-6 shadow-e2 sm:p-8">
          {step === "choose" ? (
            <>
              <h2 className="text-title">Sign in or create an account</h2>
              <p className="mt-1 text-body text-text-secondary">One account, many sign-in methods. You can link more later.</p>
              {error && <ErrorBox text={error} />}
              <div className="mt-5 flex flex-col gap-3">
                <IdpButton glyph="G" label="Continue with Google" busy={busy === "google"} onClick={idp("google", ["popup_blocked", "idp_cancelled"])} />
                <IdpButton glyph="A" label="Continue with Apple" busy={busy === "apple"} onClick={idp("apple", ["popup_blocked", "idp_cancelled"])} />
                <IdpButton glyph="✈" label="Continue with Telegram" busy={busy === "telegram"} onClick={idp("telegram", ["telegram_invalid", "idp_cancelled", "popup_blocked"])} />
              </div>
              <Divider />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
                  if (fail([])) return;
                  setStep("otp");
                }}
              >
                <label htmlFor="email" className="mb-1 block text-label text-text-secondary">Email</label>
                <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-12 w-full rounded-md border border-border-default bg-bg-inset px-3 text-bodyLg outline-none focus:outline-2 focus:outline-border-focus" />
                <Button type="submit" variant="primary" size="lg" className="mt-3 w-full"><Mail size={16} /> Send 6-digit code</Button>
              </form>
              <Divider />
              <Button
                size="lg"
                variant="secondary"
                className="w-full border-brand-primary"
                onClick={() => {
                  setError(null);
                  if (fail(["wallet_missing"])) return;
                  setWalletOpen(true);
                }}
              >
                <Wallet size={16} /> Connect Solana wallet
              </Button>
              <p className="mt-2 text-caption text-text-tertiary">Phantom · Solflare · Backpack · Mobile Wallet Adapter</p>
              <p className="text-caption text-semantic-profit">You will sign a message (not a transaction, no fee).</p>
              <p className="mt-6 text-caption text-text-tertiary">By signing in you agree to the Terms and Privacy Policy.</p>
              <p className="mt-2 text-label text-mode-practice">New accounts always start in PRACTICE mode.</p>
            </>
          ) : (
            <OtpStep email={email} onBack={() => setStep("choose")} onSuccess={() => complete("email_otp")} busy={busy === "email_otp"} />
          )}
        </div>
        <MockPanel scenario={scenario} setScenario={setScenario} />
      </section>

      <SiwsDialog
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onSigned={() => {
          setWalletOpen(false);
          if (scenario === "sign_rejected" || scenario === "nonce_expired") return setError(ERR[scenario]!);
          complete("wallet_siws");
        }}
      />
    </div>
  );
}

function IdpButton({ glyph, label, onClick, busy }: { glyph: string; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <Button size="lg" variant="secondary" className="relative w-full" onClick={onClick} loading={busy}>
      <span className="absolute left-4 grid h-6 w-6 place-items-center rounded-full border border-border-default text-caption font-semibold" aria-hidden>{glyph}</span>
      {label}
    </Button>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-caption text-text-tertiary">
      <span className="h-px flex-1 bg-border-subtle" /> or <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-semantic-loss/50 bg-semantic-lossContainer px-3 py-2 text-body text-semantic-loss">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {text}
    </p>
  );
}

function OtpStep({ email, onBack, onSuccess, busy }: { email: string; onBack: () => void; onSuccess: () => void; busy: boolean }) {
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const now = useNow(1000) ?? sentAt;
  const expired = now - sentAt > OTP_TTL;
  const locked = lockedUntil != null && now < lockedUntil;
  const canResend = now - sentAt >= RESEND_AFTER && !locked;

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const submit = (code: string) => {
    if (locked || expired) return;
    if (code === MOCK_CODE) return onSuccess();
    const n = attempts + 1;
    setAttempts(n);
    setDigits(Array(6).fill(""));
    refs.current[0]?.focus();
    if (n >= MAX_ATTEMPTS) {
      setLockedUntil(now + LOCK_MS);
      setErr("Too many attempts. Locked for 15 minutes.");
    } else setErr(`Wrong code. ${MAX_ATTEMPTS - n} attempt${MAX_ATTEMPTS - n === 1 ? "" : "s"} left.`);
  };

  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      // paste
      const next = clean.slice(0, 6).split("");
      const filled = [...next, ...Array(6 - next.length).fill("")];
      setDigits(filled);
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
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary"><ArrowLeft size={14} /> Other methods</button>
      <h2 className="text-title">Enter the 6-digit code</h2>
      <p className="mt-1 text-body text-text-secondary">Sent to <b className="text-text-primary">{email}</b>. It expires in <span className={cn("num", OTP_TTL - (now - sentAt) < 120_000 && "text-semantic-loss")}>{fmtCountdown(OTP_TTL - (now - sentAt))}</span>.</p>
      <p className="mt-2 rounded-md bg-semantic-infoContainer px-3 py-2 text-caption text-semantic-info">Mock build: no email is sent. Use code <span className="num font-semibold">123456</span>.</p>
      {err && <ErrorBox text={err} />}
      {expired && <ErrorBox text="This code expired. Request a new one." />}
      <fieldset className="mt-5" disabled={locked || expired || busy}>
        <legend className="sr-only">One-time code</legend>
        <div className="flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              value={d}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              maxLength={6}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
              className="num h-14 w-full min-w-0 rounded-md border border-border-default bg-bg-inset text-center text-numLg outline-none focus:outline-2 focus:outline-border-focus disabled:opacity-50"
            />
          ))}
        </div>
      </fieldset>
      {locked && <p className="mt-3 flex items-center gap-1.5 text-caption text-semantic-loss"><Lock size={12} /> Try again in <span className="num">{fmtCountdown((lockedUntil ?? 0) - now)}</span></p>}
      <div className="mt-4 flex items-center justify-between text-caption">
        <span className="num text-text-tertiary">Attempts {attempts}/{MAX_ATTEMPTS}</span>
        <button
          disabled={!canResend}
          onClick={() => {
            setSentAt(Date.now());
            setErr(null);
            setDigits(Array(6).fill(""));
          }}
          className="text-brand-primary disabled:text-text-disabled"
        >
          {canResend ? "Resend code" : `Resend in ${fmtCountdown(RESEND_AFTER - (now - sentAt))}`}
        </button>
      </div>
    </>
  );
}

function SiwsDialog({ open, onClose, onSigned }: { open: boolean; onClose: () => void; onSigned: () => void }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ nonce: string; issuedAt: string; exp: string; domain: string } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const issued = new Date();
      setMsg({ nonce: crypto.randomUUID().replace(/-/g, "").slice(0, 16), issuedAt: issued.toISOString(), exp: new Date(issued.getTime() + 5 * 60_000).toISOString(), domain: window.location.host });
      setWallet(null);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Sign in with Solana" initialFocusRef={cancelRef}>
      {!wallet ? (
        <>
          <p className="text-body text-text-secondary">Choose a wallet. (Mock: no wallet extension is contacted.)</p>
          <div className="mt-4 grid gap-2">
            {["Phantom", "Solflare", "Backpack", "Mobile Wallet Adapter"].map((w) => (
              <Button key={w} variant="secondary" size="lg" onClick={() => setWallet(w)}>{w}</Button>
            ))}
          </div>
          <Button ref={cancelRef} variant="ghost" className="mt-3 w-full" onClick={onClose}>Cancel</Button>
        </>
      ) : (
        <>
          <p className="text-body text-text-secondary">{wallet} will ask you to sign this message. It is <b>not a transaction</b> and costs no fee.</p>
          <pre className="num mt-3 whitespace-pre-wrap rounded-md border border-border-subtle bg-bg-inset p-3 text-caption text-text-secondary">
{`${msg?.domain} wants you to sign in with your Solana account:
<your wallet address>

Sign in to Sentra. This does not move any funds.

URI: https://${msg?.domain}
Version: 1
Nonce: ${msg?.nonce} (single use)
Issued At: ${msg?.issuedAt}
Expiration Time: ${msg?.exp}`}
          </pre>
          <p className="mt-2 text-caption text-text-tertiary">The sign-in wallet is separate from any trading (custody) wallet.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button ref={cancelRef} variant="secondary" size="lg" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="lg" onClick={onSigned}>Simulate signature</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function MockPanel({ scenario, setScenario }: { scenario: Scenario; setScenario: (s: Scenario) => void }) {
  return (
    <div className="mt-4 w-full max-w-md rounded-md border border-dashed border-border-default p-3 text-caption text-text-tertiary">
      <label className="flex items-center justify-between gap-2">
        <span>Mock scenario (for UX review)</span>
        <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)} className="h-8 rounded-sm border border-border-default bg-bg-inset px-2 text-text-primary">
          {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
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
