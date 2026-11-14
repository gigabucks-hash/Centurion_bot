import { cookies } from "next/headers";
import { createFmt, type Fmt } from "../format.ts";
import type { TradingMode } from "../types.ts";
import { createT, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale, type T } from "./index.ts";
import { LEGACY_LOCALE_COOKIE } from "../legacy-storage.ts";

/** Reads the locale cookie. Call inside a Suspense boundary (runtime data). */
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  // Pre-rename cookie as a read-only fallback until the user changes the locale again.
  const v = c.get(LOCALE_COOKIE)?.value ?? c.get(LEGACY_LOCALE_COOKIE)?.value;
  const fallback: Locale = process.env.CENTURION_LOCAL === "1" && process.env.DATA_SOURCE !== "http" ? "id" : DEFAULT_LOCALE;
  return isLocale(v) ? v : fallback;
}

export async function getT(): Promise<T> {
  return createT(await getLocale());
}

/** Locale + mode bound formatter for server components (inside Suspense). */
export async function getFmt(mode: TradingMode = "practice"): Promise<Fmt> {
  return createFmt(await getLocale(), mode);
}
