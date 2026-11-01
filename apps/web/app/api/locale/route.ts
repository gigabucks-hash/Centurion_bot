import { LocaleBody } from "@/lib/schemas/wire";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

/** UI language preference (not account data). */
export async function POST(request: Request) {
  const p = LocaleBody.safeParse(await request.json().catch(() => ({})));
  if (!p.success || !isLocale(p.data.locale)) return Response.json({ error: "locale must be en|id" }, { status: 400 });
  const body = p.data;
  (await cookies()).set(LOCALE_COOKIE, body.locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return Response.json({ locale: body.locale });
}
