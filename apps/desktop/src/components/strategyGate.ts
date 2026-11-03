/**
 * Per-strategy Paper/Real gate (contracts 1.1.6 `StrategyRealGateFields`) → i18n keys + args (0.4.10+ copy).
 * Pure (unit-tested under node). Wire mode stays `practice | real`; the UI label for `practice` is "Paper".
 * Real is gated off: when `real_locked` the Real option is shown disabled with its reason and the Paper progress,
 * and it can never be chosen. Unknown / missing reason → `other`. `*_required` null = "rule not set".
 */
export type RealLockedReason = "needs_owner_approval" | "gate_not_met" | "policy" | "other";
export const REAL_LOCKED_REASONS: readonly RealLockedReason[] = ["needs_owner_approval", "gate_not_met", "policy", "other"];
export interface PaperProgress { days_done: number; days_required: number | null; trades_done: number; trades_required: number | null }
export interface GateFields { mode: "practice" | "real"; real_locked: boolean; real_locked_reason: RealLockedReason | null; paper_progress: PaperProgress }
export interface Line { key: string; args?: Record<string, number | string> }
export interface GateView {
  modeKey: "strategy.mode.paper" | "strategy.mode.real";
  locked: boolean;
  /** The Real option may be offered (hold 2.5 s). Never true while locked. */
  realSelectable: boolean;
  chip: Line | null;
  reason: Line | null;
  /** `strategy.real_locked.a11y` for the disabled Real option. */
  a11y: Line | null;
  note: Line | null;
  progress: Line[];
}
/** UX SPEC hold-to-confirm: Paper 1.2 s, Real 2.5 s (= --motion-holdPractice / --motion-holdReal). */
export const HOLD_MS = { practice: 1200, real: 2500 } as const;

export function gateView(g: Partial<GateFields>): GateView {
  const locked = g.real_locked !== false; // missing → locked (fail safe)
  const reason: RealLockedReason = REAL_LOCKED_REASONS.includes(g.real_locked_reason as RealLockedReason) ? (g.real_locked_reason as RealLockedReason) : "other";
  const p = g.paper_progress ?? { days_done: 0, days_required: null, trades_done: 0, trades_required: null };
  const progress: Line[] = [
    p.days_required == null ? { key: "strategy.real_gate.days_done", args: { days_done: p.days_done } } : { key: "strategy.real_gate.progress_days", args: { days_done: p.days_done, days_required: p.days_required } },
    p.trades_required == null ? { key: "strategy.real_gate.trades_done", args: { trades_done: p.trades_done } } : { key: "strategy.real_gate.progress_trades", args: { trades_done: p.trades_done, trades_required: p.trades_required } },
  ];
  if (p.days_required == null && p.trades_required == null) progress.push({ key: "strategy.real_gate.not_set" });
  const reasonLine: Line = { key: `strategy.real_locked_reason.${reason}` };
  return {
    modeKey: g.mode === "real" ? "strategy.mode.real" : "strategy.mode.paper",
    locked,
    realSelectable: !locked && g.mode !== "real",
    chip: locked ? { key: "strategy.real_locked.chip" } : null,
    reason: locked ? reasonLine : null,
    a11y: locked ? { key: "strategy.real_locked.a11y", args: { reason: reasonLine.key } } : null,
    note: locked ? { key: "strategy.real_locked.list_note" } : null,
    progress: locked ? progress : [],
  };
}
