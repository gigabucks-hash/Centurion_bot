import { approvalToWire } from "@/lib/contracts";
import { fail, idempotent, ok, readJson } from "@/lib/bff";
import { cancelGuardChange, WireError } from "@/lib/mock/store";

/** POST /guard-changes/{id}/cancel — any member, during the 10 min cooldown. (Mock: id = proposal id.) */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/guard-changes/[id]/cancel">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, async () => {
    try {
      return ok(approvalToWire(cancelGuardChange(id)));
    } catch (e) {
      if (e instanceof WireError) return fail(e.code, e.extra, e.details);
      throw e;
    }
  });
}
