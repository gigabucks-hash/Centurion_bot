// BUG_HUNT_v2 — retest F3 at main 97faf0a.
// F3: `?window=1h` is a valid server range; the range control must offer it and must display the
// requested value instead of falling back to the 1D option.
//
// Code-level check (no browser): the component source and the shared parser are both read from
// apps/web. A browser screenshot was produced for v1; this run proves the source no longer has the
// mismatch, not the pixels.
//
// Run from C:\cw\app:
//   node --experimental-strip-types docs/qa/repro/v2/f3_range_retest.ts
import { readFileSync } from "node:fs";
import { PNL_WINDOWS, parsePnlWindow } from "../../../../apps/web/lib/pnl-report.ts";

const src = readFileSync(new URL("../../../../apps/web/components/PnlFilters.tsx", import.meta.url), "utf8");
let fail = 0;
const check = (ok: boolean, label: string, extra = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
};

check((PNL_WINDOWS as readonly string[]).includes("1h"), "PNL_WINDOWS includes 1h", PNL_WINDOWS.join(","));
check(parsePnlWindow("1h") === "1h", "parsePnlWindow('1h') === '1h'", parsePnlWindow("1h"));
check(parsePnlWindow("24h") === "24h", "parsePnlWindow('24h') === '24h'");
check(parsePnlWindow("bogus") === "7d", "unknown window falls back to the 7d default");

const optionValues = [...src.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
check(optionValues.includes("1h"), "range select renders a 1h option", optionValues.join(","));
check(
  /value=\{parsePnlWindow\(sp\.get\("window"\)\)\}/.test(src),
  "select value is parsed from ?window= (so 1h selects the 1h option)",
);
check(!/value=\{sp\.get\("window"\) \?\? "7d"\}/.test(src), "old raw-value binding is gone");

console.log(fail === 0 ? "\nF3 RETEST: FIXED (1h offered and selected; code-level)" : `\nF3 RETEST: NOT FIXED (${fail} failure(s))`);
process.exitCode = fail === 0 ? 0 : 1;