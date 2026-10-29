"use client";
import { NextIntlClientProvider } from "next-intl";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createFmt, type Fmt } from "../format";
import type { TradingMode } from "../types";
import { createT, DEFAULT_LOCALE, messagesFor, type Locale, type T } from "./index";

const Ctx = createContext<{ locale: Locale; t: T; f: Fmt }>({ locale: DEFAULT_LOCALE, t: createT(DEFAULT_LOCALE), f: createFmt(DEFAULT_LOCALE) });

/** next-intl provider (for useTranslations) + our typed t() and the locale/mode-bound formatter. */
export function I18nProvider({ locale, mode = "practice", children }: { locale: Locale; mode?: TradingMode; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createT(locale), f: createFmt(locale, mode) }), [locale, mode]);
  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale) as never} timeZone="Asia/Jakarta" onError={() => {}}>
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
