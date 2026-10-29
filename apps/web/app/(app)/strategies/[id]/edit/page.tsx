import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import { EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/domain";
import { StrategyBuilder } from "@/components/builder/StrategyBuilder";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Edit strategy" };

async function Edit({ params }: { params: PageProps<"/strategies/[id]/edit">["params"] }) {
  const [{ id }, mode, t] = await Promise.all([params, getMode(), getT()]);
  const s = await getApi().getStrategy(id);
  if (!s) notFound();
  const crumb = <Link href="/strategies" className="hover:underline">{t("nav.strategies")}</Link>;
  if (s.mode !== mode) {
    return (
      <>
        <PageHeader title={t("strategies.edit")} breadcrumb={crumb} />
        <EmptyState title={t("mode.otherWorkspace", { mode: t(s.mode === "real" ? "mode.realShort" : "mode.practiceShort") })} detail={t("mode.otherWorkspaceDetail")} />
      </>
    );
  }
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2">{t("builder.editTitle", { name: s.name })} <StatusBadge status={s.status} /></span>} breadcrumb={crumb} subtitle={t("builder.editSubtitle", { rev: s.rev })} />
      <StrategyBuilder initial={structuredClone(s.settings)} base={s.status === "draft" ? null : s.settings} strategyId={s.id} rev={s.rev} mode={s.mode} draftKey={`sentra_draft_${s.id}_rev${s.rev}`} />
    </>
  );
}

export default function EditStrategyPage(props: PageProps<"/strategies/[id]/edit">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
      <Edit params={props.params} />
    </Suspense>
  );
}
