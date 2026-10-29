import { cookies } from "next/headers";
import { fail, ok, readJson } from "@/lib/bff";
import { WireError } from "@/lib/mock/store";
import { otpVerify } from "@/lib/mock/auth";

/** POST /auth/email/otp/verify {email, code} → session | OTP_INVALID {attempts_left} | 429 OTP_LOCKED {retry_after_s}. */
export async function POST(req: Request) {
  const p = await readJson(req);
  if (p instanceof Response) return p;
  const { email, code } = p.body as Record<string, string>;
  try {
    const r = otpVerify(String(email ?? ""), String(code ?? ""));
    const c = await cookies();
    c.set("sentra_session", `mock:${r.method}`, { path: "/", httpOnly: true, sameSite: "lax" });
    c.set("sentra_mode", "practice", { path: "/", httpOnly: true, sameSite: "lax" });
    return ok({ is_new_account: true });
  } catch (e) {
    if (e instanceof WireError) return fail(e.code, e.extra, e.details);
    throw e;
  }
}
