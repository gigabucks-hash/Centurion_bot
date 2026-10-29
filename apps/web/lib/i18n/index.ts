import { en } from "./en.ts";
import { id } from "./id.ts";

/** Lightweight typed dictionary i18n (no runtime dependency). English is the default. */
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
/** Every valid copy key, e.g. "approvals.approve" or "exitReason.stop_loss". */
export type MessageKey = Leaves<Messages>;
export type Vars = Record<string, string | number>;
export type T = (key: MessageKey, vars?: Vars) => string;

const DICTS: Record<Locale, PartialMessages> = { en, id };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

function lookup(dict: unknown, key: string): string | undefined {
  // Keys are "section.rest" where rest may itself contain dots (e.g. field."sizing.budgetSol").
  const dot = key.indexOf(".");
  const section = (dict as Record<string, Record<string, unknown>> | undefined)?.[key.slice(0, dot)];
  if (!section) return undefined;
  const rest = key.slice(dot + 1);
  if (typeof section[rest] === "string") return section[rest] as string;
  let cur: unknown = section;
  for (const part of rest.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return typeof cur === "string" ? cur : undefined;
}

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Returns a translator; missing keys fall back to English, then to the key itself. */
export function createT(locale: Locale): T {
  const dict = DICTS[locale];
  return (key, vars) => interpolate(lookup(dict, key) ?? lookup(en, key) ?? key, vars);
}

/** Static English translator for code outside a request (e.g. mock server errors, metadata). */
export const tEn: T = createT("en");

/** Keys present in English but missing in a locale (used by the i18n test). */
export function missingKeys(locale: Locale): string[] {
  const out: string[] = [];
  const walk = (o: Record<string, unknown>, p: string) => {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? `${p}.${k}` : k;
      if (typeof v === "string") {
        if (lookup(DICTS[locale], key) === undefined) out.push(key);
      } else walk(v as Record<string, unknown>, key);
    }
  };
  walk(en as unknown as Record<string, unknown>, "");
  return out;
}
