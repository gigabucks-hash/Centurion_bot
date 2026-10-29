// Secret handling + redaction check. Secrets are read at runtime from a mode-600 file outside the repo.
// Values are never printed; only variable NAMES may appear in output.
import { readFileSync, statSync } from "node:fs";

export const DEFAULT_SECRETS_FILE = "/home/box/.secrets/sentra_bakeoff.env";
export const SECRET_NAME = /^(CROSSMINT_.*KEY|TURNKEY_API_PRIVATE_KEY|TURNKEY_.*SECRET|.*_PRIVATE_KEY)$/;
/** Key-shaped tokens: a Crossmint staging/production prefix followed by key characters. */
export const KEY_SHAPE = /\b(?:sk|ck)_(?:staging|production)_[A-Za-z0-9_-]{8,}/;

/** Parse a dotenv-style file (KEY=VALUE, optional quotes). Returns names → values; never logs. */
export function loadSecretsFile(path: string = process.env.BAKEOFF_SECRETS_FILE ?? DEFAULT_SECRETS_FILE): Record<string, string> {
  const st = statSync(path);
  if ((st.mode & 0o077) !== 0) throw new Error(`${path} must not be group/world readable (chmod 600)`);
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** Values that must never appear anywhere: every secret-named var with a non-trivial value. */
export function secretValues(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([k, v]) => SECRET_NAME.test(k) && typeof v === "string" && v.length >= 8)
    .map(([, v]) => v as string);
}

export type Leak = { where: string; kind: "secret-value" | "key-shape" };
export function findLeaks(text: string, where: string, secrets: string[]): Leak[] {
  const leaks: Leak[] = [];
  for (const s of secrets) if (text.includes(s)) leaks.push({ where, kind: "secret-value" });
  if (KEY_SHAPE.test(text)) leaks.push({ where, kind: "key-shape" });
  return leaks;
}

export function redact(text: string, secrets: string[]): string {
  let t = text;
  for (const s of secrets) t = t.split(s).join("[REDACTED]");
  return t.replace(new RegExp(KEY_SHAPE.source, "g"), "[REDACTED_KEY]");
}
