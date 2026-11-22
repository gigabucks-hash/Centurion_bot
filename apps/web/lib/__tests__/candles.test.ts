import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedUrl } from "../../../../packages/explore/src/hosts.ts";
import {
  formatPrice,
  visibleRange,
  attributionUrl,
  cachedPool,
  clearPoolCache,
  loadMarketCandles,
  ohlcvUrl,
  parseOhlcv,
  pickPool,
  poolsUrl,
  rememberPool,
  solSide,
  WSOL,
  type PoolPick,
} from "../../../../packages/explore/src/candles.ts";
import type { Net } from "../../../../packages/explore/src/load.ts";

const MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
const POOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const NOW = Date.parse("2026-11-22T00:00:00Z");

function poolsBody() {
  return {
    data: [
      poolRow(POOL, MINT, WSOL, "1000", "50"),
      poolRow("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", MINT, WSOL, "9000", "10"),
      poolRow("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", WSOL, "99999", "99999"),
    ],
  };
}

function poolRow(address: string, base: string, quote: string, reserve: string, vol: string) {
  return {
    attributes: { address, reserve_in_usd: reserve, volume_usd: { h24: vol } },
    relationships: {
      base_token: { data: { id: `solana_${base}` } },
      quote_token: { data: { id: `solana_${quote}` } },
    },
  };
}

function barsBody() {
  return { data: { attributes: { ohlcv_list: [[200, 2, 3, 1, 2.5, 10], [100, 1, 2, 0.5, 1.5, 4], [100, 9, 9, 9, 9, 1], ["nope", 1, 1, 1, 1, 1]] } } };
}

function net(handler: (url: string) => { status: number; json: unknown }): { calls: string[]; partial: Partial<Net> } {
  const calls: string[] = [];
  const partial: Partial<Net> = {
    now: () => NOW,
    cache: new Map(),
    inflight: new Map(),
    fetch: async (url: string | URL | Request) => {
      calls.push(String(url));
      const hit = handler(String(url));
      return new Response(JSON.stringify(hit.json), { status: hit.status, headers: { "content-type": "application/json" } });
    },
  };
  return { calls, partial };
}

test("pool and candle URLs stay on the public GeckoTerminal paths", () => {
  const pools = poolsUrl(MINT)!;
  const bars = ohlcvUrl(POOL, "15m", "usd", "base")!;
  const sol = ohlcvUrl(POOL, "1m", "sol", "base")!;
  assert.equal(allowedUrl(pools), true);
  assert.equal(allowedUrl(bars), true);
  assert.match(bars, /\/ohlcv\/minute\?aggregate=15/);
  assert.match(sol, /currency=token/);
  assert.equal(allowedUrl("https://api.geckoterminal.com/api/v2/networks/solana/pools"), false);
  assert.equal(allowedUrl(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${POOL}/ohlcv/minute/../day`), false);
  assert.equal(poolsUrl("not a mint"), null);
  assert.equal(attributionUrl(POOL), `https://www.geckoterminal.com/solana/pools/${POOL}`);
});

test("the deepest pool for this mint wins, and SOL quote only when the other side is SOL", () => {
  const pool = pickPool(poolsBody(), MINT)!;
  assert.equal(pool.address, "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");
  assert.equal(solSide(pool, MINT), "base");
  const inverted: PoolPick = { ...pool, base: WSOL, quote: MINT };
  assert.equal(solSide(inverted, MINT), "quote");
  assert.equal(solSide({ ...pool, quote: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, MINT), null);
  const candles = parseOhlcv(barsBody());
  assert.deepEqual(candles.map((c) => c.time), [100, 200]);
  assert.equal(candles[0].close, 1.5);
  assert.equal(formatPrice(211.89891591), "211.90");
  assert.equal(formatPrice(0.000005123), "0.0₅5123");
  assert.equal(formatPrice(0.045).startsWith("0.045"), true);
  assert.equal(visibleRange(300, 960).from, 180);
  assert.equal(visibleRange(300, 400).from, 300 - 50);
});

test("a cached pool is not fetched again, a 429 backs off, and a miss is an empty chart", async () => {
  clearPoolCache();
  const ok = net((url) => ({ status: 200, json: url.includes("/pools?") ? poolsBody() : barsBody() }));
  const first = await loadMarketCandles(MINT, "5m", "usd", ok.partial);
  assert.equal(first.ok, true);
  assert.equal(first.currency, "usd");
  assert.equal(ok.calls.length, 2);
  const again = await loadMarketCandles(MINT, "5m", "sol", ok.partial);
  assert.equal(again.currency, "sol");
  assert.equal(ok.calls.length, 3, "pool address is reused");
  assert.equal(cachedPool(MINT, NOW)?.address, first.pool);

  clearPoolCache();
  const limited = net(() => ({ status: 429, json: null }));
  const missed = await loadMarketCandles(MINT, "1h", "usd", limited.partial);
  assert.equal(missed.ok, false);
  assert.equal(missed.reason, "rate");
  const during = await loadMarketCandles(MINT, "1h", "usd", limited.partial);
  assert.equal(limited.calls.length, 1, "backoff skips the network");
  assert.equal(during.ok, false);

  clearPoolCache();
  rememberPool(MINT, { address: POOL, base: MINT, quote: WSOL, pair: "MINT / SOL", reserveUsd: 1, volumeUsd: 1 }, NOW);
  const emptyBars = net(() => ({ status: 200, json: { data: { attributes: { ohlcv_list: [] } } } }));
  const fallback = await loadMarketCandles(MINT, "1d", "usd", emptyBars.partial);
  assert.equal(fallback.ok, false);
  assert.equal(fallback.reason, "unavailable");
  assert.equal(fallback.pool, POOL);
  assert.equal(emptyBars.calls.length, 1);
});
