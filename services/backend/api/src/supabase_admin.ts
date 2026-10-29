// Supabase Auth admin API: create the auth user for a new wallet login (production path).
// The service-role key comes from env only and is never logged or echoed.
import { createHash } from "node:crypto";
import { ApiError } from "./errors.ts";

/** Wallet users have no email; GoTrue admin create wants one, so we use a non-routable, confirmed alias
 *  derived from the address (`.invalid` TLD, RFC 2606): never mailed, never shown. */
export function walletAlias(address: string): string {
  return `w-${createHash("sha256").update(address).digest("hex").slice(0, 32)}@wallet.sentra.invalid`;
}

export async function adminCreateWalletUser(url: string, key: string, address: string, timeoutMs = 5000): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        email: walletAlias(address), email_confirm: true,
        app_metadata: { provider: "siws", providers: ["siws"] }, user_metadata: { wallet: address },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError("UNAVAILABLE", { reason: "auth admin unreachable" });
  }
  const body = (await r.json().catch(() => null)) as { id?: unknown; user?: { id?: unknown } } | null;
  const id = body?.id ?? body?.user?.id;
  if (!r.ok || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new ApiError("UNAVAILABLE", { reason: "auth admin create failed", status: r.status });
  }
  return id.toLowerCase();
}
