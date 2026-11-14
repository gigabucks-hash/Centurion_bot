/**
 * Shared speed policy for a live swap. The desktop lane sends the transaction.
 * This module is the same math for the local web app and MCP: fee cap, compute units
 * from a simulation, Jito off unless asked, and parallel sells that cannot double-sell.
 */

export const CONFIRM_COMMITMENT = "confirmed";
export const DEFAULT_FEE_PERCENTILE = 75;
export const QUOTE_TTL_MS = 1_500;

const inflight = new Set<string>();

export function claimSell(key: string): boolean {
  if (inflight.has(key)) return false;
  inflight.add(key);
  return true;
}

export function releaseSell(key: string): void {
  inflight.delete(key);
}

export function percentile(samples: number[], pct: number): number {
  if (samples.length === 0) return 0;
  const v = [...samples].sort((a, b) => a - b);
  const p = Math.min(100, Math.max(0, Math.trunc(pct)));
  const n = v.length;
  const idx = p === 0 ? 0 : Math.min(n - 1, Math.ceil((p / 100) * n) - 1);
  return v[idx] ?? 0;
}

/** Micro-lamports per CU × units, never above the owner's cap. A cap of 0 spends nothing. */
export function priorityFeeLamports(microPerCu: number, cu: number, cap: number): number {
  if (cap <= 0 || cu <= 0 || microPerCu <= 0) return 0;
  return Math.min(cap, Math.floor((microPerCu * cu) / 1_000_000));
}

/** Not the 200_000 default. Ten percent over the simulated units, clamped. */
export function cuLimitFromSim(units: number): number {
  if (units <= 0) return 1_000;
  return Math.min(1_400_000, Math.max(1_000, Math.floor((units * 11) / 10)));
}

export function jitoOn(enabled: boolean, tipLamports: number): boolean {
  return enabled && tipLamports > 0;
}

export function rpcInUse(primary: string, fast: string): string {
  return fast.trim() === "" ? primary : fast;
}

export function sendConfig(simulatedOk: boolean): { skipPreflight: boolean; maxRetries: number; preflightCommitment: string } {
  return { skipPreflight: simulatedOk, maxRetries: 0, preflightCommitment: CONFIRM_COMMITMENT };
}

export interface StageMs {
  quote: number;
  build: number;
  sign: number;
  send: number;
  confirm: number;
}

export function stageTotal(s: StageMs): number {
  return s.quote + s.build + s.sign + s.send + s.confirm;
}

/** Cold serialized path: new connection, quote then build, preflight on send, several confirm polls. */
export function predictBaseline(d: { quoteCold: number; build: number; sim: number; send: number; confirmPoll: number; polls: number }): StageMs {
  return { quote: d.quoteCold, build: d.build, sign: 0, send: d.send + d.sim, confirm: d.confirmPoll * d.polls };
}

/** Warm path: quote overlaps the RPC reads, simulation is not repeated on send, one confirmed notification. */
export function predictFast(d: { quoteWarm: number; build: number; sim: number; send: number; confirmWs: number }, cached: boolean): StageMs {
  return { quote: cached ? 0 : d.quoteWarm, build: d.build + d.sim, sign: 0, send: d.send, confirm: d.confirmWs };
}

export async function sellAllParallel<T>(keys: string[], sell: (key: string) => Promise<T>): Promise<{ sold: string[]; skipped: string[] }> {
  const sold: string[] = [];
  const skipped: string[] = [];
  await Promise.all([...new Set(keys)].map(async (key) => {
    if (!claimSell(key)) {
      skipped.push(key);
      return;
    }
    try {
      await sell(key);
      sold.push(key);
    } catch {
      skipped.push(key);
    } finally {
      releaseSell(key);
    }
  }));
  return { sold, skipped };
}
