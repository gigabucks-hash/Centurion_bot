import { connection } from "next/server";
import { approvalToWire, type ApprovalItemWire } from "@/lib/contracts";
import { fail, ok, realSolDisabled } from "@/lib/bff";
import { getApproval, issueDecisionToken } from "@/lib/mock/store";

/** GET /approvals/{id} → item + a fresh single-use decision_token (TTL min(15 min, expires_at)). */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/approvals/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const a = getApproval(id);
  if (!a) return fail("NOT_FOUND");
  if (a.mode === "real" && realSolDisabled()) return fail("REAL_SOL_DISABLED");
  const w: ApprovalItemWire = approvalToWire(a);
  if (a.status === "pending" || (a.kind === "guard_change" && a.guardChangeState === "cooling_down")) {
    const tok = issueDecisionToken(id);
    w.decision_token = tok.token;
    w.decision_token_expires_at = new Date(tok.expiresAt).toISOString();
  }
  return ok(w);
}
