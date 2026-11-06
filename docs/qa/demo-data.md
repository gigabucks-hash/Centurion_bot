# Demo dataset v1.2 (deterministic)

**Owner:** Game Dev Specialist **For:** Apex Dev Lead, Product Tester, UX **Version:** 1.2 (6 Nov 2026)
**Scope:** `tools/demo`, this document. No app code, no secrets, no deploy. Paper only.
**Status:** fixture only. Nothing loads it at runtime yet; it is the repeatable input for QA,
screenshots, and stub servers. **Schema stays 1.1** (additive fixture fields only).

## 1. What it is

`node tools/demo/gen-demo-data.mjs` builds one JSON file with a fixed seed and a fixed clock:

| Piece | Content |
|---|---|
| `coins` | 12 synthetic coins, 10 with `logo_hash` + `logo_url`, 2 without a logo (identicon), 1 untradeable |
| `positions_open` | 5 open positions, one with a partial take-profit, one at exactly 0 PnL, one deep loss |
| `positions_closed` | 25 closed trades across the 30-day window, 16 wins / 9 losses, 6 with a partial take-profit |
| `windows` | `1h`, `24h`, `7d`, `30d`, `all` with the closed rows and a `PnlSummary`-shaped object each |
| `empty_range` | a 48 h hole in the ledger that must return zero closed rows |
| `markets` | discovery feed v1: Trending / New pairs / Graduated for every supported window, plus two empty states |
| `strategies` | 3 strategies with `status` + `rev`: one **paused**, one paused-then-resumed (running), one never paused |
| `strategy_events` | the `strategy.paused` / `strategy.resumed` envelopes behind those statuses (D5) |
| `coin_trails` | full `/coins/[mint]` trail for `ORBIT` (buy -> partial take-profit -> sell) and a blocked `FLUX` trail (screener only) |
| `summary` | counts and the exact workspace snapshot (realized + unrealized = total) |
| `scenarios` | named pointers for the cases above, so a test can find them without guessing |

Non-goals: it is not a Postgres seed, not an event stream, and not real market data. Every mint,
price, wallet, and order is synthetic.

## 2. Files and commands

| File | Role |
|---|---|
| `tools/demo/gen-demo-data.mjs` | generator, zero dependencies, Node >= 20 |
| `tools/demo/demo-data.json` | committed output of the default seed (byte-exact) |
| `docs/qa/demo-data.md` | this document |

```bash
node tools/demo/gen-demo-data.mjs             # write/refresh demo-data.json
node tools/demo/gen-demo-data.mjs --stdout    # print instead of writing
node tools/demo/gen-demo-data.mjs --validate   # invariants + sha256, no write
node tools/demo/gen-demo-data.mjs --check      # exit 1 if the committed file drifted
node tools/demo/gen-demo-data.mjs --out /tmp/demo.json
```

`--seed` changes mints and logos only (the trade and market profiles are fixed); `--check`
refuses a non-default seed on purpose.

## 3. Determinism contract

| Rule | Value |
|---|---|
| Anchor ("now") | `2026-11-05T17:00:00.000Z` = 6 Nov 2026 00:00 WIB |
| Seed | `1337` |
| Wall clock / locale / randomness | never read |
| Line endings / encoding | LF, ASCII only |
| `meta.schema_version` | `1.1` (unchanged by this additive extension) |
| Default output sha256 | `ed796e8681f000dd6e6556c3f8e45e77b854e9ef65084ffb8b851359562bcebd` |
| Default output size | 175 801 bytes |

Two runs on two machines produce the same bytes; `--check` is the gate. The anchor is fixed on
purpose: a moving "now" would break screenshot baselines and make "30 days" mean something
different every morning. Market row order is derived (score, then mint) - never from object
iteration or the clock.

## 4. Top-level schema

```jsonc
{
  "meta": { "dataset", "schema_version", "seed", "anchor", "anchor_wib", "mode",
            "practice_epoch", "workspace_id", "generator", "docs", "note" },
  "summary": { "coins", "strategies", "open_positions", "closed_positions", "wins", "losses",
               "open_partial_take_profits", "closed_partial_take_profits",
               "unrealized_pnl_lamports", "realized_pnl_lamports", "total_pnl_lamports",
               "ledger_closed_pnl_lamports", "reconciliation_delta_lamports",
               "markets_trending", "markets_new", "markets_graduated",
               "markets_market_only_mints", "markets_empty_cases",
               "strategies_paused", "strategy_pause_events", "strategy_resume_events",
               "coin_trails", "coin_trail_events" },
  "strategies": [ { "id", "key", "name", "mode", "status", "rev", "created_at", "updated_at" } ],
  "strategy_events": [ EventEnvelope ],
  "coins": [ CoinWire ],
  "positions_open": [ PositionWireView ],
  "positions_closed": [ PositionWireView ],
  "windows": { "1h" | "24h" | "7d" | "30d" | "all": WindowEntry },
  "empty_range": { "from", "to", "closed_count", "pnl_summary", "note" },
  "markets": Markets,
  "coin_trails": [ CoinTrail ],
  "scenarios": [ { "id", "expect", "pointers" } ]
}
```

`mode` is always `practice` and `practice_epoch` is `1`. No row is real.

## 5. Wire shapes

### 5.1 `coins[]`

`CoinWire` from `apps/web/lib/contracts.ts` including contracts 1.1.4/1.1.6 fields:
`mint`, `venue` (`curve` | `amm`), `launchpad`, `decimals`, `token_program`, `quote_mint`,
`tradeable`, `skip_reason`, `untrusted.symbol`, `untrusted.name`, plus the mock display extras
`strategy_id`, `strategy_name`, `mode`, `status`, `last_event_at`, `pnl_lamports`,
`mcap_source`, `market_cap_lamports`, `mcap_usd`, `mcap_as_of`, `logo_hash`, `logo_url`.

Logo rule (contracts 1.1.6): `logo_hash` and `logo_url` are both set or both `null`.
`logo_url` is exactly `/v1/img/coin/{mint}?s=96&v={logo_hash}`. A null pair means identicon and
no image request. Mints start with `demo` (valid base58, 44 chars) so nobody mistakes them for a
live account; the logo proxy will 404 for them, which is the intended identicon path.

`FLUX` is the "Not tradeable" case: `tradeable: false`, `skip_reason: "UNSUPPORTED_QUOTE_MINT"`,
`quote_mint` set to USDC.

### 5.2 `positions_open[]`, `positions_closed[]`

`PositionWire` plus the `PositionWireView` display extras used by the clients
(`untrusted.symbol`, `strategy_name`, `mark_price_sol`, `unrealized_pnl_lamports`,
`unrealized_pnl_pct`, `sold_bps`, `stop_loss_pct`, `peak_trail_pct`).

Money and time rules, identical to the backend (`0022_pnl_report.sql`):

| Field | Rule |
|---|---|
| `pnl_lamports` | closed: `sol_out_lamports - sol_in_lamports`; open: `null` |
| `pnl_pct` | closed: `round(pnl * 100 / sol_in, 2)`; `null` when `sol_in = 0` or the row is open |
| `hold_seconds` | closed: `closed_at - opened_at` in seconds; open: `null` |
| `fees_lamports` | reported context only. The swap fee is already inside `sol_in` / `sol_out`; never subtract it again |
| open `sol_out_lamports` | proceeds of the partial sells so far (`0` without a partial) |
| open `cost_basis_lamports` | cost of the remaining quantity |
| `qty_raw` | integer string; `"0"` once closed |
| lamports | always decimal strings, never numbers |
| `practice_epoch` | `1` |

Closed rows are ordered newest first (`closed_at` desc). To verify a row:
`pnl == sol_out - sol_in`, `pnl_pct == round(pnl*100/sol_in, 2)`.

`partial_tp` and `partial_tp_legs` are **demo extras**, not contract fields. They describe the
ladder that produced the final number:

```json
"partial_tp": true,
"partial_tp_legs": [ { "sold_bps": 4000, "gain_pct": 24 }, { "sold_bps": 6000, "gain_pct": -2 } ]
```

`pnl_lamports` is the exact sum of the legs, so a partial win can still end below the first rung
(`demo-001-orbit`: +8.4 % total, first rung +24 %).

### 5.3 `windows.*`

```jsonc
{
  "pnl_summary": PnlSummary,         // wire shape; safe to return from a stub as-is
  "closed_position_keys": [ "..." ] // demo extra: exactly the rows in this window
}
```

`pnl_summary` follows `GET /stats/pnl` (`mode`, `practice_epoch`, `window`, `from`, `to`,
`unrealized_*`, `realized_*`, `total_*`, `realized_pnl_window_lamports`, `closed_count`,
`win_count`, `win_rate_pct`, `avg_hold_s`, `fees_lamports`, `best_pnl_lamports`,
`worst_pnl_lamports`, `as_of_seq`, `ts`).

Two rules the fixture demonstrates on purpose:

- **Snapshot vs range:** `unrealized_*`, `realized_pnl_lamports` and `total_pnl_lamports` are the
  workspace + mode snapshot and are identical in every window. Only
  `realized_pnl_window_lamports` and the counts/holds narrow. Removing
  `closed_position_keys` gives a stubbable response.
- **Empty range is not zero percent:** with `closed_count = 0`, `win_rate_pct` and `avg_hold_s`
  are `null`, `best/worst` are `null`. Never render 0 %.

`as_of_seq` is the synthetic string `"4242"` and `ts` is the anchor; both exist so the field is
present, not to model a real stream position.

### 5.4 `markets`

One state table (`MARKET_ROWS`) is rendered per tab and window, so a mint keeps the same mcap,
logo, guard, and activity everywhere it appears. The envelope follows the UX spec B11 shape:

```jsonc
{
  "as_of": "2026-11-05T17:00:00.000Z",   // feed time (anchor)
  "server_now": "2026-11-05T17:00:00.000Z",
  "as_of_seq": "4242",                   // placeholder stream position
  "next_poll_ms": 10000,                 // polling fallback when SSE is absent
  "capabilities": { "change_pct", "activity", "volume", "liquidity", "holders", "guard", "launchpad" },
  "windows": { "trending": [...], "new": [...], "graduated": [...] },
  "defaults": { "trending": "1h", "new": "1h", "graduated": "24h" },
  "by_window": {
    "trending": { "5m"|"1h"|"24h": MarketResponse },
    "new": { "15m"|"1h"|"6h"|"24h": MarketResponse },
    "graduated": { "15m"|"1h"|"6h"|"24h": MarketResponse }
  },
  "empty": [ { "tab", "window", "total_count", "copy_key", "note" } ],
  "note": "why markets.empty.new is not reachable from this fixture"
}
```

`MarketResponse` is what a stub returns for `GET /markets?tab=&window=`:

```jsonc
{
  "tab": "trending",           // echoes the requested tab
  "window": "1h",              // echoes the requested window
  "total_count": 10,           // == rows.length (one page, no cursor)
  "limit": 100,                // 100 Trending / 50 the other tabs
  "next_cursor": null,         // v1 fits one page; paging is additive later
  "rank": { ... },             // Trending only; absent on New pairs and Graduated
  "rows": [ MarketRow ]
}
```

`markets.windows` is the authoritative window list per tab; `markets.defaults` is the tab's
initial window. Only these combinations are materialised - do not invent `trending/15m` or
`new/5m`.

#### Market row fields

| Field | Rule |
|---|---|
| `mint` | synthetic base58, starts with `demo`, unique within a tab |
| `symbol`, `name` | from the coin table, or the market-only mint table |
| `logo_hash`, `logo_url` | both set or both `null`; the same pair contract as `coins[]` |
| `launchpad` | `pumpfun` \| `raydium` |
| `venue` | `curve` before migration, `amm` after; a graduated mint stays `amm` even in New pairs |
| `first_seen_at`, `migrated_at` | ISO; `migrated_at` is `null` on the curve |
| `market_cap_lamports` | decimal string derived from `mcap_usd` at the fixture's fixed 200 USD/SOL; `null` when unknown |
| `mcap_usd` | decimal string or `null`; never `0` as a stand-in for "unknown" |
| `mcap_source` | `curve` \| `pool` \| `unavailable` |
| `mcap_as_of` | ISO or `null`; follows the mcap, not the row |
| `price_change_5m_pct`, `price_change_1h_pct`, `price_change_24h_pct` | percent number or `null` |
| `price_change_since_migration_pct` | percent since graduation; the Graduated tab uses this, not 24h |
| `volume_lamports_24h`, `liquidity_lamports`, `holders`, `trades_24h` | always `null` in v1 (no volume/liquidity/holder/trade feed); never `0` |
| `activity_count_window` | screening events inside the window, not market trades |
| `guard_verdict` | `PASS` \| `WARN` \| `FAIL` \| `null` (never screened -> "Not evaluated", never "Guard failed") |
| `guard_score` | `0..100` or `null`; null exactly when the verdict is null |
| `tradeable`, `skip_reason` | `false` carries a reason; the row stays visible with neutral treatment |
| `as_of` | **fixture extra:** per-row freshness; older than 60 s drives the row-level Stale flag |
| `rank_position`, `rank_score`, `rank_inputs` | Trending only; `null` on New pairs and Graduated |

#### Capabilities

| Capability | Value | Meaning |
|---|---|---|
| `change_pct` | `true` | the three window changes and since-migration are real fields |
| `activity` | `true` | screening-event count is present |
| `guard` | `true` | verdict/score present when screened |
| `launchpad` | `true` | launchpad is known |
| `volume`, `liquidity`, `holders` | `false` | the matching row fields are `null`; clients hide the metric |

#### Ranking (Trending only)

`rank.weights_version` is `markets-rank-v1`; clients must read the version before trusting scores.

| Item | Value |
|---|---|
| Weights | `mcap_growth 0.5`, `activity 0.3`, `migration 0.2` (sum 1) |
| `mcap_growth_score` | `clamp(mcap_growth_pct * 2, 0, 100)` |
| `activity_score` | `min(activity_count_window, 50) * 2` |
| `migration_score` | `100` when the mint graduated inside the window, else `0` |
| `rank_score` | `0.5 * mcap_growth_score + 0.3 * activity_score + 0.2 * migration_score`, rounded to 2 dp |
| Sort | `rank_score` desc, then mint ascending (stable, locale-free) |
| `rank_inputs` | the raw growth/activity/migration inputs plus the three normalized scores, so QA can recompute the score |

The migration term is window-relative, so the order legitimately changes between 1h and 24h:
`NOVA` and `CRATE` graduated inside 24h but not inside 1h. `markets.trending.5m` has no rows
(fewer than 5 observations) but keeps the `rank` metadata so the client can render the empty
copy with the right weights version.

### 5.5 `strategies[]` and `strategy_events[]` (D5 pause/resume)

`strategies[]` keeps its old 3 rows and adds the wire fields a pause/resume UI reads:
`status` (`draft | running | paused | archived`), `rev`, `created_at`, `updated_at`.

| Strategy | `status` | `rev` | What it exercises |
|---|---|---|---|
| `dip` / Dip Sniper | `paused` | 4 | the **Resume** action; last event is `strategy.paused` at `2026-11-05T15:00:00.000Z` |
| `grad` / Grad Runner | `running` | 5 | paused at `2026-11-05T09:00:00.000Z` (rev 4) then resumed at `2026-11-05T10:00:00.000Z` (rev 5) |
| `ladder` / Fast Ladder | `running` | 2 | never paused; no lifecycle event |

`strategy_events[]` holds the exact envelopes (`strategy.paused`, `strategy.resumed`) that produced
those states, oldest first. Every envelope is `version: 2`, `mode: "practice"`, `actor: "user"`,
`mint: null`, `logo_hash: null`, `logo_url: null`, and `payload = { rev, base_rev, status }`.
The latest event for a strategy must match its `status`, `rev`, and `updated_at` exactly; the
validator enforces that. `status` inside `payload` is the status after the event (`paused` for a
pause, `running` for a resume), not the previous one.

### 5.6 `coin_trails[]` (`/coins/[mint]`)

Each trail is the deterministic event list a stub can return from
`GET /coins/{mint}/timeline?mode=practice&limit=500`, plus the coin metadata the detail page needs.
Counts of `coins` / `positions_*` do not change.

```jsonc
{
  "mint", "symbol", "state": "closed" | "blocked", "position_key", "strategy_id",
  "logo_hash", "logo_url", "mode": "practice", "first_event_at", "last_event_at",
  "events": [ EventEnvelope ]
}
```

| Trail | `state` | Events | What it proves |
|---|---|---|---|
| `ORBIT` | `closed` | `coin.detected` -> `screener.scored` -> `position.opened` -> `exit.triggered` (partial) -> `position.closed` | buy, partial take-profit, and final sell with UTC timestamps |
| `FLUX` | `blocked` | `coin.detected` -> `screener.scored` (`tradeable: false`, `skip_reason: UNSUPPORTED_QUOTE_MINT`) | the detail page explains "Not tradeable" before any buy; no invented position |

Every event has `version: 2`, `mode: "practice"`, `workspace_id`, the trail mint, and the **same**
`logo_hash` / `logo_url` pair as its coin row (a null pair stays null). `untrusted.symbol` matches
the coin. `seq` is a deterministic integer string; `id` is `<mint-or-strategy>:<epoch_ms>:<type>`.
The complete trail uses the real closed row `demo-001-orbit`:

| Event | UTC | Amounts |
|---|---|---|
| `position.opened` | `2026-11-05T03:00:00.000Z` | buy `sol_lamports` = the row's `sol_in_lamports` |
| `exit.triggered` | `2026-11-05T07:30:00.000Z` | `sell_portion_pct: 40`, `pnl_lamports` = the first ledger leg (40 % at +24 %), `partial: true` |
| `position.closed` | `2026-11-05T12:00:00.000Z` | `sol_out_lamports`, `pnl_lamports`, `pnl_pct`, `exit_reason`, `hold_seconds` exactly match the ledger row |

The validator also checks the order (buy < partial < sell), the partial percentage (0 < x < 100),
and that the partial PnL equals `sol_in * sold_bps * gain_pct / 1e6` for that leg.

### 5.7 Tradeability states

`FLUX` is the blocked coin and keeps its explicit reason:
`tradeable: false`, `skip_reason: "UNSUPPORTED_QUOTE_MINT"`, `quote_mint: <USDC mint>`.
Every other coin is the control: `tradeable: true`, `skip_reason: null`. The validator rejects a
blocked coin with an empty/missing reason, a reason that is just `"0"`/`"0%"`, or a tradeable coin
with a reason. `coins[].tradeable` / `skip_reason` are the same fields the web passes through when
the backend adds them; `screener.scored` in the trail repeats them so the detail page can show the
state without a second lookup.

## 6. Expected numbers (default seed)

| Item | Value |
|---|---|
| Coins / strategies | 12 / 3 |
| Open / closed | 5 / 25 |
| Win / loss | 16 / 9 (64.0 % win rate) |
| Realized snapshot | `6070400000` lamports (6.0704 SOL) |
| Unrealized snapshot | `-527900000` lamports (-0.5279 SOL) |
| Total snapshot | `5542500000` lamports (5.5425 SOL) |
| Sum of closed rows | `5710400000` lamports (5.7104 SOL) |
| Reconciliation delta | `360000000` lamports (0.36 SOL, from the open partial) |
| Fees (all, reported) | `770000000` lamports (0.77 SOL) |

| Window | Closed | Win rate | Range realized (lamports) | Avg hold |
|---|---|---|---|---|
| `1h` | 0 | `null` | `0` | `null` |
| `24h` | 3 | 66.7 | `962400000` | 33 600 s |
| `7d` | 15 | 66.7 | `3789400000` | 49 440 s |
| `30d` | 25 | 64.0 | `5710400000` | 61 488 s |
| `all` | 25 | 64.0 | `5710400000` | 61 488 s |

Empty custom range: `2026-10-24T05:00:00.000Z` .. `2026-10-26T05:00:00.000Z`
(24 Oct 12:00 WIB .. 26 Oct 12:00 WIB), `closed_count = 0`.

### 6.1 Markets counts (default seed)

18 market states: 10 also have a `/coins` row, 8 are market-only mints
(`GRAIN`, `SPORE`, `CRATE`, `PULSE`, `VAPOR`, `EMBER`, `MOSSY`, `SABLE`).

| Tab | 5m | 15m | 1h | 6h | 24h |
|---|---|---|---|---|---|
| Trending | 0 | - | 10 | - | 10 |
| New pairs | - | 4 | 8 | 10 | 12 |
| Graduated | - | 0 | 1 | 2 | 7 |

Default windows: Trending `1h` (10 rows), New pairs `1h` (8), Graduated `24h` (7).

Lifecycle and trail counts: `strategies_paused = 1`, `strategy_pause_events = 2`,
`strategy_resume_events = 1`, `coin_trails = 2`, `coin_trail_events = 7`.

Trending 1h order (score): `GRAIN 74.2`, `MOCHI 62.6`, `NOVA 57.2`, `ORBIT 57.2`,
`SPORE 55.4`, `KELP 53`, `CRATE 40.6`, `BREW 32.1`, `FLUX 10.4`, `PULSE 1.8`.
`NOVA` and `ORBIT` tie at 57.2; mint ascending puts `NOVA` first.

Trending 24h order: `NOVA 77.2`, `GRAIN 74.2`, `MOCHI 62.6`, `CRATE 60.6`, `ORBIT 57.2`,
`SPORE 55.4`, `KELP 53`, `BREW 32.1`, `FLUX 10.4`, `PULSE 1.8`.

Empty states: `markets.by_window.trending["5m"]` and `markets.by_window.graduated["15m"]` both have
`rows: []`, `total_count: 0`. Copy keys: `markets.empty.trending`, `markets.empty.graduated`.
`markets.empty.new` is deliberately unreachable here (a pair is 45 s old); stub an override to
test that copy.

## 7. Scenarios

| `scenarios[].id` | What it proves | Pointer |
|---|---|---|
| `empty-1h` | empty standard window, null win rate | `windows.1h` |
| `empty-custom-range` | empty `from`/`to` page, no rows | `empty_range` |
| `partial-tp-closed` | total PnL = sum of rungs; last rung can be negative | 6 `position_key`s |
| `partial-tp-open` | `sold_bps > 0` while `pnl_lamports` is `null`; its realized part is already in the snapshot | `demo-o01-mochi` |
| `losses` | negative PnL keeps its sign | 9 `position_key`s |
| `no-logo` | `logo_hash`/`logo_url` null, identicon, no request | `LUMA`, `WISP` |
| `untradeable` | `tradeable: false` + `skip_reason` | `FLUX` |
| `zero-pnl-open` | 0 unrealized stays neutral, not a 0 % win | `demo-o03-brew` |
| `strategy-paused` | current status `paused` + a `strategy.paused` event; the row offers Resume | `dip:rev4` |
| `strategy-resumed` | status `running` after pause -> resume; both events and rev 4 -> 5 | `grad:rev5` |
| `tradeable-control` | a tradeable=true, skip_reason=null coin beside the blocked one | `ORBIT` (and 10 more) |
| `coin-trail-partial-tp` | buy -> partial take-profit -> sell, with consistent logo pair | `ORBIT` |
| `coin-trail-not-tradeable` | trail stops at screener with tradeable=false + explicit reason; no buy | `FLUX` |
| `markets-trending-ranks` | rank 1..10 asc, score recomputable from `rank_inputs` | 10 `rank_position:symbol` |
| `markets-trending-empty` | Trending 5m returns zero rows and `total_count: 0` | `markets.by_window.trending["5m"]` |
| `markets-graduated-empty` | Graduated 15m returns zero rows | `markets.by_window.graduated["15m"]` |
| `markets-new-young` | a 45 s-old pair gets the New chip | `SPORE` |
| `markets-migrated-still-new` | a graduated mint stays in New pairs and still shows `venue: amm` | `GRAIN`, `MOCHI` |
| `markets-since-migration` | Graduated uses `price_change_since_migration_pct`, not 24h | `GRAIN`, `NOVA` |
| `markets-market-only-guard-null` | never-screened mint -> "Not evaluated", not "Guard failed" | `CRATE` |
| `markets-null-mcap` | null mcap renders an em dash, no invented rate | `VAPOR` |
| `markets-null-change` | null change renders an em dash | `VAPOR` |
| `markets-stale-row` | row `as_of` 95 s old keeps its row and flags Stale | `MOCHI` |
| `markets-not-tradeable` | untradeable row stays visible with a neutral treatment | `FLUX` |
| `markets-no-logo` | null logo pair -> identicon and no image request | `PULSE`, `WISP`, `GRAIN`, `VAPOR` |

## 8. Using it

For screenshots and UI assertions, pick the numbers from the tables above or read them with Node:

```bash
node -e "const d=require('./tools/demo/demo-data.json');console.log(d.windows['7d'].pnl_summary)"
node -e "const d=require('./tools/demo/demo-data.json');console.log(d.positions_closed.filter(r=>r.partial_tp).map(r=>r.position_key))"
node -e "const d=require('./tools/demo/demo-data.json');console.log(d.markets.by_window.trending['1h'].rows)"
node -e "const d=require('./tools/demo/demo-data.json');console.log(d.strategies.map(s=>[s.key,s.status,s.rev]))"
node -e "const d=require('./tools/demo/demo-data.json');const t=d.coin_trails.find(t=>t.symbol==='ORBIT');console.log(t.events.map(e=>[e.type,e.ts]))"
```

Mapping to endpoints when a stub is wired:

| Response | Source |
|---|---|
| `GET /coins` | `coins` |
| `GET /positions?state=open` | `positions_open` |
| `GET /positions?state=closed&window=7d` | `positions_closed` filtered by the window `from` |
| `GET /stats/pnl?window=7d` | `windows["7d"].pnl_summary` |
| `GET /stats/pnl?from=&to=` | `empty_range.pnl_summary` for the empty case |
| `GET /markets?tab=trending&window=1h` | `markets.by_window.trending["1h"]`, wrapped with `as_of`, `server_now`, `as_of_seq`, `next_poll_ms`, `capabilities` |
| `GET /markets?tab=new&window=15m` | `markets.by_window.new["15m"]` (4 rows) |
| `GET /markets?tab=graduated&window=15m` | `markets.by_window.graduated["15m"]` (empty state) |
| `GET /strategies?mode=practice` | `strategies` (3 rows, with `status` + `rev`) |
| `GET /events` (strategy lifecycle slice) | `strategy_events` (pause/resume envelopes; filter by `type`) |
| `GET /coins/{mint}/timeline?mode=practice&limit=500` | `coin_trails.find(t => t.mint === mint).events` |
| `GET /coins/{mint}` | the matching row in `coins` (logo pair + `tradeable`/`skip_reason`) |
| `GET /positions/{id}` | `positions_closed` or `positions_open` by `id` (for trail references) |

Window options and defaults come from `markets.windows` / `markets.defaults`, not from a hard-coded
client list. Market rows carry no `mode`: do not apply the screener mode chip to this feed.
`strategy_events` and each trail's `events` are `EventEnvelope`-shaped, so a stub can return them
without reshaping; there is no global feed in this fixture (compose one from both arrays if needed).

There is no runtime loader in the apps yet. Do not change app code to consume this file without a
task that says so; today it is the expected-value fixture for QA and the seed for a future stub.

## 9. Limitations

1. Logo URLs are the real proxy shape but the mints are synthetic, so the proxy returns
   `LOGO_NOT_FOUND`; identicon is the correct rendering. No image bytes are shipped.
2. `as_of_seq` (`"4242"`) and `ts` are placeholders.
3. `partial_tp_legs` is metadata; per-leg order/fill rows are not modelled. Event envelopes exist
   only inside `strategy_events` and `coin_trails`, not as a complete `/events` feed.
4. No receipts beyond the closed position fields (no per-trade event signature/transaction).
5. Bot filter is not modelled as an endpoint; filter `positions_closed[].strategy_id` yourself.
6. The dataset is demo-only: never point it at `mode=real`, never treat a mint as tradable.
7. Markets materialises only the tab/window pairs in `markets.windows`. Other combinations
   (`trending/15m`, `new/5m`, ...) are out of scope for v1; the client disables them.
8. Markets are market-wide and mode-less. There is no `mode`, strategy, or workspace field on a
   market row, and the feed must not be filtered by the screener's mode chip.
9. Market `as_of` (per row) and `skip_reason` are fixture extras: they are the proposed shape for
   row freshness and the untradeable reason, not contract fields that exist on the current endpoint.
10. `volume_lamports_24h`, `liquidity_lamports`, `holders`, and `trades_24h` are always `null` in
    v1 and the first three are flagged `false` in `capabilities`. Rendering `0` would invent data.
11. `market_cap_lamports` is converted from the synthetic USD number at a fixed 200 USD/SOL; it is
    not a quote and carries no exchange rate history.
12. The ranking formula is the v1 fixture contract (`markets-rank-v1`). A backend with a different
    `weights_version` must not be compared against these scores.
13. Strategy `status`/`rev` and the pause/resume events are fixture state for D5. They do not claim
    that the paper API has a pause endpoint; the web uses its mock BFF for that flow today.
14. Event `seq` values are deterministic placeholders starting at `9001`. They are unique and sorted
    within this fixture, but they are not a server watermark and must not be compared with
    `markets.as_of_seq`.
15. Only `ORBIT` has a complete trail and only `FLUX` has a blocked trail. Other mints intentionally
    have no trail; `/timeline` should return an empty page for them, not invented rows.
16. `position.opened.fill` is a paper fill with no signature or transaction id. The SOL/token
    amounts are fixture numbers, not an on-chain quote.

## 10. Changing the fixture

1. Edit the profile tables in `tools/demo/gen-demo-data.mjs` (`MARKET_ROWS`, `MARKET_ONLY` for the
   feed; `STRATEGY_LIFECYCLE` for pause/resume; `TRAIL_COIN` / `BLOCKED_TRAIL_COIN` for trails) or
   use `--seed` for mints/logos. Keep `SCHEMA_VERSION` at `1.1` unless the schema itself changes.
2. Run the generator; it validates every invariant before writing (including strategy status vs its
   last event, the buy/partial/sell order, the ledger amounts, and the logo pair on every event).
3. Commit the script **and** `demo-data.json` in the same change; update the sha256, the byte size,
   and the expected-numbers tables here.
4. Do not hand-edit the JSON: `--check` compares bytes and will fail.