"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Play, ShieldAlert } from "lucide-react";
import type { TradingState } from "@/lib/types";
import { fetchTradingClient, setBuysPausedClient } from "@/lib/trading-client";
import { ApiError, errorText } from "@/lib/errors";
import { Badge, Button, Card } from "@/components/ui";
import { Dialog, useToast } from "@/components/ui/client";
import { useFmt, useT } from "@/lib/i18n/client";

/**
 * Workspace-wide "Stop buying" switch (Settings). Pause needs a danger confirm; resume is immediate but still confirmed.
 * Optimistic `If-Match` rev: on 409 VERSION_CONFLICT we re-read GET /trading and ask the user to retry (never retry blindly).
 * `RESUME_REQUIRES_APP` (403) is surfaced as "resume in the app" copy.
 */
export function TradingControls({ initial }: { initial: TradingState }) {
  const t = useT();
  // Copy keys live in lib/i18n/en.ts + id.ts (owned by another change); listed in the hand-off. Until they land,
  // next-intl renders the key rather than throwing, so the control still works.
  const tr = (key: string, vars?: Record<string, string | number>) => t(key as never, vars);
  const f = useFmt();
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<TradingState>(initial);
  const [dialog, setDialog] = useState<"pause" | "resume" | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setState(await fetchTradingClient());
    } catch {
      /* keep the last known state; the page refresh below reports the real one */
    }
  }

  async function run(paused: boolean) {
    setBusy(true);
    try {
      const next = await setBuysPausedClient(paused, state.rev);
      setState(next);
      toast({ kind: "success", text: tr(paused ? "trading.stopped" : "trading.resumed") });
      setDialog(null);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "VERSION_CONFLICT") {
        await refresh();
        toast({ kind: "warning", text: tr("trading.conflict") });
      } else if (e instanceof ApiError && e.code === "RESUME_REQUIRES_APP") {
        toast({ kind: "warning", text: tr("trading.resumeBlocked") });
      } else {
        toast({ kind: "error", text: errorText(t, e) });
      }
      setDialog(null);
      if (e instanceof ApiError) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="trading-controls">
      <Card
        title={tr("trading.title")}
        subtitle={tr("trading.subtitle")}
        action={<Badge tone={state.buysPaused ? "warning" : "profit"}>{tr(state.buysPaused ? "trading.paused" : "trading.active")}</Badge>}
      >
        <dl className="grid gap-2 text-caption sm:grid-cols-2" data-testid="trading-status">
          <div>
            <dt className="text-text-tertiary">{tr("trading.stateLabel")}</dt>
            <dd className="text-text-primary">{tr(state.buysPaused ? "trading.paused" : "trading.active")}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">{tr("trading.agentLabel")}</dt>
            <dd className="text-text-primary">{tr(state.agentTradeEnabled ? "trading.agentOn" : "trading.agentOff")}</dd>
          </div>
          {state.buysPaused && (
            <>
              <div>
                <dt className="text-text-tertiary">{tr("trading.pausedAt")}</dt>
                <dd className="num text-text-primary" data-testid="trading-paused-at">
                  {state.buysPausedAt != null ? `${f.dateTime(state.buysPausedAt)} WIB` : tr("common.none")}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{tr("trading.pausedVia")}</dt>
                <dd className="text-text-primary" data-testid="trading-paused-via">{state.buysPausedVia ?? tr("common.none")}</dd>
              </div>
            </>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {state.buysPaused ? (
            <Button variant="primary" data-testid="trading-resume" onClick={() => setDialog("resume")} disabled={busy}>
              <Play size={14} aria-hidden /> {tr("trading.resume")}
            </Button>
          ) : (
            <Button variant="danger" data-testid="trading-stop" onClick={() => setDialog("pause")} disabled={busy}>
              <Ban size={14} aria-hidden /> {tr("trading.stop")}
            </Button>
          )}
          <span className="text-caption text-text-tertiary">{tr("trading.rev", { rev: state.rev })}</span>
        </div>
      </Card>

      <Dialog
        open={dialog !== null}
        onClose={() => (busy ? undefined : setDialog(null))}
        accent="warning"
        title={dialog === "pause" ? tr("trading.stopConfirmTitle") : tr("trading.resumeConfirmTitle")}
      >
        <p className="flex items-start gap-2 text-body text-text-secondary">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-semantic-warning" aria-hidden />
          <span>{dialog === "pause" ? tr("trading.stopConfirmBody") : tr("trading.resumeConfirmBody")}</span>
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" data-testid="trading-cancel" onClick={() => setDialog(null)} disabled={busy}>
            {tr("common.cancel")}
          </Button>
          <Button
            variant={dialog === "pause" ? "danger" : "primary"}
            data-testid="trading-confirm"
            loading={busy}
            onClick={() => run(dialog === "pause")}
          >
            {dialog === "pause" ? tr("trading.stop") : tr("trading.resume")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}