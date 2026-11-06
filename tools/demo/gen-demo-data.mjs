#!/usr/bin/env node
/**
 * Deterministic demo dataset generator for QA and screenshots (Centurion, paper only).
 *
 *   node tools/demo/gen-demo-data.mjs            # write tools/demo/demo-data.json
 *   node tools/demo/gen-demo-data.mjs --stdout   # print, do not write
 *   node tools/demo/gen-demo-data.mjs --check    # fail if the committed file drifted
 *   node tools/demo/gen-demo-data.mjs --validate # invariants only, no write
 *
 * Every number is synthetic. No wall clock, no locale, no crypto randomness: the same
 * seed + anchor always produce byte-identical JSON. See docs/qa/demo-data.md.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(HERE, "demo-data.json");

/** Dataset "now": 2026-11-06 00:00:00 WIB (UTC+7). Fixed so screenshots never drift. */
const ANCHOR_ISO = "2026-11-05T17:00:00.000Z";
const ANCHOR = Date.parse(ANCHOR_ISO);
const DEFAULT_SEED = 1337;
const DATASET = "centurion-demo-v1";
const SCHEMA_VERSION = "1.1";

const HOUR = 3_600_000;
const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_USD = 200;
const FEE_BPS = 125; // 1.25 % of sol_in, same convention as the web mock
const WORKSPACE_ID = "9f1d3c2a-7b64-4e58-8a10-0d5c6b7e8f90";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// ---------------------------------------------------------------------------
// deterministic primitives
// ---------------------------------------------------------------------------

/** FNV-1a 32 bit, hex. Stable across Node versions and platforms. */
function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuidFrom(label, seed) {
  const hex = (salt) => fnv1a32(`${seed}:${label}:${salt}`).toString(16).padStart(8, "0");
  const raw = `${hex("a")}${hex("b")}${hex("c")}${hex("d")}`;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

/** Synthetic mints start with "demo" so nobody mistakes them for a live token account. */
function mintFrom(label, seed) {
  const rnd = mulberry32(fnv1a32(`${seed}:mint:${label}`));
  let out = "demo";
  while (out.length < 44) out += BASE58[Math.floor(rnd() * BASE58.length)];
  return out;
}

function logoHashFrom(mint, seed) {
  const h = fnv1a32(`${seed}:logo:${mint}`);
  if (h % 4 === 3) return null;
  return `m${h.toString(36)}${fnv1a32(`${seed}:salt:${mint}`).toString(36)}`;
}

function logoUrlFrom(mint, hash) {
  return hash ? `/v1/img/coin/${mint}?s=96&v=${hash}` : null;
}

function dec(value, digits = 15) {
  let s = value.toFixed(digits);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

const iso = (ms) => new Date(ms).toISOString();
const round2 = (n) => Math.round(n * 100) / 100;
const pctOf = (pnl, solIn) => (solIn > 0 ? round2((pnl * 100) / solIn) : null);
const feeOf = (solIn) => Math.round((solIn * FEE_BPS) / 10_000);

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const STRATEGIES = [
  { key: "dip", name: "Dip Sniper", label: "curve dip entries" },
  { key: "grad", name: "Grad Runner", label: "AMM graduation momentum" },
  { key: "ladder", name: "Fast Ladder", label: "three-step take-profit ladder" },
];

/**
 * Strategy lifecycle for D5 (pause/resume). `status` is the current wire status
 * (`draft | running | paused | archived`); `events` are the pause/resume envelopes that
 * produced it, oldest first. `atH` is hours before the anchor. One strategy is paused now,
 * one was paused and resumed (running with both events), one was never paused.
 */
const STRATEGY_LIFECYCLE = [
  {
    key: "dip",
    status: "paused",
    rev: 4,
    events: [{ type: "strategy.paused", atH: 2, baseRev: 3, rev: 4, status: "paused" }],
  },
  {
    key: "grad",
    status: "running",
    rev: 5,
    events: [
      { type: "strategy.paused", atH: 8, baseRev: 3, rev: 4, status: "paused" },
      { type: "strategy.resumed", atH: 7, baseRev: 4, rev: 5, status: "running" },
    ],
  },
  { key: "ladder", status: "running", rev: 2, events: [] },
];

/** The coin whose `/coins/[mint]` trail is complete: buy -> partial take-profit -> sell. */
const TRAIL_COIN = "ORBIT";
/** The coin whose trail stops at the screener with tradeable=false (no invented buy/sell). */
const BLOCKED_TRAIL_COIN = "FLUX";

const COINS = [
  { symbol: "ORBIT", venue: "curve", launchpad: "pumpfun", decimals: 6 },
  { symbol: "MOCHI", venue: "amm", launchpad: "raydium", decimals: 6 },
  { symbol: "KELP", venue: "curve", launchpad: "pumpfun", decimals: 9 },
  { symbol: "ZAPP", venue: "curve", launchpad: "pumpfun", decimals: 6 },
  { symbol: "BREW", venue: "amm", launchpad: "raydium", decimals: 6 },
  { symbol: "PIXL", venue: "curve", launchpad: "pumpfun", decimals: 9 },
  { symbol: "NOVA", venue: "amm", launchpad: "raydium", decimals: 6 },
  { symbol: "TIDE", venue: "curve", launchpad: "pumpfun", decimals: 6 },
  { symbol: "LUMA", venue: "amm", launchpad: "orca", decimals: 9 },
  { symbol: "DUSK", venue: "curve", launchpad: "pumpfun", decimals: 6 },
  { symbol: "WISP", venue: "curve", launchpad: "pumpfun", decimals: 6 },
  { symbol: "FLUX", venue: "amm", launchpad: "raydium", decimals: 6 },
];

/**
 * Closed trades, newest first. `legs` are [shareBps, gainPct] and must sum to 10000;
 * a leg after the first one means the position took a partial take-profit before the
 * final exit (total pnl is the exact sum of the legs).
 * `atH` = hours before the anchor the position closed, `holdH` = hours it was held.
 */
const CLOSED_PROFILES = [
  { atH: 5, holdH: 9, strat: 0, coin: 0, solIn: 2_500_000_000, exit: "profit_target", legs: [[4000, 24], [6000, -2]] },
  { atH: 11, holdH: 6, strat: 1, coin: 1, solIn: 1_800_000_000, exit: "loss_guard", legs: [[10000, -14.2]] },
  { atH: 19, holdH: 13, strat: 2, coin: 2, solIn: 3_200_000_000, exit: "peak_trail", legs: [[5000, 45], [5000, 18]] },
  { atH: 27, holdH: 4, strat: 0, coin: 3, solIn: 1_200_000_000, exit: "profit_target", legs: [[10000, 6.2]] },
  { atH: 34, holdH: 26, strat: 1, coin: 4, solIn: 4_000_000_000, exit: "max_hold", legs: [[10000, -9.8]] },
  { atH: 46, holdH: 17, strat: 2, coin: 5, solIn: 2_000_000_000, exit: "profit_target", legs: [[3000, 40], [7000, 8.4]] },
  { atH: 58, holdH: 8, strat: 0, coin: 6, solIn: 1_500_000_000, exit: "sell_floor", legs: [[10000, -22.6]] },
  { atH: 70, holdH: 31, strat: 1, coin: 7, solIn: 2_800_000_000, exit: "peak_trail", legs: [[10000, 12.4]] },
  { atH: 83, holdH: 5, strat: 2, coin: 8, solIn: 900_000_000, exit: "profit_target", legs: [[10000, 4.1]] },
  { atH: 96, holdH: 22, strat: 0, coin: 9, solIn: 3_600_000_000, exit: "profit_target", legs: [[5000, 62], [5000, 27.6]] },
  { atH: 108, holdH: 11, strat: 1, coin: 0, solIn: 2_200_000_000, exit: "idle", legs: [[10000, -6.3]] },
  { atH: 121, holdH: 9, strat: 2, coin: 1, solIn: 1_700_000_000, exit: "peak_trail", legs: [[10000, 9.9]] },
  { atH: 134, holdH: 28, strat: 0, coin: 2, solIn: 5_000_000_000, exit: "profit_target", legs: [[10000, 21.6]] },
  { atH: 146, holdH: 3, strat: 1, coin: 3, solIn: 1_100_000_000, exit: "rug_detected", legs: [[10000, -31.4]] },
  { atH: 158, holdH: 14, strat: 2, coin: 4, solIn: 2_400_000_000, exit: "profit_target", legs: [[4000, 38], [6000, 0]] },
  { atH: 170, holdH: 19, strat: 0, coin: 5, solIn: 3_000_000_000, exit: "loss_guard", legs: [[10000, -11.7]] },
  { atH: 182, holdH: 25, strat: 1, coin: 6, solIn: 2_600_000_000, exit: "max_hold", legs: [[10000, 7.3]] },
  { atH: 195, holdH: 16, strat: 2, coin: 7, solIn: 1_400_000_000, exit: "peak_trail", legs: [[10000, 26.9]] },
  { atH: 208, holdH: 7, strat: 0, coin: 8, solIn: 2_100_000_000, exit: "idle", legs: [[10000, -4.2]] },
  { atH: 240, holdH: 33, strat: 1, coin: 9, solIn: 3_300_000_000, exit: "profit_target", legs: [[10000, 18.1]] },
  // 240 h .. 312 h stays empty on purpose: a 3-day gap for the "empty range" scenario.
  { atH: 312, holdH: 12, strat: 2, coin: 0, solIn: 1_900_000_000, exit: "profit_target", legs: [[10000, 11.3]] },
  { atH: 360, holdH: 21, strat: 0, coin: 1, solIn: 2_700_000_000, exit: "sell_floor", legs: [[10000, -17.5]] },
  { atH: 480, holdH: 40, strat: 1, coin: 2, solIn: 4_200_000_000, exit: "peak_trail", legs: [[5000, 52], [5000, 25.2]] },
  { atH: 660, holdH: 18, strat: 2, coin: 3, solIn: 1_600_000_000, exit: "manual", legs: [[10000, 5.7]] },
  { atH: 696, holdH: 30, strat: 0, coin: 4, solIn: 2_900_000_000, exit: "stall", legs: [[10000, -8.9]] },
];

/**
 * Open positions. `soldBps` > 0 means a partial take-profit already happened, so the
 * workspace realized number includes it while the open row itself stays unrealized.
 */
const OPEN_PROFILES = [
  { key: "o01", openedH: 45, strat: 1, coin: 1, solIn: 3_000_000_000, soldBps: 4000, soldGainPct: 30, remGainPct: 12.5, stop: 18, trail: 12 },
  { key: "o02", openedH: 20, strat: 0, coin: 2, solIn: 1_400_000_000, soldBps: 0, remGainPct: -6.8, stop: 20, trail: 15 },
  { key: "o03", openedH: 11, strat: 2, coin: 4, solIn: 2_200_000_000, soldBps: 0, remGainPct: 0, stop: 25, trail: 10 },
  { key: "o04", openedH: 6, strat: 1, coin: 5, solIn: 900_000_000, soldBps: 0, remGainPct: 41.2, stop: 22, trail: 18 },
  { key: "o05", openedH: 2.5, strat: 0, coin: 8, solIn: 5_500_000_000, soldBps: 0, remGainPct: -18.7, stop: 15, trail: 9 },
];

// ---------------------------------------------------------------------------
// discovery /markets (docs/design/receipt-and-discovery.md, part B)
// ---------------------------------------------------------------------------

/** Mints that exist only in the market feed: never screened, so guard is "not evaluated". */
const MARKET_ONLY = [
  { symbol: "GRAIN", launchpad: "pumpfun" },
  { symbol: "SPORE", launchpad: "pumpfun" },
  { symbol: "MOSSY", launchpad: "raydium" },
  { symbol: "PULSE", launchpad: "pumpfun" },
  { symbol: "CRATE", launchpad: "raydium" },
  { symbol: "EMBER", launchpad: "pumpfun" },
  { symbol: "VAPOR", launchpad: "pumpfun" },
  { symbol: "SABLE", launchpad: "raydium" },
];

const TRENDING_WEIGHTS_VERSION = "markets-rank-v1";
const TRENDING_WEIGHTS = { mcap_growth: 0.5, activity: 0.3, migration: 0.2 };

/**
 * One market state per mint; the three tabs are views over this table, so a mint keeps
 * the same mcap/logo/guard everywhere it appears.
 * `seenH` / `migratedH` = hours before the anchor. `rank: true` puts the mint in Trending;
 * its rank inputs are always the row's own growth/activity/migration, never a hand-written score.
 */
const MARKET_ROWS = [
  { symbol: "SPORE", seenH: 0.0125, migratedH: null, mcapUsd: 58_000, growth: 88.5, change: { m5: 8.2, h1: 34.5, h24: null }, sinceMigration: null, activity: 9, guard: ["PASS", 71], tradeable: true, rank: true },
  { symbol: "ORBIT", seenH: 0.07, migratedH: null, mcapUsd: 412_000, growth: 118, change: { m5: 3.1, h1: 18.2, h24: 44.8 }, sinceMigration: null, activity: 12, guard: ["PASS", 84], tradeable: true, rank: true },
  { symbol: "GRAIN", seenH: 0.6, migratedH: 0.5, mcapUsd: 96_000, growth: 205, change: { m5: 6.4, h1: 41, h24: null }, sinceMigration: 41, activity: 7, guard: ["PASS", 66], tradeable: true, rank: true },
  { symbol: "KELP", seenH: 0.15, migratedH: null, mcapUsd: 133_000, growth: 64, change: { m5: 1.2, h1: 9.4, h24: 21.7 }, sinceMigration: null, activity: 5, guard: ["PASS", 77], tradeable: true, rank: true },
  { symbol: "PULSE", seenH: 0.22, migratedH: null, mcapUsd: 27_500, growth: -12, change: { m5: -2.4, h1: -3.6, h24: null }, sinceMigration: null, activity: 3, guard: ["PASS", 58], tradeable: true, rank: true },
  { symbol: "WISP", seenH: 0.45, migratedH: null, mcapUsd: 31_000, growth: 2, change: { m5: 0.4, h1: 2, h24: null }, sinceMigration: null, activity: 2, guard: ["PASS", 55], tradeable: true },
  { symbol: "VAPOR", seenH: 0.8, migratedH: null, mcapUsd: null, growth: null, change: { m5: null, h1: null, h24: null }, sinceMigration: null, activity: 1, guard: null, tradeable: true },
  { symbol: "MOCHI", seenH: 0.9, migratedH: 40, mcapUsd: 780_000, growth: 96, change: { m5: 0.8, h1: 12.1, h24: 33.4 }, sinceMigration: null, activity: 21, guard: ["PASS", 88], tradeable: true, staleSeconds: 95, rank: true },
  { symbol: "EMBER", seenH: 1.4, migratedH: null, mcapUsd: 64_000, growth: 27.7, change: { m5: -0.6, h1: 27.7, h24: null }, sinceMigration: null, activity: 4, guard: ["PASS", 69], tradeable: true },
  { symbol: "ZAPP", seenH: 3.1, migratedH: null, mcapUsd: 19_800, growth: -8.2, change: { m5: -1.1, h1: -8.2, h24: -14.5 }, sinceMigration: null, activity: 2, guard: ["FAIL", 31], tradeable: true },
  { symbol: "CRATE", seenH: 8, migratedH: 7.5, mcapUsd: 210_000, growth: 33.4, change: { m5: 2.2, h1: 9.8, h24: 33.4 }, sinceMigration: 33.4, activity: 12, guard: null, tradeable: true, rank: true },
  { symbol: "BREW", seenH: 12, migratedH: 50, mcapUsd: 305_000, growth: 25.5, change: { m5: 0.5, h1: 4.2, h24: 25.5 }, sinceMigration: null, activity: 11, guard: ["PASS", 74], tradeable: true, rank: true },
  { symbol: "MOSSY", seenH: 36, migratedH: 5, mcapUsd: 244_000, growth: null, change: { m5: 1.8, h1: 7.4, h24: 19.2 }, sinceMigration: 19.2, activity: 8, guard: ["PASS", 79], tradeable: true },
  { symbol: "FLUX", seenH: 26, migratedH: null, mcapUsd: 12_400, growth: 8, change: { m5: 0.2, h1: 8, h24: null }, sinceMigration: null, activity: 4, guard: ["PASS", 49], tradeable: false, skipReason: "UNSUPPORTED_QUOTE_MINT", rank: true },
  { symbol: "NOVA", seenH: 30, migratedH: 9, mcapUsd: 540_000, growth: 41, change: { m5: 0.9, h1: 11.3, h24: 33.4 }, sinceMigration: 41, activity: 27, guard: ["PASS", 82], tradeable: true, rank: true },
  { symbol: "TIDE", seenH: 33, migratedH: 14, mcapUsd: 275_000, growth: null, change: { m5: -0.3, h1: 2.6, h24: 12.6 }, sinceMigration: 12.6, activity: 9, guard: ["PASS", 72], tradeable: true },
  { symbol: "DUSK", seenH: 40, migratedH: 20, mcapUsd: 188_000, growth: null, change: { m5: -0.7, h1: -2.1, h24: -5.4 }, sinceMigration: -5.4, activity: 6, guard: ["FAIL", 28], tradeable: true },
  { symbol: "SABLE", seenH: 44, migratedH: 23, mcapUsd: 149_000, growth: null, change: { m5: 0.1, h1: 1.9, h24: 7.8 }, sinceMigration: 7.8, activity: 4, guard: null, tradeable: true },
];

const MARKET_CAPABILITIES = {
  change_pct: true,
  activity: true,
  volume: false,
  liquidity: false,
  holders: false,
  guard: true,
  launchpad: true,
};

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function build(seed) {
  const priceSol = (idx) => 0.0000012 * (1 + idx * 0.41);
  const strategyId = (i) => uuidFrom(`strategy:${STRATEGIES[i].key}`, seed);

  const coins = COINS.map((c, i) => {
    const mint = mintFrom(c.symbol, seed);
    const hash = logoHashFrom(mint, seed);
    const strat = i % STRATEGIES.length;
    return {
      mint,
      venue: c.venue,
      launchpad: c.launchpad,
      decimals: c.decimals,
      token_program: i % 5 === 4 ? TOKEN_2022 : TOKEN_PROGRAM,
      quote_mint: null,
      tradeable: true,
      skip_reason: null,
      untrusted: { symbol: c.symbol, name: `${c.symbol.charAt(0)}${c.symbol.slice(1).toLowerCase()} Demo` },
      strategy_id: strategyId(strat),
      strategy_name: STRATEGIES[strat].name,
      mode: "practice",
      status: "watching",
      last_event_at: iso(ANCHOR - (3 + i) * HOUR),
      pnl_lamports: null,
      mcap_source: c.venue === "curve" ? "curve" : "pool",
      market_cap_lamports: String(Math.round((42_000 + i * 97_000) * (LAMPORTS_PER_SOL / SOL_USD))),
      mcap_usd: dec(42_000 + i * 97_000, 2),
      mcap_as_of: iso(ANCHOR - (3 + i) * HOUR),
      logo_hash: hash,
      logo_url: logoUrlFrom(mint, hash),
      _priceSol: dec(priceSol(i), 15),
    };
  });

  // last coin is a demo of the "not tradeable" state; the one before it has no logo.
  const flux = coins[11];
  flux.tradeable = false;
  flux.skip_reason = "UNSUPPORTED_QUOTE_MINT";
  flux.quote_mint = USDC_MINT;
  delete flux._priceSol;

  const closed = CLOSED_PROFILES.map((p, n) => {
    const coin = coins[p.coin];
    const closedAt = ANCHOR - p.atH * HOUR;
    const openedAt = closedAt - p.holdH * HOUR;
    const pnl = p.legs.reduce((acc, [bps, gain]) => acc + Math.round((p.solIn * bps * gain) / 1_000_000), 0);
    const solOut = p.solIn + pnl;
    const fees = p.legs.reduce((acc, [bps]) => acc + feeOf(Math.round((p.solIn * bps) / 10_000)), 0);
    const entry = Number(coin._priceSol);
    const lastGain = p.legs[p.legs.length - 1][1];
    const peakPct = Math.max(...p.legs.map(([, gain]) => gain), 0) + 6 + (n % 5);
    const id = uuidFrom(`closed:${n}`, seed);
    return {
      id,
      position_key: `demo-${String(n + 1).padStart(3, "0")}-${coin.untrusted.symbol.toLowerCase()}`,
      workspace_id: WORKSPACE_ID,
      strategy_id: strategyId(p.strat),
      mint: coin.mint,
      mode: "practice",
      status: "closed",
      rev: 3 + (n % 4),
      practice_epoch: 1,
      qty_raw: "0",
      decimals: coin.decimals,
      token_program: coin.token_program,
      cost_basis_lamports: "0",
      sol_in_lamports: String(p.solIn),
      sol_out_lamports: String(solOut),
      fees_lamports: String(fees),
      avg_entry_price_sol: coin._priceSol,
      peak_price_sol: dec(entry * (1 + peakPct / 100), 15),
      exit_price_sol: dec(entry * (1 + lastGain / 100), 15),
      exit_reason: p.exit,
      opened_at: iso(openedAt),
      closed_at: iso(closedAt),
      logo_hash: coin.logo_hash,
      logo_url: coin.logo_url,
      pnl_lamports: String(pnl),
      pnl_pct: pctOf(pnl, p.solIn),
      hold_seconds: p.holdH * 3600,
      untrusted: { symbol: coin.untrusted.symbol },
      strategy_name: STRATEGIES[p.strat].name,
      partial_tp: p.legs.length > 1,
      partial_tp_legs: p.legs.map(([bps, gain]) => ({ sold_bps: bps, gain_pct: gain })),
    };
  });

  const open = OPEN_PROFILES.map((p, n) => {
    const coin = coins[p.coin];
    const entry = Number(coin._priceSol);
    const sold = Math.round((p.solIn * p.soldBps) / 10_000);
    const realized = Math.round((sold * p.soldGainPct) / 100);
    const remaining = p.solIn - sold;
    const unrealized = Math.round((remaining * p.remGainPct) / 100);
    const mark = entry * (1 + p.remGainPct / 100);
    const qty = remaining / LAMPORTS_PER_SOL / entry;
    const raw = BigInt(Math.round(qty * 10 ** coin.decimals)).toString();
    return {
      id: uuidFrom(`open:${p.key}`, seed),
      position_key: `demo-${p.key}-${coin.untrusted.symbol.toLowerCase()}`,
      workspace_id: WORKSPACE_ID,
      strategy_id: strategyId(p.strat),
      mint: coin.mint,
      mode: "practice",
      status: "open",
      rev: 2 + n,
      practice_epoch: 1,
      qty_raw: raw,
      decimals: coin.decimals,
      token_program: coin.token_program,
      cost_basis_lamports: String(remaining),
      sol_in_lamports: String(p.solIn),
      sol_out_lamports: String(p.soldBps > 0 ? sold + realized : 0),
      fees_lamports: String(feeOf(p.solIn)),
      avg_entry_price_sol: coin._priceSol,
      peak_price_sol: dec(entry * (1 + Math.max(p.remGainPct, 0) / 100 + 0.05), 15),
      exit_price_sol: null,
      exit_reason: null,
      opened_at: iso(ANCHOR - p.openedH * HOUR),
      closed_at: null,
      logo_hash: coin.logo_hash,
      logo_url: coin.logo_url,
      // 0022 additive fields stay null while the position is open.
      pnl_lamports: null,
      pnl_pct: null,
      hold_seconds: null,
      untrusted: { symbol: coin.untrusted.symbol },
      strategy_name: STRATEGIES[p.strat].name,
      mark_price_sol: dec(mark, 15),
      unrealized_pnl_lamports: String(unrealized),
      unrealized_pnl_pct: p.remGainPct,
      sold_bps: p.soldBps,
      stop_loss_pct: p.stop,
      peak_trail_pct: p.trail,
      partial_tp: p.soldBps > 0,
      partial_tp_legs: p.soldBps > 0 ? [{ sold_bps: p.soldBps, gain_pct: p.soldGainPct }] : [],
      _partial_realized_lamports: realized,
    };
  });

  // ---- strategy lifecycle + coin trails (D5 pause/resume, /coins/[mint]) ----
  const mcapFields = (c) => ({
    market_cap_lamports: c.market_cap_lamports,
    mcap_usd: c.mcap_usd,
    mcap_as_of: c.mcap_as_of,
    mcap_source: c.mcap_source,
  });

  const strategyStates = STRATEGY_LIFECYCLE.map((s, i) => {
    if (s.key !== STRATEGIES[i].key) throw new Error(`strategy lifecycle order must match STRATEGIES (${s.key} != ${STRATEGIES[i].key})`);
    return { ...s, index: i, id: strategyId(i) };
  });

  const lifecycleDrafts = strategyStates.flatMap((s) =>
    s.events.map((e) => {
      const ts = iso(ANCHOR - e.atH * HOUR);
      return {
        _kind: "strategy",
        _ts: Date.parse(ts),
        id: `${s.id}:${Date.parse(ts)}:${e.type}`,
        type: e.type,
        version: 2,
        workspace_id: WORKSPACE_ID,
        strategy_id: s.id,
        ck: null,
        mint: null,
        logo_hash: null,
        logo_url: null,
        ts,
        actor: "user",
        mode: "practice",
        payload: { rev: e.rev, base_rev: e.baseRev, status: e.status },
        untrusted: {},
        server_now: ANCHOR_ISO,
      };
    }),
  );

  const coinBySymbol = new Map(coins.map((c) => [c.untrusted.symbol, c]));
  const coinEvent = (coin, o) => ({
    _kind: "trail",
    _ts: Date.parse(o.ts),
    id: `${coin.mint}:${Date.parse(o.ts)}:${o.type}`,
    type: o.type,
    version: 2,
    workspace_id: WORKSPACE_ID,
    strategy_id: o.strategyId ?? null,
    ck: o.ck ?? null,
    mint: coin.mint,
    logo_hash: coin.logo_hash,
    logo_url: coin.logo_url,
    ts: o.ts,
    actor: o.actor,
    mode: "practice",
    payload: o.payload,
    untrusted: { symbol: coin.untrusted.symbol },
    server_now: ANCHOR_ISO,
  });

  const orbit = coinBySymbol.get(TRAIL_COIN);
  const orbitClosed = closed.find((r) => r.mint === orbit.mint && r.partial_tp && r.exit_reason === "profit_target");
  if (!orbitClosed) throw new Error(`trail coin ${TRAIL_COIN} needs a closed position with a partial take-profit`);
  const orbitEntry = Number(orbitClosed.avg_entry_price_sol);
  const orbitSolIn = Number(orbitClosed.sol_in_lamports);
  const orbitQtyRaw = BigInt(Math.round((orbitSolIn / LAMPORTS_PER_SOL / orbitEntry) * 10 ** orbit.decimals)).toString();
  const orbitLeg = orbitClosed.partial_tp_legs[0];
  const orbitSoldSol = Math.round((orbitSolIn * orbitLeg.sold_bps) / 10_000);
  const orbitPartialPnl = Math.round((orbitSoldSol * orbitLeg.gain_pct) / 100);
  const orbitPartialProceeds = orbitSoldSol + orbitPartialPnl;
  const orbitOpenedMs = Date.parse(orbitClosed.opened_at);
  const orbitClosedMs = Date.parse(orbitClosed.closed_at);
  const orbitDetectedAt = iso(orbitOpenedMs - HOUR);
  const orbitScoredAt = iso(orbitOpenedMs - HOUR / 2);
  const orbitPartialAt = iso(orbitOpenedMs + Math.round((orbitClosedMs - orbitOpenedMs) / 2));
  const orbitStrategyId = orbitClosed.strategy_id;
  const orbitChecks = [
    { id: "quote_mint", class: "venue", passed: true, measured: null, points: 0, reason: "SOL quote" },
    { id: "mcap_usd", class: "weighted", passed: true, measured: 6_000, points: 30, reason: "Market cap above the floor" },
  ];
  const orbitEvents = [
    coinEvent(orbit, {
      type: "coin.detected",
      ts: orbitDetectedAt,
      actor: "ingest",
      strategyId: orbitStrategyId,
      payload: {
        mint: orbit.mint,
        venue: orbit.venue,
        launchpad: orbit.launchpad,
        creator: null,
        decimals: orbit.decimals,
        token_program: orbit.token_program,
        quote_mint: null,
        ...mcapFields(orbit),
      },
    }),
    coinEvent(orbit, {
      type: "screener.scored",
      ts: orbitScoredAt,
      actor: "screener",
      strategyId: orbitStrategyId,
      payload: {
        mint: orbit.mint,
        passed: true,
        tradeable: true,
        skip_reason: null,
        quote_mint: null,
        summary: "Score 84 >= 60; SOL quote.",
        rejected_by: null,
        failed: [],
        result: { passed: true, score: 84, score_threshold: 60, max_score: 100, checks: orbitChecks, tradeable: true, skip_reason: null, quote_mint: null },
        ...mcapFields(orbit),
      },
    }),
    coinEvent(orbit, {
      type: "position.opened",
      ts: orbitClosed.opened_at,
      actor: "executor",
      strategyId: orbitStrategyId,
      ck: orbitClosed.position_key,
      payload: {
        position_key: orbitClosed.position_key,
        position_id: orbitClosed.id,
        rev: 1,
        practice_epoch: 1,
        mint: orbit.mint,
        decimals: orbit.decimals,
        token_program: orbit.token_program,
        first_buy: true,
        fill: {
          id: uuidFrom(`fill:${orbitClosed.position_key}:buy`, seed),
          side: "buy",
          simulated: true,
          practice_epoch: 1,
          sol_lamports: orbitClosed.sol_in_lamports,
          token_amount_raw: orbitQtyRaw,
          exec_price_sol: orbitClosed.avg_entry_price_sol,
          mid_price_sol: orbitClosed.avg_entry_price_sol,
          price_impact_bps: 12,
          slippage_bps: 25,
          swap_fee_lamports: String(feeOf(orbitSolIn)),
          network_fee_lamports: "5000",
          latency_ms: 380,
          created_at: orbitClosed.opened_at,
        },
      },
    }),
    coinEvent(orbit, {
      type: "exit.triggered",
      ts: orbitPartialAt,
      actor: "exit",
      strategyId: orbitStrategyId,
      ck: orbitClosed.position_key,
      payload: {
        position_key: orbitClosed.position_key,
        rule: "profit_target",
        rule_index: 0,
        sell_portion_pct: orbitLeg.sold_bps / 100,
        trigger_price_sol: dec(orbitEntry * (1 + orbitLeg.gain_pct / 100), 15),
        detail: `Step 1: sell ${orbitLeg.sold_bps / 100}% at +${orbitLeg.gain_pct.toFixed(1)}%`,
        partial: true,
        summary: `Partial take-profit: sold ${orbitLeg.sold_bps / 100}% at +${orbitLeg.gain_pct.toFixed(1)}%`,
        sol_lamports: String(orbitPartialProceeds),
        pnl_lamports: String(orbitPartialPnl),
        pnl_pct: orbitLeg.gain_pct,
      },
    }),
    coinEvent(orbit, {
      type: "position.closed",
      ts: orbitClosed.closed_at,
      actor: "exit",
      strategyId: orbitStrategyId,
      ck: orbitClosed.position_key,
      payload: {
        position_key: orbitClosed.position_key,
        position_id: orbitClosed.id,
        rev: orbitClosed.rev,
        practice_epoch: 1,
        exit_reason: orbitClosed.exit_reason,
        exit_price_sol: orbitClosed.exit_price_sol,
        sol_out_lamports: orbitClosed.sol_out_lamports,
        pnl_lamports: orbitClosed.pnl_lamports,
        pnl_pct: orbitClosed.pnl_pct,
        hold_seconds: orbitClosed.hold_seconds,
        partial: false,
        summary: `Closed ${orbitClosed.pnl_pct >= 0 ? "+" : ""}${orbitClosed.pnl_pct.toFixed(2)}% after ${orbitClosed.hold_seconds / 3600}h`,
        sol_lamports: orbitClosed.sol_out_lamports,
      },
    }),
  ];

  const fluxCoin = coins.find((c) => c.untrusted.symbol === BLOCKED_TRAIL_COIN);
  if (!fluxCoin || fluxCoin.tradeable !== false) throw new Error(`blocked trail coin ${BLOCKED_TRAIL_COIN} must be tradeable=false`);
  const fluxDetectedAt = iso(ANCHOR - 28 * HOUR);
  const fluxScoredAt = iso(ANCHOR - 27.5 * HOUR);
  const fluxEvents = [
    coinEvent(fluxCoin, {
      type: "coin.detected",
      ts: fluxDetectedAt,
      actor: "ingest",
      strategyId: fluxCoin.strategy_id,
      payload: {
        mint: fluxCoin.mint,
        venue: fluxCoin.venue,
        launchpad: fluxCoin.launchpad,
        creator: null,
        decimals: fluxCoin.decimals,
        token_program: fluxCoin.token_program,
        quote_mint: fluxCoin.quote_mint,
        ...mcapFields(fluxCoin),
      },
    }),
    coinEvent(fluxCoin, {
      type: "screener.scored",
      ts: fluxScoredAt,
      actor: "screener",
      strategyId: fluxCoin.strategy_id,
      payload: {
        mint: fluxCoin.mint,
        passed: false,
        tradeable: false,
        skip_reason: fluxCoin.skip_reason,
        quote_mint: fluxCoin.quote_mint,
        summary: "Quote mint is USDC; practice only trades SOL-quoted coins.",
        rejected_by: "quote_mint",
        failed: ["quote_mint"],
        result: {
          passed: false,
          score: 41,
          score_threshold: 60,
          max_score: 100,
          checks: [{ id: "quote_mint", class: "venue", passed: false, measured: null, points: 0, reason: "Quote mint must be wSOL" }],
          tradeable: false,
          skip_reason: fluxCoin.skip_reason,
          quote_mint: fluxCoin.quote_mint,
        },
        ...mcapFields(fluxCoin),
      },
    }),
  ];

  const draftEvents = [...lifecycleDrafts, ...orbitEvents, ...fluxEvents].sort((a, b) => a._ts - b._ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  draftEvents.forEach((e, i) => {
    e.seq = String(9001 + i);
  });
  const strategyEvents = draftEvents.filter((e) => e._kind === "strategy");
  const orbitTrailEvents = draftEvents.filter((e) => e._kind === "trail" && e.mint === orbit.mint);
  const fluxTrailEvents = draftEvents.filter((e) => e._kind === "trail" && e.mint === fluxCoin.mint);
  for (const e of draftEvents) {
    delete e._ts;
    delete e._kind;
  }

  const trailOf = (coin, state, positionKey, events) => ({
    mint: coin.mint,
    symbol: coin.untrusted.symbol,
    state,
    position_key: positionKey,
    strategy_id: events.find((e) => e.strategy_id != null)?.strategy_id ?? null,
    logo_hash: coin.logo_hash,
    logo_url: coin.logo_url,
    mode: "practice",
    first_event_at: events[0].ts,
    last_event_at: events[events.length - 1].ts,
    events,
  });
  const coinTrails = [
    trailOf(orbit, "closed", orbitClosed.position_key, orbitTrailEvents),
    trailOf(fluxCoin, "blocked", null, fluxTrailEvents),
  ];

  // coin status + coin-level pnl from the ledger (mock display extras)
  for (const coin of coins) {
    const isOpen = open.some((p) => p.mint === coin.mint);
    const rows = closed.filter((p) => p.mint === coin.mint);
    if (isOpen) coin.status = "open";
    else if (rows.length) coin.status = "closed";
    if (rows.length) coin.pnl_lamports = String(rows.reduce((acc, r) => acc + Number(r.pnl_lamports), 0));
    const latest = isOpen
      ? open.filter((p) => p.mint === coin.mint).map((p) => Date.parse(p.opened_at)).sort((a, b) => b - a)[0]
      : rows.length
        ? rows.map((r) => Date.parse(r.closed_at)).sort((a, b) => b - a)[0]
        : Date.parse(coin.last_event_at);
    coin.last_event_at = iso(latest);
    coin.mcap_as_of = iso(latest);
    delete coin._priceSol;
  }

  const sum = (rows, f) => rows.reduce((acc, r) => acc + f(r), 0);

  // ---- discovery /markets (spec: docs/design/receipt-and-discovery.md part B) ----
  const marketOnly = MARKET_ONLY.map((m) => {
    const mint = mintFrom(`market:${m.symbol}`, seed);
    const hash = logoHashFrom(mint, seed);
    return {
      mint,
      symbol: m.symbol,
      name: `${m.symbol.charAt(0)}${m.symbol.slice(1).toLowerCase()} Demo`,
      launchpad: m.launchpad,
      logo_hash: hash,
      logo_url: logoUrlFrom(mint, hash),
    };
  });

  const marketUniverse = new Map();
  for (const c of coins) {
    marketUniverse.set(c.untrusted.symbol, {
      mint: c.mint,
      symbol: c.untrusted.symbol,
      name: c.untrusted.name,
      launchpad: c.launchpad,
      logo_hash: c.logo_hash,
      logo_url: c.logo_url,
    });
  }
  for (const m of marketOnly) marketUniverse.set(m.symbol, m);

  const marketRowOf = (p) => {
    const base = marketUniverse.get(p.symbol);
    if (!base) throw new Error(`market row ${p.symbol} is not in the universe`);
    const firstSeen = ANCHOR - p.seenH * HOUR;
    const migrated = p.migratedH == null ? null : ANCHOR - p.migratedH * HOUR;
    const venue = migrated == null ? "curve" : "amm";
    const asOf = ANCHOR - (p.staleSeconds || 0) * 1000;
    return {
      mint: base.mint,
      symbol: base.symbol,
      name: base.name,
      logo_hash: base.logo_hash,
      logo_url: base.logo_url,
      launchpad: base.launchpad,
      venue,
      first_seen_at: iso(firstSeen),
      migrated_at: migrated == null ? null : iso(migrated),
      market_cap_lamports: p.mcapUsd == null ? null : String(Math.round((p.mcapUsd * LAMPORTS_PER_SOL) / SOL_USD)),
      mcap_usd: p.mcapUsd == null ? null : dec(p.mcapUsd, 2),
      mcap_source: p.mcapUsd == null ? "unavailable" : venue === "curve" ? "curve" : "pool",
      mcap_as_of: p.mcapUsd == null ? null : iso(asOf),
      price_change_5m_pct: p.change.m5 == null ? null : round2(p.change.m5),
      price_change_1h_pct: p.change.h1 == null ? null : round2(p.change.h1),
      price_change_24h_pct: p.change.h24 == null ? null : round2(p.change.h24),
      price_change_since_migration_pct: p.sinceMigration == null ? null : round2(p.sinceMigration),
      volume_lamports_24h: null,
      liquidity_lamports: null,
      holders: null,
      trades_24h: null,
      activity_count_window: p.activity,
      guard_verdict: p.guard ? p.guard[0] : null,
      guard_score: p.guard ? p.guard[1] : null,
      tradeable: p.tradeable !== false,
      skip_reason: p.skipReason ?? null,
      as_of: iso(asOf),
      rank_position: null,
      rank_score: null,
      rank_inputs: null,
    };
  };

  const marketBase = MARKET_ROWS.map(marketRowOf);
  const marketBySymbol = new Map(marketBase.map((r) => [r.symbol, r]));
  const byMintAsc = (a, b) => (a.mint < b.mint ? -1 : a.mint > b.mint ? 1 : 0);

  const WINDOW_MS = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": HOUR, "6h": 6 * HOUR, "24h": 24 * HOUR };
  const MARKET_WINDOWS = {
    trending: ["5m", "1h", "24h"],
    new: ["15m", "1h", "6h", "24h"],
    graduated: ["15m", "1h", "6h", "24h"],
  };
  const MARKET_DEFAULTS = { trending: "1h", new: "1h", graduated: "24h" };

  const rankMeta = {
    weights_version: TRENDING_WEIGHTS_VERSION,
    weights: TRENDING_WEIGHTS,
    formula: "rank_score = 0.5 * mcap_growth_score + 0.3 * activity_score + 0.2 * migration_score",
    normalization: {
      mcap_growth_score: "clamp(mcap_growth_pct * 2, 0, 100)",
      activity_score: "min(activity_count_window, 50) * 2",
      migration_score: "100 when the mint graduated inside the window, else 0",
    },
    inputs: {
      mcap_growth_pct: "market-cap growth since first_seen_at, in percent",
      activity_count_window: "screening events in the window, not market trades",
      migrated_within_window: "1 when the mint graduated inside the window, else 0",
    },
    tie_break: "mint ascending when rank_score is equal",
  };

  const responseOf = (tab, window) => {
    const ms = WINDOW_MS[window];
    let rows;
    if (tab === "trending") {
      // Fewer than 5 observations inside 5m: the server has nothing to rank yet.
      rows = window === "5m" ? [] : MARKET_ROWS.filter((p) => p.rank)
        .map((p) => {
          const migratedWithin = p.migratedH != null && p.migratedH * HOUR <= ms;
          const growthScore = Math.min(Math.max(p.growth * 2, 0), 100);
          const activityScore = Math.min(p.activity, 50) * 2;
          const migrationScore = migratedWithin ? 100 : 0;
          return {
            row: marketBySymbol.get(p.symbol),
            score: round2(0.5 * growthScore + 0.3 * activityScore + 0.2 * migrationScore),
            inputs: {
              mcap_growth_pct: p.growth,
              activity_count_window: p.activity,
              migrated_within_window: migratedWithin ? 1 : 0,
              mcap_growth_score: growthScore,
              activity_score: activityScore,
              migration_score: migrationScore,
            },
          };
        })
        .sort((a, b) => b.score - a.score || byMintAsc(a.row, b.row))
        .map((e, i) => ({ ...e.row, rank_position: i + 1, rank_score: e.score, rank_inputs: e.inputs }));
    } else if (tab === "new") {
      rows = marketBase
        .filter((r) => ANCHOR - Date.parse(r.first_seen_at) <= ms)
        .sort((a, b) => Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at) || byMintAsc(a, b));
    } else {
      rows = marketBase
        .filter((r) => r.migrated_at != null && ANCHOR - Date.parse(r.migrated_at) <= ms)
        .sort((a, b) => Date.parse(b.migrated_at) - Date.parse(a.migrated_at) || byMintAsc(a, b));
    }
    return {
      tab,
      window,
      total_count: rows.length,
      limit: tab === "trending" ? 100 : 50,
      next_cursor: null,
      ...(tab === "trending" ? { rank: rankMeta } : {}),
      rows,
    };
  };

  const byWindow = {
    trending: Object.fromEntries(MARKET_WINDOWS.trending.map((w) => [w, responseOf("trending", w)])),
    new: Object.fromEntries(MARKET_WINDOWS.new.map((w) => [w, responseOf("new", w)])),
    graduated: Object.fromEntries(MARKET_WINDOWS.graduated.map((w) => [w, responseOf("graduated", w)])),
  };
  const defaultRows = (tab) => byWindow[tab][MARKET_DEFAULTS[tab]].rows;

  const markets = {
    as_of: ANCHOR_ISO,
    server_now: ANCHOR_ISO,
    as_of_seq: "4242",
    next_poll_ms: 10_000,
    capabilities: MARKET_CAPABILITIES,
    windows: MARKET_WINDOWS,
    defaults: MARKET_DEFAULTS,
    by_window: byWindow,
    empty: [
      {
        tab: "trending",
        window: "5m",
        total_count: byWindow.trending["5m"].total_count,
        copy_key: "markets.empty.trending",
        note: "Ranking needs at least 5 observations inside the window; none yet at 5m.",
      },
      {
        tab: "graduated",
        window: "15m",
        total_count: byWindow.graduated["15m"].total_count,
        copy_key: "markets.empty.graduated",
        note: "The newest graduation in this fixture is 30 minutes old.",
      },
    ],
    note: "markets.empty.new is not reachable from this fixture: a pair first seen 45 s ago exists, so the 15m window has 4 rows. Use a stub override to test that copy.",
  };

  const pnlSummaryOf = (rows, window, from, to = ANCHOR_ISO) => {
    const closedCount = rows.length;
    const winCount = rows.filter((r) => Number(r.pnl_lamports) > 0).length;
    const pnls = rows.map((r) => Number(r.pnl_lamports));
    return {
      mode: "practice",
      practice_epoch: 1,
      window,
      from: from == null ? null : iso(from),
      to: to == null ? null : iso(to),
      // Snapshot numbers: workspace + mode, never narrowed by the window or a bot filter.
      unrealized_pnl_lamports: String(unrealized),
      realized_pnl_lamports: String(realized),
      total_pnl_lamports: String(realized + unrealized),
      realized_pnl_window_lamports: String(pnls.reduce((acc, p) => acc + p, 0)),
      closed_count: closedCount,
      win_count: winCount,
      // null on an empty range: never a fake 0 %.
      win_rate_pct: closedCount ? Math.round((winCount * 1000) / closedCount) / 10 : null,
      avg_hold_s: closedCount ? Math.round(sum(rows, (r) => r.hold_seconds) / closedCount) : null,
      fees_lamports: String(sum(rows, (r) => Number(r.fees_lamports))),
      best_pnl_lamports: closedCount ? String(Math.max(...pnls)) : null,
      worst_pnl_lamports: closedCount ? String(Math.min(...pnls)) : null,
      as_of_seq: "4242",
      ts: ANCHOR_ISO,
    };
  };

  const rangeOf = (fromH) => {
    const from = fromH == null ? null : ANCHOR - fromH * HOUR;
    const rows = closed.filter((r) => (from == null ? true : Date.parse(r.closed_at) >= from));
    const window = fromH == null ? "all" : fromH === 1 ? "1h" : fromH === 24 ? "24h" : fromH === 168 ? "7d" : "30d";
    return {
      pnl_summary: pnlSummaryOf(rows, window, from),
      closed_position_keys: rows.map((r) => r.position_key),
    };
  };

  const realizedOpenPartials = OPEN_PROFILES.filter((p) => p.soldBps > 0).reduce(
    (acc, p) => acc + Math.round((Math.round((p.solIn * p.soldBps) / 10_000) * p.soldGainPct) / 100),
    0,
  );
  const realizedClosed = sum(closed, (r) => Number(r.pnl_lamports));
  const realized = realizedClosed + realizedOpenPartials;
  const unrealized = sum(open, (p) => Number(p.unrealized_pnl_lamports));

  const windows = { "1h": rangeOf(1), "24h": rangeOf(24), "7d": rangeOf(168), "30d": rangeOf(720), all: rangeOf(null) };

  // 3-day hole between the 240 h and 312 h closes: a range a tester can ask for that must be empty.
  const emptyFrom = ANCHOR - 300 * HOUR;
  const emptyTo = ANCHOR - 252 * HOUR;
  const emptyRows = closed.filter((r) => {
    const t = Date.parse(r.closed_at);
    return t >= emptyFrom && t <= emptyTo;
  });

  for (const p of open) delete p._partial_realized_lamports;

  const closedSorted = [...closed].sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at));
  const openSorted = [...open].sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));

  return {
    meta: {
      dataset: DATASET,
      schema_version: SCHEMA_VERSION,
      seed,
      anchor: ANCHOR_ISO,
      anchor_wib: "2026-11-06T00:00:00+07:00",
      mode: "practice",
      practice_epoch: 1,
      workspace_id: WORKSPACE_ID,
      generator: "tools/demo/gen-demo-data.mjs",
      docs: "docs/qa/demo-data.md",
      note: "Synthetic paper data for QA and screenshots. No live token, price, order, or wallet.",
    },
    summary: {
      coins: coins.length,
      strategies: STRATEGIES.length,
      open_positions: openSorted.length,
      closed_positions: closedSorted.length,
      wins: closedSorted.filter((r) => Number(r.pnl_lamports) > 0).length,
      losses: closedSorted.filter((r) => Number(r.pnl_lamports) < 0).length,
      open_partial_take_profits: openSorted.filter((p) => p.sold_bps > 0).length,
      closed_partial_take_profits: closedSorted.filter((r) => r.partial_tp).length,
      unrealized_pnl_lamports: String(unrealized),
      realized_pnl_lamports: String(realized),
      total_pnl_lamports: String(realized + unrealized),
      ledger_closed_pnl_lamports: String(realizedClosed),
      reconciliation_delta_lamports: String(realized - realizedClosed),
      markets_trending: defaultRows("trending").length,
      markets_new: defaultRows("new").length,
      markets_graduated: defaultRows("graduated").length,
      markets_market_only_mints: marketOnly.length,
      markets_empty_cases: markets.empty.length,
      strategies_paused: strategyStates.filter((s) => s.status === "paused").length,
      strategy_pause_events: strategyEvents.filter((e) => e.type === "strategy.paused").length,
      strategy_resume_events: strategyEvents.filter((e) => e.type === "strategy.resumed").length,
      coin_trails: coinTrails.length,
      coin_trail_events: coinTrails.reduce((n, t) => n + t.events.length, 0),
    },
    strategies: STRATEGIES.map((s, i) => {
      const state = strategyStates[i];
      const lastEvent = state.events[state.events.length - 1];
      return {
        id: strategyId(i),
        key: s.key,
        name: s.name,
        mode: "practice",
        status: state.status,
        rev: state.rev,
        created_at: iso(ANCHOR - 30 * 24 * HOUR),
        updated_at: lastEvent ? iso(ANCHOR - lastEvent.atH * HOUR) : iso(ANCHOR - 20 * 24 * HOUR),
      };
    }),
    strategy_events: strategyEvents,
    coin_trails: coinTrails,
    coins,
    positions_open: openSorted,
    positions_closed: closedSorted,
    windows,
    markets,
    empty_range: {
      from: iso(emptyFrom),
      to: iso(emptyTo),
      closed_count: emptyRows.length,
      pnl_summary: pnlSummaryOf(emptyRows, null, emptyFrom, emptyTo),
      note: "48 h hole between the 10-day and 13-day closes; /positions?state=closed&from=&to= must return no rows.",
    },
    scenarios: [
      { id: "empty-1h", expect: "windows.1h.pnl_summary.closed_count = 0, win_rate_pct = null", pointers: [] },
      { id: "empty-custom-range", expect: "empty_range.closed_count = 0", pointers: [iso(emptyFrom), iso(emptyTo)] },
      { id: "partial-tp-closed", expect: "pnl = sum of legs; realized can exceed the visible last leg", pointers: closedSorted.filter((r) => r.partial_tp).map((r) => r.position_key) },
      { id: "partial-tp-open", expect: "sold_bps > 0 while pnl_lamports is null; its realized part is inside summary.realized_pnl_lamports", pointers: openSorted.filter((p) => p.sold_bps > 0).map((p) => p.position_key) },
      { id: "losses", expect: "negative pnl sign is kept, never clamped to zero", pointers: closedSorted.filter((r) => Number(r.pnl_lamports) < 0).map((r) => r.position_key) },
      { id: "no-logo", expect: "logo_hash and logo_url are both null -> identicon, no request", pointers: coins.filter((c) => c.logo_hash === null).map((c) => c.untrusted.symbol) },
      { id: "untradeable", expect: "tradeable=false + skip_reason=UNSUPPORTED_QUOTE_MINT", pointers: ["FLUX"] },
      { id: "zero-pnl-open", expect: "unrealized 0 stays neutral, not a 0% win", pointers: openSorted.filter((p) => Number(p.unrealized_pnl_lamports) === 0).map((p) => p.position_key) },
      { id: "strategy-paused", expect: "a strategy with status paused and a strategy.paused event; the row offers Resume", pointers: strategyStates.filter((s) => s.status === "paused").map((s) => `${s.key}:rev${s.rev}`) },
      { id: "strategy-resumed", expect: "a strategy that was paused then resumed: status running with both events, rev increases", pointers: strategyStates.filter((s) => s.status === "running" && s.events.some((e) => e.type === "strategy.resumed")).map((s) => `${s.key}:rev${s.rev}`) },
      { id: "tradeable-control", expect: "at least one coin with tradeable=true and skip_reason null next to the blocked coin", pointers: coins.filter((c) => c.tradeable === true && c.skip_reason === null).map((c) => c.untrusted.symbol).slice(0, 6) },
      { id: "coin-trail-partial-tp", expect: "one trail: buy -> partial take-profit -> sell, each with the coin logo_hash/logo_url", pointers: [TRAIL_COIN] },
      { id: "coin-trail-not-tradeable", expect: "trail stops at screener with tradeable=false + UNSUPPORTED_QUOTE_MINT and no buy/sell", pointers: [BLOCKED_TRAIL_COIN] },
      { id: "markets-trending-ranks", expect: "rank_position 1..10 in asc order; rank_score recomputable from rank_inputs and markets.by_window.trending[\"1h\"].rank.weights", pointers: defaultRows("trending").map((r) => `${r.rank_position}:${r.symbol}`) },
      { id: "markets-trending-empty", expect: "rows [] and total_count 0 for trending 5m", pointers: ["markets.empty[0]"] },
      { id: "markets-graduated-empty", expect: "rows [] and total_count 0 for graduated 15m", pointers: ["markets.empty[1]"] },
      { id: "markets-new-young", expect: "first_seen_at < 60 s -> New chip", pointers: defaultRows("new").filter((r) => ANCHOR - Date.parse(r.first_seen_at) < 60_000).map((r) => r.symbol) },
      { id: "markets-migrated-still-new", expect: "a mint in New pairs and Graduated at the same time keeps venue AMM in New", pointers: defaultRows("new").filter((r) => r.migrated_at != null).map((r) => r.symbol) },
      { id: "markets-since-migration", expect: "Graduated change uses price_change_since_migration_pct, not 24h", pointers: defaultRows("graduated").filter((r) => r.price_change_since_migration_pct !== r.price_change_24h_pct).map((r) => r.symbol) },
      { id: "markets-market-only-guard-null", expect: "never-screened mint: guard_verdict null -> Not evaluated, never Guard failed", pointers: defaultRows("trending").filter((r) => r.guard_verdict === null).map((r) => r.symbol) },
      { id: "markets-null-mcap", expect: "mcap_usd and market_cap_lamports both null -> em dash, no invented rate", pointers: defaultRows("new").filter((r) => r.mcap_usd === null).map((r) => r.symbol) },
      { id: "markets-null-change", expect: "change null per row -> em dash", pointers: defaultRows("new").filter((r) => r.price_change_1h_pct === null).map((r) => r.symbol) },
      { id: "markets-stale-row", expect: "row as_of older than 60 s keeps its row and flags Stale", pointers: defaultRows("new").filter((r) => ANCHOR - Date.parse(r.as_of) > 60_000).map((r) => r.symbol) },
      { id: "markets-not-tradeable", expect: "tradeable false + skip_reason, neutral treatment", pointers: defaultRows("trending").filter((r) => !r.tradeable).map((r) => r.symbol) },
      { id: "markets-no-logo", expect: "logo_hash and logo_url null -> identicon, no request", pointers: defaultRows("new").filter((r) => r.logo_hash === null).map((r) => r.symbol) },
    ],
  };
}

// ---------------------------------------------------------------------------
// invariants
// ---------------------------------------------------------------------------

function validate(data) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const isInt = (v) => typeof v === "number" && Number.isInteger(v);
  const isLamportStr = (v) => typeof v === "string" && /^(0|-?[1-9][0-9]*)$/.test(v);
  const WINDOW_MS_VALIDATE = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": HOUR, "6h": 6 * HOUR, "24h": 24 * HOUR };

  if (data.meta.seed !== data.meta.seed) fail("seed is NaN");
  if (!Number.isFinite(Date.parse(data.meta.anchor))) fail("anchor is not an ISO timestamp");

  for (const k of ["unrealized_pnl_lamports", "realized_pnl_lamports", "total_pnl_lamports"]) {
    if (!isLamportStr(data.summary[k])) fail(`summary.${k} is not an integer lamport string: ${JSON.stringify(data.summary[k])}`);
  }
  if (Number(data.summary.realized_pnl_lamports) + Number(data.summary.unrealized_pnl_lamports) !== Number(data.summary.total_pnl_lamports)) {
    fail("summary.total_pnl_lamports != realized + unrealized");
  }
  if (Number(data.summary.ledger_closed_pnl_lamports) + Number(data.summary.reconciliation_delta_lamports) !== Number(data.summary.realized_pnl_lamports)) {
    fail("summary reconciliation does not add up");
  }

  const mints = new Set();
  for (const c of data.coins) {
    if (mints.has(c.mint)) fail(`duplicate mint ${c.mint}`);
    mints.add(c.mint);
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c.mint)) fail(`mint is not base58: ${c.mint}`);
    if (Boolean(c.logo_hash) !== Boolean(c.logo_url)) fail(`logo_hash/logo_url mismatch for ${c.untrusted.symbol}`);
    if (c.logo_hash && c.logo_url !== `/v1/img/coin/${c.mint}?s=96&v=${c.logo_hash}`) fail(`logo_url shape wrong for ${c.untrusted.symbol}`);
    if (c.logo_hash && !/^[A-Za-z0-9_-]{1,128}$/.test(c.logo_hash)) fail(`logo_hash charset wrong for ${c.untrusted.symbol}`);
  }

  const keys = new Set();
  const positionIds = new Set();
  for (const [kind, rows] of [["open", data.positions_open], ["closed", data.positions_closed]]) {
    for (const p of rows) {
      if (keys.has(p.position_key)) fail(`duplicate position_key ${p.position_key}`);
      keys.add(p.position_key);
      if (positionIds.has(p.id)) fail(`duplicate position id ${p.id}`);
      positionIds.add(p.id);
      if (!isLamportStr(p.sol_in_lamports)) fail(`${p.position_key}: sol_in_lamports`);
      if (!isLamportStr(p.sol_out_lamports)) fail(`${p.position_key}: sol_out_lamports`);
      if (!isLamportStr(p.fees_lamports)) fail(`${p.position_key}: fees_lamports`);
      if (p.mode !== "practice") fail(`${p.position_key}: demo must stay paper`);
      if (p.practice_epoch !== 1) fail(`${p.position_key}: practice_epoch`);
      const opened = Date.parse(p.opened_at);
      const closedAt = p.closed_at == null ? null : Date.parse(p.closed_at);
      if (!Number.isFinite(opened)) fail(`${p.position_key}: opened_at not ISO`);
      if (kind === "open") {
        if (closedAt !== null) fail(`${p.position_key}: open row has closed_at`);
        if (p.pnl_lamports !== null) fail(`${p.position_key}: open row must have pnl_lamports null`);
        if (p.sold_bps < 0 || p.sold_bps > 10000) fail(`${p.position_key}: sold_bps range`);
        if (!isLamportStr(p.unrealized_pnl_lamports)) fail(`${p.position_key}: unrealized pnl`);
      } else {
        if (closedAt === null || !Number.isFinite(closedAt)) fail(`${p.position_key}: closed_at missing`);
        if (closedAt < opened) fail(`${p.position_key}: closed before opened`);
        if (p.partial_tp && (!Array.isArray(p.partial_tp_legs) || p.partial_tp_legs.length < 2)) fail(`${p.position_key}: partial_tp needs 2+ legs`);
        if (p.partial_tp && p.partial_tp_legs.reduce((acc, leg) => acc + leg.sold_bps, 0) !== 10000) fail(`${p.position_key}: partial legs must sum to 10000 bps`);
        const pnl = Number(p.pnl_lamports);
        if (pnl !== Number(p.sol_out_lamports) - Number(p.sol_in_lamports)) fail(`${p.position_key}: pnl != sol_out - sol_in`);
        if (p.pnl_pct !== pctOf(pnl, Number(p.sol_in_lamports))) fail(`${p.position_key}: pnl_pct rounding`);
        const legSum = (p.partial_tp_legs || []).reduce((acc, leg) => acc + Math.round((Number(p.sol_in_lamports) * leg.sold_bps * leg.gain_pct) / 1_000_000), 0);
        if (legSum !== pnl) fail(`${p.position_key}: pnl != sum of exit legs`);
        if ((p.partial_tp_legs || []).reduce((acc, leg) => acc + leg.sold_bps, 0) !== 10000) fail(`${p.position_key}: exit legs must sum to 10000 bps`);
        if (p.hold_seconds !== Math.round((closedAt - opened) / 1000)) fail(`${p.position_key}: hold_seconds`);
        if (Number(p.fees_lamports) < 0) fail(`${p.position_key}: negative fees`);
      }
    }
  }

  const closed = data.positions_closed;
  if (closed.length < 20) fail("expected at least 20 closed trades");
  if (!closed.some((r) => Number(r.pnl_lamports) > 0)) fail("no winning closed trade");
  if (!closed.some((r) => Number(r.pnl_lamports) < 0)) fail("no losing closed trade");
  if (closed.filter((r) => r.exit_reason === "profit_target").length < 1) fail("no profit target exits");
  for (let i = 1; i < closed.length; i += 1) {
    if (Date.parse(closed[i - 1].closed_at) < Date.parse(closed[i].closed_at)) fail("closed ledger is not newest first");
  }

  const newest = Math.max(...closed.map((r) => Date.parse(r.closed_at)));
  const oldest = Math.min(...closed.map((r) => Date.parse(r.closed_at)));
  if (Number.isNaN(newest) || Number.isNaN(oldest)) fail("closed timestamps unreadable");
  if (newest > Date.parse(data.meta.anchor)) fail("a closed trade is after the anchor");
  if (Date.parse(data.meta.anchor) - oldest > 31 * 24 * HOUR) fail("closed ledger spans more than 31 days");

  // ---- strategy lifecycle (D5) ----
  if (data.meta.schema_version !== "1.1") fail("schema_version must stay 1.1 for this additive fixture");
  if (!Array.isArray(data.strategies) || data.strategies.length !== 3) fail("expected exactly 3 strategies (count must not change)");
  const STRATEGY_STATUSES = new Set(["draft", "running", "paused", "archived"]);
  for (const s of data.strategies) {
    if (!STRATEGY_STATUSES.has(s.status)) fail(`strategy ${s.key}: unknown status ${JSON.stringify(s.status)}`);
    if (!isInt(s.rev) || s.rev < 1) fail(`strategy ${s.key}: rev`);
    if (s.mode !== "practice") fail(`strategy ${s.key}: demo must stay paper`);
    if (!Number.isFinite(Date.parse(s.created_at)) || !Number.isFinite(Date.parse(s.updated_at))) fail(`strategy ${s.key}: created_at/updated_at`);
  }
  const lifecycle = data.strategy_events;
  if (!Array.isArray(lifecycle) || lifecycle.length < 2) fail("strategy_events must contain the pause/resume events");
  const strategyById = new Map(data.strategies.map((s) => [s.id, s]));
  const eventIds = new Set();
  const eventSeqs = new Set();
  for (const e of lifecycle || []) {
    if (!["strategy.paused", "strategy.resumed"].includes(e.type)) fail(`strategy event ${e.type}: only pause/resume belong here`);
    if (e.version !== 2) fail(`strategy event ${e.id}: version`);
    if (e.mode !== "practice") fail(`strategy event ${e.id}: mode`);
    if (e.workspace_id !== data.meta.workspace_id) fail(`strategy event ${e.id}: workspace_id`);
    if (e.mint !== null || e.logo_hash !== null || e.logo_url !== null) fail(`strategy event ${e.id}: must not carry a mint/logo`);
    if (!strategyById.has(e.strategy_id)) fail(`strategy event ${e.id}: unknown strategy_id`);
    if (!Number.isFinite(Date.parse(e.ts))) fail(`strategy event ${e.id}: ts`);
    const payload = e.payload || {};
    const wantStatus = e.type === "strategy.paused" ? "paused" : "running";
    if (payload.status !== wantStatus) fail(`strategy event ${e.id}: payload.status must be ${wantStatus}`);
    if (!isInt(payload.rev) || payload.rev < 2) fail(`strategy event ${e.id}: payload.rev`);
    if (!isInt(payload.base_rev) || payload.rev <= payload.base_rev) fail(`strategy event ${e.id}: payload.base_rev`);
    if (eventIds.has(e.id)) fail(`duplicate event id ${e.id}`);
    eventIds.add(e.id);
    if (eventSeqs.has(e.seq)) fail(`duplicate event seq ${e.seq}`);
    eventSeqs.add(e.seq);
  }
  for (const s of data.strategies) {
    const evs = (lifecycle || []).filter((e) => e.strategy_id === s.id);
    if (evs.length === 0) {
      if (s.status !== "running") fail(`strategy ${s.key}: a strategy without events must stay running`);
      continue;
    }
    const last = evs[evs.length - 1];
    if (s.status !== last.payload.status) fail(`strategy ${s.key}: status must match its last event`);
    if (s.rev !== last.payload.rev) fail(`strategy ${s.key}: rev must match its last event`);
    if (Date.parse(s.updated_at) !== Date.parse(last.ts)) fail(`strategy ${s.key}: updated_at must match its last event`);
  }
  if (!data.strategies.some((s) => s.status === "paused")) fail("no strategy is paused (Resume state)");
  if (!data.strategies.some((s) => s.status === "running" && (lifecycle || []).some((e) => e.strategy_id === s.id && e.type === "strategy.resumed"))) {
    fail("no strategy was paused then resumed (Running state with a resume event)");
  }
  if (data.summary.strategies_paused !== data.strategies.filter((s) => s.status === "paused").length) fail("summary.strategies_paused");
  if (data.summary.strategy_pause_events !== (lifecycle || []).filter((e) => e.type === "strategy.paused").length) fail("summary.strategy_pause_events");
  if (data.summary.strategy_resume_events !== (lifecycle || []).filter((e) => e.type === "strategy.resumed").length) fail("summary.strategy_resume_events");

  // ---- tradeable states ----
  const blockedCoins = data.coins.filter((c) => c.tradeable === false);
  if (blockedCoins.length === 0) fail("no coin with tradeable=false");
  for (const c of blockedCoins) {
    if (typeof c.skip_reason !== "string" || c.skip_reason.length === 0 || c.skip_reason.length > 64) fail(`coin ${c.untrusted.symbol}: tradeable=false needs a clear skip_reason`);
    if (c.skip_reason === "0" || c.skip_reason === "0%") fail(`coin ${c.untrusted.symbol}: skip_reason must be a reason code, not a percentage`);
  }
  for (const c of data.coins.filter((c) => c.tradeable === true)) {
    if (c.skip_reason !== null) fail(`coin ${c.untrusted.symbol}: tradeable=true must have skip_reason null`);
  }
  if (!data.coins.some((c) => c.tradeable === true)) fail("no tradeable=true control coin");

  // ---- coin trails (/coins/[mint]) ----
  if (!Array.isArray(data.coin_trails) || data.coin_trails.length < 1) fail("coin_trails is missing");
  const coinByMint = new Map(data.coins.map((c) => [c.mint, c]));
  let completeTrails = 0;
  let blockedTrails = 0;
  for (const t of data.coin_trails || []) {
    const coin = coinByMint.get(t.mint);
    if (!coin) {
      fail(`trail ${t.symbol}: mint is not in coins[]`);
      continue;
    }
    if (t.symbol !== coin.untrusted.symbol) fail(`trail ${t.symbol}: symbol mismatch`);
    if (t.logo_hash !== coin.logo_hash || t.logo_url !== coin.logo_url) fail(`trail ${t.symbol}: logo pair must match the coin`);
    if (t.mode !== "practice") fail(`trail ${t.symbol}: mode`);
    if (!Array.isArray(t.events) || t.events.length < 2) {
      fail(`trail ${t.symbol}: needs at least coin.detected and screener.scored`);
      continue;
    }
    let prevTs = -Infinity;
    for (const e of t.events) {
      if (e.mint !== t.mint) fail(`trail ${t.symbol}: event mint`);
      if (e.logo_hash !== coin.logo_hash || e.logo_url !== coin.logo_url) fail(`trail ${t.symbol}: event logo pair`);
      if (e.mode !== "practice" || e.version !== 2) fail(`trail ${t.symbol}: event mode/version`);
      if (e.workspace_id !== data.meta.workspace_id) fail(`trail ${t.symbol}: event workspace_id`);
      if (!Number.isFinite(Date.parse(e.ts))) fail(`trail ${t.symbol}: event ts`);
      if (Date.parse(e.ts) < prevTs) fail(`trail ${t.symbol}: events must be oldest first`);
      prevTs = Date.parse(e.ts);
      if (e.untrusted?.symbol !== coin.untrusted.symbol) fail(`trail ${t.symbol}: event untrusted.symbol`);
      if (eventIds.has(e.id)) fail(`duplicate event id ${e.id}`);
      eventIds.add(e.id);
      if (eventSeqs.has(e.seq)) fail(`duplicate event seq ${e.seq}`);
      eventSeqs.add(e.seq);
    }
    if (t.first_event_at !== t.events[0].ts || t.last_event_at !== t.events[t.events.length - 1].ts) fail(`trail ${t.symbol}: first/last event at`);
    const scored = t.events.find((e) => e.type === "screener.scored");
    if (!scored) fail(`trail ${t.symbol}: no screener.scored`);
    else {
      if (scored.payload.tradeable !== coin.tradeable) fail(`trail ${t.symbol}: screener tradeable must match the coin`);
      if ((scored.payload.skip_reason ?? null) !== coin.skip_reason) fail(`trail ${t.symbol}: screener skip_reason must match the coin`);
      if ((scored.payload.quote_mint ?? null) !== (coin.quote_mint ?? null)) fail(`trail ${t.symbol}: screener quote_mint must match the coin`);
    }
    const opened = t.events.find((e) => e.type === "position.opened");
    const partial = t.events.find((e) => e.type === "exit.triggered");
    const closedEv = t.events.find((e) => e.type === "position.closed");
    if (opened && partial && closedEv) {
      completeTrails += 1;
      if (t.position_key !== opened.payload.position_key) fail(`trail ${t.symbol}: position_key`);
      if (!(partial.payload.sell_portion_pct > 0 && partial.payload.sell_portion_pct < 100)) fail(`trail ${t.symbol}: partial sell_portion_pct`);
      if (!(Date.parse(opened.ts) < Date.parse(partial.ts) && Date.parse(partial.ts) < Date.parse(closedEv.ts))) fail(`trail ${t.symbol}: buy/partial/sell order`);
      const row = closed.find((r) => r.position_key === t.position_key);
      if (!row) fail(`trail ${t.symbol}: no matching closed position`);
      else {
        if (closedEv.payload.pnl_lamports !== row.pnl_lamports) fail(`trail ${t.symbol}: closed pnl must equal the ledger row`);
        if (closedEv.payload.sol_out_lamports !== row.sol_out_lamports) fail(`trail ${t.symbol}: closed sol_out must equal the ledger row`);
        if (closedEv.payload.exit_reason !== row.exit_reason) fail(`trail ${t.symbol}: exit_reason must equal the ledger row`);
        if (closedEv.payload.hold_seconds !== row.hold_seconds) fail(`trail ${t.symbol}: hold_seconds must equal the ledger row`);
        if (opened.payload.fill.sol_lamports !== row.sol_in_lamports) fail(`trail ${t.symbol}: buy amount must equal sol_in`);
        const leg = row.partial_tp_legs?.[0];
        if (!leg) fail(`trail ${t.symbol}: ledger row has no partial leg`);
        else {
          const legPnl = Math.round((Number(row.sol_in_lamports) * leg.sold_bps * leg.gain_pct) / 1_000_000);
          if (Number(partial.payload.pnl_lamports) !== legPnl) fail(`trail ${t.symbol}: partial pnl must equal the ledger leg`);
          if (partial.payload.sell_portion_pct !== leg.sold_bps / 100) fail(`trail ${t.symbol}: partial bps`);
          if (partial.payload.pnl_pct !== leg.gain_pct) fail(`trail ${t.symbol}: partial gain`);
        }
      }
    } else if (opened || closedEv) {
      fail(`trail ${t.symbol}: buy/sell events must be complete`);
    } else if (scored?.payload.tradeable === false && scored?.payload.skip_reason) {
      blockedTrails += 1;
    }
  }
  if (completeTrails < 1) fail("no complete coin trail (buy + partial take-profit + sell)");
  if (blockedTrails < 1) fail("no coin trail for a tradeable=false coin");
  if (data.summary.coin_trails !== (data.coin_trails || []).length) fail("summary.coin_trails");
  if (data.summary.coin_trail_events !== (data.coin_trails || []).reduce((n, t) => n + t.events.length, 0)) fail("summary.coin_trail_events");

  if (data.windows["1h"].pnl_summary.closed_count !== 0) fail("1h window must be empty");
  const order = ["1h", "24h", "7d", "30d", "all"];
  for (let i = 1; i < order.length; i += 1) {
    if (data.windows[order[i]].pnl_summary.closed_count < data.windows[order[i - 1]].pnl_summary.closed_count) fail(`window ${order[i]} count is smaller than ${order[i - 1]}`);
  }
  for (const w of order) {
    const s = data.windows[w].pnl_summary;
    const rows = closed.filter((r) => (s.from == null ? true : Date.parse(r.closed_at) >= Date.parse(s.from)));
    const total = rows.reduce((acc, r) => acc + Number(r.pnl_lamports), 0);
    if (Number(s.realized_pnl_window_lamports) !== total) fail(`window ${w}: realized does not match rows`);
    if (s.closed_count !== rows.length) fail(`window ${w}: count does not match rows`);
    if (s.closed_count === 0 && s.win_rate_pct !== null) fail(`window ${w}: empty range must have null win rate`);
    if (s.closed_count > 0 && s.win_rate_pct == null) fail(`window ${w}: win rate missing`);
    if (s.total_pnl_lamports !== data.summary.total_pnl_lamports) fail(`window ${w}: snapshot total must not be narrowed`);
  }

  if (data.empty_range.closed_count !== 0) fail("empty_range is not empty");
  if (data.empty_range.pnl_summary.closed_count !== 0 || data.empty_range.pnl_summary.win_rate_pct !== null) fail("empty_range pnl summary must be empty with a null win rate");

  // ---- discovery /markets ----
  const mk = data.markets;
  if (!mk) {
    fail("markets section is missing");
  } else {
    const caps = mk.capabilities || {};
    const expectedWindows = { trending: ["5m", "1h", "24h"], new: ["15m", "1h", "6h", "24h"], graduated: ["15m", "1h", "6h", "24h"] };
    const expectedDefaults = { trending: "1h", new: "1h", graduated: "24h" };
    if (!Number.isFinite(Date.parse(mk.as_of))) fail("markets.as_of is not ISO");
    if (!Number.isFinite(Date.parse(mk.server_now))) fail("markets.server_now is not ISO");
    if (!isInt(mk.next_poll_ms) || mk.next_poll_ms <= 0) fail("markets.next_poll_ms must be a positive integer");
    const tabNames = Object.keys(mk.by_window || {}).join(",");
    if (tabNames !== "trending,new,graduated") fail(`markets.by_window must be trending,new,graduated (got ${tabNames})`);

    const rowChecks = (where, rows) => {
      const seen = new Set();
      for (const r of rows) {
        if (seen.has(r.mint)) fail(`markets.${where}: duplicate mint ${r.mint}`);
        seen.add(r.mint);
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint)) fail(`markets.${where}: mint not base58`);
        if (Boolean(r.logo_hash) !== Boolean(r.logo_url)) fail(`markets.${where}: logo pair mismatch for ${r.symbol}`);
        if (r.logo_hash && r.logo_url !== `/v1/img/coin/${r.mint}?s=96&v=${r.logo_hash}`) fail(`markets.${where}: logo_url shape for ${r.symbol}`);
        const hasUsd = r.mcap_usd !== null;
        const hasSol = r.market_cap_lamports !== null;
        if (hasUsd !== hasSol) fail(`markets.${where}: mcap pair mismatch for ${r.symbol}`);
        if (hasSol && !isLamportStr(r.market_cap_lamports)) fail(`markets.${where}: market_cap_lamports for ${r.symbol}`);
        if (hasSol && !r.mcap_as_of) fail(`markets.${where}: mcap_as_of missing for ${r.symbol}`);
        if (!hasSol && (r.mcap_source !== "unavailable" || r.mcap_as_of !== null)) fail(`markets.${where}: null mcap must be unavailable with null as_of`);
        if (hasSol && !["curve", "pool"].includes(r.mcap_source)) fail(`markets.${where}: mcap_source for ${r.symbol}`);
        if (!["curve", "amm"].includes(r.venue)) fail(`markets.${where}: venue for ${r.symbol}`);
        if (r.venue === "amm" && r.migrated_at == null) fail(`markets.${where}: AMM without migrated_at for ${r.symbol}`);
        if (r.venue === "curve" && r.migrated_at != null) fail(`markets.${where}: curve after migration for ${r.symbol}`);
        if (!Number.isFinite(Date.parse(r.first_seen_at))) fail(`markets.${where}: first_seen_at for ${r.symbol}`);
        if (Date.parse(r.first_seen_at) > Date.parse(mk.as_of)) fail(`markets.${where}: first_seen_at after as_of for ${r.symbol}`);
        if (!Number.isFinite(Date.parse(r.as_of))) fail(`markets.${where}: row as_of for ${r.symbol}`);
        if (Date.parse(r.as_of) > Date.parse(mk.as_of)) fail(`markets.${where}: row as_of in the future for ${r.symbol}`);
        if (!isInt(r.activity_count_window) || r.activity_count_window < 0) fail(`markets.${where}: activity for ${r.symbol}`);
        if (![null, "PASS", "WARN", "FAIL"].includes(r.guard_verdict)) fail(`markets.${where}: guard_verdict for ${r.symbol}`);
        if (r.guard_verdict === null && r.guard_score !== null) fail(`markets.${where}: score without verdict for ${r.symbol}`);
        if (r.guard_verdict !== null && (!isInt(r.guard_score) || r.guard_score < 0 || r.guard_score > 100)) fail(`markets.${where}: guard_score for ${r.symbol}`);
        if (typeof r.tradeable !== "boolean") fail(`markets.${where}: tradeable for ${r.symbol}`);
        if (!r.tradeable && !r.skip_reason) fail(`markets.${where}: untradeable row needs skip_reason (${r.symbol})`);
        if (caps.volume === false && r.volume_lamports_24h !== null) fail(`markets.${where}: volume present while capability is false`);
        if (caps.liquidity === false && r.liquidity_lamports !== null) fail(`markets.${where}: liquidity present while capability is false`);
        if (caps.holders === false && r.holders !== null) fail(`markets.${where}: holders present while capability is false`);
      }
      return [...seen];
    };

    const canonical = (r) => JSON.stringify({ ...r, rank_position: null, rank_score: null, rank_inputs: null });
    const seenState = new Map();

    for (const [tab, wins] of Object.entries(expectedWindows)) {
      if (JSON.stringify(mk.windows?.[tab]) !== JSON.stringify(wins)) fail(`markets.windows.${tab} must be ${wins.join(",")}`);
      if (mk.defaults?.[tab] !== expectedDefaults[tab]) fail(`markets.defaults.${tab} must be ${expectedDefaults[tab]}`);

      const counts = [];
      for (const w of wins) {
        const res = mk.by_window?.[tab]?.[w];
        if (!res) {
          fail(`markets.by_window.${tab}.${w} is missing`);
          continue;
        }
        const where = `${tab}/${w}`;
        if (res.tab !== tab || res.window !== w) fail(`markets.${where}: tab/window echo`);
        if (res.total_count !== res.rows.length) fail(`markets.${where}: total_count != rows.length`);
        if (!isInt(res.limit) || res.limit < 1) fail(`markets.${where}: limit`);
        if (res.next_cursor !== null) fail(`markets.${where}: next_cursor must be null for a single page`);
        if (tab === "trending" && !res.rank) fail(`markets.${where}: rank block missing`);
        if (tab !== "trending" && "rank" in res) fail(`markets.${where}: rank block only belongs to Trending`);

        rowChecks(where, res.rows);
        for (const r of res.rows) {
          const key = r.mint;
          const value = canonical(r);
          if (!seenState.has(key)) seenState.set(key, value);
          else if (seenState.get(key) !== value) fail(`markets: ${r.symbol} differs between windows/tabs`);
        }
        counts.push(res.rows.length);

        if (tab === "trending") {
          if (w === "5m") {
            if (res.rows.length !== 0) fail("markets.trending.5m: must be empty");
            continue;
          }
          const weights = res.rank?.weights || {};
          if (Math.abs(weights.mcap_growth + weights.activity + weights.migration - 1) > 1e-9) fail(`markets.${where}: weights must sum to 1`);
          if (res.rank?.weights_version !== "markets-rank-v1") fail(`markets.${where}: weights_version`);
          if (res.rows.length < 3) fail(`markets.${where}: too few ranked rows`);
          let lastScore = Infinity;
          res.rows.forEach((r, i) => {
            if (r.rank_position !== i + 1) fail(`markets.${where}: rank_position ${r.symbol} should be ${i + 1}`);
            const inputs = r.rank_inputs;
            if (!inputs) {
              fail(`markets.${where}: ${r.symbol} has no rank_inputs`);
              return;
            }
            const g = Math.min(Math.max(inputs.mcap_growth_pct * 2, 0), 100);
            const a = Math.min(inputs.activity_count_window, 50) * 2;
            const mi = inputs.migrated_within_window ? 100 : 0;
            if (inputs.mcap_growth_score !== g) fail(`markets.${where}: ${r.symbol} growth score`);
            if (inputs.activity_score !== a) fail(`markets.${where}: ${r.symbol} activity score`);
            if (inputs.migration_score !== mi) fail(`markets.${where}: ${r.symbol} migration score`);
            const score = Math.round((0.5 * g + 0.3 * a + 0.2 * mi) * 100) / 100;
            if (Math.abs(r.rank_score - score) > 0.001) fail(`markets.${where}: ${r.symbol} rank_score != formula`);
            if (r.rank_score > lastScore) fail(`markets.${where}: ${r.symbol} breaks score order`);
            lastScore = r.rank_score;
            const prev = res.rows[i - 1];
            if (prev && prev.rank_score === r.rank_score && !(prev.mint < r.mint)) fail(`markets.${where}: tie must break on mint asc (${prev.symbol}, ${r.symbol})`);
          });
        } else if (tab === "new") {
          for (let i = 1; i < res.rows.length; i += 1) {
            if (Date.parse(res.rows[i - 1].first_seen_at) < Date.parse(res.rows[i].first_seen_at)) fail(`markets.${where}: not sorted first_seen desc`);
          }
          for (const r of res.rows) {
            if (Date.parse(mk.as_of) - Date.parse(r.first_seen_at) > WINDOW_MS_VALIDATE[w]) fail(`markets.${where}: ${r.symbol} outside the window`);
          }
        } else {
          for (let i = 1; i < res.rows.length; i += 1) {
            if (Date.parse(res.rows[i - 1].migrated_at) < Date.parse(res.rows[i].migrated_at)) fail(`markets.${where}: not sorted migrated desc`);
          }
          for (const r of res.rows) {
            if (r.migrated_at == null) fail(`markets.${where}: ${r.symbol} has no migrated_at`);
            else if (Date.parse(mk.as_of) - Date.parse(r.migrated_at) > WINDOW_MS_VALIDATE[w]) fail(`markets.${where}: ${r.symbol} outside the window`);
          }
        }
      }
      for (let i = 1; i < counts.length; i += 1) {
        if (counts[i] < counts[i - 1]) fail(`markets.${tab}: count is not monotonic across windows`);
      }
    }

    for (const e of mk.empty || []) {
      const res = mk.by_window?.[e.tab]?.[e.window];
      if (!res || res.total_count !== 0 || res.rows.length !== 0 || e.total_count !== 0) fail(`markets.empty ${e.tab}/${e.window} is not empty`);
      if (!String(e.copy_key || "").startsWith("markets.empty.")) fail(`markets.empty ${e.tab}/${e.window} copy_key`);
    }
    if (!(mk.empty || []).some((e) => e.tab === "trending" && e.window === "5m")) fail("markets.empty: no trending 5m case");
    if (!(mk.empty || []).some((e) => e.tab === "graduated" && e.window === "15m")) fail("markets.empty: no graduated 15m case");

    const t1 = mk.by_window?.trending?.["1h"]?.rows || [];
    const n1 = mk.by_window?.new?.["1h"]?.rows || [];
    const g24 = mk.by_window?.graduated?.["24h"]?.rows || [];
    if (!n1.some((r) => Date.parse(mk.as_of) - Date.parse(r.first_seen_at) < 60_000)) fail("markets.new: no row younger than 60 s");
    if (!n1.some((r) => r.migrated_at !== null)) fail("markets.new: no migrated mint that stays in New pairs");
    if (!g24.some((r) => r.price_change_since_migration_pct !== r.price_change_24h_pct)) fail("markets.graduated: since-migration change is not distinguishable");
    if (!t1.some((r) => r.guard_verdict === null)) fail("markets.trending: no guard-not-evaluated row");
    if (!n1.some((r) => r.logo_hash === null)) fail("markets: no no-logo row");
    if (!n1.some((r) => Date.parse(mk.as_of) - Date.parse(r.as_of) > 60_000)) fail("markets: no stale row (>60 s)");
    if (!t1.some((r) => !r.tradeable)) fail("markets.trending: no not-tradeable row");
    if (!n1.some((r) => r.mcap_usd === null)) fail("markets: no null-mcap row");

    const n1Mints = new Set(n1.map((r) => r.mint));
    if (!g24.some((r) => n1Mints.has(r.mint))) fail("markets: expected a mint in both New pairs and Graduated");
  }
  if (data.summary.closed_partial_take_profits < 1) fail("no partial take-profit scenario marked");
  if (data.summary.reconciliation_delta_lamports === "0") fail("reconciliation delta should be non-zero for the partial-TP demo");

  return errors;
}

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, seed: DEFAULT_SEED, stdout: false, check: false, validate: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--stdout") opts.stdout = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--validate") opts.validate = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--out") opts.out = argv[++i];
    else if (a.startsWith("--out=")) opts.out = a.slice("--out=".length);
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a.startsWith("--seed=")) opts.seed = Number(a.slice("--seed=".length));
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(opts.seed) || opts.seed <= 0) throw new Error("--seed must be a positive integer");
  if (!opts.out) throw new Error("--out needs a path");
  return opts;
}

function help() {
  console.log(`Deterministic demo dataset (${DATASET})

  node tools/demo/gen-demo-data.mjs [options]

  --out <path>   write here (default tools/demo/demo-data.json)
  --seed <n>     PRNG seed for mints/logos (default ${DEFAULT_SEED})
  --stdout       print JSON instead of writing
  --check        exit 1 when the file on disk differs from a fresh build
  --validate     run invariants only (no write)

  Fixed anchor: ${ANCHOR_ISO} (2026-11-06 00:00 WIB). Same seed -> same bytes.`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    help();
    return;
  }
  if (opts.check && opts.seed !== DEFAULT_SEED) throw new Error("--check only works with the default seed");

  const data = build(opts.seed);
  const errors = validate(data);
  if (errors.length) {
    console.error(`demo dataset is invalid (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const digest = createHash("sha256").update(json, "utf8").digest("hex");

  if (opts.validate) {
    console.log(`ok: ${data.summary.coins} coins, ${data.summary.open_positions} open, ${data.summary.closed_positions} closed, seed ${opts.seed}`);
    console.log(`markets: ${data.summary.markets_trending} trending, ${data.summary.markets_new} new, ${data.summary.markets_graduated} graduated, ${data.summary.markets_empty_cases} empty cases`);
    console.log(`sha256 ${digest}`);
    return;
  }
  if (opts.stdout) {
    process.stdout.write(json);
    return;
  }

  mkdirSync(dirname(opts.out), { recursive: true });
  const existing = existsSync(opts.out) ? readFileSync(opts.out, "utf8") : null;
  if (opts.check) {
    if (existing === null) {
      console.error(`missing ${opts.out}; run the generator and commit the result`);
      process.exit(1);
    }
    if (existing !== json) {
      console.error(`drift: ${opts.out} does not match seed ${opts.seed} (expected sha256 ${digest})`);
      process.exit(1);
    }
    console.log(`ok: ${opts.out} matches seed ${opts.seed} (sha256 ${digest})`);
    return;
  }

  if (existing === json) {
    console.log(`unchanged: ${opts.out} (sha256 ${digest})`);
    return;
  }
  writeFileSync(opts.out, json, "utf8");
  console.log(`wrote ${opts.out}`);
  console.log(`  seed ${opts.seed}, anchor ${ANCHOR_ISO}`);
  console.log(`  ${data.summary.coins} coins, ${data.summary.open_positions} open, ${data.summary.closed_positions} closed (${data.summary.wins}W/${data.summary.losses}L)`);
  console.log(`  markets: ${data.summary.markets_trending} trending, ${data.summary.markets_new} new, ${data.summary.markets_graduated} graduated`);
  console.log(`  realized ${data.summary.realized_pnl_lamports} + unrealized ${data.summary.unrealized_pnl_lamports} = ${data.summary.total_pnl_lamports} lamports`);
  console.log(`  sha256 ${digest}`);
}

main();
