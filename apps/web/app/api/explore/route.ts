import { isMint } from "@explore/sanitize";
import { isSection, isWindow } from "@explore/types";
import { loadExplore, loadMint } from "@explore/load";

export const dynamic = "force-dynamic";

/**
 * Read-only discovery. The browser CSP cannot call the market hosts, so this route does.
 * It never places an order. A cross-site page cannot use it as an open proxy.
 */
function sameSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("host") ?? "")
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!sameSite(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const headers = { "cache-control": "no-store" };
  const mint = url.searchParams.get("mint");
  if (mint != null) {
    if (!isMint(mint)) return Response.json({ error: "bad_request" }, { status: 400, headers });
    return Response.json(await loadMint(mint), { headers });
  }
  const section = url.searchParams.get("section") ?? "trending";
  const window = url.searchParams.get("window") ?? "5m";
  if (!isSection(section) || !isWindow(window)) return Response.json({ error: "bad_request" }, { status: 400, headers });
  return Response.json(await loadExplore(section, window), { headers });
}
