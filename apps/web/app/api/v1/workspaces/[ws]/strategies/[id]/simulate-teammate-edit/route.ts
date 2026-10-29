import { ok } from "@/lib/bff";
import { guarded } from "@/lib/bff-wrap";
import { simulateTeammateEdit } from "@/lib/mock/store";

/** Mock-only (not in the contract): a teammate saves from mobile so the 409 merge flow can be demoed. */
export async function POST(_req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/strategies/[id]/simulate-teammate-edit">) {
  const { id } = await ctx.params;
  return guarded(() => ok(simulateTeammateEdit(id).strategy));
}
