import { approvalToWire } from "@/lib/contracts";
import { fail, ok, realSolDisabled } from "@/lib/bff";
import { getApproval, refreshQuote, WireError } from "@/lib/mock/store";

/**
 * MOCK-ONLY (proposed to Backend, not in contracts 1.1.4): POST /approvals/{id}/quote re-runs the papersim quote
 * (backend `set_approval_quote`): pending buy picks only, rev + 1, emits proposal.updated. → ApprovalWire.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/approvals/[id]/quote">) {
  const { id } = await ctx.params;
  const a = getApproval(id);
  if (!a) return fail("NOT_FOUND");
  if (a.mode === "real" && realSolDisabled()) return fail("REAL_SOL_DISABLED");
  try {
    return ok(approvalToWire(refreshQuote(id)));
  } catch (e) {
    if (e instanceof WireError) return fail(e.code, e.extra, e.details);
    throw e;
  }
}
