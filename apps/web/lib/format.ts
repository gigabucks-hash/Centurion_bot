/**
 * Number/date formatting (QA-01). Every value goes through the UX reference formatters in
 * @centurion/i18n/format (packages/i18n 0.4.0 format.mjs, workspace dependency; no local copy), bound to the UI
 * locale (en → en-US, id → id-ID) and the mode (Practice amounts read "paper SOL"). No component
 * hardcodes a number locale. Get a formatter with useFmt() (client) or getFmt(mode) (server).
 */
import { solToLamports } from "./contracts";
import { formatCompact, formatCountdown, formatDateTime, formatInt, formatLamports, formatPct, formatSol, formatSolVar, formatTime, formatUsd, LOCALES } from "@centurion/i18n/format";
import type { Locale } from "./i18n/index.ts";
import type { TradingMode } from "./types.ts";

export const TZ = "Asia/Jakarta";
const NBSP = "\u00A0";

export type Fmt = ReturnType<typeof build>;

const cache = new Map<string, Fmt>();
export function createFmt(locale: Locale, mode: TradingMode = "practice"): Fmt {
  const key = `${locale}:${mode}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = build(locale, mode)));
  return f;
}

function build(locale: Locale, mode: TradingMode) {
  const loc = locale;
  const tag = LOCALES[locale];
  const paper = mode === "practice";
  const f = {
    locale,
    mode,
    /** Absolute value, fixed decimals (callers add arrows/signs). */
    num: (n: number, digits = 2, minDigits = digits) => new Intl.NumberFormat(tag, { minimumFractionDigits: minDigits, maximumFractionDigits: digits }).format(Math.abs(n)),
    /** SOL amount via formatSol: "27.53 paper SOL" / "−0.066 SOL". `sign` → pnl kind (+/−). `unit:false` drops the unit. */
    sol: (n: number, o: { sign?: boolean; unit?: boolean } = {}) => {
      const s = formatSol(n, loc, { kind: o.sign ? "pnl" : "amount", paper });
      return o.unit === false ? s.replace(/\u00A0(paper )?SOL$/, "") : s;
    },
    /** Wire lamport string ("250000000") → "0.25 SOL" (exact BigInt split in format.mjs). */
    lamports: (l: string, o: { sign?: boolean } = {}) => formatLamports(l, loc, { kind: o.sign ? "pnl" : "amount", paper }),
    /**
     * i18n 0.4.3 `{amount_lamports}` var: a UI SOL number → lamport string → formatLamports(v, locale, {paper}).
     * The var carries formatted SOL text, never raw lamports.
     */
    amount: (sol: number) => formatLamports(solToLamports(sol), loc, { kind: "amount", paper }),
    /** Wire decimal string ("0.25") → SOL text. */
    solVar: (s: string, o: { sign?: boolean } = {}) => formatSolVar(s, loc, { kind: o.sign ? "pnl" : "amount", paper }),
    /** Percent from a percentage number (8.4 → "+8.4%"). */
    pct: (n: number, digits = 1, sign = true) => formatPct(n / 100, loc, { signed: sign, dp: digits }),
    int: (n: number) => formatInt(n, loc),
    usd: (n: number) => formatUsd(n, loc),
    compact: (n: number) => formatCompact(n, loc),
    /** Time of day in WIB (12 h in en, 24 h in id). */
    time: (ts: number) => formatTime(ts, loc, TZ),
    /** Date + time with zone ("Oct 29, 3:04 PM GMT+7"). */
    dateTime: (ts: number) => formatDateTime(ts, loc, TZ),
    /** Day + month only ("Oct 29" / "29 Okt"). */
    day: (ts: number) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: TZ }).format(ts),
    /** Compact duration, never wraps (NBSP). */
    duration: (seconds: number) => {
      const u = locale === "id" ? { s: "dtk", m: "mnt", h: "j" } : { s: "s", m: "m", h: "h" };
      const sp = locale === "id" ? NBSP : "";
      if (seconds < 60) return `${seconds}${sp}${u.s}`;
      const m = Math.floor(seconds / 60);
      if (m < 60) return `${m}${sp}${u.m}${NBSP}${String(seconds % 60).padStart(2, "0")}${sp}${u.s}`;
      return `${Math.floor(m / 60)}${sp}${u.h}${NBSP}${m % 60}${sp}${u.m}`;
    },
    countdown: fmtCountdown,
    /** Re-formats a canonical diff value ("12.5 SOL", "40%", "1500") in the UI locale; other text passes through. */
    value: (raw: string) => {
      // eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested quantifiers (linear); inputs are short app strings
      const m = /^(-?\d+(?:\.\d+)?)(%| .+)?$/.exec(raw);
      if (!m) return raw;
      const n = Number(m[1]);
      const num = new Intl.NumberFormat(tag, { maximumFractionDigits: 6 }).format(n).replace("-", "\u2212");
      const unit = m[2] === "%" ? "%" : m[2] ? `${NBSP}${m[2].trim() === "SOL" && paper ? "paper SOL" : m[2].trim()}` : "";
      return num + unit;
    },
  };
  return f;
}

/** mm:ss (h:mm:ss past an hour) from a server-clock difference. Digits + colon, not localized. */
export function fmtCountdown(ms: number): string {
  if (ms < 3_600_000) return formatCountdown(ms);
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}
