import { connection } from "next/server";
import { pageEvents } from "@/lib/contracts";
import { fail, gateMode, now } from "@/lib/bff";
import { parseSeq } from "@/lib/seq";
import { workspaceEnvelopes } from "@/lib/mock/events";

/** GET /events?mode=&after_seq=&before_seq=&limit=&strategy_id=&ck= → EventPage (seq cursors, safe_seq, gaps allowed). */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/events">) {
  await connection();
  const { ws } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const num = (k: string) => (q.get(k) != null && q.get(k) !== "" ? Number(q.get(k)) : undefined);
  // seq cursors are int64 strings (1.1.2): parsed as strings, compared with BigInt, never Number().
  for (const k of ["after_seq", "before_seq"]) if (q.get(k) && !parseSeq(q.get(k))) return fail("VALIDATION_FAILED", {}, { field: k });
  const sid = q.get("strategy_id");
  const ck = q.get("ck");
  const all = workspaceEnvelopes(ws, mode).filter((e) => (!sid || e.strategy_id === sid) && (!ck || e.ck === ck));
  return Response.json(pageEvents(all, { after_seq: parseSeq(q.get("after_seq")), before_seq: parseSeq(q.get("before_seq")), limit: num("limit") }, now()));
}
