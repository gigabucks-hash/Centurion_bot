/**
 * Hold-to-confirm state machine (no React, unit-tested in scripts/hold-reset.test.mjs).
 *
 * A Real hold confirms exactly the quote the user is looking at. When the proposal changes underneath
 * (silent SSE `proposal.updated`: new rev / new quote; 1.1.5 adds quote_id), an in-progress hold is
 * cancelled and must be started again. That reset is shown as inline text (review.quote.changed_during_hold),
 * never as a toast. A hold that already completed is not undone (the server re-checks expected_rev).
 */
export type HoldEvent = { kind: "idle" } | { kind: "holding"; progress: number } | { kind: "confirmed" } | { kind: "reset" };

export class HoldGate {
  private startedAt: number | null = null;
  private done = false;
  private wasReset = false;
  private version: string;
  private readonly ms: number;
  constructor(ms: number, version: string) {
    this.ms = ms;
    this.version = version;
  }
  begin(now: number): void {
    if (this.startedAt !== null || this.done) return;
    this.startedAt = now;
    this.wasReset = false;
  }
  release(): void {
    if (!this.done) this.startedAt = null;
  }
  /** Proposal identity changed (rev / quote_id). Returns true when a hold in progress was reset. */
  versionChanged(next: string): boolean {
    if (next === this.version) return false;
    this.version = next;
    if (this.startedAt === null || this.done) return false;
    this.startedAt = null;
    this.wasReset = true;
    return true;
  }
  /** Advance; returns the state for rendering. "confirmed" is returned once. */
  tick(now: number): HoldEvent {
    if (this.done) return { kind: "idle" };
    if (this.startedAt === null) return this.wasReset ? { kind: "reset" } : { kind: "idle" };
    const progress = Math.min(1, (now - this.startedAt) / this.ms);
    if (progress >= 1) {
      this.done = true;
      this.startedAt = null;
      return { kind: "confirmed" };
    }
    return { kind: "holding", progress };
  }
  get holding(): boolean {
    return this.startedAt !== null;
  }
}

/** Identity of what a Real hold confirms: rev (1.1.4 `proposal.updated` bumps it) + quote_id (1.1.5). */
export const holdVersion = (p: { rev: number; quote_id?: string | null }) => `${p.rev}:${p.quote_id ?? ""}`;
