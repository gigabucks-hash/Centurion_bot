// Sentra's own pre-sign layer (REAL_MONEY_OPTIONS §4.3, bake-off subset). Runs BEFORE any provider sign call.
// Fail closed: any decode error, unknown program, unknown instruction or unresolved account is a rejection.
import { decodeTransaction, type DecodedInstruction, type DecodedMessage } from "./solana/message.ts";
import {
  allowlistFor, PUMP_IX, RAYDIUM_AMM_V4_TAGS, RAYDIUM_CLMM_IX, RAYDIUM_CPMM_IX, PUMP_AMM_IX, type ProgramEntry,
} from "./solana/programs.ts";

export type Cluster = "devnet" | "mainnet";
export type PresignPolicy = {
  cluster: Cluster;
  /** Trading wallet (fee payer / authority). */
  owner: string;
  /** Accounts the trading wallet owns (its ATAs, temp wSOL accounts). Transfers may only land here. */
  ownedAccounts: string[];
  perTxCapLamports: bigint;
  maxCuPriceMicroLamports: bigint;
  /** Optional fee-payer override: Crossmint smart wallets are fee-paid by Crossmint's relayer. */
  allowedFeePayers?: string[];
  tipAccounts?: string[];
  maxTipLamports?: bigint;
};

export type Violation = { code: string; ix?: number; detail: string };
export type SimulationResult = { err: string | null; ownerLamportsDelta: bigint; logs?: string[] };
export interface Simulator {
  simulate(tx: Uint8Array, owner: string): Promise<SimulationResult>;
}
export type PresignVerdict = {
  ok: boolean;
  violations: Violation[];
  staticSpendLamports: bigint;
  simulatedSpendLamports: bigint | null;
  message?: DecodedMessage;
};

const u32le = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(o, true);
const u64le = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, true);
const hex8 = (d: Uint8Array) => Buffer.from(d.subarray(0, 8)).toString("hex");

type IxCtx = { policy: PresignPolicy; owned: Set<string>; tips: Set<string>; out: Violation[]; i: number };
type IxResult = { spend: bigint };

function acct(ix: DecodedInstruction, n: number): string | null {
  return ix.accounts[n]?.pubkey ?? null;
}

function checkSystem(ix: DecodedInstruction, c: IxCtx): IxResult {
  if (ix.data.length < 4) return deny(c, "SYSTEM_IX_MALFORMED", "short data");
  const tag = u32le(ix.data, 0);
  const from = acct(ix, 0);
  const to = acct(ix, 1);
  if (tag === 2) {
    // Transfer { lamports }
    const lamports = ix.data.length >= 12 ? u64le(ix.data, 4) : 0n;
    if (to === null) return deny(c, "ACCOUNT_UNRESOLVED", "transfer destination from lookup table");
    const toSelf = to === c.policy.owner || c.owned.has(to);
    const toTip = c.tips.has(to) && lamports <= (c.policy.maxTipLamports ?? 0n);
    if (!toSelf && !toTip) return deny(c, "TRANSFER_TO_NON_OWNER", `SOL transfer of ${lamports} to ${to}`);
    return { spend: from === c.policy.owner ? lamports : 0n }; // wrapping into our own wSOL ATA still counts as spend
  }
  if (tag === 0 || tag === 3) {
    // CreateAccount / CreateAccountWithSeed: only for accounts we own (temp wSOL).
    if (to === null || !c.owned.has(to)) return deny(c, "CREATE_ACCOUNT_FOREIGN", `new account ${to}`);
    return { spend: 0n };
  }
  return deny(c, "SYSTEM_IX_NOT_ALLOWED", `system instruction tag ${tag}`);
}

function checkToken(ix: DecodedInstruction, c: IxCtx): IxResult {
  if (ix.data.length < 1) return deny(c, "TOKEN_IX_MALFORMED", "empty");
  const tag = ix.data[0];
  switch (tag) {
    case 3: // Transfer [src, dst, owner]
    case 12: { // TransferChecked [src, mint, dst, owner]
      const dst = acct(ix, tag === 3 ? 1 : 2);
      if (dst === null) return deny(c, "ACCOUNT_UNRESOLVED", "token transfer destination from lookup table");
      if (!c.owned.has(dst) && dst !== c.policy.owner) return deny(c, "TRANSFER_TO_NON_OWNER", `SPL transfer to ${dst}`);
      return { spend: 0n };
    }
    case 9: { // CloseAccount [account, destination, owner]
      const dst = acct(ix, 1);
      if (dst !== c.policy.owner) return deny(c, "CLOSE_TO_NON_OWNER", `close rent to ${dst}`);
      return { spend: 0n };
    }
    case 17: // SyncNative
      return { spend: 0n };
    case 1: case 16: case 18: { // InitializeAccount / 2 / 3
      const a = acct(ix, 0);
      if (a === null || !c.owned.has(a)) return deny(c, "INIT_FOREIGN_ACCOUNT", `init ${a}`);
      return { spend: 0n };
    }
    case 4: case 13:
      return deny(c, "TOKEN_APPROVE_DENIED", "Approve/ApproveChecked delegates our tokens");
    case 6:
      return deny(c, "TOKEN_SET_AUTHORITY_DENIED", "SetAuthority");
    default:
      return deny(c, "TOKEN_IX_NOT_ALLOWED", `token instruction tag ${tag}`);
  }
}

function checkAta(ix: DecodedInstruction, c: IxCtx): IxResult {
  // Create (empty / [0]) or CreateIdempotent ([1]); accounts [payer, ata, wallet, mint, system, token_program]
  if (ix.data.length > 1 || (ix.data.length === 1 && ix.data[0] > 1)) return deny(c, "ATA_IX_NOT_ALLOWED", "only create/create_idempotent");
  const wallet = acct(ix, 2);
  if (wallet !== c.policy.owner) return deny(c, "ATA_FOR_FOREIGN_WALLET", `ATA for ${wallet}`);
  return { spend: 0n };
}

function checkCompute(ix: DecodedInstruction, c: IxCtx): IxResult {
  const tag = ix.data[0];
  if (tag === 2 || tag === 1) return { spend: 0n }; // SetComputeUnitLimit / RequestHeapFrame
  if (tag === 3) {
    const price = u64le(ix.data, 1);
    if (price > c.policy.maxCuPriceMicroLamports) return deny(c, "CU_PRICE_OVER_CAP", `cu price ${price}`);
    return { spend: 0n };
  }
  return deny(c, "COMPUTE_IX_NOT_ALLOWED", `compute budget tag ${tag}`);
}

function checkPump(ix: DecodedInstruction, c: IxCtx): IxResult {
  const known = PUMP_IX[hex8(ix.data)];
  if (!known) return deny(c, "PROGRAM_IX_NOT_ALLOWED", `pump.fun discriminator ${hex8(ix.data)}`);
  const spend = known.spendArgOffset !== undefined && ix.data.length >= known.spendArgOffset + 8 ? u64le(ix.data, known.spendArgOffset) : 0n;
  return { spend };
}

function checkDisc(set: Set<string>, label: string) {
  return (ix: DecodedInstruction, c: IxCtx): IxResult =>
    set.has(hex8(ix.data)) ? { spend: 0n } : deny(c, "PROGRAM_IX_NOT_ALLOWED", `${label} discriminator ${hex8(ix.data)}`);
}

function deny(c: IxCtx, code: string, detail: string): IxResult {
  c.out.push({ code, ix: c.i, detail });
  return { spend: 0n };
}

const HANDLERS: Record<ProgramEntry["kind"], (ix: DecodedInstruction, c: IxCtx) => IxResult> = {
  system: checkSystem,
  compute: checkCompute,
  token: checkToken,
  ata: checkAta,
  memo: () => ({ spend: 0n }),
  pump: checkPump,
  pump_amm: checkDisc(PUMP_AMM_IX, "PumpSwap"),
  raydium_cpmm: checkDisc(RAYDIUM_CPMM_IX, "Raydium CPMM"),
  raydium_clmm: checkDisc(RAYDIUM_CLMM_IX, "Raydium CLMM"),
  raydium_amm_v4: (ix, c) => (RAYDIUM_AMM_V4_TAGS.has(ix.data[0]) ? { spend: 0n } : deny(c, "PROGRAM_IX_NOT_ALLOWED", `Raydium AMM v4 tag ${ix.data[0]}`)),
  jupiter: (ix, c) => deny(c, "PROGRAM_IX_NOT_ALLOWED", "Jupiter route parsing not implemented in bake-off (mainnet only)"),
};

/** Static checks only (no RPC). */
export function staticCheck(tx: Uint8Array, policy: PresignPolicy): PresignVerdict {
  const out: Violation[] = [];
  let message: DecodedMessage;
  try {
    message = decodeTransaction(tx);
  } catch (e) {
    return { ok: false, violations: [{ code: "DECODE_FAILED", detail: String((e as Error).message) }], staticSpendLamports: 0n, simulatedSpendLamports: null };
  }
  const feePayer = message.staticKeys[0];
  const okPayers = new Set([policy.owner, ...(policy.allowedFeePayers ?? [])]);
  if (!okPayers.has(feePayer)) out.push({ code: "FEE_PAYER_NOT_OWNER", detail: `fee payer ${feePayer}` });
  if (message.addressTableLookups.length > 0) out.push({ code: "ACCOUNT_UNRESOLVED", detail: "address lookup tables are not resolved by the bake-off pre-sign layer" });
  const allow = new Map(allowlistFor(policy.cluster).map((p) => [p.id, p]));
  const c: IxCtx = { policy, owned: new Set(policy.ownedAccounts), tips: new Set(policy.tipAccounts ?? []), out, i: 0 };
  let spend = 0n;
  message.instructions.forEach((ix, i) => {
    c.i = i;
    const entry = allow.get(ix.programId);
    if (!entry) {
      out.push({ code: "PROGRAM_NOT_ALLOWED", ix: i, detail: `program ${ix.programId}` });
      return;
    }
    spend += HANDLERS[entry.kind](ix, c).spend;
  });
  if (spend > policy.perTxCapLamports) out.push({ code: "OVER_CAP", detail: `static spend ${spend} > cap ${policy.perTxCapLamports}` });
  return { ok: out.length === 0, violations: out, staticSpendLamports: spend, simulatedSpendLamports: null, message };
}

/** Full pre-sign: static checks, then simulation; spend = max(static, simulated outflow). */
export async function presign(tx: Uint8Array, policy: PresignPolicy, sim: Simulator): Promise<PresignVerdict> {
  const v = staticCheck(tx, policy);
  if (!v.ok) return v;
  let s: SimulationResult;
  try {
    s = await sim.simulate(tx, policy.owner);
  } catch (e) {
    v.violations.push({ code: "SIMULATION_UNAVAILABLE", detail: String((e as Error).message) });
    v.ok = false;
    return v;
  }
  if (s.err) v.violations.push({ code: "SIMULATION_FAILED", detail: s.err });
  const out = s.ownerLamportsDelta < 0n ? -s.ownerLamportsDelta : 0n;
  v.simulatedSpendLamports = out;
  if (out > policy.perTxCapLamports) v.violations.push({ code: "OVER_CAP", detail: `simulated outflow ${out} > cap ${policy.perTxCapLamports}` });
  v.ok = v.violations.length === 0;
  return v;
}

/** Mock simulator: owner delta = -(top-level SOL transfers out of owner to non-owned + pump spend args) - fee. */
export class MockSimulator implements Simulator {
  private readonly opts: { feeLamports?: bigint; fail?: string; down?: boolean; extraOutflow?: bigint };
  constructor(opts: { feeLamports?: bigint; fail?: string; down?: boolean; extraOutflow?: bigint } = {}) {
    this.opts = opts;
  }
  async simulate(tx: Uint8Array, owner: string): Promise<SimulationResult> {
    if (this.opts.down) throw new Error("simulator unavailable (mock outage)");
    const m = decodeTransaction(tx);
    let delta = -(this.opts.feeLamports ?? 5000n) - (this.opts.extraOutflow ?? 0n);
    for (const ix of m.instructions) {
      if (ix.programId === "11111111111111111111111111111111" && ix.data.length >= 12 && u32le(ix.data, 0) === 2 && ix.accounts[0]?.pubkey === owner && ix.accounts[1]?.pubkey !== owner) {
        delta -= u64le(ix.data, 4);
      }
      const p = PUMP_IX[hex8(ix.data)];
      if (p?.spendArgOffset !== undefined && ix.data.length >= p.spendArgOffset + 8) delta -= u64le(ix.data, p.spendArgOffset);
    }
    return { err: this.opts.fail ?? null, ownerLamportsDelta: delta };
  }
}
