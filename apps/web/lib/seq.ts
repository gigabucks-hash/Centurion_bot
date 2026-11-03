/**
 * Contract 1.1.2: `seq`, `next_after_seq`, `next_before_seq`, `safe_seq`, `as_of_seq` and job ids are int64
 * base-10 strings. JS numbers lose precision above 2^53, so every comparison goes through BigInt.
 * Never `Number(seq)`, never `a.seq - b.seq`.
 */
import type { Int64String } from "@centurion/contracts/wire";

export type Seq = Int64String;

const SEQ_RE = /^(0|[1-9][0-9]{0,18})$/;

export function isSeq(v: unknown): v is Seq {
  return typeof v === "string" && SEQ_RE.test(v);
}

/** Parse a cursor from a query string / header; null when absent or malformed. */
export function parseSeq(v: string | null | undefined): Seq | null {
  return v != null && isSeq(v.trim()) ? v.trim() : null;
}

export function toSeq(v: string | number | bigint): Seq {
  return BigInt(v).toString();
}

export function cmpSeq(a: Seq, b: Seq): -1 | 0 | 1 {
  const x = BigInt(a), y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const seqGt = (a: Seq, b: Seq) => BigInt(a) > BigInt(b);
export const seqLt = (a: Seq, b: Seq) => BigInt(a) < BigInt(b);

export function maxSeq(list: Seq[], fallback: Seq | null = null): Seq | null {
  return list.reduce<Seq | null>((m, s) => (m == null || seqGt(s, m) ? s : m), fallback);
}

export function minSeq(list: Seq[]): Seq | null {
  return list.reduce<Seq | null>((m, s) => (m == null || seqLt(s, m) ? s : m), null);
}

/** Merge pages / realtime rows: one row per seq (later copy wins), newest first. */
export function dedupeBySeq<E extends { seq: Seq }>(rows: E[]): E[] {
  const m = new Map<Seq, E>();
  for (const r of rows) m.set(r.seq, r);
  return [...m.values()].sort((a, b) => cmpSeq(b.seq, a.seq));
}
