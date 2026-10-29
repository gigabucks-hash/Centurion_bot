"use client";
import Link from "next/link";
import type { TradeEvent } from "@/lib/types";
import { eventKindMeta } from "@/components/domain";
import { useT } from "@/lib/i18n/client";
import { Pnl, cn } from "@/components/ui";
import { fmtClock } from "@/lib/format";
import { EventTitle } from "@/components/EventTitle";

/** Timeline-style feed row: time · dot · ACTOR / KIND $SYM / reason. */
export function EventRow({ e, strategyName, fresh }: { e: TradeEvent; strategyName?: string; fresh?: boolean }) {
  const t = useT();
  const m = eventKindMeta[e.kind];
  return (
    <li className={cn("grid grid-cols-[3rem_0.75rem_1fr] gap-x-2 py-2.5", fresh && "rounded-md bg-brand-primaryContainer/40")}>
      <span className="num pt-0.5 text-numSm text-text-tertiary">{fmtClock(e.ts)}</span>
      <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", m.dot)} aria-hidden />
      <span className="min-w-0">
        <span className="block text-overline uppercase tracking-wide text-text-tertiary">
          {t(`actor.${e.actor}`)} · {t(`kind.${e.kind}`)}
        </span>
        <span className="block text-body font-semibold">
          {e.mint ? (
            <Link href={`/coins/${e.mint}`} className="hover:underline">
              <EventTitle e={e} />
            </Link>
          ) : (
            <EventTitle e={e} />
          )}
          {e.pnlSol != null && <Pnl sol={e.pnlSol} className="ml-2 text-caption font-normal" />}
        </span>
        {(e.reason || strategyName) && (
          <span className="block truncate text-caption text-text-secondary">
            {[strategyName, e.reason].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
    </li>
  );
}
