import { cookies } from "next/headers";
import { MODE_COOKIE } from "@/lib/mode";

/** Mock workspace switch. Switching TO Real requires the 2.5 s hold to have completed client-side. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { mode?: string; holdMs?: number };
  if (body.mode !== "practice" && body.mode !== "real") return Response.json({ error: "mode must be practice|real" }, { status: 400 });
  if (body.mode === "real" && (body.holdMs ?? 0) < 2500) return Response.json({ error: "Hold-to-confirm 2.5 s required" }, { status: 409 });
  const c = await cookies();
  c.set(MODE_COOKIE, body.mode, { path: "/", sameSite: "lax", httpOnly: true });
  return Response.json({ mode: body.mode });
}
