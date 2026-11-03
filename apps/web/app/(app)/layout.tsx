import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { listAllStrategies, modesOf } from "@/lib/mode";
import { AppShell, ShellSkeleton } from "@/components/shell/AppShell";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { messagesFor } from "@/lib/i18n";

/**
 * Shell: no global mode (per-strategy Paper/Real, contracts 1.1.6). The banner/title/accents reflect whether any
 * strategy runs in Real; every screen badges each item with its own mode. Real reads only when a Real strategy exists
 * (a refused Real read, e.g. 403 REAL_SOL_DISABLED, just means "no Real strategies").
 */
async function Shell({ children }: { children: React.ReactNode }) {
  const api = getApi();
  const [strategies, locale] = await Promise.all([listAllStrategies(api), getLocale()]);
  const modes = modesOf(strategies);
  const overviews = await Promise.all(modes.map((m) => api.getOverview(m)));
  const live = strategies.filter((s) => s.status !== "archived");
  const realCount = live.filter((s) => s.mode === "real").length;
  return (
    <I18nProvider locale={locale} messages={messagesFor(locale) as unknown as Record<string, unknown>}>
      <AppShell
        sessionKeeper={process.env.CENTURION_AUTH_GATE !== "0"}
        modes={modes}
        realCount={realCount}
        paperCount={live.length - realCount}
        pendingApprovals={overviews.reduce((n, o) => n + o.pendingApprovals, 0)}
      >
        {children}
      </AppShell>
    </I18nProvider>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
