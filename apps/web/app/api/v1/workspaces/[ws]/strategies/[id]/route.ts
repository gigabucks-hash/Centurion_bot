import { idempotent, ok, readJson, fail } from "@/lib/bff";
import { expectedRev, guarded } from "@/lib/bff-wrap";
import { approvalToWire } from "@/lib/contracts";
import { getStrategy, patchStrategy, strategyToWire } from "@/lib/mock/store";

/** GET /strategies/{id} → `{data: {id, rev, name, status, mode, settings (flat snake_case)}}` + ETag. */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/strategies/[id]">) {
  const { id } = await ctx.params;
  const s = getStrategy(id);
  if (!s) return fail("NOT_FOUND");
  return ok(strategyToWire(s), { headers: { ETag: `"${s.rev}"` } });
}

/**
 * PATCH /strategies/{id}: `If-Match: "<rev>"` (or `expected_rev`) + `{settings_patch}` (JSON merge, null removes).
 * 200 applied (rev+1) · 202 `{proposal}` when a guard loosens (guard_change, 24 h) · 409 STRATEGY_REV_CONFLICT with merge data ·
 * 428 PRECONDITION_REQUIRED without a base rev.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/strategies/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  const patch = parsed.body.settings_patch;
  if (!patch || typeof patch !== "object") return fail("VALIDATION_FAILED", {}, { field: "settings_patch" });
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const r = patchStrategy(id, expectedRev(req, parsed.body), patch as Record<string, unknown>);
      const headers = { ETag: `"${r.strategy.rev}"` };
      return r.status === 202 ? ok({ proposal: approvalToWire(r.proposal), strategy: r.strategy }, { status: 202, headers }) : ok(r.strategy, { headers });
    }),
  );
}
