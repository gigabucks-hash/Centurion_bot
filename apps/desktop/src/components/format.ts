import { formatMcapUsd } from "@centurion/i18n/format.mjs";
import { lamportsToSol, type DecimalString, type Lamports } from "../api";
/** WebKitGTK may report navigator.language = "C" (POSIX locale) which Intl rejects. */
export const safeLocale = (() => {
  try {
    return Intl.getCanonicalLocales(navigator.language)[0] ?? "id-ID";
  } catch {
    return "id-ID";
  }
})();

export const fmtUsd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
export const fmtPrice = (n: number) => (n < 0.01 ? n.toExponential(3) : n.toFixed(4));
// PnL display = @centurion/i18n format.mjs pnlSol / pnlPct (T-15: exact zero "0.00" neutral, no arrow) — see src/i18n.
export const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString(safeLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fmtMmSs = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export const shortMint = (m: string) => `${m.slice(0, 4)}…${m.slice(-4)}`;

// ---- wire value formatting (lamports = integer strings, prices = decimal strings)

const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** Decimal-string price for display: "0.0000002134" → "0.0₆2134" (string ops, no float rounding). */
export const fmtPriceDec = (d: DecimalString | null | undefined) => {
  if (!d) return "—";
  const m = /^(-?)0\.(0+)(\d+)$/.exec(d);
  if (m && m[2].length >= 3) return `${m[1]}0.0${String(m[2].length).split("").map((c) => SUB[+c]).join("")}${m[3].slice(0, 4)}`;
  const [i, f = ""] = d.split(".");
  return f ? `${i}.${f.slice(0, 6)}` : i;
};
/** Lamports → "0,25" (2 decimal places, BigInt, no float). */
export const fmtSol = (l: Lamports | null | undefined) => {
  if (l == null) return "—";
  const s = lamportsToSol(l, 2);
  const [i, f = ""] = s.split(".");
  return `${i},${(f + "00").slice(0, 2)}`;
};

/** Compact USD in the UI locale: "$48.2K" (en) / "$48,2 rb" (id). Always a leading "$". */
export const fmtUsdLocale = (n: number, lang: "id" | "en") => formatMcapUsd(n, lang);
