import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import { AppShell, ShellSkeleton } from "@/components/shell/AppShell";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { messagesFor } from "@/lib/i18n";
import { realSolDisabled } from "@/lib/bff";
import { RealSolDisabled } from "@/components/shell/RealSolDisabled";

async function Shell({ children }: { children: React.ReactNode }) {
  const mode = await getMode();
  const [overview, locale] = await Promise.all([getApi().getOverview(mode), getLocale()]);
  return (
    <I18nProvider locale={locale} messages={messagesFor(locale) as unknown as Record<string, unknown>} mode={mode}>
    <AppShell sessionKeeper={process.env.SENTRA_AUTH_GATE !== "0"} mode={mode} pendingApprovals={overview.pendingApprovals} walletConnected={overview.walletConnected} cashSol={overview.cashSol} lossStopPct={overview.lossStopPct} runningStrategies={overview.runningStrategies}>
      {mode === "real" && realSolDisabled() ? <RealSolDisabled /> : children}
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
