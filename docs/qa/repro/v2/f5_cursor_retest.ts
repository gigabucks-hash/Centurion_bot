// BUG_HUNT_v2 — retest F5 at main 97faf0a.
// F5: a cursor id that is not a canonical UUID must be rejected by decodeCursor (-> 400
// CURSOR_INVALID at the route), never reach PostgreSQL's `$9::uuid` cast (-> 500).
//
// Run from C:\cw\app:
//   node --experimental-strip-types docs/qa/repro/v2/f5_cursor_retest.ts
import { decodeCursor } from "../../../../services/backend/api/src/wire.ts";

const ts = "2026-11-06T03:00:00.000000Z";
const enc = (raw: string) => Buffer.from(raw, "utf8").toString("base64url");

const cases: { name: string; id: string; want: "bad" | "ok" }[] = [
  { name: "36 hyphens (the v1 repro)", id: "-".repeat(36), want: "bad" },
  { name: "35 chars", id: "0".repeat(35), want: "bad" },
  { name: "37 chars", id: "0".repeat(37), want: "bad" },
  { name: "wrong grouping 4-8-4-4-12", id: "0000-00000000-0000-0000-000000000000", want: "bad" },
  { name: "non-hex letters", id: "zzzzzzzz-0000-0000-0000-000000000000", want: "bad" },
  { name: "full-width digits", id: "\uFF10".repeat(36), want: "bad" },
  { name: "canonical uuid", id: "40000000-0000-0000-0000-0000000000f5", want: "ok" },
];

let fail = 0;
for (const c of cases) {
  const got = decodeCursor(enc(`${ts}|${c.id}`));
  const verdict = got === "bad" ? "bad" : "ok";
  const pass = verdict === c.want;
  if (!pass) fail++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${c.name.padEnd(30)} want=${c.want} got=${verdict}`);
}

// A 5-part ranged cursor keeps the same id validation.
const ranged = decodeCursor(enc(`${ts}|${"-".repeat(36)}|2026-10-30T00:00:00.000Z||7d`));
console.log(`${ranged === "bad" ? "PASS" : "FAIL"}  ranged cursor, bad id          want=bad got=${ranged === "bad" ? "bad" : "ok"}`);
if (ranged !== "bad") fail++;

console.log(fail === 0 ? "\nF5 RETEST: FIXED (every malformed id is rejected before SQL)" : `\nF5 RETEST: NOT FIXED (${fail} case(s) accepted)`);
process.exitCode = fail === 0 ? 0 : 1;