import type { ApprovalDecisionRequest } from "@sentra/contracts/wire";
import { fail, idempotent, now, readJson, realSolDisabled } from "@/lib/bff";
import { expectedRev } from "@/lib/bff-wrap";
import { decideApprovalWire, getApproval, WireError } from "@/lib/mock/store";

/**
 * POST /approvals/{id}/decision  (Idempotency-Key required)
 * Contracts 1.1.2: `If-Match: "<approval rev>"` (or body expected_rev) + {decision: approve|reject, token, reason?, confirmation?}.
 * 1.1.3: optional `reject_reason` (user_declined | not_tradeable | price_moved | other), reject only → else 422
 * VALIDATION_FAILED; default user_declined; echoed in the response and on the ApprovalWire.
 * No `client` field (the channel comes from the JWT). `expected_version` is gone.
 * 428 PRECONDITION_REQUIRED · 409 VERSION_CONFLICT {error.current_rev, base_rev, current} · APPROVAL_ALREADY_DECIDED ·
 * APPROVAL_EXPIRED {error.reason} · IDEMPOTENCY_KEY_REUSED.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/approvals/[id]/decision">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, async () => {
    const b = parsed.body as Partial<ApprovalDecisionRequest>;
    if ((b.decision !== "approve" && b.decision !== "reject") || typeof b.token !== "string") {
      return fail("VALIDATION_FAILED", {}, { expected: "{decision, token, reason?, confirmation?} + If-Match" });
    }
    const rev = expectedRev(req, parsed.body as Record<string, unknown>);
    if (rev == null) return fail("PRECONDITION_REQUIRED");
    const a = getApproval(id);
    if (!a) return fail("NOT_FOUND");
    if (a.mode === "real" && realSolDisabled()) return fail("REAL_SOL_DISABLED");
    try {
      const data = decideApprovalWire(id, { ...(b as ApprovalDecisionRequest), expected_rev: rev });
      return Response.json({ data, server_now: now() });
    } catch (e) {
      if (e instanceof WireError) return fail(e.code, e.extra, e.details);
      throw e;
    }
  });
}
