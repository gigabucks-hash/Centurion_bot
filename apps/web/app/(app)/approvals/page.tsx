import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { acrossModes, listAllStrategies, modesOf } from "@/lib/mode";
import { PageHeader } from "@/components/ui";
import { ApprovalQueue } from "@/components/approvals/ApprovalQueue";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Approvals" };

async function Queue({ searchParams }: { searchParams: Promise<{ focus?: string | string[] }> }) {
  await connection(); // always read fresh mock state at request time
  const api = getApi();
  const [all, t, sp] = await Promise.all([listAllStrategies(api), getT(), searchParams]);
  // Per-strategy mode: one merged queue, each card badged with its own Paper/Real mode.
  const modes = modesOf(all);
  // ?focus=<approval id> (builder "Open the proposal"): validated as a plain id, ignored otherwise.
  const focus = typeof sp.focus === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(sp.focus) ? sp.focus : null;
  const approvals = (await acrossModes(modes, (m) => api.listApprovals(m))).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <>
      <PageHeader
        title={t("approvals.title")}
        subtitle={t(modes.includes("real") ? "approvals.subtitleReal" : "approvals.subtitlePractice")}
      />
      <ApprovalQueue key={modes.join(",")} initial={approvals} modes={modes} initialFocus={focus} />
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
