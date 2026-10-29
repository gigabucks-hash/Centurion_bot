import { cookies } from "next/headers";
import { createFmt, type Fmt } from "../format.ts";
import type { TradingMode } from "../types.ts";
import { createT, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale, type T } from "./index.ts";

/** Reads the locale cookie. Call inside a Suspense boundary (runtime data). */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getT(): Promise<T> {
  return createT(await getLocale());
}

/** Locale + mode bound formatter for server components (inside Suspense). */
export async function getFmt(mode: TradingMode = "practice"): Promise<Fmt> {
  return createFmt(await getLocale(), mode);
}
