import Link from "next/link";
import type { TradingMode } from "@/lib/types";
import type { T } from "@/lib/i18n/core";
import { cn } from "@/components/ui";
import { ModeBadge } from "@/components/domain";

/**
 * Balances stay per mode on the wire (`?mode=`, never mixed). Money screens (overview portfolio, exit stats) show one
 * mode; this chip row (same style as the coins filter chips) appears only when a strategy actually runs in Real.
 * Otherwise it is just the Paper badge, as before.
 */
export function PortfolioModeTabs({ mode, modes, href, t }: { mode: TradingMode; modes: TradingMode[]; href: (m: TradingMode) => string; t: T }) {
  if (modes.length < 2) return <ModeBadge mode={mode} />;
  const chip = (active: boolean) => cn("inline-flex min-h-8 items-center rounded-full border px-3 text-caption", active ? "border-brand-primary bg-brand-primaryContainer text-brand-onPrimaryContainer" : "border-border-default text-text-secondary hover:text-text-primary");
  return (
    <nav aria-label={t("portfolio.label")} className="flex flex-wrap gap-2">
      {modes.map((m) => (
        <Link key={m} href={href(m)} aria-current={m === mode ? "page" : undefined} className={chip(m === mode)}>
          {m === "practice" ? "◇ " : "● "}{t.ux(m === "practice" ? "strategy.mode.paper" : "strategy.mode.real")}
        </Link>
      ))}
    </nav>
  );
}
