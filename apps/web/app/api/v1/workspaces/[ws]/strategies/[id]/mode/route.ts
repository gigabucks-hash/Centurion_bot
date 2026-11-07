import { parse, StrategyModeBody } from "@/lib/schemas/wire";
import { idempotent, ok, readJson } from "@/lib/bff";
import { expectedRev, guarded } from "@/lib/bff-wrap";
import { setStrategyMode, strategyToWire } from "@/lib/mock/store";

/**
 * MOCK BFF `POST /v1/workspaces/{ws}/strategies/{id}/mode` (contract route added by Backend; additive to 1.1.6).
 * Body `{mode: "practice" | "real"}` + `If-Match: "<rev>"` + `Idempotency-Key`. The 2.5 s hold for practice → real is
 * a client-side gesture and is never sent.
 * 200 `{data: strategy}` + ETag · 403 MODE_NOT_ALLOWED (practice → real while paper-only / archived) ·
 * 409 STRATEGY_REV_CONFLICT · 428 PRECONDITION_REQUIRED · 404 NOT_FOUND.
 * In DATA_SOURCE=http the proxy answers this same URL from the paper API, so the browser code is identical.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  const v = parse(StrategyModeBody, parsed.body);
  if (!v.ok) return v.res;
  const body = v.data;
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const s = setStrategyMode(id, body.mode, expectedRev(req, parsed.body));
      return ok(strategyToWire(s), { headers: { ETag: `"${s.rev}"` } });
    }),
  );
}
