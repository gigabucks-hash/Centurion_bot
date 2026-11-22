import { isMint } from "@explore/sanitize";
import { isTimeframe, loadMarketCandles, type CandleQuote } from "@explore/candles";

export const dynamic = "force-dynamic";

/** The browser CSP cannot call GeckoTerminal. This route is the only caller, and it is not an open proxy. */
function sameSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("host") ?? "");
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!sameSite(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const mint = url.searchParams.get("mint") ?? "";
  const tf = url.searchParams.get("tf") ?? "5m";
  const currency = url.searchParams.get("currency") === "sol" ? "sol" : "usd";
  const headers = { "cache-control": "no-store" };
  if (!isMint(mint) || !isTimeframe(tf)) return Response.json({ error: "bad_request" }, { status: 400, headers });
  const chart = await loadMarketCandles(mint, tf, currency as CandleQuote);
  return Response.json(chart, { headers });
}
