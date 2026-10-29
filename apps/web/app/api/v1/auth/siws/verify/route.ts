import { cookies } from "next/headers";
import { fail, ok, readJson } from "@/lib/bff";
import { WireError } from "@/lib/mock/store";
import { siwsVerify } from "@/lib/mock/auth";
import { issueSession, type Session } from "@/lib/mock/session";
import { isAllowedWallet } from "@/lib/auth/allowlist";
import { VerifyBody } from "@/lib/auth/schemas";
import { publicSession, setSessionCookies } from "@/lib/auth/cookies";
import { MODE_COOKIE } from "@/lib/mode";
import { forward, upstreamAuth } from "@/lib/auth/upstream";

/**
 * POST /v1/auth/siws/verify {address, message, signature} → Session. The tokens go into httpOnly cookies here and
 * are stripped from the body, so browser JS only sees {session_id, address, expires_at}.
 */
export async function POST(req: Request) {
  const p = await readJson(req);
  if (p instanceof Response) return p;
  const b = VerifyBody.safeParse(p.body);
  if (!b.success) return fail("VALIDATION_FAILED", {}, { fields: b.error.issues.map((i) => i.path.join(".")) });
  let s: Session;
  if (upstreamAuth()) {
    const r = await forward("/siws/verify", { ...b.data, client: "web" }, req);
    if (r.status !== 200) return Response.json(r.json, { status: r.status });
    s = r.json.data as Session;
  } else {
    try {
      siwsVerify(b.data.address, b.data.message, b.data.signature);
      if (!isAllowedWallet(b.data.address)) return fail("FORBIDDEN_ROLE", {}, { reason: "wallet_not_allowed" });
      s = issueSession(b.data.address);
    } catch (e) {
      if (e instanceof WireError) return fail(e.code, e.extra, e.details);
      throw e;
    }
  }
  const c = await cookies();
  setSessionCookies(c, s);
  if (!c.get(MODE_COOKIE)) c.set(MODE_COOKIE, "practice", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.SENTRA_INSECURE_COOKIES !== "1" });
  return ok(publicSession(s));
}
