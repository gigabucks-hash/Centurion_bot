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

async function Queue({ searchParams }: { searchParams: Promise<{ focus?: string | string[] }> }) {
  await connection(); // always read fresh mock state at request time
  const [mode, t, sp] = await Promise.all([getMode(), getT(), searchParams]);
  // ?focus=<approval id> (builder "Open the proposal"): validated as a plain id, ignored otherwise.
  const focus = typeof sp.focus === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(sp.focus) ? sp.focus : null;
  const approvals = await getApi().listApprovals(mode);
  return (
    <>
      <PageHeader
        title={t("approvals.title")}
        subtitle={t(mode === "real" ? "approvals.subtitleReal" : "approvals.subtitlePractice")}
        actions={<ModeBadge mode={mode} />}
      />
      <ApprovalQueue key={mode} initial={approvals} mode={mode} initialFocus={focus} />
    </>
  );
}

export default function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-bg-surface" />}>
      <Queue searchParams={searchParams as Promise<{ focus?: string | string[] }>} />
    </Suspense>
  );
}
