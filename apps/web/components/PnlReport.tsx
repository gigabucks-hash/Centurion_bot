import Link from "next/link";
import type { Fmt } from "@/lib/format";
import type { T } from "@/lib/i18n/core";
import type { TradingMode } from "@/lib/types";
import { pnlReport } from "@/lib/pnl-report";
import { Pnl, StatStrip } from "@/components/ui";

/**
 * PnL report (G1-blue): three cells in one bordered strip, plus the closed-trade ledger line.
 * Server component — `t` / `f` come from the page so formatting stays per mode (paper SOL).
 *
 * Money is never recomputed here: realized / unrealized are the overview's own per-mode values;
 * the total is their sum so the card reconciles with the equity hero by construction.
 */
export function PnlReport({ realized, unrealized, openPositions, trades, wins, mode, t, f }: {
  realized: number;
  unrealized: number;
  openPositions: number;
  trades: number;
  wins: number;
  mode: TradingMode;
  t: T;
  f: Fmt;
}) {
  const r = pnlReport({ realized, unrealized, openPositions, trades, wins });
  return (
    <section aria-label={t("pnlReport.title")} data-testid="pnl-report">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-titleSm text-text-primary">{t("pnlReport.title")}</h2>
        <Link href={mode === "real" ? "/stats?mode=real" : "/stats"} className="tap text-caption text-brand-primary hover:underline">
          {t("pnlReport.full")} →
        </Link>
      </div>
      <StatStrip
        columns={3}
        items={[
          { label: t("pnlReport.total"), value: <Pnl sol={r.total} mode={mode} unit />, hint: t("pnlReport.totalHint") },
          { label: t("pnlReport.unrealized"), value: <Pnl sol={r.unrealized} mode={mode} unit />, hint: t("pnlReport.openHint", { n: r.openPositions }) },
          {
            label: t("pnlReport.realized"),
            value: <Pnl sol={r.realized} mode={mode} unit />,
            hint: r.hasClosed ? t("pnlReport.closedHint", { n: r.trades }) : t("pnlReport.noClosed"),
          },
        ]}
      />
      <p className="mt-2 text-caption text-text-tertiary">
        {r.winRatePct != null && <span className="text-text-secondary">{t("pnlReport.winRate", { pct: f.pct(r.winRatePct, 1, false), n: r.trades })} · </span>}
        {t("pnlReport.note")}
      </p>
    </section>
  );
}