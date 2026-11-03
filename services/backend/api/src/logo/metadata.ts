// Logo source resolution: mint -> Metaplex metadata PDA (read-only getAccountInfo) -> `uri` -> metadata JSON
// `image` (pump.fun and most launchpads write Metaplex metadata) -> image URL. ipfs:// and ar:// are rewritten
// to our pinned gateways. Token-provided strings are untrusted: they only ever become URLs that go through
// safeFetch(), and are never logged in full, returned to clients, or used anywhere else.
import { createHash } from "node:crypto";
import { b58decode, b58encode } from "../base58.ts";

export const METAPLEX_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

// ---- ed25519 on-curve test (PDAs must be off-curve) --------------------------------------------------------
const P = (1n << 255n) - 19n;
const modp = (a: bigint) => ((a % P) + P) % P;
function powmod(b: bigint, e: bigint): bigint {
  let r = 1n;
  b = modp(b);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}
const D = modp(-121665n * powmod(121666n, P - 2n));

/** Whether 32 bytes decompress to an ed25519 point (same acceptance as curve25519-dalek decompress). */
export function isOnCurve(b: Uint8Array): boolean {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? b[i]! & 0x7f : b[i]!);
  if (y >= P) return false;
  const y2 = (y * y) % P;
  const u = modp(y2 - 1n);
  const v = modp(D * y2 + 1n);
  if (u === 0n) return true;
  const x2 = (u * powmod(v, P - 2n)) % P;
  return powmod(x2, (P - 1n) / 2n) === 1n;
}

export function findProgramAddress(seeds: Uint8Array[], program: Uint8Array): { address: Uint8Array; bump: number } {
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Uint8Array.of(bump)).update(program).update("ProgramDerivedAddress");
    const a = h.digest();
    if (!isOnCurve(a)) return { address: new Uint8Array(a), bump };
  }
  throw new Error("no viable bump");
}

export function metadataPda(mint: string): string {
  const m = b58decode(mint);
  const prog = b58decode(METAPLEX_PROGRAM);
  if (!m || m.length !== 32 || !prog) throw new Error("bad mint");
  return b58encode(findProgramAddress([Buffer.from("metadata"), prog, m], prog).address);
}

/** Metaplex Metadata v1: key(1)=4, update_authority(32), mint(32), name/symbol/uri borsh strings. */
export function parseMetadataUri(data: Buffer, mint: string): string | null {
  if (data.length < 1 + 32 + 32 + 12 || data[0] !== 4) return null;
  if (b58encode(data.subarray(33, 65)) !== mint) return null;
  let off = 65;
  const str = (max: number): string | null => {
    if (off + 4 > data.length) return null;
    const n = data.readUInt32LE(off);
    off += 4;
    if (n > max || off + n > data.length) return null;
    const s = data.subarray(off, off + n).toString("utf8");
    off += n;
    return s.replace(/\0+$/g, "").trim();
  };
  if (str(64) === null || str(32) === null) return null; // name, symbol
  const uri = str(512);
  return uri ? uri : null;
}

export interface RpcClient {
  getAccount(address: string): Promise<{ owner: string; data: Buffer } | null>;
}

/** Minimal read-only JSON-RPC client. The URL (may contain an API key) is never logged. */
export function jsonRpc(url: string, timeoutMs: number): RpcClient {
  return {
    async getAccount(address) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address, { encoding: "base64", commitment: "confirmed" }] }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      if (!res.ok) throw new Error(`rpc http ${res.status}`);
      const j = (await res.json()) as { result?: { value?: { owner?: string; data?: [string, string] } | null }; error?: unknown };
      if (j.error) throw new Error("rpc error");
      const v = j.result?.value;
      if (!v) return null;
      if (!Array.isArray(v.data) || v.data[1] !== "base64" || typeof v.owner !== "string") throw new Error("rpc shape");
      return { owner: v.owner, data: Buffer.from(v.data[0], "base64") };
    },
  };
}

const CID = /^[A-Za-z0-9]{10,128}$/;
const AR_ID = /^[A-Za-z0-9_-]{43}$/;
const SAFE_PATH = /^[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;

/**
 * Untrusted URI -> candidate fetch URLs (in gateway order), or [] when unusable.
 * http(s) URLs pass through (safeFetch still vets them); ipfs:// and ar:// use pinned gateways only.
 */
export function rewriteUri(raw: string, ipfsGateways: string[], arGateways: string[]): string[] {
  const s = raw.trim();
  if (s.length === 0 || s.length > 2048) return [];
  const lower = s.toLowerCase();
  if (lower.startsWith("ipfs://")) {
    let rest = s.slice(7);
    if (rest.toLowerCase().startsWith("ipfs/")) rest = rest.slice(5);
    const i = rest.search(/[/?#]/);
    const cid = i < 0 ? rest : rest.slice(0, i);
    const path = i < 0 ? "" : rest.slice(i).split(/[?#]/)[0]!;
    if (!CID.test(cid) || !SAFE_PATH.test(path) || path.includes("..")) return [];
    return ipfsGateways.map((g) => g + cid + path);
  }
  if (lower.startsWith("ar://")) {
    const id = s.slice(5).split(/[/?#]/)[0]!;
    if (!AR_ID.test(id)) return [];
    return arGateways.map((g) => g + id);
  }
  if (lower.startsWith("https://") || lower.startsWith("http://")) {
    try {
      return [new URL(s).href];
    } catch {
      return [];
    }
  }
  return []; // data:, javascript:, file:, ftp:, relative, ...
}

/** Metadata JSON -> its `image` string (untrusted), or null. */
export function imageFromJson(body: Buffer): string | null {
  let j: unknown;
  try {
    j = JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const img = (j as Record<string, unknown>).image;
  return typeof img === "string" && img.trim() !== "" ? img : null;
}
