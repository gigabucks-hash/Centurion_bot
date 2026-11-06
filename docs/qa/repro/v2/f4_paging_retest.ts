// BUG_HUNT_v2 — retest F4 at main 97faf0a.
// F4: a relative `window` must be resolved ONCE (page 1) and carried in the cursor, so page 2 cannot
// move its lower bound; and a cursor from another range must be refused.
//
// This drives the real functions (`pagedRange`, `encodeCursor`, `decodeCursor`) with a fake `Ctx`,
// so it needs no server and no database. It is independent of the author's test file.
//
// Run from C:\cw\app:
//   node --experimental-strip-types docs/qa/repro/v2/f4_paging_retest.ts
import { pagedRange } from "../../../../services/backend/api/src/rules.ts";
import { decodeCursor, encodeCursor } from "../../../../services/backend/api/src/wire.ts";

const ctx = (qs: string) => ({ url: new URL(`http://x/v1/positions?${qs}`) }) as never;
let fail = 0;
const check = (ok: boolean, label: string, extra = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
};

// Page 1: resolve the range from the relative window.
const p1 = pagedRange(ctx("window=7d&limit=2"), null);
check(p1.window === "7d", "page 1 remembers the window", `window=${p1.window}`);
check(!!p1.range.from, "page 1 resolves an absolute from", `from=${p1.range.from}`);
check(p1.range.to === null, "open-ended `to` stays null");

// Page 2 arrives 10 minutes later. The naive resolver would compute from = now-7d again.
await new Promise((r) => setTimeout(r, 60));
const cursor = encodeCursor("2026-11-05T10:00:00.123456Z", "40000000-0000-0000-0000-0000000000f4", p1.range, p1.window);
const decoded = decodeCursor(cursor);
check(decoded !== "bad" && decoded !== null, "cursor decodes");
if (decoded && decoded !== "bad") {
  const p2 = pagedRange(ctx("window=7d&limit=2&cursor=" + cursor), decoded);
  check(p2.range.from === p1.range.from, "page 2 reuses page 1's from byte-for-byte", `${p2.range.from}`);
  check(p2.range.to === p1.range.to, "page 2 reuses page 1's to");
  check(p2.window === p1.window, "page 2 keeps the window key");

  // Same walk without repeating `window`: the cursor alone still pins the range.
  const p2b = pagedRange(ctx("limit=2&cursor=" + cursor), decoded);
  check(p2b.range.from === p1.range.from, "cursor alone pins the range");

  // A cursor replayed against another range must be refused, not silently applied.
  for (const other of ["30d", "1h", "all"]) {
    let code: string | null = null;
    try {
      pagedRange(ctx(`window=${other}&cursor=${cursor}`), decoded);
    } catch (e) {
      code = (e as { code?: string }).code ?? String(e);
    }
    check(code === "CURSOR_INVALID", `window=${other} with a 7d cursor -> CURSOR_INVALID`, String(code));
  }

  // Explicit bounds from another range are refused too.
  let code: string | null = null;
  try {
    pagedRange(ctx(`from=2020-01-01T00:00:00Z&cursor=${cursor}`), decoded);
  } catch (e) {
    code = (e as { code?: string }).code ?? String(e);
  }
  check(code === "CURSOR_INVALID", "mismatched explicit from -> CURSOR_INVALID", String(code));

  // The same explicit bounds as the frozen ones are allowed (desktop sends from/to).
  let sameOk = true;
  try {
    const p3 = pagedRange(
      ctx(`from=${encodeURIComponent(p1.range.from!)}&cursor=${cursor}`),
      decoded,
    );
    sameOk = p3.range.from === p1.range.from;
  } catch {
    sameOk = false;
  }
  check(sameOk, "identical explicit from/to is accepted");
}

console.log(fail === 0 ? "\nF4 RETEST: FIXED (frozen range + range-bound cursor)" : `\nF4 RETEST: NOT FIXED (${fail} failure(s))`);
process.exitCode = fail === 0 ? 0 : 1;