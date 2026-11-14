"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { CoinAvatar } from "@/components/CoinAvatar";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import {
  applyExploreQuery,
  coerceFeed,
  defaultSort,
  safeIcon,
  SECTIONS,
  WINDOWS,
  type ExploreFeed,
  type ExploreRow,
  type ExploreSection,
  type ExploreWindow,
  type SortDir,
  type SortKey,
} from "@explore/index";

const REFRESH_MS = 12_000;

const TAB: Record<ExploreSection, MessageKey> = {
  trending: "explore.tab.trending",
  graduated: "explore.tab.graduated",
  bluechip: "explore.tab.bluechip",
  new: "explore.tab.new",
};
const NOTE: Record<ExploreSection, MessageKey> = {
  trending: "explore.note.trending",
  graduated: "explore.note.graduated",
  bluechip: "explore.note.bluechip",
  new: "explore.note.new",
};
const WIN: Record<ExploreWindow, MessageKey> = {
  "1m": "explore.window.1m",
  "5m": "explore.window.5m",
  "1h": "explore.window.1h",
  "6h": "explore.window.6h",
  "24h": "explore.window.24h",
};

function money(n: number | null, tag: string): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(tag, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function signed(n: number | null, tag: string): string {
  if (n == null) return "—";
  const body = new Intl.NumberFormat(tag, { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(n);
  return `${body}%`;
}

function tone(n: number | null): string {
  if (n == null || n === 0) return "text-text-tertiary";
  return n > 0 ? "text-semantic-profit" : "text-semantic-loss";
}

function parseNum(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** GMGN-style discovery table. Read-only: the only navigation is the existing coin page. */
export function ExploreBoard({ initial }: { initial: ExploreFeed }) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "id" ? "id-ID" : "en-US";
  const [section, setSection] = useState<ExploreSection>(initial.section);
  const [span, setSpan] = useState<ExploreWindow>(initial.window);
  const [feed, setFeed] = useState<ExploreFeed>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [minLiq, setMinLiq] = useState("");
  const [minMcap, setMinMcap] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [sorts, setSorts] = useState<Partial<Record<ExploreSection, { sort: SortKey; dir: SortDir }>>>({});
  const sort = sorts[section] ?? defaultSort(section);
  const [copied, setCopied] = useState<string | null>(null);
  const setSort = (next: { sort: SortKey; dir: SortDir } | ((cur: { sort: SortKey; dir: SortDir }) => { sort: SortKey; dir: SortDir })) => {
    setSorts((prev) => {
      const cur = prev[section] ?? defaultSort(section);
      return { ...prev, [section]: typeof next === "function" ? next(cur) : next };
    });
  };

  useEffect(() => {
    let alive = true;
    const pull = () => {
      fetch(`/api/explore?section=${section}&window=${span}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
        .then((body) => {
          if (alive) setFeed(coerceFeed(body));
        })
        .catch(() => {
          if (!alive) return;
          setFeed((prev) => prev && prev.section === section ? { ...prev, stale: prev.rows.length > 0, error: prev.rows.length ? prev.error ?? "unavailable" : "unavailable" } : coerceFeed({ section, window: span, error: "unavailable", rows: [] }));
        });
    };
    pull();
    const id = window.setInterval(() => { if (document.visibilityState !== "hidden") pull(); }, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVis);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [section, span]);

  const rows = useMemo(() => {
    if (!feed) return [];
    return applyExploreQuery(feed.rows, {
      minLiq: parseNum(minLiq),
      minMcap: parseNum(minMcap),
      maxAgeMin: parseNum(maxAge),
      sort: sort.sort,
      dir: sort.dir,
      now: feed.fetchedAt || now,
    });
  }, [feed, minLiq, minMcap, maxAge, sort, now]);

  const go = (nextSection: ExploreSection, nextWindow: ExploreWindow) => {
    setSection(nextSection);
    setSpan(nextWindow);
    const url = `/explore?section=${nextSection}&window=${nextWindow}`;
    window.history.replaceState(null, "", url);
  };
  const age = (created: number | null) => {
    if (created == null) return "—";
    const s = Math.max(0, Math.round((now - created) / 1000));
    if (s < 60) return t("explore.age.s", { n: s });
    const m = Math.floor(s / 60);
    if (m < 60) return t("explore.age.m", { n: m });
    const h = Math.floor(m / 60);
    if (h < 48) return t("explore.age.h", { n: h });
    return t("explore.age.d", { n: Math.floor(h / 24) });
  };
  const copy = (mint: string) => {
    void navigator.clipboard.writeText(mint).then(() => {
      setCopied(mint);
      window.setTimeout(() => setCopied((c) => (c === mint ? null : c)), 1200);
    }).catch(() => {});
  };
  const head = (key: SortKey, label: string, align = "right") => (
    <th className={align === "left" ? "text-left" : "text-right"} aria-sort={sort.sort === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="font-medium text-text-tertiary hover:text-text-primary" onClick={() => setSort((s) => s.sort === key ? { sort: key, dir: s.dir === "asc" ? "desc" : "asc" } : { sort: key, dir: key === "symbol" || key === "age" ? "asc" : "desc" })}>
        {label}{sort.sort === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const updated = !feed ? t("explore.loading") : now - feed.fetchedAt < 5_000 ? t("explore.updatedNow") : t("explore.updated", { seconds: Math.max(0, Math.round((now - feed.fetchedAt) / 1000)) });

  return (
    <section data-testid="explore-root" className="min-w-0">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold tracking-tight">{t("explore.title")}</h1>
          <p className="mt-1 max-w-3xl text-caption text-text-secondary">{t("explore.readonly")}</p>
        </div>
        <p className="tabular-nums text-caption text-text-tertiary" role="status">{updated}{feed ? ` · ${t("explore.count", { count: rows.length })}` : ""}</p>
      </header>
      <div className="mb-2 flex flex-wrap items-center gap-4 border-b border-border-subtle">
        <div role="tablist" aria-label={t("explore.tablist")} className="flex gap-1">
          {SECTIONS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={s === section} data-testid={`explore-tab-${s}`} className={`border-b-2 px-2 py-1.5 text-label ${s === section ? "border-brand-primary text-text-primary" : "border-transparent text-text-tertiary hover:text-text-primary"}`} onClick={() => go(s, span)}>
              {t(TAB[s])}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t("explore.windowLabel")} className="ml-auto flex">
          {WINDOWS.map((w) => (
            <button key={w} type="button" aria-pressed={w === span} className={`px-2 py-1.5 text-caption tabular-nums ${w === span ? "text-brand-primary" : "text-text-tertiary hover:text-text-primary"}`} onClick={() => go(section, w)}>
              {t(WIN[w])}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-caption text-text-tertiary">{feed?.unsupported ? t("explore.unsupported") : t(NOTE[section])}</p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-caption text-text-tertiary">{t("explore.filter.minLiq")}
          <input value={minLiq} onChange={(e) => setMinLiq(e.target.value)} inputMode="decimal" className="mt-1 block h-8 w-32 border border-border-subtle bg-bg-sunken px-2 text-body text-text-primary" />
        </label>
        <label className="text-caption text-text-tertiary">{t("explore.filter.minMcap")}
          <input value={minMcap} onChange={(e) => setMinMcap(e.target.value)} inputMode="decimal" className="mt-1 block h-8 w-32 border border-border-subtle bg-bg-sunken px-2 text-body text-text-primary" />
        </label>
        <label className="text-caption text-text-tertiary">{t("explore.filter.maxAge")}
          <input value={maxAge} onChange={(e) => setMaxAge(e.target.value)} inputMode="numeric" className="mt-1 block h-8 w-32 border border-border-subtle bg-bg-sunken px-2 text-body text-text-primary" />
        </label>
        {(minLiq || minMcap || maxAge) && <button type="button" className="text-caption text-text-secondary hover:text-text-primary" onClick={() => { setMinLiq(""); setMinMcap(""); setMaxAge(""); }}>{t("explore.clear")}</button>}
      </div>
      {feed?.error === "rate_limit" && <p className="mb-2 text-caption text-text-secondary" role="status">{t("explore.rate")}</p>}
      {feed?.stale && feed.error !== "rate_limit" && <p className="mb-2 text-caption text-text-secondary" role="status">{t("explore.stale")}</p>}
      <div className="overflow-x-auto border border-border-subtle">
        <table data-testid="explore-table" className="w-full min-w-[1080px] border-collapse text-caption">
          <thead className="bg-bg-surface text-text-tertiary">
            <tr>
              {head("symbol", t("explore.col.token"), "left")}
              {head("age", t("explore.col.age"))}
              {head("liquidity", t("explore.col.liq"))}
              {head("mcap", t("explore.col.mcap"))}
              {head("volume", t("explore.col.volume"))}
              {head("txns", t("explore.col.txns"))}
              {head("holders", t("explore.col.holders"))}
              {head("change", t("explore.col.change"))}
              <th className="px-2 py-1.5 text-left font-medium">{t("explore.col.safety")}</th>
            </tr>
          </thead>
          <tbody>
            {!feed && <tr><td colSpan={9} className="px-3 py-6 text-text-tertiary">{t("explore.loading")}</td></tr>}
            {feed && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-text-secondary">{feed.rows.length ? t("explore.emptyFiltered") : t("explore.empty")}</td></tr>}
            {rows.map((r) => <Row key={r.mint} row={r} tag={tag} age={age(r.createdAt)} copied={copied === r.mint} onCopy={() => copy(r.mint)} t={t} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ row, tag, age, copied, onCopy, t }: {
  row: ExploreRow;
  tag: string;
  age: string;
  copied: boolean;
  onCopy: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const icon = safeIcon(row.icon);
  return (
    <tr className="border-t border-border-subtle hover:bg-bg-surface">
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-2">
          {icon ? (
            // Remote icon is path-locked to static.datapi.jup.ag; next/image would add a second optimizer hop.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" width={24} height={24} referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
          ) : <CoinAvatar mint={row.mint} symbol={row.symbol} size="sm" />}
          <span className="min-w-0">
            <Link href={`/coins/${row.mint}`} className="font-medium text-text-primary hover:underline" title={row.name}>{`$${row.symbol}`}</Link>
            <span className="mt-0.5 flex items-center gap-1 text-text-tertiary">
              <span className="max-w-32 truncate">{row.name}</span>
              <button type="button" className="inline-flex items-center text-text-tertiary hover:text-text-primary" aria-label={t("explore.copy")} onClick={onCopy}>
                <Copy size={12} aria-hidden />
                {copied && <span className="ml-1">{t("explore.copied")}</span>}
              </button>
            </span>
          </span>
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">{age}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(row.liquidityUsd, tag)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(row.mcapUsd, tag)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(row.volumeUsd, tag)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        <div>{row.txns == null ? "—" : row.txns.toLocaleString(tag)}</div>
        {row.buys != null && row.sells != null && <div className="text-text-tertiary"><span className="text-semantic-profit">{row.buys.toLocaleString(tag)}</span>/<span className="text-semantic-loss">{row.sells.toLocaleString(tag)}</span></div>}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{row.holders == null ? "—" : row.holders.toLocaleString(tag)}</td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${tone(row.changePct)}`}>{signed(row.changePct, tag)}</td>
      <td className="px-2 py-1.5 text-left text-text-tertiary">
        <Safety row={row} t={t} tag={tag} />
      </td>
    </tr>
  );
}

function Safety({ row, t, tag }: { row: ExploreRow; t: (key: MessageKey, vars?: Record<string, string | number>) => string; tag: string }) {
  const bits: string[] = [];
  if (row.mintRenounced != null) bits.push(t(row.mintRenounced ? "explore.safety.mintOn" : "explore.safety.mintOff"));
  if (row.freezeRenounced != null) bits.push(t(row.freezeRenounced ? "explore.safety.freezeOn" : "explore.safety.freezeOff"));
  if (row.lpBurned != null) bits.push(t(row.lpBurned ? "explore.safety.lpOn" : "explore.safety.lpOff"));
  if (row.top10Pct != null) bits.push(t("explore.safety.top10", { pct: new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(row.top10Pct) }));
  if (!bits.length) return <>—</>;
  return <span>{bits.join(" · ")}</span>;
}
