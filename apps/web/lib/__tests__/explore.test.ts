import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedUrl,
  applyExploreQuery,
  BLUE_MIN_AGE_MS,
  collectMints,
  coerceFeed,
  feedFromRaw,
  fetchRaw,
  getJson,
  isBlueChip,
  mintUrl,
  parseGecko,
  parseJupiter,
  safeIcon,
  safeSymbol,
  searchUrl,
  trendingUrl,
  type ExploreRow,
  type Net,
} from "../../../../packages/explore/src/index.ts";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
const SOL = "So11111111111111111111111111111111111111112";
const ICON = "https://static.datapi.jup.ag/token-icons/3ba2b903fe70b8697b8e9db898b7a516b1a0836d498e05f6251535ab9b4b9a28.webp";

function row(partial: Partial<ExploreRow> & Pick<ExploreRow, "mint">): ExploreRow {
  return {
    symbol: "AAA",
    name: "Name",
    icon: null,
    createdAt: NOW - 60_000,
    liquidityUsd: 1_000,
    mcapUsd: 2_000,
    volumeUsd: 100,
    buys: 2,
    sells: 1,
    txns: 3,
    holders: 10,
    changePct: 1,
    mintRenounced: null,
    freezeRenounced: null,
    lpBurned: null,
    top10Pct: null,
    venue: null,
    feedClass: null,
    ...partial,
  };
}

test("token text drops bidi, controls, and invisible characters", () => {
  assert.equal(safeSymbol("PE\u202ETE\u0000"), "PETE");
  assert.equal(safeSymbol("$SOL\u200B"), "SOL");
  assert.equal(safeSymbol("A".repeat(40)).length <= 16, true);
  assert.equal(safeSymbol(12), "");
  assert.equal(safeIcon(ICON), ICON);
  assert.equal(safeIcon("https://gmgn.ai/logo.webp"), null);
  assert.equal(safeIcon("https://static.datapi.jup.ag/token-icons/../evil.webp"), null);
  assert.equal(safeIcon(`${ICON}?x=1`), null);
});

test("jupiter rows keep the window's volume and drop hostile fields", () => {
  const rows = parseJupiter(
    [
      {
        id: MINT,
        name: "Far\u202etcoin<script>",
        symbol: "FART\u0000",
        icon: "https://evil.example/x.webp",
        createdAt: "2024-10-18T06:05:05Z",
        holderCount: 80,
        mcap: 12_000_000,
        liquidity: 400_000,
        launchpad: "pump.fun",
        tags: ["community"],
        audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: false, topHoldersPercentage: 12.5 },
        stats5m: { priceChange: 1.5, buyVolume: 10, sellVolume: 4, numBuys: 3, numSells: 1 },
        firstPool: { id: "Bzc9NZfMqkXR6fz1DBph7BDf9BroyEf6pnzESP7v5iiw", createdAt: "2024-10-18T06:05:05Z" },
      },
      { id: "not a mint", symbol: "NO", name: "No" },
      { id: SOL, symbol: "SOL", name: "Wrapped SOL", mcap: 1, liquidity: 1, stats5m: { priceChange: 9_999_999 } },
    ],
    "5m",
    NOW,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].symbol, "FART");
  assert.equal(rows[0].name, "Fartcoin<script>");
  assert.equal(rows[0].icon, null);
  assert.equal(rows[0].volumeUsd, 14);
  assert.equal(rows[0].txns, 4);
  assert.equal(rows[0].buys, 3);
  assert.equal(rows[0].changePct, 1.5);
  assert.equal(rows[0].mintRenounced, true);
  assert.equal(rows[0].freezeRenounced, false);
  assert.equal(rows[0].lpBurned, null);
  assert.equal(rows[0].top10Pct, 12.5);
  assert.equal(rows[0].holders, 80);
  assert.equal(rows[0].venue, "Pump.fun");
  assert.equal(rows[1].changePct, null);
  assert.equal(parseJupiter([{ id: MINT, symbol: "A", stats1h: { numBuys: 2, numSells: 2, buyVolume: 1, sellVolume: 1 } }], "1m", NOW)[0].volumeUsd, null);
});

test("gecko pools pick the non-quote token and graduated keeps PumpSwap", () => {
  const doc = {
    data: [
      {
        type: "pool",
        attributes: {
          name: "BAD / SOL",
          pool_created_at: "2026-11-14T11:59:00Z",
          reserve_in_usd: "1000",
          fdv_usd: "5000",
          market_cap_usd: null,
          price_change_percentage: { m5: "2.5" },
          volume_usd: { m5: "20" },
          transactions: { m5: { buys: 4, sells: 1 } },
        },
        relationships: {
          dex: { data: { id: "pumpswap", type: "dex" } },
          base_token: { data: { id: "solana_" + MINT, type: "token" } },
          quote_token: { data: { id: "solana_" + SOL, type: "token" } },
        },
      },
      {
        type: "pool",
        attributes: { pool_created_at: "2026-11-14T11:58:00Z", reserve_in_usd: 10, name: "curve" },
        relationships: {
          dex: { data: { id: "pump-fun", type: "dex" } },
          base_token: { data: { id: "solana_CurveMint11111111111111111111111111111111", type: "token" } },
          quote_token: { data: { id: "solana_" + SOL, type: "token" } },
        },
      },
    ],
    included: [
      { id: "solana_" + MINT, type: "token", attributes: { address: MINT, name: "Hi\u202e", symbol: "HI" } },
      { id: "solana_" + SOL, type: "token", attributes: { address: SOL, name: "SOL", symbol: "SOL" } },
      { id: "solana_CurveMint11111111111111111111111111111111", type: "token", attributes: { address: "CurveMint11111111111111111111111111111111", name: "Curve", symbol: "CRV" } },
      { id: "javascript:alert(1)", type: "token", attributes: { address: "javascript:alert(1)", name: "x", symbol: "x" } },
    ],
  };
  const graduated = parseGecko(doc, "5m", true, NOW);
  assert.equal(graduated.length, 1);
  assert.equal(graduated[0].mint, MINT);
  assert.equal(graduated[0].symbol, "HI");
  assert.equal(graduated[0].name, "Hi");
  assert.equal(graduated[0].venue, "PumpSwap");
  assert.equal(graduated[0].volumeUsd, 20);
  assert.equal(graduated[0].txns, 5);
  assert.equal(graduated[0].changePct, 2.5);
  assert.equal(graduated[0].holders, null);
  const fresh = parseGecko(doc, "5m", false, NOW);
  assert.equal(fresh.length, 2);
  assert.deepEqual(collectMints(doc), [MINT, SOL, "CurveMint11111111111111111111111111111111"]);
});

test("blue chip thresholds, filters, and nulls-last sort", () => {
  const old = NOW - BLUE_MIN_AGE_MS - 1_000;
  const meme = row({ mint: MINT, symbol: "FART", name: "Fartcoin", mcapUsd: 20_000_000, liquidityUsd: 500_000, createdAt: old });
  const young = row({ mint: "A".repeat(32).replace(/A/g, "B"), symbol: "NEW", mcapUsd: 20_000_000, liquidityUsd: 500_000, createdAt: NOW - 86_400_000 });
  const sol = row({ mint: SOL, symbol: "SOL", mcapUsd: 50_000_000_000, liquidityUsd: 1_000_000_000, createdAt: old });
  const stock = row({ mint: "C".repeat(32).replace(/C/g, "D"), symbol: "TTWO", mcapUsd: 20_000_000, liquidityUsd: 500_000, createdAt: old, feedClass: "stock" });
  assert.equal(isBlueChip(meme, NOW), true);
  assert.equal(isBlueChip(young, NOW), false);
  assert.equal(isBlueChip(sol, NOW), false);
  assert.equal(isBlueChip(stock, NOW), false);
  const thin = row({ mint: "E".repeat(32).replace(/E/g, "F"), symbol: "LOW", liquidityUsd: 10, mcapUsd: 10, volumeUsd: null });
  const fat = row({ mint: "G".repeat(32).replace(/G/g, "H"), symbol: "HIGH", liquidityUsd: 5_000, mcapUsd: 9_000, volumeUsd: 50, createdAt: NOW - 120_000 });
  const q = { minLiq: 1000, minMcap: 1000, maxAgeMin: 3, sort: "volume" as const, dir: "desc" as const, now: NOW };
  const filtered = applyExploreQuery([thin, fat, meme], q);
  assert.deepEqual(filtered.map((r) => r.symbol), ["HIGH"]);
  const sorted = applyExploreQuery([thin, fat], { minLiq: null, minMcap: null, maxAgeMin: null, sort: "volume", dir: "desc", now: NOW });
  assert.deepEqual(sorted.map((r) => r.symbol), ["HIGH", "LOW"]);
});

test("allowlist is https and those two hosts, with no swap path", () => {
  const ok = trendingUrl("5m");
  assert.ok(ok);
  assert.equal(allowedUrl(ok), true);
  assert.equal(trendingUrl("1m"), null);
  assert.equal(allowedUrl("http://lite-api.jup.ag/tokens/v2/toptraded/5m"), false);
  assert.equal(allowedUrl("https://user:pw@lite-api.jup.ag/tokens/v2/toptraded/5m"), false);
  assert.equal(allowedUrl("https://lite-api.jup.ag.evil.com/tokens/v2/toptraded/5m"), false);
  assert.equal(allowedUrl("https://evil.example/tokens/v2/toptraded/5m"), false);
  assert.equal(allowedUrl("https://lite-api.jup.ag/swap/v1/quote"), false);
  assert.equal(allowedUrl("https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1"), true);
  assert.equal(allowedUrl("https://api.dexscreener.com/latest/dex/search?q=sol"), false);
  assert.equal(mintUrl(`${MINT}&slippageBps=1`), null);
  assert.equal(searchUrl(["not-a-mint"]), null);
  const search = searchUrl([MINT]);
  assert.ok(search);
  assert.match(search, /^https:\/\/lite-api\.jup\.ag\/tokens\/v2\/search\?/);
  assert.doesNotMatch(search, /swap|quote/);
});

test("fetch backs off, refuses other hosts, and does not rank a 1 minute window", async () => {
  let now = 1_000_000;
  let calls = 0;
  const net: Partial<Net> = {
    now: () => now,
    cache: new Map(),
    inflight: new Map(),
    fetch: async () => {
      calls += 1;
      return new Response("{}", { status: 429, headers: { "content-type": "application/json" } });
    },
  };
  const url = trendingUrl("5m")!;
  assert.equal((await getJson(url, net)).kind, "rate");
  now += 1_000;
  await getJson(url, net);
  assert.equal(calls, 1);
  now += 70_000;
  await getJson(url, net);
  assert.equal(calls, 2);
  calls = 0;
  await getJson("https://api.dexscreener.com/latest/dex/search?q=sol", net);
  assert.equal(calls, 0);
  const raw = await fetchRaw("trending", "1m", net);
  assert.equal(raw.unsupported, true);
  assert.equal(calls, 0);
  const bad = await fetchRaw("../swap", "5m", net);
  assert.equal(bad.parts.length, 0);
  assert.equal(calls, 0);
});

test("raw feed sanitizes names and ignores a fake error string", () => {
  const feed = feedFromRaw({
    section: "trending",
    window: "5m",
    fetchedAt: NOW,
    unsupported: false,
    error: "<img src=x onerror=alert(1)>",
    stale: false,
    parts: [{ kind: "jupiter", json: [{ id: MINT, symbol: "Z\u202eZ", name: "Ok", icon: "https://gmgn.ai/a.webp", mcap: 10, liquidity: 10, stats5m: { buyVolume: 3, sellVolume: 1, numBuys: 1, numSells: 0 } }] }],
  });
  assert.equal(feed.error, null);
  assert.equal(feed.rows[0].symbol, "ZZ");
  assert.equal(feed.rows[0].icon, null);
  assert.equal(feed.rows[0].volumeUsd, 4);
  const replay = coerceFeed({ ...feed, rows: [{ ...feed.rows[0], symbol: "QQ\u0007", icon: "https://evil.example/a.png", mint: MINT }] });
  assert.equal(replay.rows[0].symbol, "QQ");
  assert.equal(replay.rows[0].icon, null);
});

test("web CSP can show the Jupiter icon host and cannot connect to market APIs", async () => {
  const { buildCsp } = await import("../security/csp.ts");
  const csp = buildCsp({ nonce: "n", dev: false, https: true });
  const img = csp.split(";").find((d) => d.trim().startsWith("img-src")) ?? "";
  const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";
  assert.match(img, /https:\/\/static\.datapi\.jup\.ag/);
  assert.doesNotMatch(img, /dexscreener|gmgn|geckoterminal|lite-api/);
  assert.doesNotMatch(connect, /jup\.ag|geckoterminal|dexscreener|pump\.fun/);
});
