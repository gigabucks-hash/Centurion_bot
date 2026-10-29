"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createT, DEFAULT_LOCALE, type Locale, type T } from "./index";

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: DEFAULT_LOCALE, t: createT(DEFAULT_LOCALE) });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createT(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): T {
  return useContext(Ctx).t;
}

export function useLocale(): Locale {
  return useContext(Ctx).locale;
}
