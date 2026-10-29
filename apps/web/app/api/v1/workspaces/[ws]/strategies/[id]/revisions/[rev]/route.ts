import { fail, ok } from "@/lib/bff";
import { settingsToWire } from "@/lib/contracts";
import { getRevision } from "@/lib/mock/store";

/** GET /strategies/{id}/revisions/{rev} — merge base for the 3-way review. */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/strategies/[id]/revisions/[rev]">) {
  const { id, rev } = await ctx.params;
  const s = getRevision(id, Number(rev));
  if (!s) return fail("NOT_FOUND");
  return ok({ strategy_id: id, rev: Number(rev), settings: settingsToWire(s) });
}
