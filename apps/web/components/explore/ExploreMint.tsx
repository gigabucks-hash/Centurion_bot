"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CoinAvatar } from "@/components/CoinAvatar";
import { formatMcapUsd } from "@centurion/i18n/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { coerceFeed, safeIcon, type ExploreRow } from "@explore/index";

/** Read-only mint page when the screener has not seen the coin. No buy control. */
export function ExploreMint({ mint }: { mint: string }) {
  const t = useT();
  const locale = useLocale();
  const [row, setRow] = useState<ExploreRow | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`/api/explore?mint=${encodeURIComponent(mint)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive) return;
        const feed = coerceFeed(body);
        setRow(feed.rows[0] ?? null);
      })
      .catch(() => alive && setRow(null));
    return () => {
      alive = false;
    };
  }, [mint]);
  const usd = (n: number | null) => formatMcapUsd(n, locale);
  const icon = safeIcon(row?.icon);
  return (
    <article className="mx-auto max-w-xl">
      <Link href="/explore" className="mb-3 inline-flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary">
        <ArrowLeft size={14} aria-hidden /> {t("explore.detail.back")}
      </Link>
      <h1 className="flex items-center gap-3 text-title font-semibold">
        {icon ? (
          // Remote icon is path-locked to static.datapi.jup.ag; next/image would add a second optimizer hop.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" width={40} height={40} referrerPolicy="no-referrer" className="h-10 w-10 rounded-full" />
        ) : (
          <CoinAvatar mint={mint} symbol={row?.symbol ?? mint.slice(0, 4)} size="lg" />
        )}
        <span>{row?.symbol ? `$${row.symbol}` : t("explore.loading")}</span>
      </h1>
      <p className="mt-2 font-mono text-caption text-text-tertiary">{mint}</p>
      <p className="mt-3 text-caption text-text-secondary">{t("explore.detail.note")}</p>
      {row === null && <p className="mt-4 text-body text-text-secondary">{t("explore.detail.missing")}</p>}
      {row && (
        <dl className="mt-4 divide-y divide-border-subtle border border-border-subtle text-body">
          {[
            [t("explore.col.mcap"), usd(row.mcapUsd)],
            [t("explore.col.liq"), usd(row.liquidityUsd)],
            [t("explore.col.volume"), usd(row.volumeUsd)],
            [t("explore.col.holders"), row.holders == null ? "—" : String(row.holders)],
            [t("explore.col.change"), row.changePct == null ? "—" : `${row.changePct.toFixed(1)}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-text-secondary">{k}</dt>
              <dd className="tabular-nums text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link href="/approvals" className="mt-4 inline-flex text-label text-brand-primary hover:underline">{t("explore.detail.approvals")}</Link>
    </article>
  );
}
