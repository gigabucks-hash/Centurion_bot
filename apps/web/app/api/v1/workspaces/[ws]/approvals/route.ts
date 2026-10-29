import { connection } from "next/server";
import { approvalToWire } from "@/lib/contracts";
import { gateMode, list } from "@/lib/bff";
import { listApprovals } from "@/lib/mock/store";

/** GET /approvals?mode=&status=pending|approved|rejected|expired&kind= — pending sorted by expires_at. */
export async function GET(req: Request) {
  await connection();
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const status = q.get("status");
  const kind = q.get("kind");
  const items = listApprovals(mode)
    .map((a) => approvalToWire(a))
    .filter((a) => (!status || a.status === status) && (!kind || a.kind === kind))
    .sort((a, b) => (a.status === "pending" && b.status === "pending" ? Date.parse(a.expires_at) - Date.parse(b.expires_at) : 0));
  return list(items);
}
