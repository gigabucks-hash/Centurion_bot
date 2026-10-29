// Test/probe transaction builders (unsigned). Devnet-only usage.
import { compileLegacyMessage, unsignedTransaction, type Instruction } from "./solana/message.ts";
import { COMPUTE_BUDGET, MEMO, MEMO_V1, PUMP, SYSTEM, TOKEN } from "./solana/programs.ts";
import { b58decode } from "./solana/base58.ts";

const u64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};
const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const cat = (...xs: Uint8Array[]) => {
  const out = new Uint8Array(xs.reduce((a, x) => a + x.length, 0));
  let o = 0;
  for (const x of xs) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};

export const ix = {
  memo: (signer: string, text: string, program = MEMO): Instruction => ({ programId: program, keys: [{ pubkey: signer, isSigner: true, isWritable: false }], data: new TextEncoder().encode(text) }),
  transfer: (from: string, to: string, lamports: bigint): Instruction => ({ programId: SYSTEM, keys: [{ pubkey: from, isSigner: true, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true }], data: cat(u32(2), u64(lamports)) }),
  splTransfer: (src: string, dst: string, owner: string, amount: bigint): Instruction => ({ programId: TOKEN, keys: [{ pubkey: src, isSigner: false, isWritable: true }, { pubkey: dst, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }], data: cat(new Uint8Array([3]), u64(amount)) }),
  approve: (src: string, delegate: string, owner: string, amount: bigint): Instruction => ({ programId: TOKEN, keys: [{ pubkey: src, isSigner: false, isWritable: true }, { pubkey: delegate, isSigner: false, isWritable: false }, { pubkey: owner, isSigner: true, isWritable: false }], data: cat(new Uint8Array([4]), u64(amount)) }),
  cuPrice: (microLamports: bigint): Instruction => ({ programId: COMPUTE_BUDGET, keys: [], data: cat(new Uint8Array([3]), u64(microLamports)) }),
  /** pump.fun `buy` (amount, max_sol_cost). Accounts are placeholders: the pre-sign layer judges program/discriminator/args. */
  pumpBuy: (user: string, tokens: bigint, maxSolCost: bigint): Instruction => ({ programId: PUMP, keys: [{ pubkey: user, isSigner: true, isWritable: true }], data: cat(new Uint8Array([102, 6, 61, 18, 1, 218, 235, 234]), u64(tokens), u64(maxSolCost)) }),
  memoV1: (signer: string, text: string): Instruction => ix.memo(signer, text, MEMO_V1),
};

export const DUMMY_BLOCKHASH = "11111111111111111111111111111111";
export function buildTx(payer: string, ixs: Instruction[], blockhash = DUMMY_BLOCKHASH): Uint8Array {
  b58decode(payer);
  return unsignedTransaction(compileLegacyMessage(payer, ixs, blockhash));
}

import { createHash } from "node:crypto";
import { b58encode } from "./solana/base58.ts";
/** Deterministic fake address for tests/mocks (not a real key). */
export const addr = (label: string): string => b58encode(new Uint8Array(createHash("sha256").update(label).digest()));
