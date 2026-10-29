import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import { PageHeader } from "@/components/ui";
import { ModeBadge } from "@/components/domain";
import { ApprovalQueue } from "@/components/approvals/ApprovalQueue";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Approvals" };

async function Queue() {
  await connection(); // always read fresh mock state at request time
  const [mode, t] = await Promise.all([getMode(), getT()]);
  const approvals = await getApi().listApprovals(mode);
  return (
    <>
      <PageHeader
        title={t("approvals.title")}
        subtitle={t(mode === "real" ? "approvals.subtitleReal" : "approvals.subtitlePractice")}
        actions={<ModeBadge mode={mode} />}
      />
      <ApprovalQueue key={mode} initial={approvals} mode={mode} />
    </>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-bg-surface" />}>
      <Queue />
    </Suspense>
  );
}
