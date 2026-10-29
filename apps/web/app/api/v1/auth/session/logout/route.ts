import { cookies } from "next/headers";
import { ok } from "@/lib/bff";
import { logoutSession } from "@/lib/mock/session";
import { clearSessionCookies, REFRESH_COOKIE } from "@/lib/auth/cookies";
import { forward, upstreamAuth } from "@/lib/auth/upstream";

/** POST /v1/auth/session/logout → {revoked: true} always; clears both cookies. */
export async function POST(req: Request) {
  const c = await cookies();
  const rt = c.get(REFRESH_COOKIE)?.value;
  if (upstreamAuth()) await forward("/session/logout", { refresh_token: rt ?? "" }, req).catch(() => null);
  else logoutSession(rt);
  clearSessionCookies(c);
  return ok({ revoked: true });
}
