import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { verifySolanaMessage } from "./ed25519";
import { localDir } from "./paths";
import {
  DEFAULT_KNOBS,
  diffKnobs,
  enableMessage,
  limitsMessage,
  rpcUrlOk,
  validateKnobs,
  type RealKnobs,
} from "./real-limits";

export interface RealBook {
  enabled: boolean;
  wallet: string;
  /** Base58 signature of the enable message. Public. Never a private key. */
  enableSignature: string;
  rpcUrl: string;
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
    rpcUrl: "https://api.mainnet-beta.solana.com",
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

function isKnobs(value: unknown): value is RealKnobs {
  return !!value && typeof value === "object" && validateKnobs(value as RealKnobs) == null;
}

function normalize(raw: unknown): RealBook {
  const blank = defaultBook();
  if (!raw || typeof raw !== "object") return blank;
  const row = raw as Partial<RealBook>;
  const strategies: Record<string, RealKnobs> = {};
  if (row.strategies && typeof row.strategies === "object" && !Array.isArray(row.strategies)) {
    for (const [id, knobs] of Object.entries(row.strategies)) {
      if (isKnobs(knobs)) strategies[id] = knobs;
    }
  }
  return {
    enabled: row.enabled === true,
    wallet: typeof row.wallet === "string" ? row.wallet : "",
    enableSignature: typeof row.enableSignature === "string" ? row.enableSignature : "",
    rpcUrl: typeof row.rpcUrl === "string" && rpcUrlOk(row.rpcUrl) ? row.rpcUrl : blank.rpcUrl,
    global: isKnobs(row.global) ? row.global : blank.global,
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
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(book, null, 2)}\n`);
  renameSync(tmp, file);
}

export function scopeKnobs(book: RealBook, scope: string): RealKnobs | null {
  if (scope === "global") return structuredClone(book.global);
  if (!scope.startsWith("strategy:") || scope.length > 80) return null;
  const id = scope.slice("strategy:".length);
  if (!id) return null;
  return structuredClone(book.strategies[id] ?? book.global);
}

export function previewEnable(wallet: string): string | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return null;
  return enableMessage(wallet);
}

export function previewLimits(book: RealBook, scope: string, next: RealKnobs): string | null {
  if (!book.enabled || !book.wallet) return null;
  if (validateKnobs(next)) return null;
  const old = scopeKnobs(book, scope);
  if (!old) return null;
  return limitsMessage(book.wallet, scope, old, next);
}

export function enableReal(book: RealBook, wallet: string, signature: string): { book: RealBook } | { error: BookError } {
  const message = previewEnable(wallet);
  if (!message) return { error: "wallet" };
  if (book.wallet && book.wallet !== wallet) return { error: "wallet" };
  if (!verifySolanaMessage(wallet, message, signature)) return { error: "bad_signature" };
  return { book: { ...book, enabled: true, wallet, enableSignature: signature } };
}

/** Turning Real off is immediate. It does not delete the public key. */
export function disableReal(book: RealBook): RealBook {
  return { ...book, enabled: false };
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
  if (diff.kind === "loosen") {
    if (!signature) return { error: "needs_signature" };
    const message = limitsMessage(book.wallet, scope, old, next);
    if (!verifySolanaMessage(book.wallet, message, signature)) return { error: "bad_signature" };
  }
  const saved = structuredClone(book);
  if (scope === "global") saved.global = structuredClone(next);
  else saved.strategies[scope.slice("strategy:".length)] = structuredClone(next);
  return { book: saved };
}

export function setRpc(book: RealBook, rpcUrl: string): { book: RealBook } | { error: BookError } {
  if (!rpcUrlOk(rpcUrl.trim())) return { error: "invalid" };
  return { book: { ...book, rpcUrl: rpcUrl.trim() } };
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
    global: book.global,
    strategies: book.strategies,
    buysPaused: book.buysPaused,
    realStrategies: book.realStrategies,
    defaults: { tradeSol: "0.05", dailySol: "0.5", capSol: "2", maxPositions: 3 },
  };
}
