// Fails (exit 1) if any loaded secret VALUE, or an sk_/ck_ staging/production key-shaped token, appears in:
// files tracked or staged in git under bakeoff/ + docs/BAKEOFF_REVIEW.md, results/, and any extra files passed as args.
// Prints only file paths and leak kinds, never values.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { findLeaks, loadSecretsFile, secretValues, DEFAULT_SECRETS_FILE, type Leak } from "./secrets.ts";

const here = resolve(import.meta.dirname, "..");
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here }).toString().trim();
const secretsPath = process.env.BAKEOFF_SECRETS_FILE ?? DEFAULT_SECRETS_FILE;
const fileEnv = existsSync(secretsPath) ? loadSecretsFile(secretsPath) : {};
const secrets = secretValues({ ...process.env, ...fileEnv });

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".git") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = new Set<string>([
  ...walk(here),
  resolve(repoRoot, "services/backend/docs/BAKEOFF_REVIEW.md"),
  ...process.argv.slice(2).map((f) => resolve(f)),
]);
// Also scan what git would commit (staged blobs) for our paths.
let staged = "";
try {
  staged = execFileSync("git", ["diff", "--cached", "--", "services/backend/bakeoff", "services/backend/docs/BAKEOFF_REVIEW.md"], { cwd: repoRoot, maxBuffer: 64 << 20 }).toString();
} catch { /* nothing staged */ }

const leaks: Leak[] = [];
for (const f of files) if (existsSync(f)) leaks.push(...findLeaks(readFileSync(f, "utf8"), f.replace(repoRoot + "/", ""), secrets));
leaks.push(...findLeaks(staged, "git:staged-diff", secrets));

console.log(`redaction-check: ${files.size} files + staged diff scanned, ${secrets.length} secret value(s) loaded from ${existsSync(secretsPath) ? "secrets file" : "env only"}`);
if (leaks.length) {
  for (const l of leaks) console.log(`LEAK ${l.kind} in ${l.where}`);
  process.exit(1);
}
console.log("redaction-check: PASS (no secret values, no key-shaped tokens)");
