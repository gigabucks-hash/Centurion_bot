/**
 * Paper session used by the desktop preview and by tests.
 * Stop pauses new buys only. Sells, including sell-all, still close positions.
 * A missing PnL leg stays null so the UI can print an em dash, never 0.
 */

export interface PaperPosition {
  key: string;
  mint: string;
  symbol: string;
  costLamports: string;
  valueLamports: string;
  pnlLamports: string | null;
}

export interface PaperClose {
  key: string;
  solIn: string | null;
  solOut: string | null;
  pnlLamports: string | null;
}

export interface PaperState {
  cashLamports: bigint;
  buysPaused: boolean;
  positions: PaperPosition[];
  closed: PaperClose[];
  realizedLamports: bigint;
}

const START = 30_000_000_000n;
const BUY = 250_000_000n;

export function openPaper(): PaperState {
  return { cashLamports: START, buysPaused: false, positions: [], closed: [], realizedLamports: 0n };
}

export type PaperResult = { ok: true; state: PaperState } | { ok: false; code: string; state: PaperState };

function clone(s: PaperState): PaperState {
  return { ...s, positions: s.positions.map((p) => ({ ...p })), closed: [...s.closed] };
}

/** Approve a paper buy. Refused while Stop is on; open positions stay put. */
export function paperBuy(s: PaperState, mint: string, symbol: string, pnlLamports: string | null = "0"): PaperResult {
  const state = clone(s);
  if (state.buysPaused) return { ok: false, code: "BUYS_PAUSED", state };
  if (state.cashLamports < BUY) return { ok: false, code: "INSUFFICIENT_PRACTICE_BALANCE", state };
  state.cashLamports -= BUY;
  state.positions.push({
    key: `${mint}.${state.positions.length}`,
    mint,
    symbol,
    costLamports: BUY.toString(),
    valueLamports: BUY.toString(),
    pnlLamports,
  });
  return { ok: true, state };
}

/** Stop: new buys pause. No cooldown, no position is closed, exits stay available. */
export function paperStop(s: PaperState): PaperState {
  return { ...clone(s), buysPaused: true };
}

export function paperResume(s: PaperState): PaperState {
  return { ...clone(s), buysPaused: false };
}

export function paperSell(s: PaperState, key: string, solOut: string | null): PaperResult {
  const state = clone(s);
  const i = state.positions.findIndex((p) => p.key === key);
  if (i < 0) return { ok: false, code: "NO_POSITION", state };
  const pos = state.positions[i];
  state.positions.splice(i, 1);
  const out = solOut == null ? null : BigInt(solOut);
  if (out != null) state.cashLamports += out;
  const pnl = out == null ? null : (out - BigInt(pos.costLamports)).toString();
  if (pnl != null) state.realizedLamports += BigInt(pnl);
  state.closed.unshift({ key, solIn: pos.costLamports, solOut, pnlLamports: pnl });
  return { ok: true, state };
}

/** Jual semua: every open position, even while buys are paused. */
export function paperSellAll(s: PaperState): PaperResult {
  let state = clone(s);
  const keys = state.positions.map((p) => p.key);
  if (!keys.length) return { ok: true, state };
  for (const key of keys) {
    const pos = state.positions.find((p) => p.key === key);
    const sold = paperSell(state, key, pos?.valueLamports ?? null);
    state = sold.state;
  }
  return { ok: true, state };
}

/** Missing legs stay null. Callers render those as an em dash. */
export function paperPnl(s: PaperState): { realized: string | null; unrealized: string | null } {
  if (s.positions.some((p) => p.pnlLamports == null)) {
    return { realized: s.closed.length ? s.realizedLamports.toString() : null, unrealized: null };
  }
  const unreal = s.positions.reduce((a, p) => a + BigInt(p.pnlLamports ?? "0"), 0n);
  return {
    realized: s.closed.length ? s.realizedLamports.toString() : null,
    unrealized: s.positions.length ? unreal.toString() : null,
  };
}
