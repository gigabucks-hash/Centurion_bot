"use client";
import type { TradingMode } from "@/lib/types";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** Persistent, non-dismissable mode banner on every screen (SPEC §1). */
export function ModeBanner({ mode, walletConnected }: { mode: TradingMode; walletConnected: boolean }) {
  const t = useT();
  return (
    <div
      role="status"
      className={cn(
        "flex h-8 items-center px-4 text-label font-semibold",
        mode === "practice" ? "stripes-practice bg-mode-practiceContainer text-mode-practice" : "bg-mode-real text-mode-onReal",
      )}
    >
      {mode === "practice" ? (
        <span>{t("mode.bannerPractice")}</span>
      ) : (
        <span>{t(walletConnected ? "mode.bannerRealConnected" : "mode.bannerRealMock")}</span>
      )}
    </div>
  );
}
