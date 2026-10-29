"use client";
import type { CoinTrail } from "@/lib/types";
import { fmtDuration, fmtNum } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/components/ui";
import { pnlArrow, pnlTone } from "@/lib/pnl";

const signed = (v: number) => `${pnlArrow(v)} ${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtNum(v, 0)}%`.trim();

type Node = { id: string; label: string; value: string; tone: "brand" | "profit" | "loss" | "guard" | "neutral"; reached: boolean };

/** Step nodes Screen → Guard → Entry → Buy → TP → Exit → Closed (SPEC §4). */
export function trailNodes(tr: T, t: CoinTrail): Node[] {
  const ev = (k: string, pred?: (e: CoinTrail["events"][number]) => boolean) => t.events.find((e) => e.kind === k && (!pred || pred(e)));
  const screened = ev("passed", (e) => e.actor === "screener");
  const blocked = ev("blocked");
  const guard = ev("passed", (e) => e.actor === "guard");
  const armed = ev("armed");
  const bought = ev("bought");
  const tp = ev("sold", (e) => !!e.partial);
  const exit = ev("sold", (e) => !e.partial);
  const pos = t.positions[0];
  return [
    { id: "screen", label: tr("trail.node.screen"), value: t.score ? tr("trail.node.fit", { v: t.score.value, p: t.score.passMark }) : "—", tone: blocked && !screened ? "loss" : "neutral", reached: true },
    { id: "guard", label: tr("trail.node.guard"), value: blocked ? tr("trail.node.blocked") : guard ? tr("trail.node.passed") : "—", tone: blocked ? "guard" : "brand", reached: !!(guard || blocked) },
    { id: "entry", label: tr("trail.node.entry"), value: armed?.reason?.replace("waiting for ", "") ?? "—", tone: "brand", reached: !!armed },
    { id: "buy", label: tr("trail.node.buy"), value: bought?.solAmount ? `${fmtNum(bought.solAmount, 3)} SOL` : "—", tone: "brand", reached: !!bought },
    { id: "tp", label: tr("trail.node.tp"), value: tp?.pctChange ? signed(tp.pctChange) : "—", tone: "profit", reached: !!tp },
    { id: "exit", label: exit?.exitReason ? tr(`exitReason.${exit.exitReason}`) : tr("trail.node.exit"), value: exit?.pctChange != null ? signed(exit.pctChange) : "—", tone: pnlTone(exit?.pctChange), reached: !!exit },
    { id: "closed", label: tr("trail.node.closed"), value: pos?.status === "closed" ? `${signed(pos.pnlPct)} · ${fmtDuration(Math.round(((pos.closedAt ?? 0) - pos.openedAt) / 1000))}` : pos ? tr("trail.node.open") : "—", tone: pnlTone(pos?.pnlPct), reached: pos?.status === "closed" },
  ];
}

const ring = { brand: "border-brand-primary text-brand-primary", profit: "border-semantic-profit text-semantic-profit", loss: "border-semantic-loss text-semantic-loss", guard: "border-semantic-guard text-semantic-guard", neutral: "border-text-secondary text-text-secondary" };

export function CoinTrailSteps({ trail }: { trail: CoinTrail }) {
  const t = useT();
  const nodes = trailNodes(t, trail);
  return (
    <ol className="flex items-start overflow-x-auto pb-1" aria-label={t("trail.stepsAria")}>
      {nodes.map((n, i) => (
        <li key={n.id} className="relative flex min-w-20 flex-1 flex-col items-center text-center">
          {i > 0 && <span className={cn("absolute top-4 right-1/2 h-px w-full", n.reached ? "bg-border-strong" : "bg-border-subtle")} aria-hidden />}
          <span className={cn("relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 bg-bg-surface text-label", n.reached ? ring[n.tone] : "border-border-subtle text-text-disabled")}>{i + 1}</span>
          <span className={cn("mt-1.5 text-label", n.reached ? "text-text-primary" : "text-text-disabled")}>{n.label}</span>
          <span className="num text-caption text-text-secondary">{n.reached ? n.value : "—"}</span>
        </li>
      ))}
    </ol>
  );
}
