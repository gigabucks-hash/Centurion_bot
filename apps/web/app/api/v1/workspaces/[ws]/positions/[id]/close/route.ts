import type { ClosePositionResponse, FillWire, OrderWire } from "@sentra/contracts/wire";
import { fail, gateMode, idempotent, now, readJson } from "@/lib/bff";
import { expectedRev, guarded } from "@/lib/bff-wrap";
import { positionToWire, solToLamports } from "@/lib/contracts";
import { closePosition } from "@/lib/mock/store";

/**
 * POST /v1/workspaces/{ws}/positions/{id}/close?mode=  (contracts 1.1.2, manual sell, practice only)
 * Headers: `If-Match: "<position rev>"` (or body expected_rev) + `Idempotency-Key`. Body `{fraction_bps?: 1–10000}`
 * (default 10000 = all of the remaining quantity). `sell_pct` is gone.
 * 200 ClosePositionResponse (mock: fill completes synchronously, job_id null) · 403 MODE_NOT_ALLOWED · 422 INVALID_FRACTION ·
 * 409 POSITION_ALREADY_CLOSED · 428 PRECONDITION_REQUIRED · 409 VERSION_CONFLICT {error.current_rev, base_rev, current}.
 * Mock only: no wallet, RPC or chain.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/positions/[id]/close">) {
  const { ws, id } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const mode = gateMode(new URL(req.url).searchParams.get("mode") ?? parsed.body.mode);
      if (mode instanceof Response) return mode;
      if ("sell_pct" in parsed.body) return fail("VALIDATION_FAILED", {}, { field: "sell_pct", hint: "use fraction_bps" });
      const bps = parsed.body.fraction_bps == null ? 10_000 : Number(parsed.body.fraction_bps);
      const r = closePosition(decodeURIComponent(id), expectedRev(req, parsed.body), bps, mode);
      const ts = now();
      const orderId = crypto.randomUUID();
      const fillId = crypto.randomUUID();
      const lamports = solToLamports(r.before.solIn * (1 - r.before.soldPct / 100) * (bps / 10_000) * (1 + r.before.pnlPct / 100));
      const order: OrderWire = {
        id: orderId, position_id: r.before.key, mint: r.before.mint, mode, side: "sell", kind: "manual_close", fraction_bps: bps,
        status: "filled", reason_code: null, job_id: null, fill_id: fillId, practice_epoch: r.before.practiceEpoch, created_at: ts, updated_at: ts,
      };
      const fill = {
        id: fillId, side: "sell", simulated: true, practice_epoch: r.before.practiceEpoch, sol_lamports: lamports, token_amount_raw: "0", created_at: ts,
      } as unknown as FillWire;
      const body: ClosePositionResponse & { position_after: ReturnType<typeof positionToWire> } = {
        position: positionToWire(r.before, ws), order, order_id: orderId, fill, job_id: null, status: "filled", replayed: false, server_now: ts,
        // mock extra: the post-close view so the UI can update without waiting for position.updated
        position_after: positionToWire(r.after, ws),
      };
      return Response.json({ data: body, server_now: ts });
    }),
  );
}
