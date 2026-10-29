import { connection } from "next/server";
import { exitStatToWire } from "@/lib/contracts";
import { gateMode, list } from "@/lib/bff";
import { mockApi } from "@/lib/mock";

/** GET /stats/exit-reasons?mode=&strategy_id=&window= → ExitStatsRow[] {exit_reason, count, pnl_lamports, avg_pnl_pct, win_rate_pct, avg_hold_s}. */
export async function GET(req: Request) {
  await connection();
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const w = q.get("window")?.match(/^(\d+)h$/);
  const rows = await mockApi.getExitStats({ mode, strategyId: q.get("strategy_id") ?? undefined, windowHours: w ? Number(w[1]) : undefined });
  return list(rows.map(exitStatToWire));
}
