import { ok } from "@/lib/bff";
import { guarded } from "@/lib/bff-wrap";
import { getTradingState, tradingToWire } from "@/lib/mock/trading";

/** MOCK BFF `GET /v1/workspaces/{ws}/trading`: workspace-wide buy switch + optimistic rev (`ETag`). */
export async function GET() {
  return guarded(() => {
    const s = getTradingState();
    return ok(tradingToWire(s), { headers: { ETag: `"${s.rev}"` } });
  });
}