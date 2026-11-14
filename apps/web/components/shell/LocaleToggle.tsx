"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LOCALES } from "@/lib/i18n/core";
import { useLocale, useT } from "@/lib/i18n/client";
import { cn } from "@/components/ui";

/** EN / ID language switch. Indonesian is a partial scaffold that falls back to English. */
export function LocaleToggle() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <div role="radiogroup" aria-label={t("common.language")} className="inline-flex rounded-md border border-border-subtle p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          onClick={async () => {
            if (l === locale) return;
            await fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: l }) });
            router.refresh();
          }}
          className={cn("h-6 min-w-8 rounded-sm px-1.5 text-caption font-medium uppercase", locale === l ? "bg-bg-surface text-text-primary" : "text-text-tertiary hover:text-text-primary")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
