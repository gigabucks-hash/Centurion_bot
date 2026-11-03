/**
 * PnL sign → tone + arrow (UX SPEC §1). Pure; shared by feed rows, coin trail and chips.
 * Rule: a loss is NEVER rendered with the profit token, and colour is never the only signal
 * (always paired with ▲/▼ and +/− in the text).
 */
import { pnlPct, pnlSol, type PnlOut } from "@centurion/i18n/format";

export type PnlTone = "profit" | "loss" | "neutral";

// eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested quantifiers (linear); inputs are short app strings
const DECIMAL = /^([+\-\u2212])?(\d+)(?:\.(\d*))?$/;

/**
 * Exact sign of a wire decimal / lamport string, no float parsing: "0", "0.00", "-0.00", "+0", "−0" → 0;
 * "0.0001" → 1; "-12.5" → -1. Anything that is not a plain decimal (exponent, NaN, empty) → null.
 */
export function decimalSign(s: string): -1 | 0 | 1 | null {
  const m = DECIMAL.exec(s.trim());
  if (!m) return null;
  const nonZero = /[1-9]/.test(m[2]) || /[1-9]/.test(m[3] ?? "");
  if (!nonZero) return 0;
  return m[1] === "-" || m[1] === "\u2212" ? -1 : 1;
}

/** Sign of a number or decimal string. Numbers: only an exact 0 (or -0) is zero — no epsilon. */
export function signOf(v: number | string | null | undefined): -1 | 0 | 1 | null {
  if (v == null) return null;
  if (typeof v === "string") return decimalSign(v);
  if (!Number.isFinite(v)) return null;
  return v === 0 ? 0 : v > 0 ? 1 : -1;
}

export function pnlTone(v: number | string | null | undefined): PnlTone {
  const s = signOf(v);
  return s === 1 ? "profit" : s === -1 ? "loss" : "neutral";
}

export function pnlArrow(v: number | string | null | undefined): "▲" | "▼" | "" {
  const t = pnlTone(v);
  return t === "profit" ? "▲" : t === "loss" ? "▼" : "";
}

/**
 * Shared PnL display (T-15) = the package helpers `pnlSol()` / `pnlPct()` from @centurion/i18n/format, unchanged:
 * exact zero → "0.00" neutral, no arrow/sign; non-zero → ▲/▼ + +/− + tone, tiny values "<0.000001" (never "0").
 * Inputs: `lamports` (wire string, exact), `sol` (number or decimal string), `pct` (percentage number, 8.4 = 8.4%).
 */
export function pnlDisplay(v: { lamports: string } | { sol: number | string } | { pct: number }, locale: "en" | "id", o: { paper?: boolean; unit?: boolean; dp?: number } = {}): PnlOut {
  const out = "pct" in v
    ? pnlPct(v.pct / 100, locale, { dp: o.dp ?? 1 })
    : "lamports" in v
      ? pnlSol(v.lamports, locale, { paper: o.paper })
      : pnlSol(typeof v.sol === "string" ? (decimalSign(v.sol) === 0 ? 0 : Number(v.sol)) : v.sol, locale, { paper: o.paper });
  return o.unit === false ? { ...out, text: out.text.replace(/\u00A0(paper )?SOL$/, "") } : out;
}

export const PNL_TEXT_CLASS: Record<PnlTone, string> = {
  profit: "text-semantic-profit",
  loss: "text-semantic-loss",
  neutral: "text-semantic-neutralPnl",
};

/**
 * The value an activity title is coloured by. For sells this is the % shown in the
 * title (that leg's move), falling back to the position PnL. Other kinds are neutral.
 */
export function eventSignValue(e: { kind: string; pctChange?: number; pnlSol?: number }): number | null {
  if (e.kind !== "sold") return null;
  return e.pctChange ?? e.pnlSol ?? null;
}
