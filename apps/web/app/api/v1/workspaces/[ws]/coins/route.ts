import { connection } from "next/server";
import { coinToWire } from "@/lib/contracts";
import { fail, gateMode, list } from "@/lib/bff";
import { CursorInvalid, paginate, parseLimit } from "@/lib/paging";
import { coinSummaries, trails } from "@/lib/mock/data";

/**
 * GET /coins?mode=&strategy_id=&cursor=&limit= → coins with decimals, token_program, quote_mint, tradeable, skip_reason
 * (1.1.2) + market_cap_lamports / mcap_usd / mcap_as_of (1.1.4); keyset paged by last pick (newest first), 400 CURSOR_INVALID.
 */
export async function GET(req: Request) {
  await connection();
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const sid = q.get("strategy_id");
  const rows = coinSummaries.filter((s) => s.mode === mode && (!sid || s.strategyId === sid));
  try {
    const page = paginate(rows, `coins:${mode}:${sid ?? ""}`, (s) => ({ t: s.lastEventAt, id: `${s.mint}:${s.strategyId}` }), { cursor: q.get("cursor"), limit: parseLimit(q.get("limit")) });
    return list(page.items.map((s) => coinToWire(trails.find((t) => t.coin.mint === s.mint)!.coin, s)), { next_cursor: page.next_cursor });
  } catch (e) {
    if (e instanceof CursorInvalid) return fail("CURSOR_INVALID");
    throw e;
  }
}
