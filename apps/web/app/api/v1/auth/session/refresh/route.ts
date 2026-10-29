import { cookies } from "next/headers";
import { fail, ok } from "@/lib/bff";
import { WireError } from "@/lib/mock/store";
import { refreshSession, type Session } from "@/lib/mock/session";
import { clearSessionCookies, publicSession, REFRESH_COOKIE, setSessionCookies } from "@/lib/auth/cookies";
import { forward, upstreamAuth } from "@/lib/auth/upstream";

/** POST /v1/auth/session/refresh: reads the httpOnly refresh cookie, rotates it, sets new cookies. No body needed. */
export async function POST(req: Request) {
  const c = await cookies();
  const rt = c.get(REFRESH_COOKIE)?.value;
  let s: Session;
  if (upstreamAuth()) {
    const r = await forward("/session/refresh", { refresh_token: rt ?? "" }, req);
    if (r.status !== 200) {
      clearSessionCookies(c);
      return Response.json(r.json, { status: r.status });
    }
    s = r.json.data as Session;
  } else {
    try {
      s = refreshSession(rt);
    } catch (e) {
      clearSessionCookies(c);
      if (e instanceof WireError) return fail(e.code, e.extra, e.details);
      throw e;
    }
  }
  setSessionCookies(c, s);
  return ok(publicSession(s));
}
