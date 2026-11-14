import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { verifySolanaMessage } from "./ed25519";
import { localDir } from "./paths";
import {
  DEFAULT_KNOBS,
  diffKnobs,
  enableMessage,
  limitsMessage,
  nonceOk,
  rpcUrlOk,
  validateKnobs,
  type RealKnobs,
} from "./real-limits";

export interface RealBook {
  enabled: boolean;
  wallet: string;
  /** Base58 signature of the enable message. Public. Never a private key. */
  enableSignature: string;
  /** Nonce inside the enable message that was signed. */
  enableNonce: string;
  pendingEnableNonce: string;
  pendingLimitsNonce: string;
  usedSignatures: string[];
  rpcUrl: string;
  /** Empty unless the owner pasted a faster RPC. Off by default. */
  fastRpcUrl: string;
  global: RealKnobs;
  strategies: Record<string, RealKnobs>;
  buysPaused: boolean;
  realStrategies: string[];
}

export type BookError = "invalid" | "needs_signature" | "bad_signature" | "real_off" | "wallet";

const SECRET_KEY = /private|secret|seed|mnemonic|keypair|password/i;

export function defaultBook(): RealBook {
  return {
    enabled: false,
    wallet: "",
    enableSignature: "",
    enableNonce: "",
    pendingEnableNonce: "",
    pendingLimitsNonce: "",
    usedSignatures: [],
    rpcUrl: "https://api.mainnet-beta.solana.com",
    fastRpcUrl: "",
    global: structuredClone(DEFAULT_KNOBS),
    strategies: {},
    buysPaused: false,
    realStrategies: [],
  };
}

function hasSecret(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) return true;
    if (hasSecret(child)) return true;
  }
  return false;
}

function bookPath(): string | null {
  const dir = localDir();
  return dir ? path.join(dir, "real.json") : null;
}

/** Old books predate the fee percentile and the Jito switch. Missing fields stay at the safe defaults. */
export function fillKnobs(value: unknown): RealKnobs | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<RealKnobs>;
  const merged: RealKnobs = {
    ...DEFAULT_KNOBS,
    ...row,
    filters: { ...DEFAULT_KNOBS.filters, ...(row.filters ?? {}) },
    takeProfits: row.takeProfits?.length ? row.takeProfits : DEFAULT_KNOBS.takeProfits,
    priorityFeePercentile: row.priorityFeePercentile ?? DEFAULT_KNOBS.priorityFeePercentile,
    jitoEnabled: row.jitoEnabled ?? false,
  };
  return validateKnobs(merged) == null ? merged : null;
}

function normalize(raw: unknown): RealBook {
  const blank = defaultBook();
  if (!raw || typeof raw !== "object") return blank;
  const row = raw as Partial<RealBook>;
  const strategies: Record<string, RealKnobs> = {};
  if (row.strategies && typeof row.strategies === "object" && !Array.isArray(row.strategies)) {
    for (const [id, knobs] of Object.entries(row.strategies)) {
      const filled = fillKnobs(knobs);
      if (filled) strategies[id] = filled;
    }
  }
  return {
    enabled: row.enabled === true,
    wallet: typeof row.wallet === "string" ? row.wallet : "",
    enableSignature: typeof row.enableSignature === "string" ? row.enableSignature : "",
    enableNonce: typeof row.enableNonce === "string" ? row.enableNonce : "",
    pendingEnableNonce: typeof row.pendingEnableNonce === "string" ? row.pendingEnableNonce : "",
    pendingLimitsNonce: typeof row.pendingLimitsNonce === "string" ? row.pendingLimitsNonce : "",
    usedSignatures: Array.isArray(row.usedSignatures) ? row.usedSignatures.filter((s): s is string => typeof s === "string").slice(-32) : [],
    rpcUrl: typeof row.rpcUrl === "string" && rpcUrlOk(row.rpcUrl) ? row.rpcUrl : blank.rpcUrl,
    fastRpcUrl: typeof row.fastRpcUrl === "string" && (row.fastRpcUrl === "" || rpcUrlOk(row.fastRpcUrl)) ? row.fastRpcUrl : "",
    global: fillKnobs(row.global) ?? blank.global,
    strategies,
    buysPaused: row.buysPaused === true,
    realStrategies: Array.isArray(row.realStrategies) ? row.realStrategies.filter((id): id is string => typeof id === "string") : [],
  };
}

export function readBook(): RealBook {
  const file = bookPath();
  if (!file || !existsSync(file)) return defaultBook();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (hasSecret(raw)) {
      unlinkSync(file);
      return defaultBook();
    }
    const book = normalize(raw);
    if (!book.enabled) return { ...book, enabled: false };
    const message = nonceOk(book.enableNonce) ? enableMessage(book.wallet, book.enableNonce) : "";
    if (!message || !verifySolanaMessage(book.wallet, message, book.enableSignature)) {
      return { ...book, enabled: false };
    }
    return book;
  } catch {
    return defaultBook();
  }
}

export function writeBook(book: RealBook): void {
  if (hasSecret(book)) throw new Error("secret field");
  const dir = localDir();
  const file = bookPath();
  if (!dir || !file) throw new Error("not-local");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* windows */ }
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(book, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* windows */ }
}

export function scopeKnobs(book: RealBook, scope: string): RealKnobs | null {
  if (scope === "global") return structuredClone(book.global);
  if (!scope.startsWith("strategy:") || scope.length > 80) return null;
  const id = scope.slice("strategy:".length);
  if (!id) return null;
  return structuredClone(book.strategies[id] ?? book.global);
}

export function armEnable(book: RealBook, wallet: string): { book: RealBook; message: string } | { error: BookError } {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return { error: "wallet" };
  const nonce = randomBytes(16).toString("hex");
  return { book: { ...book, pendingEnableNonce: nonce }, message: enableMessage(wallet, nonce) };
}

export function armLimits(book: RealBook, scope: string, next: RealKnobs): { book: RealBook; message: string } | { error: BookError } {
  if (!book.enabled || !book.wallet) return { error: "real_off" };
  if (validateKnobs(next)) return { error: "invalid" };
  const old = scopeKnobs(book, scope);
  if (!old) return { error: "invalid" };
  const nonce = randomBytes(16).toString("hex");
  return { book: { ...book, pendingLimitsNonce: nonce }, message: limitsMessage(book.wallet, scope, old, next, nonce) };
}

export function previewEnable(wallet: string): string | null {
  const armed = armEnable(defaultBook(), wallet);
  return "error" in armed ? null : armed.message;
}

export function previewLimits(book: RealBook, scope: string, next: RealKnobs): string | null {
  const armed = armLimits(book, scope, next);
  return "error" in armed ? null : armed.message;
}

function remember(book: RealBook, signature: string): { book: RealBook } | { error: BookError } {
  if (book.usedSignatures.includes(signature)) return { error: "bad_signature" };
  return { book: { ...book, usedSignatures: [...book.usedSignatures, signature].slice(-32) } };
}

export function enableReal(book: RealBook, wallet: string, signature: string): { book: RealBook } | { error: BookError } {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return { error: "wallet" };
  if (book.wallet && book.wallet !== wallet) return { error: "wallet" };
  if (!nonceOk(book.pendingEnableNonce)) return { error: "needs_signature" };
  const message = enableMessage(wallet, book.pendingEnableNonce);
  if (!verifySolanaMessage(wallet, message, signature)) return { error: "bad_signature" };
  const kept = remember(book, signature);
  if ("error" in kept) return kept;
  return {
    book: {
      ...kept.book,
      enabled: true,
      wallet,
      enableSignature: signature,
      enableNonce: book.pendingEnableNonce,
      pendingEnableNonce: "",
    },
  };
}

/** Turning Real off is immediate. It does not delete the public key. */
export function disableReal(book: RealBook): RealBook {
  return { ...book, enabled: false };
}

/** Apply knobs with no extra signature. Only for the local autotrader after Real is already on. */
export function applyKnobsDirect(
  book: RealBook,
  scope: string,
  next: RealKnobs,
): { book: RealBook; kind: "same" | "tighten" | "loosen" } | { error: BookError } {
  if (!book.enabled || !book.wallet) return { error: "real_off" };
  if (validateKnobs(next)) return { error: "invalid" };
  const old = scopeKnobs(book, scope);
  if (!old) return { error: "invalid" };
  const kind = diffKnobs(old, next).kind;
  const saved = structuredClone(book);
  if (scope === "global") saved.global = structuredClone(next);
  else saved.strategies[scope.slice("strategy:".length)] = structuredClone(next);
  return { book: saved, kind };
}

export function applyKnobs(
  book: RealBook,
  scope: string,
  next: RealKnobs,
  signature: string | null,
): { book: RealBook } | { error: BookError } {
  if (!book.enabled || !book.wallet) return { error: "real_off" };
  if (validateKnobs(next)) return { error: "invalid" };
  const old = scopeKnobs(book, scope);
  if (!old) return { error: "invalid" };
  const diff = diffKnobs(old, next);
  let saved = structuredClone(book);
  if (diff.kind === "loosen") {
    if (!signature) return { error: "needs_signature" };
    if (!nonceOk(book.pendingLimitsNonce)) return { error: "needs_signature" };
    const message = limitsMessage(book.wallet, scope, old, next, book.pendingLimitsNonce);
    if (!verifySolanaMessage(book.wallet, message, signature)) return { error: "bad_signature" };
    const kept = remember(book, signature);
    if ("error" in kept) return kept;
    saved = structuredClone(kept.book);
    saved.pendingLimitsNonce = "";
  }
  if (scope === "global") saved.global = structuredClone(next);
  else saved.strategies[scope.slice("strategy:".length)] = structuredClone(next);
  return { book: saved };
}

export function setRpc(book: RealBook, rpcUrl: string): { book: RealBook } | { error: BookError } {
  if (!rpcUrlOk(rpcUrl.trim())) return { error: "invalid" };
  return { book: { ...book, rpcUrl: rpcUrl.trim() } };
}

/** Empty turns the optional faster RPC off. A paid URL is never filled in for the owner. */
export function setFastRpc(book: RealBook, rpcUrl: string): { book: RealBook } | { error: BookError } {
  const url = rpcUrl.trim();
  if (url !== "" && !rpcUrlOk(url)) return { error: "invalid" };
  return { book: { ...book, fastRpcUrl: url } };
}

export function setRealStrategies(book: RealBook, ids: string[]): { book: RealBook } | { error: BookError } {
  if (!book.enabled) return { error: "real_off" };
  if (ids.length > 50 || ids.some((id) => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) return { error: "invalid" };
  return { book: { ...book, realStrategies: [...new Set(ids)] } };
}

export function publicBook(book: RealBook) {
  return {
    enabled: book.enabled,
    wallet: book.wallet,
    rpcUrl: book.rpcUrl,
    fastRpcUrl: book.fastRpcUrl,
    global: book.global,
    strategies: book.strategies,
    buysPaused: book.buysPaused,
    realStrategies: book.realStrategies,
    defaults: { tradeSol: "0.05", dailySol: "0.5", capSol: "2", maxPositions: 3 },
  };
}
