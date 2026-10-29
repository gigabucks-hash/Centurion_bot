/**
 * Desktop i18n on top of @sentra/i18n 0.4.2 (packages/i18n, UX-owned, read-only): the package's
 * en/id ICU catalogs + format.mjs formatters, and contracts 1.1.2 errors.json v4 `messages.en|id`
 * for error text. Locale = Settings.locale (default `id`); numbers are always formatted in the UI
 * language (QA-01). Lookup: package[lang] → desktop-local[lang] → package.en → desktop-local.en →
 * fallback key. A raw wire enum is never shown as copy.
 */
import en from "@sentra/i18n/en.json";
import id from "@sentra/i18n/id.json";
import { LOCALES, formatLamports, pnlPct, pnlSol, type Lang, type PnlParts } from "@sentra/i18n/format.mjs";
import { ERROR_CODES, type ErrorCode } from "@sentra/contracts/wire";
import { useCallback } from "react";
import { useTerm } from "../state/store";
import { formatIcu, icuArgNames, type IcuArgs } from "./icu";
import { LOCAL } from "./local";

export type { Lang, PnlParts };
export { formatLamports, LOCALES };

type Tree = { [k: string]: string | Tree };
const flatten = (o: Tree, p = "", out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[p + k] = v;
    else flatten(v, `${p}${k}.`, out);
  }
  return out;
};
const CAT: Record<Lang, Record<string, string>> = { en: flatten(en as Tree), id: flatten(id as Tree) };

export const I18N_PACKAGE_VERSION = "0.4.2";

function lookup(lang: Lang, key: string): string | undefined {
  return CAT[lang][key] ?? LOCAL[lang][key] ?? CAT.en[key] ?? LOCAL.en[key];
}
/** Translate `key`; `fallback` key (e.g. `order.fail_reason.unknown`) if missing, else the key itself. */
export function translate(lang: Lang, key: string, args?: IcuArgs, fallback?: string): string {
  const msg = lookup(lang, key) ?? (fallback ? lookup(lang, fallback) : undefined);
  return msg == null ? key : formatIcu(msg, args, LOCALES[lang]);
}

export const useLang = (): Lang => useTerm((s) => s.settings.locale ?? "id");
export type T = (key: string, args?: IcuArgs, fallback?: string) => string;
export function useT(): T {
  const lang = useLang();
  return useCallback<T>((k, a, f) => translate(lang, k, a, f), [lang]);
}

// ---- errors (errors.json v4: kind error|notice|skip, messages.en|id)
const RENAMED: Record<string, ErrorCode> = { PAPER_CASH_INSUFFICIENT: "PRACTICE_CASH_INSUFFICIENT" };
export const errorCode = (c: string): ErrorCode | null => {
  const k = (RENAMED[c] ?? c) as ErrorCode;
  return k in ERROR_CODES ? k : null;
};
/**
 * Error text for the UI. Rust command errors are `"<CODE>: <detail>"` (error.rs); a known code is
 * shown with its errors.json message in the UI locale (code kept for support), else the plain text.
 */
export function errorText(e: unknown, lang: Lang): string {
  const s = e instanceof Error ? e.message : String(e);
  const m = /^([A-Z][A-Z0-9_]+):\s*(.*)$/s.exec(s);
  const code = m && errorCode(m[1]);
  if (!code) return s;
  return `${ERROR_CODES[code].messages[lang]} (${code})`;
}

// ---- PnL (T-15: exact zero = "0.00" neutral, no arrow/sign; non-zero signed + arrow + tone)
export const TONE_CLASS: Record<PnlParts["tone"], string> = { profit: "pos", loss: "neg", neutral: "muted" };
export const pnlLamports = (l: string | null | undefined, lang: Lang, paper: boolean): PnlParts | null =>
  l == null ? null : pnlSol(l, lang, { paper });
/** `pct` is a percent number (12.5 = 12.5 %); format.mjs takes a ratio. */
export const pnlPercent = (pct: number | null | undefined, lang: Lang): PnlParts | null => (pct == null ? null : pnlPct(pct / 100, lang));
export const pnlText = (p: PnlParts | null) => (p ? (p.arrow ? `${p.arrow} ${p.text}` : p.text) : "—");
/** Amount in SOL (Practice → "paper SOL"). */
export const solText = (l: string | null | undefined, lang: Lang, paper: boolean) => (l == null ? "—" : formatLamports(l, lang, { paper }));

// ---- structured activity text from Rust (view.rs I18nMsg)
export type I18nArg =
  | { t: "text"; v: string }
  | { t: "lamports"; v: string }
  | { t: "pnl_lamports"; v: string }
  | { t: "num"; v: number }
  | { t: "key"; v: string };
export interface I18nMsg { key: string; args: Record<string, I18nArg> }

const FALLBACK: [string, string][] = [["order.fail_reason.", "order.fail_reason.unknown"], ["expire_reason.", "expire_reason.timeout.badge"]];
const fallbackFor = (k: string) => FALLBACK.find(([p]) => k.startsWith(p))?.[1];

/** Render an activity message; `key` args the template does not use (e.g. a reason) are appended. */
export function renderMsg(m: I18nMsg, lang: Lang, paper: boolean): string | null {
  // error.code.* notices: errors.json v4 messages are the registry text
  if (m.key.startsWith("error.code.")) {
    const code = errorCode(m.key.slice(11).toUpperCase());
    if (code) return ERROR_CODES[code].messages[lang];
  }
  const fb = fallbackFor(m.key);
  const tmpl = lookup(lang, m.key) ?? (fb ? lookup(lang, fb) : undefined);
  if (tmpl == null) return null; // caller shows Rust's plain-text `message`
  const args: IcuArgs = {};
  for (const [k, a] of Object.entries(m.args)) {
    args[k] =
      a.t === "lamports" ? formatLamports(a.v, lang, { paper }) :
      a.t === "pnl_lamports" ? pnlText(pnlSol(a.v, lang, { paper })) :
      a.t === "key" ? translate(lang, a.v, undefined, fallbackFor(a.v)) :
      a.t === "num" ? new Intl.NumberFormat(LOCALES[lang]).format(a.v) : a.v;
  }
  const used = icuArgNames(tmpl);
  const extra = Object.keys(args).filter((k) => !used.has(k) && m.args[k].t === "key").map((k) => args[k]);
  return [formatIcu(tmpl, args, LOCALES[lang]), ...extra].join(" · ");
}
