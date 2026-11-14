import { cookies } from "next/headers";
import { LOCAL_PAPER_ADDRESS } from "@/lib/auth/allowlist";
import { publicSession, setSessionCookies } from "@/lib/auth/cookies";
import { loopbackRequest } from "@/lib/local/paths";
import { issueSession } from "@/lib/mock/session";
import { LEGACY_MODE_COOKIE } from "@/lib/mode";

/**
 * Paper-only session for this PC. No wallet, no signature, no key.
 * Real stays off until Phantom signs in Settings.
 */
export async function POST(req: Request) {
  if (!loopbackRequest(req)) return Response.json({ error: "not_local" }, { status: 404 });
  const session = issueSession(LOCAL_PAPER_ADDRESS);
  const jar = await cookies();
  setSessionCookies(jar, session);
  if (jar.get(LEGACY_MODE_COOKIE)) jar.delete(LEGACY_MODE_COOKIE);
  return Response.json({ data: publicSession(session) });
}
