import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { listAllStrategies, modesOf } from "@/lib/mode";
import { safeSymbol } from "@/lib/untrusted";
import { PageHeader } from "@/components/ui";
import { PositionsBoard } from "@/components/positions/PositionsBoard";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Positions" };

async function Body() {
  await connection();
  const api = getApi();
  const [all, t] = await Promise.all([listAllStrategies(api), getT()]);
  // Per-strategy mode: every open position of every mode, each row badged; Real rules follow the row's mode.
  const modes = modesOf(all);
  const rows = (await Promise.all(modes.map((m) => api.listOpenPositions(m)))).flat().map((p) => ({ ...p, symbol: safeSymbol(p.symbol) }));
  return (
    <>
      <PageHeader title={t("positions.title")} subtitle={t(modes.includes("real") ? "positions.subtitleReal" : "positions.subtitlePractice")} />
      <PositionsBoard key={modes.join(",")} initial={rows} />
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
