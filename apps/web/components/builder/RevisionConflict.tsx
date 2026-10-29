"use client";
/**
 * Revision conflict (UX REVISION_CONFLICT.md S1–S4) for a stale PATCH (409 STRATEGY_REV_CONFLICT /
 * CONFIRMATION_RESTART_REQUIRED). S1 banner (role=alert, publish locked) → S2 3-way review (base / saved / mine;
 * overlapping fields default to "saved") → S3 merged onto the current rev → or S4 discard my edits (confirm).
 * No force-save and no server-side merge: the merge happens here and is re-sent with If-Match: current_rev.
 */
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { RevConflict } from "@/lib/client";
import type { WireSettings } from "@/lib/contracts";
import { useFmt, useT } from "@/lib/i18n/client";
import { Button, cn } from "@/components/ui";

type Side = "mine" | "theirs" | "base";
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function threeWay(base: WireSettings, mine: WireSettings, theirs: WireSettings) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])];
  const rows = keys
    .map((k) => ({ key: k, base: base[k], mine: mine[k], theirs: theirs[k], mineChanged: !same(base[k], mine[k]), theirsChanged: !same(base[k], theirs[k]) }))
    .filter((r) => r.mineChanged || r.theirsChanged);
  return rows.map((r) => ({ ...r, overlap: r.mineChanged && r.theirsChanged && !same(r.mine, r.theirs) }));
}

export function mergeSettings(base: WireSettings, mine: WireSettings, theirs: WireSettings, picks: Record<string, Side> = {}): WireSettings {
  const out: WireSettings = { ...theirs };
  for (const r of threeWay(base, mine, theirs)) {
    const side: Side = r.overlap ? (picks[r.key] ?? "theirs") : r.mineChanged ? "mine" : "theirs";
    const v = side === "mine" ? r.mine : side === "base" ? r.base : r.theirs;
    if (v === undefined) delete out[r.key];
    else out[r.key] = v;
  }
  return out;
}

export function RevisionConflict({ conflict, base, mine, onMerged, onDiscard }: {
  conflict: RevConflict;
  base: WireSettings;
  mine: WireSettings;
  onMerged: (merged: WireSettings) => void;
  onDiscard: () => void;
}) {
  const t = useT();
  const f = useFmt();
  const theirs = conflict.current.settings;
  const rows = useMemo(() => threeWay(base, mine, theirs), [base, mine, theirs]);
  const overlaps = rows.filter((r) => r.overlap);
  const myEdits = rows.filter((r) => r.mineChanged).length;
  const [review, setReview] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [picks, setPicks] = useState<Record<string, Side>>({});

  const show = (key: string, v: unknown) => {
    if (v === undefined || v === null) return "—";
    if (key.endsWith("_lamports") && typeof v === "string") return f.lamports(v);
    if (typeof v === "number") return f.num(v, 2, 0);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") || "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div role="alert" className="mb-4 rounded-md border border-semantic-warning/50 bg-semantic-warningContainer p-4 text-body">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-semantic-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary">{t("conflict.title")}</p>
          <p className="text-text-secondary">{t("conflict.body", { current_rev: conflict.current_rev, base_rev: conflict.base_rev })}</p>
          {/* changed_by / changed_at / changed_fields are optional in ConflictError; `current` is required (1.1.3). */}
          {conflict.changed_by && (
            <p className="text-caption text-text-secondary">
              {t("conflict.changedBy", {
                actor: conflict.changed_by.actor ?? "—",
                via: conflict.changed_by.via ?? "—",
                device: conflict.changed_by.device ?? conflict.changed_by.via ?? "—",
                changed_at: f.dateTime(Date.parse(conflict.changed_at ?? conflict.current.updated_at)),
              })}
            </p>
          )}
          {(conflict.changed_fields?.length ?? 0) > 0 && <p className="font-mono text-caption text-text-tertiary">{t("conflict.fields", { fields: conflict.changed_fields!.join(", ") })}</p>}
          <p className="mt-1 text-caption text-text-secondary">{t("conflict.conflicts", { count: overlaps.length })} {t("builder.conflictLocked")}</p>
          {conflict.code === "CONFIRMATION_RESTART_REQUIRED" || conflict.current.mode === "real" ? <p className="mt-1 text-caption text-semantic-warning">{t("conflict.realReconfirm")}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => onMerged(mergeSettings(base, mine, theirs, picks))}>{review ? t("builder.conflictApply") : t("conflict.merge")}</Button>
        <Button size="sm" variant="secondary" onClick={() => setReview((v) => !v)} aria-expanded={review}>{t("conflict.review")}</Button>
        {confirmDiscard ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-caption">{t.ux("conflict.discard.confirm", { count: myEdits })}</span>
            <Button size="sm" variant="danger" onClick={onDiscard}>{t("conflict.discard")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(false)}>{t("common.cancel")}</Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(true)}>{t("conflict.discard")}</Button>
        )}
      </div>
      {review && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-caption">
            <thead className="text-text-tertiary">
              <tr>
                <th scope="col" className="py-1 text-left">{t("builder.conflictField")}</th>
                <th scope="col" className="py-1 text-right">{t("conflict.colBase", { rev: conflict.base_rev })}</th>
                <th scope="col" className="py-1 text-right">{t("conflict.colTheirs", { rev: conflict.current_rev })}</th>
                <th scope="col" className="py-1 text-right">{t("conflict.colMine")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pick = picks[r.key] ?? "theirs";
                const cell = (side: Side, v: unknown, changed: boolean) => (
                  <td className={cn("num py-1 text-right", changed && "font-semibold text-text-primary", r.overlap && pick === side && "underline")}>
                    {r.overlap ? (
                      <label className="inline-flex cursor-pointer items-center justify-end gap-1">
                        <input type="radio" name={`pick-${r.key}`} checked={pick === side} onChange={() => setPicks((p) => ({ ...p, [r.key]: side }))} aria-label={t.ux("conflict.diff.pick", { side })} />
                        {show(r.key, v)}
                      </label>
                    ) : (
                      show(r.key, v)
                    )}
                  </td>
                );
                return (
                  <tr key={r.key} className="border-t border-border-subtle">
                    <th scope="row" className="py-1 text-left font-mono font-normal">
                      {r.key}
                      {r.overlap && <span className="ml-2 rounded bg-semantic-warning/20 px-1 text-semantic-warning">{t("builder.conflictBoth")}</span>}
                    </th>
                    {cell("base", r.base, false)}
                    {cell("theirs", r.theirs, r.theirsChanged)}
                    {cell("mine", r.mine, r.mineChanged)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
