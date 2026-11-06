/**
 * N1: SSE/resume watermark.
 *
 * `clock.safe_seq` says "every event with seq <= safe_seq is commit-visible". It does NOT say "you have received
 * everything up to safe_seq". Two separate numbers are therefore kept:
 *  - `applied`: the highest seq handed to the UI (from an event frame or a REST catch-up row),
 *  - `safe`: the highest `clock.safe_seq` observed.
 *
 * The resume point is the smaller of the two:
 *  - clock alone never moves it (a clock frame before the events would skip them),
 *  - an event received ahead of the clock must be re-fetched on reconnect (safe still covers it).
 * Events are monotonic but not gapless, so "behind" means `safe > applied`, not `applied + 1`.
 */
import { isSeq, seqGt, seqLt, type Seq } from "./seq";

export interface Watermark {
  applied: Seq | null;
  safe: Seq | null;
}

export function initialWatermark(after?: Seq | null): Watermark {
  return { applied: isSeq(after) ? after : null, safe: null };
}

/** A stream event (or a catch-up row) was applied: advance `applied`, never backwards. */
export function noteEvent(w: Watermark, seq: unknown): Watermark {
  if (!isSeq(seq)) return w;
  if (w.applied != null && !seqGt(seq, w.applied)) return w;
  return { ...w, applied: seq };
}

/**
 * REST catch-up acknowledged everything up to `next` (`next_after_seq`). An empty page returns `safe_seq`, which
 * proves there are no further events of this mode in range — so this is the one non-event path that may advance.
 */
export function noteCatchUp(w: Watermark, next: unknown): Watermark {
  return noteEvent(w, next);
}

/** A clock frame was observed: remember `safe_seq`, but never touch `applied`. */
export function noteClock(w: Watermark, safeSeq: unknown): Watermark {
  if (!isSeq(safeSeq)) return w;
  if (w.safe != null && !seqGt(safeSeq, w.safe)) return w;
  return { ...w, safe: safeSeq };
}

/**
 * Seq to send as `after_seq` / to pass to the REST catch-up. Never beyond `safe_seq`; null when nothing was applied
 * yet (the first connection should stream from the server's own starting point, not from a guessed safe point).
 */
export function resumeAfter(w: Watermark): Seq | null {
  if (w.applied == null) return null;
  if (w.safe == null) return w.applied;
  return seqLt(w.safe, w.applied) ? w.safe : w.applied;
}

/** True when a clock says there are commit-visible events after the last applied one. */
export function isBehind(w: Watermark): boolean {
  return w.applied != null && w.safe != null && seqGt(w.safe, w.applied);
}
