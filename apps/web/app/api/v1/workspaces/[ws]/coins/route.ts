import { connection } from "next/server";
import { coinToWire } from "@/lib/contracts";
import { gateMode, list } from "@/lib/bff";
import { coinSummaries, trails } from "@/lib/mock/data";

/** GET /coins?mode=&strategy_id= → coins with decimals, token_program, quote_mint, tradeable, skip_reason (1.1.2). */
export async function GET(req: Request) {
  await connection();
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const sid = q.get("strategy_id");
  const items = coinSummaries
    .filter((s) => s.mode === mode && (!sid || s.strategyId === sid))
    .map((s) => coinToWire(trails.find((t) => t.coin.mint === s.mint)!.coin, s));
  return list(items);
}
