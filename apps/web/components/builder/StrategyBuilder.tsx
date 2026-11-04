"use client";
import { useFmt } from "@/lib/i18n/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, CircleDot, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { ApprovalMode, Venue, ExitPlanPreset, GuardPreset, StrategySettings, TradingMode } from "@/lib/types";
import {
  EXIT_PRESETS, GUARD_CHECKS, GUARD_PRESETS, MUST_HAVE, NUMBER_FIELDS, STEPS, type StepId,
  applyExitPreset, applyGuardPreset, diffSettings, getPath, setPath, settingLabel, stepStatus, validate, type Errors,
} from "@/lib/strategy-schema";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { asRevConflict, publishStrategyClient, simulateTeammateEditClient, type RevConflict } from "@/lib/client";
import { settingsFromWire, settingsToWire, type WireSettings } from "@/lib/contracts";
import { errorPresentation, errorText } from "@/lib/errors";

const pendingPr = errorPresentation("GUARD_WEAKEN_REQUIRES_APPROVAL");
import dynamic from "next/dynamic";
// Perf: the merge view only renders after a 409 → loaded on demand.
const RevisionConflict = dynamic(() => import("./RevisionConflict").then((m) => m.RevisionConflict), { ssr: false });

import { Badge, Button, Card, cn } from "@/components/ui";
import { NumberInput, Segmented, Toggle, useToast } from "@/components/ui/client";
import { ModeBadge } from "@/components/domain";
import { readMigrated } from "@/lib/legacy-storage";

const AUTOSAVE_MS = 800;

/** Renders a validation message (i18n key + params). */
function useErrText() {
  const t = useT();
  return (m?: { key: MessageKey; vars?: Record<string, string | number> }) => (m ? t(m.key, m.vars) : undefined);
}

/**
 * Strategy builder (SPEC §2, wireframe 06/07): 5 non-linear steps, presets,
 * per-field / per-step / cross-field validation, autosave (local draft only,
 * no secrets), before/after diff vs the active revision, mock publish.
 * Publishing a change that loosens a guard creates an approval item instead.
 */
export function StrategyBuilder({ initial, base, strategyId, rev, mode, draftKey }: {
  initial: StrategySettings;
  /** Active revision (edit) — null for a new strategy. */
  base: StrategySettings | null;
  strategyId: string | null;
  rev: number | null;
  mode: TradingMode;
  draftKey: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const fm = useFmt();
  const [s, setS] = useState(initial);
  const [step, setStep] = useState<StepId>("screener");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [restorable, setRestorable] = useState<StrategySettings | null>(null);
  const [onlyWeak, setOnlyWeak] = useState(false);
  const [publishing, setPublishing] = useState(false);
  /** 1.1.4: a guard-loosening save returns 202 {proposal, guard_change}; nothing applied → "Sent for approval". */
  const [sent, setSent] = useState<{ approvalId: string; fields: string[]; expiresAt?: number } | null>(null);
  // The revision the user's edits are based on (If-Match). Moves forward after a merge.
  const [baseRev, setBaseRev] = useState<{ rev: number; settings: StrategySettings } | null>(base && rev != null ? { rev, settings: base } : null);
  const [conflict, setConflict] = useState<{ c: RevConflict; base: WireSettings; mine: WireSettings } | null>(null);
  const [mergedNote, setMergedNote] = useState<number | null>(null);
  const first = useRef(true);

  // Offer to restore a local draft (non-secret settings only).
  useEffect(() => {
    const tm = setTimeout(() => {
      try {
        const raw = readMigrated(localStorage, draftKey);
        if (raw) setRestorable(JSON.parse(raw) as StrategySettings);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(tm);
  }, [draftKey]);

  // Autosave (debounced 800 ms).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const tm = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(s));
        setSavedAt(Date.now());
        setDirty(false);
      } catch {
        /* storage full / disabled */
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(tm);
  }, [s, draftKey]);

  const errText = useErrText();
  const errors = useMemo(() => validate(s), [s]);
  const diffBase = baseRev?.settings ?? base;
  const diff = useMemo(() => (diffBase ? diffSettings(diffBase, s) : []), [diffBase, s]);
  const weakKeys = useMemo(() => new Set(diff.filter((r) => r.direction === "weakens").map((r) => r.key)), [diff]);
  const stepWeak = (id: StepId) =>
    [...weakKeys].some((k) => (k.startsWith("guard.") ? id === "guard" : k.startsWith("screener.") ? id === "screener" : k === "approvalMode" ? id === "entry" : k.startsWith("exit.") ? id === "exit" : false));
  const errorCount = Object.keys(errors).length;

  const update = (path: string, v: unknown) => {
    setS((p) => setPath(p, path, v));
    setDirty(true);
  };
  const replace = (next: StrategySettings) => {
    setS(next);
    setDirty(true);
  };

  // 1.1.2: the hard stop (from ENTRY, stop_loss_pct) and the trailing stop (from PEAK, peak_trail_pct) are two
  // separate settings; their hints name the wire key and the reference price so they are never confused.
  const wireHint = (path: string): string | null =>
    path === "exit.stopLossPct" ? t("builder.hintStopLoss") : path === "exit.trailingPct" ? t("builder.hintTrail") : path === "exit.timeStopMinutes" ? t.ux("builder.exit.time_stop_hint", { duration: v2dur(getPath(s, path) as number) }) : null;
  /** minutes → "5m" / "1h 30m" style text via the shared duration formatter (seconds in). 0 → "off". */
  const v2dur = (minutes: number) => (minutes > 0 ? fm.duration(Math.round(minutes * 60)) : t("common.off"));
  const field = (path: string) => {
    const f = NUMBER_FIELDS.find((x) => x.path === path)!;
    const v = getPath(s, path) as number;
    const b = diffBase ? (getPath(diffBase, path) as number) : null;
    const weakening = b != null && f.guard != null && (f.guard === "max" ? v > b : v < b);
    return (
      <NumberInput
        key={path}
        label={settingLabel(t, f.path, f.label)}
        value={v}
        onChange={(n) => {
          update(path, n);
          if (path.startsWith("guard.max")) update("guard.preset", "custom");
        }}
        unit={f.unit}
        min={f.min}
        max={f.max}
        step={f.inc ?? 1}
        error={errText(errors[path])}
        hint={b != null && b !== v ? t("builder.activeValue", { v: fm.num(b, 2, 0) }) : wireHint(path) ?? f.path}
        weakening={weakening}
      />
    );
  };

  async function publish() {
    if (errorCount) {
      toast({ kind: "error", text: t("builder.fixN", { n: errorCount }) });
      return;
    }
    if (conflict) return;
    setPublishing(true);
    try {
      const r = await publishStrategyClient(strategyId, s, baseRev ?? undefined);
      localStorage.removeItem(draftKey);
      if (r.outcome === "needs_approval") {
        setSent({ approvalId: r.approvalId ?? "", fields: r.weakenedFields ?? [], expiresAt: r.expiresAt });
        setDirty(false);
        window.scrollTo({ top: 0 });
      } else {
        toast({ kind: "success", text: t("builder.published", { rev: r.rev }) });
        router.push("/strategies");
      }
      router.refresh();
    } catch (e) {
      const c = asRevConflict(e);
      if (c && baseRev) setConflict({ c, base: settingsToWire(baseRev.settings), mine: settingsToWire(s) });
      else toast({ kind: "error", text: errorText(t, e) });
    } finally {
      setPublishing(false);
    }
  }

  function resolveConflict(merged: WireSettings | null) {
    if (!conflict) return;
    const theirs = settingsFromWire(conflict.c.current.settings, s);
    setBaseRev({ rev: conflict.c.current_rev, settings: theirs });
    setS(merged ? { ...settingsFromWire(merged, s), mode: s.mode } : theirs);
    setMergedNote(merged ? conflict.c.current_rev : null);
    setConflict(null);
  }

  async function teammateEdit() {
    if (!strategyId) return;
    try {
      const w = await simulateTeammateEditClient(strategyId);
      toast({ kind: "info", text: t("builder.teammateEdited", { rev: w.rev }) });
    } catch (e) {
      toast({ kind: "error", text: errorText(t, e) });
    }
  }

  return (
    <div data-mode={mode}>
      {sent && (
        <div role="status" data-testid="sent-for-approval" className="mb-4 rounded-md border border-semantic-warning/60 bg-semantic-warningContainer px-4 py-3 text-body">
          {/* errors.map.json GUARD_WEAKEN_REQUIRES_APPROVAL: tone pending → status banner, not an error; title_key/cta_key. */}
          <p className="flex items-center gap-2 font-semibold"><CircleDot size={14} className="text-semantic-warning" aria-hidden /> {pendingPr.titleKey ? t.ux(pendingPr.titleKey as never) : t("builder.sentTitle")}</p>
          <p className="mt-1 text-text-secondary">{sent.expiresAt ? t.ux("guard.weaken.pending.body", { expires_at: fm.dateTime(sent.expiresAt) }) : t("builder.sentBody", { strategy: s.name })}</p>
          {sent.fields.length > 0 && <p className="num mt-1 text-caption text-text-tertiary">{t("builder.sentFields", { fields: sent.fields.map((k) => settingLabel(t, k, k)).join(", ") })}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/approvals?focus=${encodeURIComponent(sent.approvalId)}`} className="inline-flex min-h-11 items-center rounded-md bg-brand-primary px-4 text-label text-text-onAccent hover:bg-brand-primaryHover">{pendingPr.ctaKey ? t.ux(pendingPr.ctaKey as never) : t("builder.openProposal")}</Link>
            <Button variant="ghost" className="min-h-11" onClick={() => setSent(null)}>{t("builder.keepEditing")}</Button>
          </div>
        </div>
      )}
      {conflict && (
        <RevisionConflict conflict={conflict.c} base={conflict.base} mine={conflict.mine} onMerged={(m) => resolveConflict(m)} onDiscard={() => resolveConflict(null)} />
      )}
      {mergedNote != null && !conflict && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-semantic-info/40 bg-semantic-infoContainer px-4 py-2 text-body">
          <Check size={14} className="text-semantic-info" /> {t("conflict.merged", { rev: mergedNote })}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setMergedNote(null)}>{t("common.dismiss")}</Button>
        </div>
      )}
      {restorable && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-semantic-info/40 bg-semantic-infoContainer px-4 py-2 text-body">
          <RotateCcw size={14} className="text-semantic-info" /> {t("builder.draftExists", { name: restorable.name })}
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => { replace(restorable); setRestorable(null); }}>{t("common.restore")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem(draftKey); setRestorable(null); }}>{t("common.discard")}</Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="strategy-name" className="mb-1 block text-label text-text-secondary">{t("builder.name")}</label>
          <input
            id="strategy-name"
            value={s.name}
            onChange={(e) => update("name", e.target.value)}
            maxLength={60}
            className={cn("h-10 w-full rounded-md border bg-bg-sunken px-3 text-bodyLg outline-none focus:outline-2 focus:outline-border-focus", errors.name ? "border-semantic-loss" : "border-border-default")}
          />
        </div>
        <ModeBadge mode={mode} />
        <span className="text-caption text-text-tertiary" aria-live="polite">
          {dirty ? t("builder.saving") : savedAt ? t("builder.saved", { time: fm.time(savedAt) }) : baseRev ? t("builder.activeRev", { rev: baseRev.rev }) : t("builder.notSaved")}
        </span>
        {strategyId && (
          <Button size="sm" variant="ghost" onClick={teammateEdit}>{t("builder.simulateTeammate")}</Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_20rem]">
        <nav aria-label={t("builder.steps")} className="flex gap-2 overflow-x-auto lg:flex-col">
          {STEPS.map((st, i) => {
            const status = stepStatus(errors, st.id, stepWeak(st.id));
            return (
              <button
                key={st.id}
                onClick={() => setStep(st.id)}
                aria-current={step === st.id ? "step" : undefined}
                className={cn(
                  "flex min-h-tap shrink-0 items-center gap-2 rounded-md border px-3 text-left text-label",
                  step === st.id ? "border-brand-primary bg-brand-primaryContainer text-brand-onPrimaryContainer" : "border-border-subtle bg-bg-surface text-text-secondary hover:text-text-primary",
                )}
              >
                <span className="num grid h-6 w-6 place-items-center rounded-full bg-bg-sunken text-caption">{i + 1}</span>
                <span className="flex-1">{t(`steps.${st.id}`)}</span>
                {status === "error" ? <AlertTriangle size={14} className="text-semantic-loss" aria-label={t("builder.hasErrors")} /> : status === "weakened" ? <CircleDot size={14} className="text-semantic-warning" aria-label={t("builder.loosens")} /> : <Check size={14} className="text-semantic-profit" aria-label={t("builder.valid")} />}
              </button>
            );
          })}
        </nav>

        <Card title={t(`steps.${step}`)}>
          {step === "screener" && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1 text-label text-text-secondary">{t("builder.streams")}</p>
                <div className="flex gap-2">
                  {(["curve", "amm"] as Venue[]).map((c) => {
                    const on = s.screener.streams.includes(c);
                    return (
                      <Button key={c} size="sm" variant={on ? "primary" : "secondary"} aria-pressed={on} onClick={() => update("screener.streams", on ? s.screener.streams.filter((x) => x !== c) : [...s.screener.streams, c])}>
                        {c === "curve" ? t("builder.bonding") : t("builder.graduated")}
                      </Button>
                    );
                  })}
                </div>
                {errors["screener.streams"] && <p className="mt-1 text-caption text-semantic-loss">{errText(errors["screener.streams"])}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">{NUMBER_FIELDS.filter((f) => f.step === "screener").map((f) => field(f.path))}</div>
              <div>
                <p className="mb-1 text-label text-text-secondary">{t("builder.mustHave")}</p>
                <div className="flex flex-wrap gap-2">
                  {MUST_HAVE.map((m) => {
                    const on = s.screener.mustHave.includes(m.id);
                    const weak = weakKeys.has(`screener.mustHave.${m.id}`);
                    return (
                      <Button key={m.id} size="sm" variant={on ? "primary" : "secondary"} aria-pressed={on} className={weak ? "border-semantic-warning" : undefined} onClick={() => update("screener.mustHave", on ? s.screener.mustHave.filter((x) => x !== m.id) : [...s.screener.mustHave, m.id])}>
                        {t(`mustHave.${m.id}`)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === "guard" && (
            <div className="flex flex-col gap-4">
              <Segmented<GuardPreset>
                label={t("builder.guardPreset")}
                value={s.guard.preset}
                onChange={(p) => (p === "custom" ? update("guard.preset", "custom") : replace(applyGuardPreset(s, p)))}
                options={[...Object.keys(GUARD_PRESETS), "custom"].map((k) => ({ value: k as GuardPreset, label: t(`guardPreset.${k as GuardPreset}`) }))}
              />
              <div className="grid gap-3 sm:grid-cols-3">{NUMBER_FIELDS.filter((f) => f.step === "guard").map((f) => field(f.path))}</div>
              <div className="grid gap-1 sm:grid-cols-2">
                {GUARD_CHECKS.map((c) => (
                  <Toggle key={c.id} label={t(`check.${c.id}`)} checked={s.guard.checks[c.id]} warnWhenOff hint={s.guard.checks[c.id] ? t("builder.checkOn") : t("builder.checkOff")} onChange={(v) => { update(`guard.checks.${c.id}`, v); update("guard.preset", "custom"); }} />
                ))}
              </div>
            </div>
          )}

          {step === "entry" && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1 text-label text-text-secondary">{t("builder.approvalMode")}</p>
                <Segmented<ApprovalMode>
                  label={t("builder.approvalMode")}
                  value={s.approvalMode}
                  onChange={(v) => update("approvalMode", v)}
                  options={(["off", "ask_first_buy", "ask_every_buy"] as ApprovalMode[]).map((m) => ({ value: m, label: t(`approvalMode.${m}`), disabled: m === "off" && mode === "real" }))}
                />
                <p className="mt-1 text-caption text-text-tertiary">{t("approvalMode.defaultNote")} {mode === "real" ? t("approvalMode.offRealNote") : ""}</p>
                {errors.approvalMode && <p className="text-caption text-semantic-loss">{errText(errors.approvalMode)}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">{NUMBER_FIELDS.filter((f) => f.step === "entry").map((f) => field(f.path))}</div>
              <Toggle label={t("builder.breakout")} hint={t("builder.breakoutHint")} checked={s.entry.breakout.enabled} onChange={(v) => update("entry.breakout.enabled", v)} />
              {s.entry.breakout.enabled && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberInput label={t("builder.rangeWindow")} unit="min" value={s.entry.breakout.minutes} min={1} max={120} onChange={(v) => update("entry.breakout.minutes", v)} />
                  <NumberInput label={t("builder.maxRange")} unit="%" value={s.entry.breakout.rangePct} min={1} max={100} onChange={(v) => update("entry.breakout.rangePct", v)} />
                  <NumberInput label={t("builder.freshBuyers")} value={s.entry.breakout.buyers} min={1} max={100} onChange={(v) => update("entry.breakout.buyers", v)} />
                </div>
              )}
              <Toggle label={t("builder.activeTrading")} hint={t("builder.activeTradingHint")} checked={s.entry.activeTrading} onChange={(v) => update("entry.activeTrading", v)} />
              <Toggle label={t("builder.rebuy")} hint={t("builder.rebuyHint")} checked={s.entry.rebuy} onChange={(v) => update("entry.rebuy", v)} />
            </div>
          )}

          {step === "exit" && (
            <div className="flex flex-col gap-4">
              <Segmented<ExitPlanPreset>
                label={t("builder.exitPlan")}
                value={s.exit.plan}
                onChange={(p) => replace(applyExitPreset(s, p))}
                options={[...Object.keys(EXIT_PRESETS), "custom"].map((k) => ({ value: k as ExitPlanPreset, label: t(`exitPlan.${k as ExitPlanPreset}`) }))}
              />
              <Ladder s={s} errors={errors} onChange={(tps) => { update("exit.takeProfits", tps); update("exit.plan", "custom"); }} />
              <div className="grid gap-3 sm:grid-cols-2">{NUMBER_FIELDS.filter((f) => f.step === "exit" && !f.when).map((f) => field(f.path))}</div>
              {/* 1.1.4 stall_exit {window_s, min_move_pct}; off = null. Sells all when the price barely moves over the window. */}
              <Toggle label={t.ux("builder.exit.stall")} hint={t.ux("builder.exit.stall_hint", { min_move_pct: fm.pct(s.exit.stallMinMovePct, 2, false), window: v2dur(s.exit.stallWindowS / 60) })} checked={s.exit.stallExit} onChange={(v) => update("exit.stallExit", v)} />
              {s.exit.stallExit && <div className="grid gap-3 sm:grid-cols-2">{NUMBER_FIELDS.filter((f) => f.step === "exit" && f.when).map((f) => field(f.path))}</div>}
            </div>
          )}

          {step === "review" && <Review s={s} errors={errors} />}

          <div className="sticky bottom-[calc(3rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-border-subtle bg-bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0">
            <Button variant="ghost" disabled={step === STEPS[0].id} onClick={() => setStep(STEPS[STEPS.findIndex((x) => x.id === step) - 1].id)}>{t("common.back")}</Button>
            {step !== "review" ? (
              <Button variant="primary" onClick={() => setStep(STEPS[STEPS.findIndex((x) => x.id === step) + 1].id)}>{t("common.next")}</Button>
            ) : (
              <Button variant="primary" loading={publishing} disabled={errorCount > 0} onClick={publish}>{weakKeys.size ? t("builder.publishApproval") : t("builder.publish")}</Button>
            )}
          </div>
        </Card>

        <aside className="flex flex-col gap-4">
          <Card title={base ? t("builder.changesVs", { rev: baseRev?.rev ?? rev ?? "—" }) : t("builder.newStrategy")} action={base && diff.length > 0 ? (
            <label className="flex items-center gap-1.5 text-caption text-text-secondary"><input type="checkbox" checked={onlyWeak} onChange={(e) => setOnlyWeak(e.target.checked)} className="accent-[var(--color-brand-primary)]" /> {t("builder.onlyWeakening")}</label>
          ) : undefined}>
            {!base ? (
              <p className="text-caption text-text-secondary">{t("builder.newNote")}</p>
            ) : diff.length === 0 ? (
              <p className="text-caption text-text-secondary">{t("builder.noChanges")}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-caption">
                {diff.filter((r) => !onlyWeak || r.direction === "weakens").map((r) => (
                  <li key={r.key} className={cn("rounded-sm px-2 py-1", r.direction === "weakens" && "bg-semantic-warningContainer")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-text-primary">{settingLabel(t, r.key, r.label)}</span>
                      <Badge tone={r.direction === "weakens" ? "warning" : r.direction === "strengthens" ? "profit" : r.direction === "new" ? "info" : "neutral"}>{t(`builder.dir.${r.direction}`)}</Badge>
                    </div>
                    <span className="num text-text-secondary">{fm.value(r.before)} → <b className="text-text-primary">{fm.value(r.after)}</b></span>
                  </li>
                ))}
              </ul>
            )}
            {weakKeys.size > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-caption text-semantic-warning">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t(mode === "real" ? "builder.loosensNReal" : "builder.loosensN", { n: weakKeys.size })}
              </p>
            )}
          </Card>
          <Card title={t("builder.validation")}>
            {errorCount === 0 ? (
              <p className="flex items-center gap-1.5 text-caption text-semantic-profit"><Check size={12} /> {t("builder.allValid")}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-caption text-semantic-loss">
                {Object.entries(errors).slice(0, 8).map(([k, v]) => <li key={k}><span className="num">{settingLabel(t, k)}</span>: {errText(v)}</li>)}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Ladder({ s, errors, onChange }: { s: StrategySettings; errors: Errors; onChange: (tps: StrategySettings["exit"]["takeProfits"]) => void }) {
  const t = useT();
  const errText = useErrText();
  const tps = s.exit.takeProfits;
  const total = tps.reduce((a, r) => a + (r.sellPct || 0), 0);
  const set = (i: number, k: "gainPct" | "sellPct" | "pullbackPct", v: number) => onChange(tps.map((r, j) => (j === i ? { ...r, [k]: Number.isFinite(v) && v > 0 ? v : k === "pullbackPct" ? null : v } : r)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-label text-text-secondary">{t("builder.ladder")}</p>
        <span className={cn("num text-caption", total > 100 ? "text-semantic-loss" : "text-text-tertiary")}>{t("builder.sells", { n: total })}{total < 100 ? t("builder.rides", { n: 100 - total }) : ""}</span>
      </div>
      {tps.length === 0 && <p className="text-caption text-text-tertiary">{t("builder.noRungs")}</p>}
      <div className="flex flex-col gap-2">
        {tps.map((r, i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_2rem] items-end gap-2">
            <span className="num pb-2.5 text-caption text-text-tertiary">{i + 1}</span>
            <NumberInput compact label={t("builder.atGain")} unit="%" value={r.gainPct} onChange={(v) => set(i, "gainPct", v)} error={errText(errors[`exit.takeProfits.${i}.gainPct`])} />
            <NumberInput compact label={t("builder.sell")} unit="%" value={r.sellPct} onChange={(v) => set(i, "sellPct", v)} error={errText(errors[`exit.takeProfits.${i}.sellPct`])} />
            <NumberInput compact label={t("builder.pullback")} unit="%" value={r.pullbackPct ?? NaN} onChange={(v) => set(i, "pullbackPct", v)} error={errText(errors[`exit.takeProfits.${i}.pullbackPct`])} />
            <Button size="sm" variant="ghost" aria-label={t("builder.removeRung", { n: i + 1 })} onClick={() => onChange(tps.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
          </div>
        ))}
      </div>
      {errors["exit.takeProfits"] && <p className="mt-1 text-caption text-semantic-loss">{errText(errors["exit.takeProfits"])}</p>}
      <Button size="sm" className="mt-2" disabled={tps.length >= 8} onClick={() => onChange([...tps, { gainPct: (tps[tps.length - 1]?.gainPct ?? 0) + 50, sellPct: Math.max(1, Math.min(25, 100 - total)) }])}><Plus size={14} /> {t("builder.addRung")}</Button>
      {tps.length > 0 && (
        <div className="mt-3 flex h-6 overflow-hidden rounded-sm bg-bg-sunken" aria-label={t("builder.ladderPreview")}>
          {tps.map((r, i) => (
            <span key={i} className="flex items-center justify-center border-r border-bg-surface bg-semantic-profit/70 text-overline text-bg-canvas" style={{ width: `${Math.min(100, r.sellPct)}%` }}>+{r.gainPct}%</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Deterministic mock simulation from the settings (no backtest backend yet). */
function Review({ s, errors }: { s: StrategySettings; errors: Errors }) {
  const t = useT();
  const fm = useFmt();
  const looseness = (100 - s.screener.passMark) / 50 + s.guard.maxBundlersPct / 40 + (8 - Object.values(s.guard.checks).filter(Boolean).length) / 8;
  const perDay = Math.round(40 + looseness * 45);
  const winRate = Math.max(20, Math.min(70, 58 - looseness * 8));
  const dd = Math.round(8 + looseness * 5);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-2 text-caption sm:grid-cols-2">
        {[
          [t("builder.sum.streams"), s.screener.streams.map((c) => (c === "curve" ? t("builder.bonding") : t("builder.graduated"))).join(", ")],
          [t("builder.sum.passMark"), `${s.screener.passMark} pts`],
          [t("builder.sum.guard"), t("builder.sumGuard", { preset: t(`guardPreset.${s.guard.preset}`), n: Object.values(s.guard.checks).filter(Boolean).length })],
          [t("builder.sum.approval"), t(`approvalMode.${s.approvalMode}`)],
          [t("builder.sum.sizing"), t("builder.sumSizing", { trade: fm.sol(s.sizing.tradeSol), budget: fm.sol(s.sizing.budgetSol), max: s.sizing.maxOpen })],
          [t("builder.sum.exit"), t("builder.sumExit", { n: s.exit.takeProfits.length, trail: s.exit.trailingPct, sl: s.exit.stopLossPct })],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-bg-sunken px-3 py-2"><dt className="text-text-tertiary">{k}</dt><dd className="num text-text-primary">{v}</dd></div>
        ))}
      </dl>
      <div className="rounded-md border border-border-subtle p-3">
        <p className="text-label">{t("builder.sim")} <span className="text-caption font-normal text-text-tertiary">{t("builder.simNote")}</span></p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div><p className="num text-numMd">{perDay}</p><p className="text-caption text-text-tertiary">{t("builder.simPass")}</p></div>
          <div><p className="num text-numMd">{fm.num(winRate, 0)}%</p><p className="text-caption text-text-tertiary">{t("builder.simWin")}</p></div>
          <div><p className="num text-numMd text-semantic-loss">−{dd}%</p><p className="text-caption text-text-tertiary">{t("builder.simDd")}</p></div>
        </div>
      </div>
      {Object.keys(errors).length > 0 && <p className="text-caption text-semantic-loss">{t("builder.fixSteps")}</p>}
    </div>
  );
}
