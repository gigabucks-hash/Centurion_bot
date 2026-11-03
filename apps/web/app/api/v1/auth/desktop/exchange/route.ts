import { fail, ok, readJson } from "@/lib/bff";
import { WireError } from "@/lib/mock/store";
import { exchangeHandoffCode } from "@/lib/mock/handoff";
import { ExchangeBody } from "@/lib/auth/schemas";
import { upstreamAuth } from "@/lib/auth/upstream";

/**
 * MOCK-ONLY POST /v1/auth/desktop/exchange {code, code_verifier, client:"desktop"} → Session (Desktop's proposal,
 * not in the API contract yet). The desktop app calls Backend directly in production; this mirrors the shape so the
 * hand-off can be exercised end to end against the mock. Tokens only in this JSON response body, never in a URL.
 */
export async function POST(req: Request) {
  if (upstreamAuth()) return fail("NOT_FOUND");
  const p = await readJson(req);
  if (p instanceof Response) return p;
  const b = ExchangeBody.safeParse(p.body);
  if (!b.success) return fail("VALIDATION_FAILED", {}, { fields: b.error.issues.map((i) => i.path.join(".")) });
  try {
    return ok(exchangeHandoffCode(b.data.code, b.data.code_verifier));
  } catch (e) {
    if (e instanceof WireError) return fail(e.code, e.extra, e.details);
    throw e;
  }
}
