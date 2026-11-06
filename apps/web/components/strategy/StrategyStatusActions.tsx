"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import type { Strategy } from "@/lib/types";
import { pauseStrategyClient, resumeStrategyClient } from "@/lib/client";
import { ApiError, errorText } from "@/lib/errors";
import { cn } from "@/components/ui";
import { useToast } from "@/components/ui/client";
import { useT } from "@/lib/i18n/client";

/**
 * Pause/resume for a running or paused strategy (D5). Uses the real backend route
 * `POST /strategies/{id}/pause|resume` with `If-Match: "<rev>"` in both data sources; the mock BFF answers the same
 * wire shape. A 409/428 refreshes the card so the user sees the current status/rev before retrying.
 * Draft/archived strategies have no pause action.
 */
export function StrategyStatusActions({ id, name, status, rev }: Pick<Strategy, "id" | "name" | "status" | "rev">) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (status !== "running" && status !== "paused") return null;
  const pausing = status === "running";

  async function run() {
    setBusy(true);
    try {
      if (pausing) await pauseStrategyClient(id, rev);
      else await resumeStrategyClient(id, rev);
      toast({ kind: "info", text: t(pausing ? "strategies.pausedToast" : "strategies.resumedToast", { name }) });
      router.refresh();
    } catch (e) {
      toast({ kind: "error", text: errorText(t, e) });
      if (e instanceof ApiError) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={run} disabled={busy} className={cn("inline-flex h-8 items-center gap-1 rounded-md border border-border-default px-3 text-label hover:bg-bg-raised disabled:opacity-60")}>
      {pausing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
      {pausing ? t("strategies.pause") : t("strategies.resume")}
    </button>
  );
}
