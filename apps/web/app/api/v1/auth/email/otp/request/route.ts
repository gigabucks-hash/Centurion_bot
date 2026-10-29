import { readJson } from "@/lib/bff";
import { otpRequest } from "@/lib/mock/auth";

/** POST /auth/email/otp/request {email} → always 202 {sent: true, resend_after_s: 60} (no account enumeration). */
export async function POST(req: Request) {
  const p = await readJson(req);
  if (p instanceof Response) return p;
  const email = String((p.body as { email?: unknown }).email ?? "");
  if (email) otpRequest(email);
  return Response.json({ data: { sent: true, resend_after_s: 60 }, server_now: new Date().toISOString() }, { status: 202 });
}
