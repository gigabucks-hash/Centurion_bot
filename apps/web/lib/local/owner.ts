import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localDir } from "./paths";

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Public key of the wallet that signed in on this PC. Not a secret. */
export function readOwnerAddress(): string | null {
  const dir = localDir();
  if (!dir) return null;
  const file = path.join(dir, "owner.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { address?: unknown };
    return typeof parsed.address === "string" && B58.test(parsed.address) ? parsed.address : null;
  } catch {
    return null;
  }
}

/** Remember the first Phantom public key. A different key does not replace it. */
export function bindOwner(address: string): boolean {
  const dir = localDir();
  if (!dir || !B58.test(address)) return false;
  const current = readOwnerAddress();
  if (current && current !== address) return false;
  if (current === address) return true;
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "owner.json");
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ address }, null, 2));
  renameSync(tmp, file);
  return true;
}
