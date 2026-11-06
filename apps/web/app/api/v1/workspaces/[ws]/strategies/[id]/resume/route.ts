import { idempotent, ok, readJson } from "@/lib/bff";
import { expectedRev, guarded } from "@/lib/bff-wrap";
import { setStrategyStatus, strategyToWire } from "@/lib/mock/store";

/**
 * MOCK BFF `POST /v1/workspaces/{ws}/strategies/{id}/resume`.
 * Mirrors the paper backend: `If-Match: "<rev>"` + `Idempotency-Key`; 200 `{data: strategy}` + ETag.
 * In DATA_SOURCE=http the proxy answers this same URL from the real API, so the browser code is identical.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const s = setStrategyStatus(id, "running", expectedRev(req, parsed.body));
      return ok(strategyToWire(s), { headers: { ETag: `"${s.rev}"` } });
    }),
  );
}