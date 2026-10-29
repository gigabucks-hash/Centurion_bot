import { createTranslator } from "next-intl";
import uxEn from "../../messages/en.json" with { type: "json" };
import uxId from "../../messages/id.json" with { type: "json" };
import { ALIASES, type AliasKey } from "./aliases.ts";
import { en } from "./en.ts";
import { id } from "./id.ts";

/**
 * i18n on next-intl (ICU MessageFormat). Catalog = UX locales (messages/en.json, messages/id.json:
 * copies of /workspace/ux-solbot/locales, 313 keys) + our "app" namespace (lib/i18n/en.ts, id.ts)
 * for copy the UX catalog does not have yet. `t("approvals.approve")` resolves to the UX key via
 * lib/i18n/aliases.ts when one exists. English is the default; missing id strings fall back to en.
 */
export const LOCALES = ["en", "id"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "sentra_locale";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof en>;
export type PartialMessages = { [K in keyof Messages]?: Partial<{ [J in keyof Messages[K]]: Messages[K][J] extends string ? string : Partial<Messages[K][J]> }> };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Every app copy key, e.g. "approvals.approve" or "exitReason.stop_loss". */
export type MessageKey = Leaves<Messages> | AliasKey;
/** Every UX catalog key, e.g. "settings.section.profile". */
export type UxKey = Leaves<typeof uxEn>;
export type Vars = Record<string, string | number>;
export type T = ((key: MessageKey, vars?: Vars) => string) & { ux: (key: UxKey, vars?: Vars) => string; locale: Locale };

function deepMerge<A extends Record<string, unknown>>(base: A, over: Record<string, unknown> | undefined): A {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge((base[k] ?? {}) as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out as A;
}

const MESSAGES = {
  en: { ...uxEn, app: en },
  id: { ...deepMerge(uxEn as Record<string, unknown>, uxId as Record<string, unknown>), app: deepMerge(en as unknown as Record<string, unknown>, id as Record<string, unknown>) },
} as const;

export function messagesFor(locale: Locale) {
  return MESSAGES[locale];
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const cache = new Map<Locale, T>();
/** Translator usable on server and client (no hooks). Missing keys never throw; they render the key. */
export function createT(locale: Locale): T {
  const hit = cache.get(locale);
  if (hit) return hit;
  const tr = createTranslator({ locale, messages: MESSAGES[locale] as never, onError: () => {}, getMessageFallback: ({ key, namespace }) => (namespace ? `${namespace}.${key}` : key) });
  const call = (k: string, v?: Vars) => (tr as unknown as (k: string, v?: Vars) => string)(k, v);
  const t = ((key: MessageKey, vars?: Vars) => {
    const a = (ALIASES as Record<string, string | { key: string; map: (v: Vars) => Vars }>)[key];
    if (a) return typeof a === "string" ? call(a, vars) : call(a.key, a.map(vars ?? {}));
    return call(`app.${key}`, vars);
  }) as T;
  t.ux = (key, vars) => call(key, vars);
  t.locale = locale;
  cache.set(locale, t);
  return t;
}

/** Static English translator for code outside a request (root not-found, metadata). */
export const tEn: T = createT("en");

/** App keys present in English but missing in a locale's app namespace (used by the i18n test). */
export function missingKeys(locale: Locale): string[] {
  const out: string[] = [];
  const dict = locale === "en" ? en : id;
  const get = (o: unknown, path: string[]) => path.reduce<unknown>((c, p) => (c as Record<string, unknown> | undefined)?.[p], o);
  const walk = (o: Record<string, unknown>, p: string[]) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") {
        if (typeof get(dict, [...p, k]) !== "string" && !(([...p, k].join(".")) in ALIASES)) out.push([...p, k].join("."));
      } else walk(v as Record<string, unknown>, [...p, k]);
    }
  };
  walk(en as unknown as Record<string, unknown>, []);
  return out;
}
