import { Suspense } from "react";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { messagesFor } from "@/lib/i18n";

async function WithLocale({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return <I18nProvider locale={locale} messages={messagesFor(locale) as unknown as Record<string, unknown>}>{children}</I18nProvider>;
}

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div data-mode="practice" className="min-h-screen bg-bg-canvas">
      <Suspense fallback={null}>
        <WithLocale>{children}</WithLocale>
      </Suspense>
    </div>
  );
}
