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
const SCHEMA_VERSION = "1.0";

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
    },
    strategies: STRATEGIES.map((s, i) => ({ id: strategyId(i), key: s.key, name: s.name, mode: "practice" })),
    coins,
    positions_open: openSorted,
    positions_closed: closedSorted,
    windows,
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
  console.log(`  realized ${data.summary.realized_pnl_lamports} + unrealized ${data.summary.unrealized_pnl_lamports} = ${data.summary.total_pnl_lamports} lamports`);
  console.log(`  sha256 ${digest}`);
}

main();
