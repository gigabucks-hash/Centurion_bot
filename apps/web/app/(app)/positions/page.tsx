import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getMode } from "@/lib/mode";
import { listOpenPositions } from "@/lib/mock/store";
import { PageHeader } from "@/components/ui";
import { ModeBadge } from "@/components/domain";
import { PositionsBoard } from "@/components/positions/PositionsBoard";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Positions" };

async function Body() {
  await connection();
  const [mode, t] = await Promise.all([getMode(), getT()]);
  return (
    <>
      <PageHeader title={t("positions.title")} subtitle={t(mode === "real" ? "positions.subtitleReal" : "positions.subtitlePractice")} actions={<ModeBadge mode={mode} />} />
      <PositionsBoard key={mode} initial={listOpenPositions(mode)} mode={mode} />
    </>
  );
}

export default function PositionsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-bg-surface" />}>
      <Body />
    </Suspense>
  );
}
