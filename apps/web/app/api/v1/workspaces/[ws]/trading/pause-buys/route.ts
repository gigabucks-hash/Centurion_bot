import { idempotent, ok, readJson } from "@/lib/bff";
import { expectedRev, guarded } from "@/lib/bff-wrap";
import { pauseBuys, tradingToWire } from "@/lib/mock/trading";

/**
 * MOCK BFF `POST /v1/workspaces/{ws}/trading/pause-buys` ("Stop buying").
 * `If-Match: "<rev>"` + `Idempotency-Key`; 200 `{data: trading_state}` + ETag. Clients then re-GET /trading.
 */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const s = pauseBuys(expectedRev(req, parsed.body));
      return ok(tradingToWire(s), { headers: { ETag: `"${s.rev}"` } });
    }),
  );
}