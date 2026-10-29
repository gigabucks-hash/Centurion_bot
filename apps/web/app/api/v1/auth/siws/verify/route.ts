import { cookies } from "next/headers";
import { fail, ok, readJson } from "@/lib/bff";
import { WireError } from "@/lib/mock/store";
import { siwsVerify } from "@/lib/mock/auth";

/** POST /auth/siws/verify {address, message, signature} → mock session (non-secret marker cookie). */
export async function POST(req: Request) {
  const p = await readJson(req);
  if (p instanceof Response) return p;
  const { address, message, signature } = p.body as Record<string, string>;
  try {
    const r = siwsVerify(address, message, signature);
    await startSession(r.method);
    return ok({ is_new_account: true });
  } catch (e) {
    if (e instanceof WireError) return fail(e.code, e.extra, e.details);
    throw e;
  }
}

async function startSession(method: string) {
  const c = await cookies();
  c.set("sentra_session", `mock:${method}`, { path: "/", httpOnly: true, sameSite: "lax" });
  c.set("sentra_mode", "practice", { path: "/", httpOnly: true, sameSite: "lax" });
}
