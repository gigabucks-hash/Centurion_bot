// Solana wire-format message codec (legacy + v0), no dependencies.
// Decoding is what the pre-sign layer relies on; encoding exists so tests and the runner can build txs.
import { b58decode, b58encode } from "./base58.ts";

export type AccountMeta = { pubkey: string; isSigner: boolean; isWritable: boolean };
export type Instruction = { programId: string; keys: AccountMeta[]; data: Uint8Array };

export type DecodedAccount = { pubkey: string | null; isSigner: boolean; isWritable: boolean; fromLookup: boolean };
export type DecodedInstruction = { programId: string; accounts: DecodedAccount[]; data: Uint8Array };
export type AddressTableLookup = { accountKey: string; writableIndexes: number[]; readonlyIndexes: number[] };
export type DecodedMessage = {
  version: "legacy" | 0;
  header: { numRequiredSignatures: number; numReadonlySigned: number; numReadonlyUnsigned: number };
  staticKeys: string[];
  recentBlockhash: string;
  instructions: DecodedInstruction[];
  addressTableLookups: AddressTableLookup[];
};

class Reader {
  private o = 0;
  private readonly b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  u8(): number {
    if (this.o >= this.b.length) throw new Error("message truncated");
    return this.b[this.o++];
  }
  bytes(n: number): Uint8Array {
    if (this.o + n > this.b.length) throw new Error("message truncated");
    const s = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return s;
  }
  compactU16(): number {
    let v = 0;
    for (let i = 0; i < 3; i++) {
      const x = this.u8();
      v |= (x & 0x7f) << (7 * i);
      if ((x & 0x80) === 0) return v;
    }
    throw new Error("bad compact-u16");
  }
  done(): boolean {
    return this.o === this.b.length;
  }
}

function compactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    let x = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(x);
      return out;
    }
    x |= 0x80;
    out.push(x);
  }
}

export function decodeMessage(msg: Uint8Array): DecodedMessage {
  const r = new Reader(msg);
  let first = r.u8();
  let version: "legacy" | 0 = "legacy";
  if (first & 0x80) {
    const v = first & 0x7f;
    if (v !== 0) throw new Error(`unsupported message version ${v}`);
    version = 0;
    first = r.u8();
  }
  const header = { numRequiredSignatures: first, numReadonlySigned: r.u8(), numReadonlyUnsigned: r.u8() };
  const nKeys = r.compactU16();
  const staticKeys: string[] = [];
  for (let i = 0; i < nKeys; i++) staticKeys.push(b58encode(r.bytes(32)));
  const recentBlockhash = b58encode(r.bytes(32));
  const nIx = r.compactU16();
  const raw: { p: number; a: number[]; d: Uint8Array }[] = [];
  for (let i = 0; i < nIx; i++) {
    const p = r.u8();
    const na = r.compactU16();
    const a: number[] = [];
    for (let j = 0; j < na; j++) a.push(r.u8());
    const d = r.bytes(r.compactU16());
    raw.push({ p, a, d: new Uint8Array(d) });
  }
  const addressTableLookups: AddressTableLookup[] = [];
  if (version === 0) {
    const n = r.compactU16();
    for (let i = 0; i < n; i++) {
      const accountKey = b58encode(r.bytes(32));
      const w = r.compactU16();
      const writableIndexes = [...r.bytes(w)];
      const ro = r.compactU16();
      const readonlyIndexes = [...r.bytes(ro)];
      addressTableLookups.push({ accountKey, writableIndexes, readonlyIndexes });
    }
  }
  if (!r.done()) throw new Error("trailing bytes after message");
  const { numRequiredSignatures: s, numReadonlySigned: rs, numReadonlyUnsigned: ru } = header;
  const n = staticKeys.length;
  const nLookupW = addressTableLookups.reduce((a, l) => a + l.writableIndexes.length, 0);
  const meta = (idx: number): DecodedAccount => {
    if (idx < n) {
      const isSigner = idx < s;
      const isWritable = isSigner ? idx < s - rs : idx < n - ru;
      return { pubkey: staticKeys[idx], isSigner, isWritable, fromLookup: false };
    }
    // Index resolves into an address lookup table: unknown without fetching the table. Fail-closed upstream.
    return { pubkey: null, isSigner: false, isWritable: idx - n < nLookupW, fromLookup: true };
  };
  const instructions = raw.map((ix) => {
    if (ix.p >= n) throw new Error("program id loaded from lookup table (rejected)");
    return { programId: staticKeys[ix.p], accounts: ix.a.map(meta), data: ix.d };
  });
  return { version, header, staticKeys, recentBlockhash, instructions, addressTableLookups };
}

/** Serialized transaction = compact(sigCount) || sigs(64 each) || message. */
export function splitTransaction(tx: Uint8Array): { signatures: Uint8Array[]; message: Uint8Array } {
  const r = new Reader(tx);
  const n = r.compactU16();
  const signatures: Uint8Array[] = [];
  for (let i = 0; i < n; i++) signatures.push(r.bytes(64));
  const hdrLen = compactU16(n).length + 64 * n;
  return { signatures, message: tx.subarray(hdrLen) };
}

export function decodeTransaction(tx: Uint8Array): DecodedMessage {
  return decodeMessage(splitTransaction(tx).message);
}

/** Build a legacy message (payer first). Account ordering follows the runtime rules. */
export function compileLegacyMessage(payer: string, instructions: Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, { s: boolean; w: boolean }>();
  const touch = (k: string, s: boolean, w: boolean) => {
    const m = metas.get(k) ?? { s: false, w: false };
    m.s ||= s;
    m.w ||= w;
    metas.set(k, m);
  };
  touch(payer, true, true);
  for (const ix of instructions) {
    for (const k of ix.keys) touch(k.pubkey, k.isSigner, k.isWritable);
    touch(ix.programId, false, false);
  }
  const all = [...metas.entries()];
  const order = (s: boolean, w: boolean) => all.filter(([k, m]) => k !== payer && m.s === s && m.w === w).map(([k]) => k);
  const keys = [payer, ...order(true, true), ...order(true, false), ...order(false, true), ...order(false, false)];
  const numSigners = 1 + order(true, true).length + order(true, false).length;
  const out: number[] = [numSigners, order(true, false).length, order(false, false).length];
  out.push(...compactU16(keys.length));
  for (const k of keys) out.push(...b58decode(k));
  out.push(...b58decode(recentBlockhash));
  out.push(...compactU16(instructions.length));
  for (const ix of instructions) {
    out.push(keys.indexOf(ix.programId));
    out.push(...compactU16(ix.keys.length));
    for (const k of ix.keys) out.push(keys.indexOf(k.pubkey));
    out.push(...compactU16(ix.data.length));
    out.push(...ix.data);
  }
  return new Uint8Array(out);
}

/** Wrap a message with zeroed signature slots (unsigned tx, as Crossmint and Turnkey expect). */
export function unsignedTransaction(message: Uint8Array): Uint8Array {
  const n = message[0] & 0x80 ? message[1] : message[0];
  const pre = compactU16(n);
  const out = new Uint8Array(pre.length + 64 * n + message.length);
  out.set(pre, 0);
  out.set(message, pre.length + 64 * n);
  return out;
}
