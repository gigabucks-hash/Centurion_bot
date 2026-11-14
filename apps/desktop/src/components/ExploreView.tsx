import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy } from "lucide-react";
import { CoinAvatar } from "./CoinAvatar";
import { core } from "../api";
import { formatMcapUsd, useLang, useT } from "../i18n";
import {
  applyExploreQuery,
  defaultSort,
  emptyFeed,
  feedFromRaw,
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
const inDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function load(section: ExploreSection, span: ExploreWindow): Promise<ExploreFeed> {
  try {
    const raw = inDesktop
      ? await invoke("explore_fetch", { section, window: span })
      : await fetch(`/__explore?section=${encodeURIComponent(section)}&window=${encodeURIComponent(span)}`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error("http");
          return r.json();
        });
    return feedFromRaw(raw);
  } catch {
    return emptyFeed(section, span);
  }
}

function money(n: number | null, loc: "en" | "id"): string {
  return formatMcapUsd(n, loc);
}
function signed(n: number | null, tag: string): string {
  if (n == null) return "—";
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(n)}%`;
}
function parseNum(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Read-only discovery. Opening the queue or the chart uses the existing screens and does not buy. */
export function ExploreView({ queued, onOpenQueue }: { queued: ReadonlySet<string>; onOpenQueue: (mint: string) => void }) {
  const t = useT();
  const lang = useLang();
  const tag = lang === "id" ? "id-ID" : "en-US";
  const [section, setSection] = useState<ExploreSection>("trending");
  const [span, setSpan] = useState<ExploreWindow>("5m");
  const [feed, setFeed] = useState<ExploreFeed | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [minLiq, setMinLiq] = useState("");
  const [minMcap, setMinMcap] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [sorts, setSorts] = useState<Partial<Record<ExploreSection, { sort: SortKey; dir: SortDir }>>>({});
  const sort = sorts[section] ?? defaultSort(section);
  const setSort = (next: { sort: SortKey; dir: SortDir } | ((cur: { sort: SortKey; dir: SortDir }) => { sort: SortKey; dir: SortDir })) => {
    setSorts((prev) => {
      const cur = prev[section] ?? defaultSort(section);
      return { ...prev, [section]: typeof next === "function" ? next(cur) : next };
    });
  };
  const [copied, setCopied] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      load(section, span).then((next) => { if (alive) setFeed(next); }).catch(() => {});
    };
    pull();
    const id = window.setInterval(() => { if (document.visibilityState !== "hidden") pull(); }, REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearInterval(id); window.clearInterval(clock); document.removeEventListener("visibilitychange", onVis); };
  }, [section, span]);

  const rows = useMemo(() => feed ? applyExploreQuery(feed.rows, {
    minLiq: parseNum(minLiq), minMcap: parseNum(minMcap), maxAgeMin: parseNum(maxAge), sort: sort.sort, dir: sort.dir, now: feed.fetchedAt || now,
  }) : [], [feed, minLiq, minMcap, maxAge, sort, now]);
  const selected = rows.find((r) => r.mint === sel) ?? feed?.rows.find((r) => r.mint === sel) ?? null;

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
    void navigator.clipboard?.writeText(mint).then(() => {
      setCopied(mint);
      window.setTimeout(() => setCopied((c) => (c === mint ? null : c)), 1200);
    });
  };
  const head = (key: SortKey, label: string) => (
    <th aria-sort={sort.sort === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={sort.sort === key ? "on" : ""} onClick={() => setSort((s) => s.sort === key ? { sort: key, dir: s.dir === "asc" ? "desc" : "asc" } : { sort: key, dir: key === "symbol" || key === "age" ? "asc" : "desc" })}>
        {label}{sort.sort === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const updated = !feed ? t("explore.loading") : now - feed.fetchedAt < 5_000 ? t("explore.updatedNow") : t("explore.updated", { seconds: Math.max(0, Math.round((now - feed.fetchedAt) / 1000)) });

  return (
    <section className="explore" data-testid="explore-root">
      <header className="explore-bar">
        <strong>{t("explore.title")}</strong>
        <div role="tablist" aria-label={t("explore.tablist")} className="explore-tabs">
          {SECTIONS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={s === section} data-testid={`explore-tab-${s}`} className={`ghost explore-tab${s === section ? " on" : ""}`} onClick={() => setSection(s)}>{t(`explore.tab.${s}`)}</button>
          ))}
        </div>
        <div role="group" aria-label={t("explore.windowLabel")} className="explore-tabs">
          {WINDOWS.map((w) => (
            <button key={w} type="button" aria-pressed={w === span} className={`ghost explore-tab${w === span ? " on" : ""}`} onClick={() => setSpan(w)}>{t(`explore.window.${w}`)}</button>
          ))}
        </div>
        <span className="dim num">{updated}{feed ? ` · ${t("explore.count", { count: rows.length })}` : ""}</span>
      </header>
      <p className="explore-note dim">{feed?.unsupported ? t("explore.unsupported") : t(`explore.note.${section}`)} {t("explore.readonly")}</p>
      <div className="explore-filters">
        <label>{t("explore.filter.minLiq")}<input value={minLiq} onChange={(e) => setMinLiq(e.target.value)} inputMode="decimal" /></label>
        <label>{t("explore.filter.minMcap")}<input value={minMcap} onChange={(e) => setMinMcap(e.target.value)} inputMode="decimal" /></label>
        <label>{t("explore.filter.maxAge")}<input value={maxAge} onChange={(e) => setMaxAge(e.target.value)} inputMode="numeric" /></label>
        {(minLiq || minMcap || maxAge) && <button type="button" className="ghost" onClick={() => { setMinLiq(""); setMinMcap(""); setMaxAge(""); }}>{t("explore.clear")}</button>}
      </div>
      {feed?.error === "rate_limit" && <p className="explore-note dim" role="status">{t("explore.rate")}</p>}
      {feed?.stale && feed.error !== "rate_limit" && <p className="explore-note dim" role="status">{t("explore.stale")}</p>}
      <div className={`explore-body${selected ? " with-detail" : ""}`}>
        <div className="explore-scroll">
          <table className="positions explore-table" data-testid="explore-table">
            <thead>
              <tr>
                {head("symbol", t("explore.col.token"))}
                {head("age", t("explore.col.age"))}
                {head("liquidity", t("explore.col.liq"))}
                {head("mcap", t("explore.col.mcap"))}
                {head("volume", t("explore.col.volume"))}
                {head("txns", t("explore.col.txns"))}
                {head("holders", t("explore.col.holders"))}
                {head("change", t("explore.col.change"))}
                <th>{t("explore.col.safety")}</th>
              </tr>
            </thead>
            <tbody>
              {!feed && <tr><td colSpan={9} className="dim">{t("explore.loading")}</td></tr>}
              {feed && rows.length === 0 && <tr><td colSpan={9} className="dim">{feed.rows.length ? t("explore.emptyFiltered") : t("explore.empty")}</td></tr>}
              {rows.map((r) => (
                <DesktopRow key={r.mint} row={r} tag={tag} lang={lang} age={age(r.createdAt)} selected={r.mint === sel} copied={copied === r.mint} onSelect={() => setSel(r.mint)} onCopy={() => copy(r.mint)} t={t} />
              ))}
            </tbody>
          </table>
        </div>
        {selected && (
          <aside className="explore-detail">
            <h2>${selected.symbol}</h2>
            <p className="dim">{selected.name}</p>
            <p className="mono dim">{selected.mint}</p>
            <p className="dim">{t("explore.detail.note")}</p>
            <dl>
              <div><dt>{t("explore.col.mcap")}</dt><dd className="num">{money(selected.mcapUsd, lang)}</dd></div>
              <div><dt>{t("explore.col.liq")}</dt><dd className="num">{money(selected.liquidityUsd, lang)}</dd></div>
              <div><dt>{t("explore.col.volume")}</dt><dd className="num">{money(selected.volumeUsd, lang)}</dd></div>
            </dl>
            {queued.has(selected.mint) ? (
              <button type="button" onClick={() => onOpenQueue(selected.mint)}>{t("explore.detail.queue")}</button>
            ) : <p className="dim">{t("explore.detail.noQueue")}</p>}
            <button type="button" className="ghost" onClick={() => { void core.openChartWindow(selected.mint); }}>{t("explore.detail.chart")}</button>
          </aside>
        )}
      </div>
    </section>
  );
}

function DesktopRow({ row, tag, lang, age, selected, copied, onSelect, onCopy, t }: {
  row: ExploreRow;
  tag: string;
  lang: "en" | "id";
  age: string;
  selected: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: () => void;
  t: (key: string, args?: Record<string, string | number>) => string;
}) {
  const icon = safeIcon(row.icon);
  const tone = row.changePct == null || row.changePct === 0 ? "dim" : row.changePct > 0 ? "pos" : "neg";
  const bits: string[] = [];
  if (row.mintRenounced != null) bits.push(t(row.mintRenounced ? "explore.safety.mintOn" : "explore.safety.mintOff"));
  if (row.freezeRenounced != null) bits.push(t(row.freezeRenounced ? "explore.safety.freezeOn" : "explore.safety.freezeOff"));
  if (row.lpBurned != null) bits.push(t(row.lpBurned ? "explore.safety.lpOn" : "explore.safety.lpOff"));
  if (row.top10Pct != null) bits.push(t("explore.safety.top10", { pct: new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(row.top10Pct) }));
  return (
    <tr className={selected ? "cursor" : ""} onClick={onSelect}>
      <td>
        <span className="coin-sym">
          {icon ? <img src={icon} alt="" width={24} height={24} referrerPolicy="no-referrer" className="explore-icon" /> : <CoinAvatar mint={row.mint} symbol={row.symbol} size={24} />}
          <span>
            <b>${row.symbol}</b>
            <span className="dim"> {row.name}</span>
            <button type="button" className="ghost" aria-label={t("explore.copy")} onClick={(e) => { e.stopPropagation(); onCopy(); }}><Copy size={12} aria-hidden />{copied ? t("explore.copied") : ""}</button>
          </span>
        </span>
      </td>
      <td className="num">{age}</td>
      <td className="num">{money(row.liquidityUsd, lang)}</td>
      <td className="num">{money(row.mcapUsd, lang)}</td>
      <td className="num">{money(row.volumeUsd, lang)}</td>
      <td className="num">{row.txns == null ? "—" : row.txns.toLocaleString(tag)}{row.buys != null && row.sells != null && <div className="dim"><span className="pos">{row.buys}</span>/<span className="neg">{row.sells}</span></div>}</td>
      <td className="num">{row.holders == null ? "—" : row.holders.toLocaleString(tag)}</td>
      <td className={`num ${tone}`}>{signed(row.changePct, tag)}</td>
      <td className="dim">{bits.length ? bits.join(" · ") : "—"}</td>
    </tr>
  );
}
