/**
 * PnL sign → tone + arrow (UX SPEC §1). Pure; shared by feed rows, coin trail and chips.
 * Rule: a loss is NEVER rendered with the profit token, and colour is never the only signal
 * (always paired with ▲/▼ and +/− in the text).
 */
export type PnlTone = "profit" | "loss" | "neutral";

const EPS = 1e-9;

export function pnlTone(v: number | null | undefined): PnlTone {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < EPS) return "neutral";
  return v > 0 ? "profit" : "loss";
}

export function pnlArrow(v: number | null | undefined): "▲" | "▼" | "" {
  const t = pnlTone(v);
  return t === "profit" ? "▲" : t === "loss" ? "▼" : "";
}

export const PNL_TEXT_CLASS: Record<PnlTone, string> = {
  profit: "text-semantic-profit",
  loss: "text-semantic-loss",
  neutral: "text-semantic-neutralPnl",
};

/**
 * The value an activity title is coloured by. For sells this is the % shown in the
 * title (that leg's move), falling back to the position PnL. Other kinds are neutral.
 */
export function eventSignValue(e: { kind: string; pctChange?: number; pnlSol?: number }): number | null {
  if (e.kind !== "sold") return null;
  return e.pctChange ?? e.pnlSol ?? null;
}
