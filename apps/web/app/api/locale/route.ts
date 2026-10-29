import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

/** UI language preference (not account data). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  if (!isLocale(body.locale)) return Response.json({ error: "locale must be en|id" }, { status: 400 });
  (await cookies()).set(LOCALE_COOKIE, body.locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return Response.json({ locale: body.locale });
}
