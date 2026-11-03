import { parse, StrategyPatchBody } from "@/lib/schemas/wire";
import { idempotent, ok, readJson, fail, MOCK_WORKSPACE } from "@/lib/bff";
import type { GuardChangeWire } from "@centurion/contracts/wire";
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
  const v = parse(StrategyPatchBody, parsed.body);
  if (!v.ok) return v.res;
  const patch = parsed.body.settings_patch;
  if (!patch || typeof patch !== "object") return fail("VALIDATION_FAILED", {}, { field: "settings_patch" });
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const r = patchStrategy(id, expectedRev(req, parsed.body), patch as Record<string, unknown>);
      const headers = { ETag: `"${r.strategy.rev}"` };
      if (r.status !== 202) return ok(r.strategy, { headers });
      // 1.1.4 GuardChangeProposed: {proposal: ApprovalWire, guard_change: GuardChangeWire}; nothing applied; Location → the approval.
      const ap = r.proposal;
      const guard_change: GuardChangeWire = {
        id: `gc_${ap.id}`, guard_change_id: `gc_${ap.id}`, proposal_id: ap.id, strategy_id: r.strategy.id, mode: "practice", status: "requested",
        rev: 1, from_rev: r.strategy.rev,
        diff: (ap.diff ?? []).map((d) => ({ key: d.key, before: d.before, after: d.after, effect: d.direction === "weakens" ? "weakens" : "changes" })),
        weakened_fields: (ap.diff ?? []).filter((d) => d.direction === "weakens").map((d) => d.key), requested_by: null,
        cooldown_until: null, auto_revert_at: null, applied_at: null, created_at: new Date(ap.createdAt).toISOString(),
      };
      return ok({ proposal: approvalToWire(ap), guard_change } satisfies Record<string, unknown>, { status: 202, headers: { ...headers, Location: `/api/v1/workspaces/${MOCK_WORKSPACE}/approvals/${ap.id}` } });
    }),
  );
}
