import { createHash } from "node:crypto";
import { b58encode } from "../solana/base58.ts";
import { decodeTransaction, type DecodedMessage } from "../solana/message.ts";
import { SYSTEM, TOKEN, TOKEN_2022 } from "../solana/programs.ts";

/** Deterministic PRNG (mulberry32) so latency tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LatencyModel = { signMedianMs: number; confirmMedianMs: number; jitter: number };
export type MockOptions = {
  seed?: number;
  latency?: Partial<LatencyModel>;
  /** Provider outage: calls whose 0-based index falls in [from, to) fail with 503. */
  outage?: { from: number; to: number };
  /** If true, mocks really wait (for the runner); tests use virtual time. */
  realSleep?: boolean;
};

export class MockClock {
  private calls = 0;
  private readonly r: () => number;
  private readonly lat: LatencyModel;
  private readonly opts: MockOptions;
  constructor(opts: MockOptions, defaults: LatencyModel) {
    this.opts = opts;
    this.r = rng(opts.seed ?? 42);
    this.lat = { ...defaults, ...opts.latency };
  }
  next(): { idx: number; down: boolean } {
    const idx = this.calls++;
    const o = this.opts.outage;
    return { idx, down: !!o && idx >= o.from && idx < o.to };
  }
  private sample(median: number): number {
    // log-normal-ish: median * exp(jitter * N(0,1)) via Box-Muller
    const u = Math.max(this.r(), 1e-9);
    const v = this.r();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return median * Math.exp(this.lat.jitter * z);
  }
  async wait(kind: "sign" | "confirm"): Promise<number> {
    const ms = this.sample(kind === "sign" ? this.lat.signMedianMs : this.lat.confirmMedianMs);
    if (this.opts.realSleep) await new Promise((res) => setTimeout(res, ms));
    return ms;
  }
}

export const fakeSignature = (tx: Uint8Array, salt: string): string =>
  b58encode(new Uint8Array(createHash("sha512").update(salt).update(tx).digest()));

export type TopLevelTransfer = { kind: "sol" | "spl"; from: string | null; to: string | null; amount: bigint };

/** Top-level transfers only, exactly what Turnkey's `solana.tx.transfers/spl_transfers` (and Crossmint scopes) see. */
export function topLevelTransfers(m: DecodedMessage): TopLevelTransfer[] {
  const out: TopLevelTransfer[] = [];
  for (const ix of m.instructions) {
    const dv = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    if (ix.programId === SYSTEM && ix.data.length >= 12 && dv.getUint32(0, true) === 2) {
      out.push({ kind: "sol", from: ix.accounts[0]?.pubkey ?? null, to: ix.accounts[1]?.pubkey ?? "ADDRESS_TABLE_LOOKUP", amount: dv.getBigUint64(4, true) });
    }
    if ((ix.programId === TOKEN || ix.programId === TOKEN_2022) && (ix.data[0] === 3 || ix.data[0] === 12) && ix.data.length >= 9) {
      const to = ix.accounts[ix.data[0] === 3 ? 1 : 2]?.pubkey ?? "ADDRESS_TABLE_LOOKUP";
      out.push({ kind: "spl", from: ix.accounts[0]?.pubkey ?? null, to, amount: dv.getBigUint64(1, true) });
    }
  }
  return out;
}

export { decodeTransaction };
