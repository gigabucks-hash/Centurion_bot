import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getApi } from "@/lib/api";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import { StatusBadge, StrategyModeChips } from "@/components/domain";
import { StrategyModeCard } from "@/components/strategy/StrategyModeCard";
import { StrategyBuilder } from "@/components/builder/StrategyBuilder";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Edit strategy" };

/**
 * The existence check runs in the page itself, before anything is rendered: notFound() can only set HTTP 404 while
 * no byte has gone out, so this route must not sit behind a Suspense boundary (no page-level <Suspense>, no
 * `loading.tsx` in this segment or above it, no Suspense around <Shell> in app/(app)/layout.tsx).
 */
export default async function EditStrategyPage(props: PageProps<"/strategies/[id]/edit">) {
  await connection();
  const [{ id }, t] = await Promise.all([props.params, getT()]);
  const s = await getApi().getStrategy(id);
  if (!s) notFound();
  const crumb = <Link href="/strategies" className="hover:underline">{t("nav.strategies")}</Link>;
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2">{t("builder.editTitle", { name: s.name })} <StrategyModeChips mode={s.mode} realLocked={s.realLocked} realLockedReason={s.realLockedReason} short /> <StatusBadge status={s.status} /></span>} breadcrumb={crumb} subtitle={t("builder.editSubtitle", { rev: s.rev })} />
      {/* Per-strategy Paper/Real (contracts 1.1.6): this strategy's own mode, gated by real_locked. */}
      <StrategyModeCard key={`${s.id}-${s.rev}-${s.mode}`} strategy={s} />
      <StrategyBuilder initial={structuredClone(s.settings)} base={s.status === "draft" ? null : s.settings} strategyId={s.id} rev={s.rev} mode={s.mode} draftKey={`centurion_draft_${s.id}_rev${s.rev}`} />
    </>
  );
}
