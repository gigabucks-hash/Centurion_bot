# Demo dataset v1 (deterministic)

**Owner:** Game Dev Specialist **For:** Apex Dev Lead, Product Tester, UX **Version:** 1.0 (6 Nov 2026)
**Scope:** `tools/demo`, this document. No app code, no secrets, no deploy. Paper only.
**Status:** fixture only. Nothing loads it at runtime yet; it is the repeatable input for QA,
screenshots, and stub servers.

## 1. What it is

`node tools/demo/gen-demo-data.mjs` builds one JSON file with a fixed seed and a fixed clock:

| Piece | Content |
|---|---|
| `coins` | 12 synthetic coins, 10 with `logo_hash` + `logo_url`, 2 without a logo (identicon), 1 untradeable |
| `positions_open` | 5 open positions, one with a partial take-profit, one at exactly 0 PnL, one deep loss |
| `positions_closed` | 25 closed trades across the 30-day window, 16 wins / 9 losses, 6 with a partial take-profit |
| `windows` | `1h`, `24h`, `7d`, `30d`, `all` with the closed rows and a `PnlSummary`-shaped object each |
| `empty_range` | a 48 h hole in the ledger that must return zero closed rows |
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

`--seed` changes mints and logos only (the trade profiles are fixed); `--check` refuses a
non-default seed on purpose.

## 3. Determinism contract

| Rule | Value |
|---|---|
| Anchor ("now") | `2026-11-05T17:00:00.000Z` = 6 Nov 2026 00:00 WIB |
| Seed | `1337` |
| Wall clock / locale / randomness | never read |
| Line endings / encoding | LF, ASCII only |
| Default output sha256 | `c1cdcbb47775d11e41b87ec5db047bb3e3f1e4458bfff350dee271e6bfcc18b5` |

Two runs on two machines produce the same bytes; `--check` is the gate. The anchor is fixed on
purpose: a moving "now" would break screenshot baselines and make "30 days" mean something
different every morning.

## 4. Top-level schema

```jsonc
{
  "meta": { "dataset", "schema_version", "seed", "anchor", "anchor_wib", "mode",
            "practice_epoch", "workspace_id", "generator", "docs", "note" },
  "summary": { "coins", "strategies", "open_positions", "closed_positions", "wins", "losses",
               "open_partial_take_profits", "closed_partial_take_profits",
               "unrealized_pnl_lamports", "realized_pnl_lamports", "total_pnl_lamports",
               "ledger_closed_pnl_lamports", "reconciliation_delta_lamports" },
  "strategies": [ { "id", "key", "name", "mode" } ],
  "coins": [ CoinWire ],
  "positions_open": [ PositionWireView ],
  "positions_closed": [ PositionWireView ],
  "windows": { "1h" | "24h" | "7d" | "30d" | "all": WindowEntry },
  "empty_range": { "from", "to", "closed_count", "pnl_summary", "note" },
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

## 8. Using it

For screenshots and UI assertions, pick the numbers from the tables above or read them with Node:

```bash
node -e "const d=require('./tools/demo/demo-data.json');console.log(d.windows['7d'].pnl_summary)"
node -e "const d=require('./tools/demo/demo-data.json');console.log(d.positions_closed.filter(r=>r.partial_tp).map(r=>r.position_key))"
```

Mapping to endpoints when a stub is wired:

| Response | Source |
|---|---|
| `GET /coins` | `coins` |
| `GET /positions?state=open` | `positions_open` |
| `GET /positions?state=closed&window=7d` | `positions_closed` filtered by the window `from` |
| `GET /stats/pnl?window=7d` | `windows["7d"].pnl_summary` |
| `GET /stats/pnl?from=&to=` | `empty_range.pnl_summary` for the empty case |

There is no runtime loader in the apps yet. Do not change app code to consume this file without a
task that says so; today it is the expected-value fixture for QA and the seed for a future stub.

## 9. Limitations

1. Logo URLs are the real proxy shape but the mints are synthetic, so the proxy returns
   `LOGO_NOT_FOUND`; identicon is the correct rendering. No image bytes are shipped.
2. `as_of_seq` (`"4242"`) and `ts` are placeholders.
3. `partial_tp_legs` is metadata; there are no per-leg order/fill rows and no event stream.
4. No receipts beyond the closed position fields (no per-trade event list).
5. Bot filter is not modelled as an endpoint; filter `positions_closed[].strategy_id` yourself.
6. The dataset is demo-only: never point it at `mode=real`, never treat a mint as tradable.

## 10. Changing the fixture

1. Edit the profile tables in `tools/demo/gen-demo-data.mjs` (or `--seed` for mints/logos).
2. Run the generator; it validates every invariant before writing.
3. Commit the script **and** `demo-data.json` in the same change; update the sha256 and the
   expected-numbers table here.
4. Do not hand-edit the JSON: `--check` compares bytes and will fail.
