import { cookies } from "next/headers";
import { createT, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale, type T } from "./index.ts";

/** Reads the locale cookie. Call inside a Suspense boundary (runtime data). */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getT(): Promise<T> {
  return createT(await getLocale());
}
