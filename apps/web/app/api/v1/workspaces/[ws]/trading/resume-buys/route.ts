import { idempotent, ok, readJson } from "@/lib/bff";
import { expectedRev, guarded } from "@/lib/bff-wrap";
import { resumeBuys, tradingToWire } from "@/lib/mock/trading";

/**
 * MOCK BFF `POST /v1/workspaces/{ws}/trading/resume-buys` ("Resume buying").
 * Same optimistic `If-Match` + `Idempotency-Key` contract as pause; 403 RESUME_REQUIRES_APP is the real backend's call.
 */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const s = resumeBuys(expectedRev(req, parsed.body));
      return ok(tradingToWire(s), { headers: { ETag: `"${s.rev}"` } });
    }),
  );
}