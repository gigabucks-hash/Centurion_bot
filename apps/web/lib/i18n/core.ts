import { createTranslator } from "next-intl";
import type uxEn from "@sentra/i18n/en.json";
import { ALIASES } from "./aliases.ts";
import type { AliasKey } from "./aliases.ts";
import type { en } from "./en.ts";

/**
 * Client-safe i18n core: types, locale list and the translator factory. No message catalogs are imported here
 * (perf: the client gets only the active locale's messages from the server layout, not both dictionaries).
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

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translator over an already-resolved message tree ({...ux, app}). Missing keys never throw; they render the key. */
export function makeT(locale: Locale, messages: Record<string, unknown>): T {
  const tr = createTranslator({ locale, messages: messages as never, onError: () => {}, getMessageFallback: ({ key, namespace }) => (namespace ? `${namespace}.${key}` : key) });
  const call = (k: string, v?: Vars) => (tr as unknown as (k: string, v?: Vars) => string)(k, v);
  const t = ((key: MessageKey, vars?: Vars) => {
    const a = (ALIASES as Record<string, string | { key: string; map: (v: Vars) => Vars }>)[key];
    if (a) return typeof a === "string" ? call(a, vars) : call(a.key, a.map(vars ?? {}));
    return call(`app.${key}`, vars);
  }) as T;
  t.ux = (key, vars) => call(key, vars);
  t.locale = locale;
  return t;
}
