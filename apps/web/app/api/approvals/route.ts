import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import type { ApprovalDecision } from "@/lib/types";

export async function GET() {
  return Response.json(await getApi().listApprovals(await getMode()));
}

const ACTIONS = new Set(["approve", "skip", "undo_skip", "cancel_cooldown"]);

/** Body: { id, decision: ApprovalDecision }. Mock only — never touches a wallet. */
export async function POST(request: Request) {
  let body: { id?: unknown; decision?: { action?: unknown } };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.decision || !ACTIONS.has(String(body.decision.action))) {
    return Response.json({ error: "Expected { id, decision: { action } }" }, { status: 400 });
  }
  const mode = await getMode();
  const api = getApi();
  const item = (await api.listApprovals(mode)).find((a) => a.id === body.id);
  if (!item) return Response.json({ error: "Not found in this workspace" }, { status: 404 });
  try {
    return Response.json(await api.decideApproval(body.id, body.decision as ApprovalDecision));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
