import uxEn from "@sentra/i18n/en.json" with { type: "json" };
import uxId from "@sentra/i18n/id.json" with { type: "json" };
import { ALIASES } from "./aliases.ts";
import { en } from "./en.ts";
import { id } from "./id.ts";

/**
 * i18n on next-intl (ICU MessageFormat). Catalog = @sentra/i18n 0.4.1 (packages/i18n en.json, id.json:
 * workspace dependency, 398 keys) + our "app" namespace (lib/i18n/en.ts, id.ts)
 * for copy the UX catalog does not have yet. `t("approvals.approve")` resolves to the UX key via
 * lib/i18n/aliases.ts when one exists. English is the default; missing id strings fall back to en.
 */
export * from "./core.ts";
import { makeT, type Locale, type T } from "./core.ts";

function deepMerge<A extends Record<string, unknown>>(base: A, over: Record<string, unknown> | undefined): A {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge((base[k] ?? {}) as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out as A;
}

// Our dictionary lives under "app", which is also a UX namespace since i18n 0.4.7 (app.name/title/splash/about):
// merge the UX app.* leaves underneath ours (no key overlap; checked by the i18n test) so t.ux("app.name") resolves.
const uxIdAll = deepMerge(uxEn as Record<string, unknown>, uxId as Record<string, unknown>);
const MESSAGES = {
  en: { ...uxEn, app: deepMerge(uxEn.app as unknown as Record<string, unknown>, en as unknown as Record<string, unknown>) },
  id: { ...uxIdAll, app: deepMerge(uxIdAll.app as Record<string, unknown>, deepMerge(en as unknown as Record<string, unknown>, id as Record<string, unknown>)) },
} as const;

export function messagesFor(locale: Locale) {
  return MESSAGES[locale];
}

const cache = new Map<Locale, T>();
/** Translator usable on server and client (no hooks). Missing keys never throw; they render the key. */
export function createT(locale: Locale): T {
  const hit = cache.get(locale);
  if (hit) return hit;
  const t = makeT(locale, MESSAGES[locale] as unknown as Record<string, unknown>);
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
