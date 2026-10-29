import { cookies } from "next/headers";
import { fail, ok } from "@/lib/bff";
import { accessSession } from "@/lib/mock/session";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { upstreamAuth } from "@/lib/auth/upstream";

/**
 * GET /api/v1/auth/session/current (web BFF only): {address, expires_at} for scheduling the silent refresh.
 * 401 when the access cookie is missing/expired (the client then calls /session/refresh once).
 * Under the refresh cookie path so the browser also sends sentra_rt here (unused).
 */
export async function GET() {
  const at = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (upstreamAuth()) {
    // Real access tokens are JWTs; only exp/wallet are read (no verification needed for scheduling).
    try {
      const claims = JSON.parse(Buffer.from(at!.split(".")[1], "base64url").toString()) as { exp: number; wallet: string; session_id: string };
      return ok({ session_id: claims.session_id, address: claims.wallet, expires_at: new Date(claims.exp * 1000).toISOString() });
    } catch {
      return fail("UNAUTHENTICATED", {}, { reason: "access_missing" });
    }
  }
  const s = accessSession(at);
  return s ? ok(s) : fail("UNAUTHENTICATED", {}, { reason: "access_missing" });
}
