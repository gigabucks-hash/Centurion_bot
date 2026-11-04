#!/usr/bin/env node
/**
 * Cross-platform test entry.
 *
 * `CENTURION_MOCK_REAL_DEMO=1 node --import tsx --test 'lib/__tests__/*.test.ts'` only works in a POSIX shell:
 * cmd.exe and PowerShell treat the leading `NAME=value` as a command and fail with
 * "'CENTURION_MOCK_REAL_DEMO' is not recognized as an internal or external command".
 * Set the flag here and let Node's own test runner expand the glob, so `npm test` works on Windows too.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "lib/__tests__/*.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, CENTURION_MOCK_REAL_DEMO: "1" },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
