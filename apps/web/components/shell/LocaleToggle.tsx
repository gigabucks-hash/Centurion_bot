"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LOCALES } from "@/lib/i18n";
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
    <div role="radiogroup" aria-label={t("common.language")} className="inline-flex rounded-full border border-border-default p-0.5">
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
          className={cn("h-7 min-w-9 rounded-full px-2 text-caption font-semibold uppercase", locale === l ? "bg-bg-raised text-text-primary" : "text-text-tertiary hover:text-text-primary")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
