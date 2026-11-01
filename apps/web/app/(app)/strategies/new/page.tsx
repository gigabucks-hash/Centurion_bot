import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import { STRATEGY_PRESETS, blankSettings } from "@/lib/strategy-schema";
import { PageHeader, cn } from "@/components/ui";
import { StrategyBuilder } from "@/components/builder/StrategyBuilder";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "New strategy" };

async function Builder({ searchParams }: { searchParams: PageProps<"/strategies/new">["searchParams"] }) {
  const [sp, mode, t] = await Promise.all([searchParams, getMode(), getT()]);
  const preset = typeof sp.preset === "string" ? sp.preset : "balanced";
  const from = typeof sp.from === "string" ? await getApi().getStrategy(sp.from) : null;
  const source = from && from.mode === mode ? from : null;
  const initial = source
    ? { ...structuredClone(source.settings), name: `${source.name} ${t("builder.copySuffix")}`.slice(0, 60), mode: "practice" as const }
    : (STRATEGY_PRESETS.find((p) => p.id === preset)?.build() ?? blankSettings());
  const active = source ? "" : preset;
  return (
    <>
      <PageHeader title={t("builder.newTitle")} breadcrumb={<Link href="/strategies" className="tap hover:underline">{t("nav.strategies")}</Link>} subtitle={t("builder.newSubtitle")} />
      {!source && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-label text-text-secondary">{t("builder.startFrom")}</span>
          {[...STRATEGY_PRESETS.map((p) => ({ id: p.id, label: t(`preset.${p.id}`) })), { id: "blank", label: t("builder.blank") }].map((p) => (
            <Link key={p.id} href={`/strategies/new?preset=${p.id}`} className={cn("tap h-8 justify-center rounded-full border px-3 text-label leading-8", active === p.id ? "border-brand-primary bg-brand-primaryContainer text-brand-onPrimaryContainer" : "border-border-default text-text-secondary hover:text-text-primary")}>
              {p.label}
            </Link>
          ))}
        </div>
      )}
      {mode === "real" && <p className="mb-4 rounded-md border border-border-default bg-bg-sunken px-3 py-2 text-caption text-text-secondary">{t("builder.realNote")}</p>}
      <StrategyBuilder key={`${preset}-${source?.id ?? ""}`} initial={initial} base={null} strategyId={null} rev={null} mode="practice" draftKey={`sentra_draft_new_${source?.id ?? preset}`} />
    </>
  );
}

export default function NewStrategyPage(props: PageProps<"/strategies/new">) {
  return (
    <>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
        <Builder searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
