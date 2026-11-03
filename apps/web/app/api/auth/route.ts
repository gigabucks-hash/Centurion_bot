import { anyLegacyMethod } from "@/lib/auth/flags";
import { cookies } from "next/headers";

/**
 * MOCK auth. Sets a non-secret marker cookie so the UI can show "signed in".
 * No credentials, codes, emails or signatures are stored or forwarded.
 */
export async function POST(request: Request) {
  // Wallet-only MVP: the IdP mock is reachable only when a legacy method flag is on (Backend answers 404 too).
  if (!anyLegacyMethod()) return new Response(null, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { method?: string };
  const allowed = ["google", "apple", "telegram", "email_otp", "wallet_siws"];
  if (!body.method || !allowed.includes(body.method)) return Response.json({ error: "Unknown method" }, { status: 400 });
  const c = await cookies();
  c.set("centurion_session", `mock:${body.method}`, { path: "/", httpOnly: true, sameSite: "lax" });
  c.set("centurion_mode", "practice", { path: "/", httpOnly: true, sameSite: "lax" });
  return Response.json({ ok: true, isNewAccount: true });
}

export async function DELETE() {
  if (!anyLegacyMethod()) return new Response(null, { status: 404 });
  const c = await cookies();
  c.delete("centurion_session");
  return Response.json({ ok: true });
}
