import { fail, ok, readJson } from "@/lib/bff";
import { siwsNonce } from "@/lib/mock/auth";

/** POST /auth/siws/nonce {address, domain, uri, chain_id} → {nonce, message, issued_at, expires_at} (mock). */
export async function POST(req: Request) {
  const p = await readJson(req);
  if (p instanceof Response) return p;
  const { address, domain, uri } = p.body as Record<string, string>;
  if (!address || !domain || !uri) return fail("VALIDATION_FAILED", {}, { expected: "{address, domain, uri, chain_id}" });
  return ok(siwsNonce(address, domain, uri));
}
