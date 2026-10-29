import { cookies } from "next/headers";

/**
 * MOCK auth. Sets a non-secret marker cookie so the UI can show "signed in".
 * No credentials, codes, emails or signatures are stored or forwarded.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { method?: string };
  const allowed = ["google", "apple", "telegram", "email_otp", "wallet_siws"];
  if (!body.method || !allowed.includes(body.method)) return Response.json({ error: "Unknown method" }, { status: 400 });
  const c = await cookies();
  c.set("sentra_session", `mock:${body.method}`, { path: "/", httpOnly: true, sameSite: "lax" });
  c.set("sentra_mode", "practice", { path: "/", httpOnly: true, sameSite: "lax" });
  return Response.json({ ok: true, isNewAccount: true });
}

export async function DELETE() {
  const c = await cookies();
  c.delete("sentra_session");
  return Response.json({ ok: true });
}
