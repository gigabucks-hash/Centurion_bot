import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function lockDown(dir: string, file: string) {
  try { chmodSync(dir, 0o700); } catch { /* windows */ }
  try { chmodSync(file, 0o600); } catch { /* windows */ }
}

/** Bearer for this PC. Created on first use under .local-web and never committed. */
export function localToken(): string {
  const dir = process.env.CENTURION_LOCAL_DIR?.trim() || path.resolve(process.cwd(), "..", "..", ".local-web");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "mcp.token");
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (existing.length >= 32) {
      lockDown(dir, file);
      return existing;
    }
  }
  const token = randomBytes(32).toString("hex");
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  lockDown(dir, file);
  return token;
}
