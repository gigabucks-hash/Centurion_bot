import Link from "next/link";
import type { ReactNode } from "react";
import type { Fmt } from "@/lib/format";
import type { T } from "@/lib/i18n/core";
import type { TradingMode } from "@/lib/types";
import type { PnlReportView } from "@/lib/pnl-report";
import { Pnl, StatStrip, cn } from "@/components/ui";

/**
 * PnL report (G1-blue). Two shapes, one dataset:
 * - `rows` (default): a vertical ledger for the dashboard's narrow column — a 3-cell strip clips
 *   "−8.98 paper SOL" below ~420 px.
 * - `strip`: the partitioned 3-cell strip for the full-width report page.
 *
 * Money is never recomputed here: the caller passes the overview-derived view or
 * `pnlReportFromSummary()` of `GET /stats/pnl`; the card only lays it out.
 */
export function PnlReport({ report: r, mode, t, f, href = "/pnl", layout = "rows", heading }: {
  report: PnlReportView;
  mode: TradingMode;
  t: T;
  f: Fmt;
  /** null hides the link (the full report page itself). */
  href?: string | null;
  layout?: "rows" | "strip";
  /** Defaults to the section title; the report page passes "All time" so it does not repeat the H1. */
  heading?: ReactNode;
}) {
  // A null money field is "not reported": show an em dash, never a 0.00 the server did not send.
  const money = (v: number | null) =>
    v == null ? <span className="num text-text-tertiary" data-testid="pnl-not-reported">—</span> : <Pnl sol={v} mode={mode} unit wrapUnit={layout === "strip"} />;
  const items = [
    { label: t("pnlReport.unrealized"), value: money(r.unrealized), hint: t("pnlReport.openHint", { n: r.openPositions }) },
    {
      label: t("pnlReport.realized"),
      value: money(r.realized),
      hint: r.hasClosed ? t("pnlReport.closedHint", { n: r.trades }) : t("pnlReport.noClosed"),
    },
    { label: t("pnlReport.total"), value: money(r.total), hint: t("pnlReport.totalHint") },
  ];
  return (
    <section aria-label={t("pnlReport.title")} data-testid="pnl-report">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-titleSm text-text-primary">{heading ?? t("pnlReport.title")}</h2>
        {href && (
          <Link href={href} className="tap text-caption text-brand-primary hover:underline">
            {t("pnlReport.full")} →
          </Link>
        )}
      </div>
      {layout === "strip" ? (
        <StatStrip columns={3} items={items} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
          {items.map((it, i) => (
            <div key={it.label} className={cn("flex items-start justify-between gap-3 px-4 py-3", i > 0 && "border-t border-border-subtle")}>
              <span className="min-w-0">
                <span className="block text-overline uppercase tracking-wide text-text-tertiary">{it.label}</span>
                <span className="mt-0.5 block text-caption text-text-tertiary">{it.hint}</span>
              </span>
              <span className="shrink-0 text-num">{it.value}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-caption text-text-tertiary">
        {r.winRatePct != null && <span className="text-text-secondary">{t("pnlReport.winRate", { pct: f.pct(r.winRatePct, 1, false), n: r.trades })} · </span>}
        {t("pnlReport.note")}
      </p>
    </section>
  );
}