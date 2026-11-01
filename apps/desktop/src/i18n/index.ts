/**
 * Desktop i18n on top of @sentra/i18n 0.4.5 (packages/i18n, UX-owned, read-only): the package's
 * en/id ICU catalogs + format.mjs formatters, and contracts 1.1.2 errors.json v4 `messages.en|id`
 * for error text (code → key via the package's errors.map.json; registry messages as fallback). Locale = Settings.locale (default `id`); numbers are always formatted in the UI
 * language (QA-01). Lookup: package[lang] → package.en →
 * fallback key. A raw wire enum is never shown as copy.
 */
import en from "@sentra/i18n/en.json";
import id from "@sentra/i18n/id.json";
import { LOCALES, formatBps, formatFractionBps, formatLamports, formatLamportsOrDash, formatMcapUsd, formatRelativeSeconds, mcapView, pnlPct, pnlSol, quoteState, type Lang, type PnlParts } from "@sentra/i18n/format.mjs";
import errorsMap from "@sentra/i18n/errors.map.json";
import rejectMap from "@sentra/i18n/reject_reasons.map.json";
import { ERROR_CODES } from "@sentra/contracts/wire";
import { useCallback } from "react";
import { useTerm } from "../state/store";
import { formatIcu, icuArgNames, type IcuArgs } from "./icu";
import { LOCAL_TEMPLATES, MOCK_SUFFIX } from "./local";

export type { Lang, PnlParts };
export { formatBps, formatFractionBps, formatLamports, formatLamportsOrDash, formatMcapUsd, formatRelativeSeconds, LOCALES, mcapView, MOCK_SUFFIX, quoteState };

type Tree = { [k: string]: string | Tree };
const flatten = (o: Tree, p = "", out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[p + k] = v;
    else flatten(v, `${p}${k}.`, out);
  }
  return out;
};
const CAT: Record<Lang, Record<string, string>> = { en: flatten(en as Tree), id: flatten(id as Tree) };

export const I18N_PACKAGE_VERSION = "0.4.7";

function lookup(lang: Lang, key: string): string | undefined {
  // Package copy wins; LOCAL_TEMPLATES only fill keys UX has not shipped yet (reported as UX gaps).
  return CAT[lang][key] ?? CAT.en[key] ?? LOCAL_TEMPLATES[lang][key];
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

// ---- errors: i18n errors.map.json (57 errors.json v5 codes → {key, source, kind, http, retryable})
interface ErrorMapEntry { key: string; source: "copy" | "fallback"; kind: "error" | "notice" | "skip"; http: number; retryable: boolean }
const EMAP = errorsMap as unknown as { errors_json_version: number; unknown: string; codes: Record<string, ErrorMapEntry> };
/** Legacy input spelling only (pre-1.1.2 producer); never shown. */
const LEGACY: Record<string, string> = { PAPER_CASH_INSUFFICIENT: "PRACTICE_CASH_INSUFFICIENT" };
const canon = (c: string) => LEGACY[c] ?? c;
/** A code known to errors.map.json / errors.json, canonical spelling; else null. */
export const errorCode = (c: string): string | null => {
  const k = canon(c);
  return k in EMAP.codes || k in ERROR_CODES ? k : null;
};
export const errorEntry = (c: string): ErrorMapEntry | undefined => EMAP.codes[canon(c)];
/** Copy for an error / notice code: map key in the catalog → errors.json messages[lang] → map `unknown`. */
export function errorMessage(code: string, lang: Lang, args?: IcuArgs): string {
  const k = canon(code);
  const key = EMAP.codes[k]?.key;
  const copy = key ? lookup(lang, key) : undefined;
  if (copy != null) return formatIcu(copy, args, LOCALES[lang]);
  const reg = (ERROR_CODES as Record<string, { messages: Record<Lang, string> }>)[k];
  if (reg) return reg.messages[lang];
  return translate(lang, EMAP.unknown);
}
/**
 * Error text for the UI. Rust command errors are `"<CODE>: <detail>"` (error.rs); a code-shaped
 * prefix is shown with its mapped copy in the UI locale (code kept for support; an unknown code gets
 * the map's `unknown` copy), anything else as plain text.
 */
export function errorText(e: unknown, lang: Lang): string {
  const s = e instanceof Error ? e.message : String(e);
  const m = /^([A-Z][A-Z0-9_]+):\s*(.*)$/s.exec(s);
  if (!m) return s;
  return `${errorMessage(m[1], lang, errorArgs(e, lang))} (${canon(m[1])})`;
}
/** Error code of a Rust command error (`"<CODE>: …"`), canonical spelling; null if not code-shaped. */
export function errorCodeOf(e: unknown): string | null {
  const m = /^([A-Z][A-Z0-9_]+):/.exec(e instanceof Error ? e.message : String(e));
  return m ? canon(m[1]) : null;
}
/** Raw `[k=v]` detail tags (backend/mod.rs Display: next_allowed_at, retry_after_s, …). */
export function errorDetails(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of (e instanceof Error ? e.message : String(e)).matchAll(/\[([a-z_]+)=([A-Za-z0-9:.+\-]+)\]/g)) out[m[1]] = m[2];
  return out;
}
/** Copy placeholders from the detail tags; `*_at` timestamps → local date + time. */
function errorArgs(e: unknown, lang: Lang): IcuArgs {
  const out: IcuArgs = {};
  for (const [k, v] of Object.entries(errorDetails(e))) {
    const d = k.endsWith("_at") || k.endsWith("_until") ? new Date(v) : null;
    out[k] = d && !Number.isNaN(d.getTime()) ? d.toLocaleString(LOCALES[lang], { dateStyle: "medium", timeStyle: "short" }) : v;
  }
  return out;
}

// ---- wire vars (0.4.3: placeholder = wire field name). `amount_lamports` is an integer string →
// SOL text via the exact BigInt formatter, never Number(lamports); `fraction_bps` → "50%".
export function wireVars(v: Record<string, string | number | bigint | null | undefined>, lang: Lang, paper: boolean): IcuArgs {
  const out: IcuArgs = {};
  for (const [k, x] of Object.entries(v)) {
    if (x == null) continue;
    out[k] =
      k === "amount_lamports" || k.endsWith("_lamports") ? formatLamports(String(x), lang, { paper }) :
      k === "fraction_bps" ? formatFractionBps(Number(x), lang) :
      typeof x === "bigint" ? x.toString() : x;
  }
  return out;
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
  | { t: "bps"; v: number }
  | { t: "price"; v: string }
  | { t: "key"; v: string };
export interface I18nMsg { key: string; args: Record<string, I18nArg> }

const FALLBACK: [string, string][] = [["order.fail_reason.", "order.fail_reason.unknown"], ["expire_reason.", "expire_reason.timeout.badge"]];
const fallbackFor = (k: string) => FALLBACK.find(([p]) => k.startsWith(p))?.[1];

/** Render an activity message; `key` args the template does not use (e.g. a reason) are appended. */
export function renderMsg(m: I18nMsg, lang: Lang, paper: boolean): string | null {
  // Rust sends the errors.map.json key + the code: catalog copy, else errors.json messages[lang].
  const code = m.args.code?.t === "text" ? m.args.code.v : null;
  const fb = fallbackFor(m.key);
  const tmpl = lookup(lang, m.key) ?? (fb ? lookup(lang, fb) : undefined);
  if (tmpl == null) return code ? errorMessage(code, lang) : null; // else caller shows Rust's plain-text `message`
  const args: IcuArgs = {};
  for (const [k, a] of Object.entries(m.args)) {
    args[k] =
      a.t === "lamports" ? formatLamports(a.v, lang, { paper }) :
      a.t === "pnl_lamports" ? pnlText(pnlSol(a.v, lang, { paper })) :
      a.t === "key" ? translate(lang, a.v, undefined, fallbackFor(a.v)) :
      a.t === "num" ? new Intl.NumberFormat(LOCALES[lang]).format(a.v) :
      a.t === "bps" ? formatBps(a.v, lang) : // D10: fee / slippage / portion bps → % (0.4.6+ formatBps, null-safe)
      a.t === "price" ? formatPriceLocale(a.v, lang) : a.v;
  }
  const used = icuArgNames(tmpl);
  const extra = Object.keys(args).filter((k) => !used.has(k) && m.args[k].t === "key").map((k) => args[k]);
  return [formatIcu(tmpl, args, LOCALES[lang]), ...extra].join(" · ");
}

/** A decimal-string price in the UI locale (up to 6 significant digits; tiny memecoin prices stay readable). */
export const formatPriceLocale = (d: string, lang: Lang): string => {
  const n = Number(d);
  return Number.isFinite(n) ? new Intl.NumberFormat(LOCALES[lang], { maximumSignificantDigits: 6 }).format(n) : "—";
};

// ---- skip chips / reject_reason: i18n reject_reasons.map.json (contracts 1.1.3 ApprovalRejectReason)
interface SkipChip { label_key: string; reject_reason: string; reason: string | null }
const RMAP = rejectMap as unknown as { wire: Record<string, string>; skip_chips: Record<string, SkipChip>; default: string };
export const skipChip = (name: string): SkipChip | undefined => RMAP.skip_chips[name];
