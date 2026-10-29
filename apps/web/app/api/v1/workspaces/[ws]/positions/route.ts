import { connection } from "next/server";
import { positionToWire } from "@/lib/contracts";
import { gateMode, list } from "@/lib/bff";
import { listOpenPositions } from "@/lib/mock/store";

/** GET /positions?mode=&state=open&strategy_id= → PositionWire (1.1.2: rev, practice_epoch, decimals, token_program) + mock display extras. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/positions">) {
  await connection();
  const { ws } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const sid = q.get("strategy_id");
  return list(listOpenPositions(mode).filter((p) => !sid || p.strategyId === sid).map((p) => positionToWire(p, ws)));
}
