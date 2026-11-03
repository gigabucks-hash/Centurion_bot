# Strategy Spec v1 mapping (Centurion Trade P1 engine, paper only)

Status: **design / mapping only, rev 2** (2026-11-03 ~14:50 WIB, Backend). Nothing here is built yet; the engine is
built after the repo-wide rename. Source: `/workspace/sentra-inbox/STRATEGY_SPEC_V1_CONSOLIDATED.txt`.

## Rev 2 changelog (2026-11-03)

Precedence: **YUMI CONSOLIDATED REVIEW (FINAL, 14:44) > YUMI TRADING DECISIONS (14:44) > APEX TECH DECISIONS (14:30) >
spec v1 + rev 1 assumptions.** Where answers conflict, the later one is used and the conflict is noted (R2-1...).

- Gaps G-1..G-19 from rev 1 are all **resolved** (§6.1, one line each; the rev 1 text is superseded).
- Changed values from the FINAL review:
  - Dev window is 72 h (not 24 h).
  - MC = circulating = (total - burned) x pool price.
  - LP safe = burned + whitelisted-locker-locked >= 95 % for **both** A and B (was burn-only, and B was 90 %).
  - Safety floor is 70 for A and B (was 65/60). Momentum floor is 55 for A and B (was A 50).
  - A graduation age is 6 h to 7 d (no max before).
  - A 1 h vol/MC must be 0.1-2.0 (was not required).
  - Caps: A single entity 5 % / dev 2 %; B single entity 10 % / dev 5 %.
  - Token-2022: A transfer fee 0 bps / B 1 %, plus 5 more rejected extensions.
- New Guard checks G1-G13:
  - launch layers / bundlers / snipers
  - serial launcher
  - entity clustering
  - dev locks / vesting
  - wash trading
  - Jupiter round trip
  - all-pool audit
  - DESSA, fresh-wallet transfers, copycat CAs
- Guard and Momentum are **required** (never renormalised). Only Smart Money and Narrative renormalise.
- New Scout A filters: anti-top, vol/MC band, grad-age max.
- New Momentum spec: sample minimums, scoring, a new low during the delay = 0 and skip. Safety deduction scoring added.
- New Exit Manager rules: liquidity exit and insider exit.
- New paper fill model: G-17 delay and adverse slippage.
- New §7: **cost flags.** RPC cost per candidate, with an estimated call count and a mitigation for each.
- Jupiter quote: free with no key, `GET https://api.jup.ag/swap/v2/order` (verified live).
- New ambiguities R2-1..R2-20 (§8).

Rules (unchanged):
- TRADING_MODE=paper only; the live stub stays off.
- No keys, signing, transactions or wallet connection.
- Free or existing access only. Anything needing paid spend stops for Apex (§7).

Units: SOL amounts are lamport integer strings (`*_lamports`); % are numbers in percent; durations are seconds
(`*_s`) unless an existing key says minutes; USD values are numbers (filter/display only, never used for fills).

Sources used in the tables:
- **PP**: PumpPortal free data WS (primary for new mints and graduations)
- **HWS**: Helius standard WS (fallback feed; `accountSubscribe` for prices)
- **RPC**: Helius JSON-RPC (`getAccountInfo`, `getMultipleAccounts`, `getTokenLargestAccounts`, `getTransaction`,
  `getSignaturesForAddress`, `getProgramAccounts`)
- **DAS**: Helius DAS `getTokenAccounts`
- **BQ**: Bitquery (optional, behind `BITQUERY_API_KEY`; no key today)
- **OWN**: our own swap stream (PP/HWS decoded swaps, persisted)
- **SIM**: papersim
- **JUP**: Jupiter keyless quote
- **PYTH**: on-chain Pyth SOL/USD account
- **SW**: `/shared/smart_wallets.md`, read-only

The cost column links to §7: **-** = no extra RPC; **C** = cheap (1-3 calls, cached); **$n** = cost flag n in §7.

## 1. Strategy JSON layout

Versioned JSON validated against `config/strategy_settings.schema.json`, extended additively to **settings v1.2.0**.
One file per strategy lives in `config/strategies/*.json`. Files hot-reload (mtime poll, 2 s); an invalid file is
rejected and the last valid version keeps running.

| Key | Type | Notes |
|---|---|---|
| `schema_version` **NEW** | string `"1.2.0"` | |
| `strategy_key` **NEW** | string `^[a-z0-9_]{3,40}$` | `swing_hunter`, `hot_dip_reload` |
| `config_rev` **NEW** | integer >= 1 | logged with every decision/fill |
| `spec_ref` **NEW** | string | `"STRATEGY_SPEC_V1_CONSOLIDATED 2026-11-03 FINAL"` |
| `enabled` **NEW** | boolean | A true; B false in P1 (config only, schema-validated) |
| `name`, `venues` | existing | `venues: ["amm"]`; P1 SOL-quoted pools only (G-6) |

## 2. Field mapping

Components: Scout, Guard, Momentum, Risk, Entry, Exec, Exit, Reporter (§5).

### 2.1 Scout hard filters (hard veto)

| Spec field | A | B | JSON key / type / unit | Component | Source | Cost |
|---|---|---|---|---|---|---|
| Market cap (circulating) | $250K-$3M | $90K-$1.5M | `mcap_usd_min/max` / number / USD; `mcap_basis: "circulating"` **NEW** | Scout | (total - burned supply: RPC mint + burn-address balances) x pool price x PYTH | C |
| Liquidity | >= $75K | >= $40K | `liquidity_usd_min` / USD (= 2 x SOL reserve x SOL/USD; non-SOL quote -> skip) | Scout | RPC/HWS pool vaults + PYTH | C |
| Volume 24h | >= $300K | >= $100K | `volume_24h_usd_min` / USD | Scout | OWN (24 h warm-up; reason `warming`), BQ if a key is set | - |
| 1h vol / MC | **0.1-2.0** | >= 0.8 | `volume_to_mcap_1h_min/max` / ratio (A 0.1/2.0; B 0.8/null) | Scout | OWN / BQ | - |
| Top 10 (entity-clustered) | <= 25 % | <= 25 % | `top_holders_share_pct_max` / % | Scout + Guard | RPC `getTokenLargestAccounts`, after clustering (G5) | C (+$2) |
| LP safe | >= 95 % | **>= 95 %** | `lp_safe_pct_min: 95` **NEW** (burned + whitelisted locked) | Scout + Guard | RPC LP mint + burn addresses + locker escrows | $5 |
| Graduation age | **6 h-7 d** | >= 0 | `since_migration_seconds_min` (21600 / 0), `since_migration_seconds_max` **NEW** (604800 / null) | Scout | PP migration time, else pool-creation block time (RPC) | C |
| Holders (checked LAST) | >= 1500 | >= 500 | `holder_count_min` / integer | Scout (last step) | DAS `getTokenAccounts`, cached 10 min, credits metered | $6 |
| Crash skip | 1 h change <= -25 % | 25 % | `crash_skip_1h_pct` **NEW** | Scout | OWN price marks | - |
| Anti-top | skip if +60 % over 1 h or +150 % over 6 h | (not set) | `anti_top: {pct_1h: 60, pct_6h: 150}` **NEW** / null for B | Scout | OWN price marks (6 h history; warm-up) | - |
| Arm only on pools >= 6 h old | yes (G-1) | n/a | (same as grad age) | Scout | startup scan of graduated pools via backfill | $7 |
| Dust / poisoning | ignore + log only: held-but-never-bought tokens, symbol/name imitating SOL/USDC/USDT or a holding, inbound < $1 | same | `ignore_dust: {min_inbound_usd: 1, lookalike_symbols: ["SOL","USDC","USDT"], held_never_bought: true}` **NEW** | Scout pre-filter | metadata + our ledger | - |

### 2.2 Entry

| Spec field | A | B | JSON key | Component | Source | Cost |
|---|---|---|---|---|---|---|
| Dip from local high since armed | 15 % | 10 % | `entry.mode: "dip_from_high"`, `entry.dip_pct` **NEW** | Entry | HWS `accountSubscribe` (pool vaults) + OWN | - |
| Delay, then re-check ALL filters | 120 s | 60 s | `entry.delay_s`, `entry.recheck_all_filters: true` **NEW** | Entry -> Scout/Guard/Momentum/Risk | as filters | - |
| No rebuy (counts only if bought) | yes | yes (G-14) | `entry.rebuy_same_mint: false` | Entry | ledger | - |
| Armed expiry; re-arm allowed | 2 h | 2 h | `entry.arm_ttl_s: 7200`, `entry.rearm_after_expiry: true` | Entry | clock | - |

### 2.3 Momentum (required; scored on RECOVERY in the post-dip delay window)

| Item | Value (A and B) | JSON key (`momentum.*`) | Source | Cost |
|---|---|---|---|---|
| Sample minimum | >= 15 swaps and >= 8 unique buyers in the window, else `None` (pending); still pending at window end -> skip `momentum_pending` | `min_swaps: 15`, `min_unique_buyers: 8` | OWN | - (PP/HWS subscription for armed pools, $1 if HWS) |
| Swap hygiene | drop swaps < 0.01 SOL; cap any single wallet at 30 % of buy volume | `min_swap_lamports: "10000000"`, `wallet_buy_cap_pct: 30` | OWN | - |
| Higher low (must be > 0, else skip) | 30 pts | `points.higher_low: 30` | OWN marks | - |
| Buy/sell ratio by SOL volume, 1.0 -> 2.0 scaled | up to 30 | `points.buy_sell_ratio: 30`, `ratio_range: [1.0, 2.0]` | OWN | - |
| Unique buyers/min vs the 1 h average rate | up to 20 | `points.unique_buyers: 20` | OWN (1 h history) | - |
| 1 h vol/MC: full at 0.3-1.0, decays above 1.5, 0 above 2.5 | up to 20 | `points.vol_mcap: 20`, `vol_mcap_full: [0.3, 1.0]`, `vol_mcap_decay_from: 1.5`, `vol_mcap_zero_at: 2.5` | OWN | - |
| New low during the delay | Mom = 0 -> skip `new_low_in_delay` | `new_low_veto: true` | OWN marks | - |
| Floor | 55 (A and B) | `scoring.floors.momentum: 55` | | |

### 2.4 Risk (hard veto)

| Spec field | A | B | JSON key | Source |
|---|---|---|---|---|
| Per trade | 0.5 SOL | 0.4 SOL | `ticket_lamports` (`"500000000"` / `"400000000"`) | config |
| Max open | 4 | 5 | `max_concurrent_positions` | ledger |
| Budget (open cost basis, G-11) | 4 SOL | 4 SOL | `bankroll_lamports: "4000000000"`, `budget_basis: "open_cost"` **NEW** | ledger |
| Pool-share cap, shrink to fit; skip < 0.1 SOL | 1 % of SOL reserve | 1 % | `max_pool_impact_pct: 1`, `pool_share_basis: "sol_reserve"`, `pool_share_mode: "shrink"`, `min_ticket_lamports: "100000000"` | pool vaults |
| Daily-loss breaker | ships off in paper (G-13) | off | `daily_loss_halt_pct: null` | ledger |

### 2.5 Exit Manager

| Spec field | A | B | JSON key | Source | Cost |
|---|---|---|---|---|---|
| Stop | -25 % | -20 % | `stop_loss_pct` 25 / 20 | pool ticks | - |
| TP ladder (% of original size) | 30@+25, 30@+60, 40@+150 | 35@+18, 35@+35, 30@+50 | `profit_targets[{at_gain_pct, sell_portion_pct}]` | pool ticks | - |
| Time breakeven (continuous) | 360 min | 180 min | `breakeven_exit: {after_s: 21600 / 10800, rule: "sell_all_at_or_below_entry"}` **NEW** | ticks + clock | - |
| Idle (any swap on the pool) | 3600 s | 600 s | `idle_exit_seconds` | OWN | - |
| Max hold | 1440 min | none | `time_stop_s: 86400 / null` | clock | - |
| Price drain guard (stays) | >= 30 % in 5 min AND sell vol > buy vol | off | `sell_pressure_exit: {fall_pct: 30, window_minutes: 5}` / null | OWN | - |
| **Liquidity exit** | sell all if liquidity drops >= 20 % within 15 min | same | `liquidity_exit: {drop_pct: 20, window_s: 900}` **NEW** | HWS vault subscription | - |
| **Insider exit** | sell all if the dev or a clustered insider sells >= 1 % of supply | same | `insider_exit: {sell_supply_pct: 1}` **NEW** | HWS `accountSubscribe` on the dev/insider token accounts of held mints (from G5/G6) | $1 (subscriptions) |
| Trailing | off | off | `peak_trail_pct: 0` | - | - |

### 2.6 Guard (REQUIRED, never renormalised; `None`/pending at fill -> reject `guard_unavailable`). Keys under `guard_checks.*`

| # | Check | A | B | JSON key | Source | Cost |
|---|---|---|---|---|---|---|
| base | Mint and freeze authority null | null | null | `allow_mint_authority: false`, `allow_freeze_authority: false` | RPC getAccountInfo | C |
| G2 | LP burned + whitelisted-locked >= 95 %; lock end > max hold + 7 d | 95 | 95 | `lp_safe_pct_fail: 95`, `lp_lockers: [<program ids: Meteora, Raydium lockers, Streamflow>]`, `lock_min_end_after_max_hold_s: 604800` | RPC LP mint, burn addresses, locker escrow accounts | $5 |
| G3 | Launch layers (Block0 s0, s0+1..s0+3, first 60 s): **HARD VETO** if those buyers still hold >= 15 % combined, or >= 5 wallets in s0..s0+2 share one funder | 15 % / 5 wallets | same | `launch_layers: {slots_after_s0: 3, window_s: 60, holder_veto_pct: 15, shared_funder_veto_wallets: 5, shared_funder_slots: 2}` | RPC getSignaturesForAddress (early slots) + getTransaction + funder tracing | **$2, $3** |
| G3 | Remaining bundler/sniper share | fail > 8 % | fail > 15 % | `bundled_share_pct_fail` / `sniper_share_pct_fail` (8 / 15), `bundler_sniper_abs_fail_pct: 20` (always) | same | $2 |
| G4 | Serial launcher: > 3 prior launches that died < $20K MC | 3 | 3 | `serial_launcher: {max_dead_prior: 3, dead_below_mcap_usd: 20000}` | RPC creator history + prior mints' pools | **$4** |
| G5 | Entity clustering (owner + funder) BEFORE the top 10 / single-holder caps; insider cluster fail > 20 %, warn > 15 %; distribution network >= 50 wallets or >= 5 % of supply = WARN | | same | `clustering: {insider_fail_pct: 20, insider_warn_pct: 15, network_warn_wallets: 50, network_warn_supply_pct: 5, funder_hops: 1}` | RPC funder tracing of top holders | **$3** |
| G8 | Single entity cap | <= 5 % | <= 10 % | `single_holder_pct_fail` (entity-level) | after G5 | - |
| G6/G8 | Dev share incl. locked/vesting (Streamflow escrows); dev set = deployer/mint-authority setter + wallets it funded or sent tokens to within 72 h pre-launch; non-pump pools: the pool creator counts as dev unless LP safe >= 95 %; reject if a dev lock unlocks within the max hold | dev <= 2 % | dev <= 5 % | `creator_share_pct_fail` 2 / 5, `dev_window_s: 259200`, `dev_includes_locked: true`, `dev_unlock_within_max_hold: "reject"` | RPC deployer history (72 h) + Streamflow escrow scan | **$3, $5** |
| G7 | Wash trading: vol24h vs unique traders, repeated wallet pairs -> fail | | | `wash: {min_unique_trader_per_usd_vol, max_repeated_pair_share_pct}` (values R2-7) | OWN 24 h swap log (warm-up), BQ if a key is set | **$8** |
| G9 | Token-2022 transfer fee | 0 bps | <= 100 bps | `transfer_fee_bps_fail` 0 / 100 (fail when >) | RPC TLV | C |
| G9 | Token-2022 extensions rejected: TransferHook, PermanentDelegate, DefaultAccountState=Frozen, NonTransferable, Pausable, MintCloseAuthority, ConfidentialTransfer | | same | `reject_extensions: [...]` | RPC getAccountInfo TLV | C |
| G10 | Honeypot: model sim at full position size (`sim-approx` / "model approximation") + Jupiter quote round trip (price impact <= 10 %); neither available -> UNVERIFIED -> reject | | same | `honeypot: {size: "full_position", sell_tax_bps_fail: 500, roundtrip_excess_loss_bps_fail: 800, jupiter_max_price_impact_pct: 10, unverified: "reject"}` | SIM + JUP | **$9** (rate limit) |
| G11 | Safety floor | >= 70 | >= 70 | `scoring.floors.safety: 70` | | |
| G12 | Audit every pool of the mint: warn if > 30 % of liquidity is unlocked and not retail-held; fail if insiders hold > 10 % of liquidity, or a DLMM pool is one-sided token-only | | same | `pool_audit: {unlocked_warn_pct: 30, insider_lp_fail_pct: 10, dlmm_one_sided: "fail"}` | RPC pool enumeration per AMM program + LP holders | **$10** |
| G13 | DESSA = FAIL: dev bought >= 15 % in Block0, fully sold, liquidity < $35K and falling | | same | `dessa: {dev_block0_pct: 15, liq_usd_below: 35000}` | from G3 data + pool ticks | (in $2) |
| G13 | Flag transfers of >= 2 % of supply to fresh wallets | | same | `fresh_wallet_transfer_flag_pct: 2` | RPC transfers of top holders | (in $3) |
| G13 | Flag copycat CAs (same name/symbol/vanity suffix as a known coin) | | same | `copycat_flag: true` | our coin cache | - |
| G-10 | Excluded from holder/funder math: migration, program and AMM-authority accounts | | | `exclude_accounts: [...]` | config | - |

**Safety score** (after vetoes, start 100; Yumi G-18):

| Deduction | Points | Key (`safety.deduct.*`) |
|---|---|---|
| top 10 from 15 % up to the strategy max, scaled | up to -25 | `top10: {from_pct: 15, max_points: 25}` |
| holders near the minimum (min -> 2 x min, R2-11) | up to -15 | `holders: 15` |
| LP safe from the minimum to 100 % (less safe = more deduction) | up to -15 | `lp: 15` |
| pool age < 24 h | -10 | `young_pool: {below_s: 86400, points: 10}` |
| a single entity at 5-10 % | -15 | `single_holder: {from_pct: 5, to_pct: 10, points: 15}` |
| G5/G12 WARN results | R2-12 | `warns: ...` |

### 2.7 Paper model (Exec)

| Item | Value | Key |
|---|---|---|
| Start balance | 10 SOL (engine ledger, G-12) | `ENGINE_PAPER_START_LAMPORTS=10000000000` |
| Fill | price at decision + uniform 400-1200 ms delay, replaying the real pool price path (OWN ticks) when available; else adverse 0.5 % on buys and sells, +1.0 % when 1 m volatility > 10 % | `fill: {delay_ms: [400, 1200], replay_path: true, fallback_adverse_bps: 50, high_vol_extra_bps: 100, high_vol_1m_pct: 10, seed: "order_id"}` |
| Swap fee / priority fee | 125 bps / 0.0001 SOL fixed | `swap_fee_bps: 125`, `priority_fee_lamports: 100000` |
| Network fee | tracked separately in PnL | `engine_fills.network_fee_lamports` |

### 2.8 Reporter

Every decision is logged: stage, pass/reject, reason codes, per-module scores and reasons, the weights used,
`config_rev`, latency, `sim-approx` / `warming` labels, and RPC credits spent on the candidate. Every fill is logged
with PnL (network fee separate).
- Storage: Postgres (migration number after the rename, >= 0022), or JSONL files when PG is down.
- Daily CSVs: `/shared/centurion/YYYY-MM-DD_{decisions,fills,pnl}.csv`. The dir does not exist yet and is created on
  first export.
- Alerts: `engine_alerts` + `system.notice SOURCE_DEGRADED`.

## 3. Data-source plan (free / existing only)

- New mints + graduations: PP primary (verify AMM trade coverage empirically in the first hour, G-4), HWS logs
  fallback, RPC backfill on gaps. On startup, a backfill scan of graduated pools lets A arm only on pools already
  >= 6 h old (G-1, no seeding).
- Prices/reserves: RPC + HWS `accountSubscribe` on pool vaults for armed and held pools. HWS AMM logs are used only
  for armed or held pools when PP does not cover them.
- SOL/USD: Pyth on-chain account (G-5). Jupiter is a sanity check and the honeypot round trip only.
- No new keys (G-2). Bitquery is optional behind `BITQUERY_API_KEY`.
- Smart Money (P2): SW read-only (the file exists, 106 KB). StalkChain is used only for verified-free calls, flagged
  before any paid one. CabalHunter is NOT used.
- Geyser stays wired but disabled.

**Jupiter quote API:** free with **no key**: `GET https://api.jup.ag/swap/v2/order?inputMint=&outputMint=&amount=`.
Omit `taker`, so the quote comes back with `transaction: null`: no wallet and nothing to sign. Verified live at
2026-11-03 ~14:48 WIB: HTTP 200 with `outAmount`, `priceImpactPct` and `routePlan`.
- Keyless limit: **0.5 req/s (30/min)**. A free key gives 1 req/s; we use no key.
- The legacy `https://lite-api.jup.ag/swap/v1/quote` still answers 200 but is superseded.
- The quote includes a Jupiter platform fee: 50 bps on tokens < 24 h old, 10 bps for most others. The round-trip
  math has to subtract it (R2-14).

## 4. Hot path vs enrichment

Hot path (screener eval target < 50 ms, p50/p95/max measured):
1. tick/event
2. Scout (cached metrics)
3. Guard (cached enrichment + SIM)
4. Momentum
5. Risk
6. Entry
7. PaperExecutor

All §7 checks run asynchronously into caches, **only after the cheap filters pass**, ordered cheapest first and
holders LAST. A candidate whose Guard enrichment is not complete at fill time is rejected `guard_unavailable`. A coin
that stays unevaluated for more than 5 min raises a watchdog alert.

## 5. Engine architecture (design; built after the rename)

```rust
pub trait Specialist: Send + Sync {
    fn id(&self) -> ModuleId;            // scout | guard | smart_money | momentum | narrative | risk
    fn phase(&self) -> Phase;            // P1 | P2 | P3
    fn required(&self) -> bool;          // guard, momentum (and scout/risk vetoes): never renormalised
    /// None = not available / pending. Required + None => reject (guard_unavailable / momentum_pending).
    fn assess(&self, c: &Candidate, cfg: &StrategyConfig) -> Option<ModuleScore>;
}
pub struct ModuleScore { pub score: u8, pub veto: bool, pub reasons: Vec<Reason>, pub inputs_as_of: TsMs,
                         pub labels: Vec<Label> /* sim-approx, warming */, pub rpc_credits: u32 }
```

| Module | Role | Score / veto | Required | Phase |
|---|---|---|---|---|
| Scout | ingest + hard filters | veto | yes | P1 |
| Guard (Safety) | G1-G13 | weighted + veto | **yes** | P1 |
| Momentum / Flow | recovery score, dip detection | weighted | **yes** | P1 |
| Risk | sizing, limits, breaker, pool cap | veto (+ shrunk size) | yes | P1 |
| Smart Money | SW wallets | weighted | optional (renormalised) | P2 |
| Narrative / Social | X/KOL | weighted | optional (renormalised) | P3 |
| Executor / Exit Manager / Reporter | not scoring | - | - | P1 |

Lead orchestrator:
1. Scout veto.
2. Required module `None` -> reject.
3. Vetoes (Scout, Guard, Risk, plus the Spec hard filters).
4. Floors.
5. Weighted aggregate over the available modules. Renormalise only for missing **optional** modules.
6. Aggregate < `min_score` -> reject.
7. Log everything (§2.8).

Scoring JSON (A shown; B: P1 Safety 50 / Mom 50, P2 40/20/40, full 35/15/20/30, `min_score: 65`, the same floors
70/55):
```json
"scoring": {
  "version": 2, "phase": "p1",
  "weights_by_phase": {
    "full": { "safety": 40, "narrative": 20, "smart_money": 20, "momentum": 20 },
    "p1":   { "safety": 55, "momentum": 45 },
    "p2":   { "safety": 45, "smart_money": 25, "momentum": 30 } },
  "min_score": 68,
  "floors": { "safety": 70, "momentum": 55 },
  "required": ["scout", "guard", "momentum", "risk"],
  "vetoes": ["scout", "guard", "risk"],
  "missing": "renormalize_optional_only"
}
```

## 6. Gap status

### 6.1 Rev 1 gaps: all resolved

| Gap | Resolution (source) |
|---|---|
| G-1 | No seeding; A arms only on pools already >= 6 h old; startup backfill scan allowed (Apex) |
| G-2 | No new keys; 24 h warm-up accepted, reason `warming`; Bitquery optional behind `BITQUERY_API_KEY` (Apex) |
| G-3 | Holders checked last, cached 10 min, credits metered, hard stop at the current Helius plan (Apex; §7 $6) |
| G-4 | Verify PP coverage empirically in the first hour; HWS AMM logs only for armed/held pools (Apex) |
| G-5 | Pyth on-chain SOL/USD (Apex) |
| G-6 | Liquidity = 2 x SOL reserve; non-SOL quotes skipped in P1 (Apex) |
| G-7 | MC = (total - burned) x pool price = circulating (Apex = FINAL) |
| G-8 | **Superseded by FINAL #2:** burned + whitelisted-locker-locked >= 95 % for A and B (Apex said burn-only) |
| G-9 | Model sim accepted, labelled `sim-approx` / "model approximation", **plus** the Jupiter round trip (FINAL #10); Real needs a real `simulateTransaction` sell |
| G-10 | Exclude migration/program/AMM-authority accounts (Apex) |
| G-11 | Budget on open cost basis (Apex) |
| G-12 | Engine ledger 10 SOL (Apex) |
| G-13 | Breaker field exists, off in paper (Apex) |
| G-14 | B: no rebuy + 2 h armed expiry (Yumi) |
| G-15 | Dev = deployer + funded/sent wallets, window **72 h** (FINAL #6, was 24 h); caps A 2 % / B 5 % (FINAL #8); non-pump: pool creator counts unless LP >= 95 % |
| G-16 | Dust/poisoning: ignore + log (Yumi) |
| G-17 | Fill delay 400-1200 ms + path replay, else adverse 0.5 % (+1 % high vol) (Yumi) |
| G-18 | Momentum + Safety scoring defined (Yumi); Mom floor **55** both (FINAL), Safety **70** (FINAL #11) |
| G-19 | P2 Smart Money from `/shared/smart_wallets.md`; StalkChain verified-free only; no CabalHunter (Yumi) |

Rev 1 assumptions: all confirmed as defaults (Yumi). The network fee is tracked separately in PnL.

## 7. Cost flags (RPC beyond cheap reads)

Basis: the current Helius plan tier is not recorded on the box (R2-1). The numbers below are **calls per deep
candidate**; DAS and `getProgramAccounts` usually bill more credits per call than standard reads. Funnel assumption
for A: roughly 50-150 mints/day reach the deep checks (they passed the cheap Scout filters). Immutable history (launch
layers, deployer history) is cached forever per mint/creator, so each mint pays for it once. The engine meters credits
per candidate and per UTC day, with a **daily hard cap** (`ENGINE_RPC_DAILY_CREDIT_CAP`). When the cap is reached,
deep checks stop and those candidates are rejected `guard_unavailable` (never a plan upgrade).

| Flag | Check | Calls per candidate (est.) | Mitigation |
|---|---|---|---|
| $1 | HWS subscriptions: AMM logs / vault / insider token-account `accountSubscribe` for armed + held pools | 0 calls; ~2-25 subscriptions per armed/held mint (WS messages may bill) | armed/held only; drop on expiry/exit; cap total subscriptions (e.g. 200) |
| $2 | **Launch layers** (G3, G13 DESSA): `getSignaturesForAddress` walked back to s0 on the bonding curve / mint, then `getTransaction` for s0..s0+3 + first 60 s | 2-20 sig pages + 50-300 tx = **~60-320** | once per mint, cached forever; after cheap filters; cap 400 calls (cap hit -> UNVERIFIED -> reject) |
| $3 | **Funder tracing** (G3 shared funder, G5 clustering, G6 dev set 72 h, G13 fresh-wallet transfers): per wallet `getSignaturesForAddress` (bounded by time) + `getTransaction` of the first inbound SOL/token transfer | 2-4 per wallet x ~40-70 wallets (early buyers + top 20 + dev) = **~100-280** | 1 hop only; cap 60 wallets; wallet->funder cache 7 d (shared across mints) |
| $4 | **Serial launcher** (G4): creator signatures + create txs of prior mints + their current pool/curve state (`getMultipleAccounts`) | 1-10 pages + 10-100 tx + 1-3 batch = **~20-110** | per creator, cached 24 h; stop counting once > 3 dead are found |
| $5 | **LP lockers + Streamflow escrows** (G2, G6): `getProgramAccounts` with a mint memcmp on each whitelisted locker program (Streamflow, Meteora, Raydium lockers) + LP holders | 3-5 gPA + 1-3 reads = **~5-8 (heavy gPA)** | once per mint, cached 30 min; lock end re-read only for held mints |
| $6 | **Holders** (Scout, last step): DAS `getTokenAccounts` 1000/page, stop as soon as the minimum is reached | A: 2 pages (>= 1500); B: 1 page (>= 500) = **1-2 (DAS)** | last step; cache 10 min; credits metered (Apex G-3) |
| $7 | **Pool enumeration**: startup scan of graduated pools >= 6 h (G-1) and the G12 audit of every pool of a mint: `getProgramAccounts` (memcmp mint) per AMM program (PumpSwap, Raydium AMM v4/CPMM, Meteora DLMM/DAMM) + vault reads | startup: backfill pages of PumpSwap create txs (~5-50 pages + tx) once; G12: **~5-6 gPA + 2-10 reads** per mint | startup scan bounded to 7 d, rate-budgeted (existing backfill limiter); G12 once per mint, cache 10 min |
| $8 | **Wash pattern** (G7): needs trade-level 24 h history (traders, pairs). Pulling it per candidate over RPC = 24 h of pool signatures + every tx (5k-50k for a $300K-vol pool) | **5k-50k: NOT FEASIBLE** on RPC | use OWN 24 h swap log (free stream, warm-up); BQ if a key ever exists; never pull per candidate over RPC (R2-7) |
| $9 | **Jupiter round trip** (G10): 2 keyless quotes (SOL->token at size, token->SOL) | 2 HTTP calls, no Helius credits | 0.5 req/s keyless = max ~15 candidates/min; queue; cache 15 s; JUP down + sim available -> R2-14 |
| $10 | **G12 all-pool audit LP holders**: `getTokenLargestAccounts` on each pool's LP mint | 1 per pool (~1-4) | with $7, cached 10 min |

Rough total for a deep candidate: **~200-750 calls**. 50-150 deep candidates/day gives ~10k-110k calls/day,
~0.3-3.4 M/month, before any caching across shared funders. This may exceed a Free-tier Helius plan. **If the
metered rate projects past the current plan, the engine caps the daily budget and reports to Apex; no upgrade (STOP
rule).**

## 8. New ambiguities (rev 2)

- **R2-1 Helius plan tier.** The credit allowance and RPS are not recorded on the box, so the daily cap value is
  unknown. Need the plan / monthly credits from Apex.
- **R2-2 LP rule conflict.** Apex G-8 (burn-only) vs FINAL #2 (burned + whitelisted locked). FINAL is applied. Need
  the locker program-id whitelist (exact Meteora/Raydium locker and Streamflow program ids).
- **R2-3 Lock horizon for B.** B has no max hold, so "lock end > max hold + 7 d" is undefined. Proposal: lock end
  > now + 7 d, or permanent locks only.
- **R2-4 s0 for graduated coins.** Is Block0 the pump.fun create slot (assumed) or the AMM pool-creation slot?
- **R2-5 Launch-layer walk limit.** For 6 h-7 d old mints, walking signatures back to s0 can be long. If the cap
  (400 calls) is hit: UNVERIFIED -> reject (assumed), or skip the check with WARN?
- **R2-6 "Still hold >= 15 % combined".** Include wallets those buyers forwarded tokens to (cluster), or direct
  balances only?
- **R2-7 Wash thresholds and warm-up.** No numeric thresholds are given (unique traders per $ volume, repeated-pair
  share). The check also needs 24 h of OWN data. During warm-up, Guard pending -> reject would block all A trades for
  24 h per pool. Confirm whether wash = `warming` -> reject or -> WARN.
- **R2-8 Clustering definition.** "owner + funder": funder = first SOL inbound, 1 hop (assumed). Is a common
  CEX hot wallet as funder excluded (needs a CEX address list)? Define "distribution network" depth.
- **R2-9 Serial launcher "died < $20K MC".** Peak MC or current MC? Look-back window (all time assumed)?
- **R2-10 Insider exit "sells >= 1 % of supply".** Single tx or cumulative since entry (assumed cumulative)? Does a
  transfer to a fresh wallet count as a sell?
- **R2-11 Safety "holders near the minimum".** Scale range assumed min -> 2 x min (-15 -> 0).
- **R2-12 WARN results in Safety.** The deductions for G5 / G12 / G13 warns and flags are not specified. Proposal:
  -10 each, capped at -20.
- **R2-13 Liquidity exit basis.** USD liquidity (moves with SOL/USD) or SOL reserve (assumed SOL reserve)?
- **R2-14 Honeypot pass logic.** "If neither available => reject": is the model sim alone enough when Jupiter is
  down or rate-limited (assumed yes, labelled `sim-approx`), or are both required? Should the Jupiter platform fee
  (10-50 bps) count inside the 8 % excess round-trip loss?
- **R2-15 Pool audit terms.** Define "retail-held" LP (holders outside insider clusters?) and "insiders hold > 10 % of
  liquidity" (LP tokens held by the dev set / clusters).
- **R2-16 Anti-top reference.** +60 % / +150 % vs the price 1 h / 6 h ago (assumed) or vs the window low? This needs
  6 h of OWN marks: warm-up behaviour (assumed `warming` -> skip).
- **R2-17 Grad-age max for B.** FINAL sets 6 h-7 d for A only. B stays >= 0 with no max (assumed).
- **R2-18 Copycat CA definition.** Same name+symbol as an existing coin in our cache, or a vanity-suffix match? Flag
  only (assumed WARN, no deduction).
- **R2-19 Momentum unique-buyer scale.** Mapping of "vs the 1 h average rate" to 0-20 points: assumed linear 1x -> 0,
  2x -> 20.
- **R2-20 Fill replay randomness.** The uniform 400-1200 ms delay is seeded by order id (assumed) for reproducible
  replays.
