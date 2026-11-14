import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Bearer for this PC. Created on first use under .local-web and never committed. */
export function localToken(): string {
  const dir = process.env.CENTURION_LOCAL_DIR?.trim() || path.resolve(process.cwd(), "..", "..", ".local-web");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "mcp.token");
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  }
  const token = randomBytes(32).toString("hex");
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}
