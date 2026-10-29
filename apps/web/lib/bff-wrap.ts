import { fail } from "./bff";
import { WireError } from "./mock/store";

/** Maps mock WireErrors to the contract error envelope. */
export async function guarded(run: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof WireError) return fail(e.code, e.extra, e.details);
    throw e;
  }
}

/** `If-Match: "<rev>"` header or `expected_rev` body field (API_ENDPOINTS.md §2.1). */
export function expectedRev(req: Request, body: Record<string, unknown>): number | null {
  const h = req.headers.get("if-match");
  if (h) {
    const n = Number(h.replace(/^W\//, "").replace(/"/g, ""));
    return Number.isInteger(n) ? n : null;
  }
  return typeof body.expected_rev === "number" ? body.expected_rev : null;
}
