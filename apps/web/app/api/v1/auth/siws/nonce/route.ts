import { fail, ok, readJson } from "@/lib/bff";
import { siwsNonce } from "@/lib/mock/auth";
import { isAllowedWallet } from "@/lib/auth/allowlist";
import { NonceBody } from "@/lib/auth/schemas";
import { forward, upstreamAuth } from "@/lib/auth/upstream";

/** POST /v1/auth/siws/nonce {address, domain, uri?, chain_id?} → {nonce, message, issued_at, expires_at}. */
export async function POST(req: Request) {
  const p = await readJson(req);
  if (p instanceof Response) return p;
  const b = NonceBody.safeParse(p.body);
  if (!b.success) return fail("VALIDATION_FAILED", {}, { fields: b.error.issues.map((i) => i.path.join(".")) });
  if (upstreamAuth()) {
    const r = await forward("/siws/nonce", b.data, req);
    return Response.json(r.json, { status: r.status });
  }
  // OWNER_WALLETS: Backend refuses a non-owner already at the nonce step.
  if (!isAllowedWallet(b.data.address)) return fail("FORBIDDEN_ROLE", {}, { reason: "wallet_not_allowed" });
  return ok(siwsNonce(b.data.address, b.data.domain, b.data.uri ?? `https://${b.data.domain}`));
}
