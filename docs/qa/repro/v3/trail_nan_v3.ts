/**
 * BUG_HUNT_v3 - dashboard coin-trail card prints "0.00" for an unknown PnL.
 *
 * `trailPositionFromWire` (apps/web/lib/http-api.ts:442-466) sets `pnlSol: lamportsToSolNumber(...) ?? NaN`.
 * `lamportsToSolNumber` returns undefined for a null wire value, so an OPEN position (position_wire emits
 * pnl_lamports = null while open) becomes NaN. `pnlSol()` in @centurion/i18n formats any non-finite number
 * as a neutral "0.00" (packages/i18n/format.mjs:25), and Pnl.tsx only guards `=== null` (Pnl.tsx:21).
 * The dashboard passes that raw value at app/(app)/(dashboard)/page.tsx:122, while the coin detail page
 * guards it with numOrNull() and renders an em dash (coins/[mint]/page.tsx:88,145).
 *
 * Run from C:\cw\app:
 *   node --import ./apps/web/node_modules/tsx/dist/loader.mjs docs/qa/repro/v3/trail_nan_v3.ts
 */
import assert from "node:assert/strict";
import { lamportsToSolNumber } from "../../../../apps/web/lib/contracts.ts";
import { pnlDisplay } from "../../../../apps/web/lib/pnl.ts";

// position_wire: pnl_lamports is null for an open row (0025_open_position_marks.sql:42).
assert.equal(lamportsToSolNumber(null), undefined);
const pnlSol = lamportsToSolNumber(null) ?? NaN; // trailPositionFromWire:462
assert.ok(Number.isNaN(pnlSol));

// Pnl.tsx:21 guard only catches null, so NaN reaches pnlDisplay -> pnlSol(NaN).
const rendered = pnlDisplay({ sol: pnlSol }, "en", { paper: true, unit: true });
assert.equal(rendered.text, "0.00\u00A0paper SOL", "NaN is formatted as a flat 0.00, not an em dash");
assert.equal(rendered.tone, "neutral");

// For the same row the coin page passes numOrNull(pos.pnlSol) = null -> Pnl renders an em dash.
const guarded = pnlSol != null && Number.isFinite(pnlSol) ? pnlSol : null;
assert.equal(guarded, null);

console.log(JSON.stringify({
  ok: true,
  defect: "P3 dashboard coin-trail link shows 0.00 when the trail position PnL is unknown (open row)",
  source: "apps/web/lib/http-api.ts:442-466 (pnlSol NaN), apps/web/app/(app)/(dashboard)/page.tsx:122 (raw pass-through)",
  observed: rendered.text,
  expected: "em dash (coins/[mint]/page.tsx:88,145)",
}, null, 2));