"use client";
import { NextIntlClientProvider } from "next-intl";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createFmt, type Fmt } from "../format";
import type { TradingMode } from "../types";
import { DEFAULT_LOCALE, makeT, type Locale, type T } from "./core";

const Ctx = createContext<{ locale: Locale; t: T; f: Fmt }>({ locale: DEFAULT_LOCALE, t: makeT(DEFAULT_LOCALE, {}), f: createFmt(DEFAULT_LOCALE) });

/**
 * next-intl provider (for useTranslations) + our typed t() and the locale/mode-bound formatter.
 * Perf: `messages` = only the active locale's resolved catalog, passed from the server layout, so the client
 * bundle never contains the en + id dictionaries.
 */
export function I18nProvider({ locale, messages, mode = "practice", children }: { locale: Locale; messages: Record<string, unknown>; mode?: TradingMode; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale, messages), f: createFmt(locale, mode) }), [locale, messages, mode]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages as never} timeZone="Asia/Jakarta" onError={() => {}}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </NextIntlClientProvider>
  );
}

export function useT(): T {
  return useContext(Ctx).t;
}

export function useLocale(): Locale {
  return useContext(Ctx).locale;
}

export function useFmt(): Fmt {
  return useContext(Ctx).f;
}
