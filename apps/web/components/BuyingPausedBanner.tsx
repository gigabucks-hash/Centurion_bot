import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { TradingState } from "@/lib/types";
import { getFmt, getT } from "@/lib/i18n/server";

/** Workspace-wide "Stop buying" warning. Rendered by server pages so http mode always reads the API. */
export async function BuyingPausedBanner({ trading }: { trading: TradingState }) {
  if (!trading.buysPaused) return null;
  const [t, f] = await Promise.all([getT(), getFmt()]);
  // Keys are handed off for lib/i18n/en.ts + id.ts; missing keys render their key (never throw).
  const tr = (key: string, vars?: Record<string, string | number>) => t(key as never, vars);
  return (
    <div
      role="status"
      data-testid="buying-paused-banner"
      className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-semantic-warning/40 bg-semantic-warningContainer px-4 py-3"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-semantic-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label font-semibold text-text-primary">{tr("trading.bannerTitle")}</p>
        <p className="mt-0.5 text-caption text-text-secondary">
          {trading.buysPausedAt != null
            ? tr("trading.bannerBody", { time: `${f.dateTime(trading.buysPausedAt)} WIB` })
            : tr("trading.bannerBodyNoTime")}
        </p>
      </div>
      <Link href="/settings" className="tap text-label font-medium text-semantic-warning hover:underline">
        {tr("trading.bannerCta")}
      </Link>
    </div>
  );
}