import { formatMcapSol, formatMcapUsd } from "@sentra/i18n/format";
import type { MarketCap } from "@/lib/types";
import type { Locale, T } from "@/lib/i18n/core";

/**
 * contracts 1.1.4 market cap: indicative USD (reference SOL price, not live) + SOL + as-of time. Plain text only;
 * server- and client-safe (no hooks). Missing value → "—" (never a guess).
 */
export function Mcap({ m, t, locale, time, compact }: { m?: MarketCap; t: T; locale: Locale; time: (ts: number) => string; compact?: boolean }) {
  if (!m || (m.usd == null && m.lamports == null)) return <span className="text-text-tertiary">—</span>;
  const asOf = m.asOf != null ? t.ux("mcap.as_of", { time: time(m.asOf) }) : null;
  const usd = formatMcapUsd(m.usd, locale);
  const sol = formatMcapSol(m.lamports, locale);
  const title = [`${t.ux("mcap.label")}: ${usd} · ${sol}`, asOf, t.ux("mcap.usd_indicative")].filter(Boolean).join("\n");
  if (compact) {
    return (
      <span className="num whitespace-nowrap" title={title}>
        {usd}
        {asOf && <span className="block text-overline text-text-tertiary">{asOf}</span>}
      </span>
    );
  }
  return (
    <span className="num inline-flex flex-wrap items-baseline gap-x-1.5" title={title}>
      <span className="text-text-secondary">{t.ux("mcap.label")}</span>
      <span className="text-text-primary">{usd}</span>
      <span className="text-text-tertiary">({t.ux("mcap.sol_value", { amount: sol })})</span>
      {asOf && <span className="text-caption text-text-tertiary">· {asOf}</span>}
    </span>
  );
}
