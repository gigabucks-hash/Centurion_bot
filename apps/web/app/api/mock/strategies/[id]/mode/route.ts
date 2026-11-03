import { parse, StrategyModeBody } from "@/lib/schemas/wire";
import { idempotent, ok, readJson } from "@/lib/bff";
import { expectedRev, guarded } from "@/lib/bff-wrap";
import { setStrategyMode, strategyToWire } from "@/lib/mock/store";

/**
 * MOCK-ONLY per-strategy mode switch: contracts 1.1.6 defines `mode` + the Real gate fields on strategy reads but no
 * route to change a strategy's mode (open item for Backend), so this lives outside /api/v1 on purpose.
 * Body `{mode: "practice"|"real", hold_ms?}` + `If-Match: "<rev>"` + `Idempotency-Key`.
 * 200 `{data: strategy}` · 403 MODE_NOT_ALLOWED (strategy not approved for Real) · 409 STRATEGY_REV_CONFLICT ·
 * 428 PRECONDITION_REQUIRED · 422 HOLD_TOO_SHORT (Real needs the 2.5 s hold). Never touches a wallet or the chain.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  const v = parse(StrategyModeBody, parsed.body);
  if (!v.ok) return v.res;
  const body = parsed.body as { mode: "practice" | "real"; hold_ms?: number };
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const s = setStrategyMode(id, body.mode, expectedRev(req, parsed.body), body.hold_ms ?? 0);
      return ok(strategyToWire(s), { headers: { ETag: `"${s.rev}"` } });
    }),
  );
}
