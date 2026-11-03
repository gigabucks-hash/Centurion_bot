# Strategy Spec v1 mapping (Centurion Trade P1 engine, paper only)

Status: **rev 3 DRAFT, awaiting Bubu/Zola final PASS** (2026-11-03 ~15:10 WIB, Backend). Not locked. Design /
mapping only; nothing here is built yet. Source: `/workspace/sentra-inbox/STRATEGY_SPEC_V1_CONSOLIDATED.txt`.

## Rev 3 changelog (2026-11-03)

Precedence: **Bubu B-1..B-8 + locker whitelist (14:52) and Zola Z-1..Z-5 (14:51) > Yumi answers + Apex R2-1 (14:50) >
rev 2.** Zola Z-1 overrides R2-16; the Bubu whitelist supersedes R2-2 "whitelist empty".

- **Locker whitelist** (Bubu-verified mainnet programs, §2.6 G2): Streamflow, Raydium Burn&Earn, Jupiter Lock, Meteora
  DAMM v1 (lock_escrow PDA), Meteora DAMM v2 (position lock fields). Excluded: UNCX, PinkLock, Team Finance, Fluxbeam.
  Locked LP counts only when non-cancellable, non-transferable and with no early withdraw (B-2); cancellable = unlocked.
  DAMM v2 permanent position locks count (Z-3).
- **RPC budget (R2-1):** Helius treated as free tier. `ENGINE_RPC_DAILY_CREDIT_CAP` default **25000/day** (configurable)
  + running monthly meter; deep checks cheapest-first, only after Scout + cheap Guard pass; cache TTLs fixed
  (authorities / Token-2022 forever, holders / clusters 10 min); cap hit -> reject `credit_cap`, every cap hit logged;
  daily credit usage in the daily report (§2.8, §7).
- Scout A anti-top now from the window LOW with a near-high condition (Z-1); warming = SKIP `warming`, never pass, for
  anti-top and own-log vol24h (Z-2).
- Momentum: A sample minimum 10 swaps / 6 buyers (B stays 15/8) (Z-4); higher-low points by dip-recovery fraction (Z-5).
- Guard: young-pool single-funder check restored (B-1); funder depth 2 + CEX exclusion (B-3, R2-8); launch layers
  scan the migration slot +3 for graduated pools, WARN band 10-15 % (B-4, R2-4, R2-5); wash thresholds (B-5, R2-7);
  serial launcher = peak MC < $20K in 30 d (B-6, R2-9); B lock end >= 7 d after entry (B-7, R2-3); WARN points 10 each,
  cap 20, plus a mutable-metadata WARN (B-8, R2-12).
- Exit: insider exit cumulative within 60 min, transfers to non-pool wallets count (R2-10).
- §8: R2 questions marked answered with source; R2-6, 11, 13, 14, 15, 17-20 stay as **assumed**. New questions §9.

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
| Volume 24h | >= $300K | >= $100K | `volume_24h_usd_min` / USD | Scout | OWN (24 h warm-up: **SKIP `warming`, never pass**, Z-2), BQ if a key is set | - |
| 1h vol / MC | **0.1-2.0** | >= 0.8 | `volume_to_mcap_1h_min/max` / ratio (A 0.1/2.0; B 0.8/null) | Scout | OWN / BQ | - |
| Top 10 (entity-clustered) | <= 25 % | <= 25 % | `top_holders_share_pct_max` / % | Scout + Guard | RPC `getTokenLargestAccounts`, after clustering (G5) | C (+$2) |
| LP safe | >= 95 % | **>= 95 %** | `lp_safe_pct_min: 95` **NEW** (burned + whitelisted, non-cancellable locked; G2) | Scout + Guard | RPC LP mint + burn addresses + locker escrows / DAMM v2 position locks | $5 |
| Graduation age | **6 h-7 d** | >= 0 | `since_migration_seconds_min` (21600 / 0), `since_migration_seconds_max` **NEW** (604800 / null) | Scout | PP migration time, else pool-creation block time (RPC) | C |
| Holders (checked LAST) | >= 1500 | >= 500 | `holder_count_min` / integer | Scout (last step) | DAS `getTokenAccounts`, cached 10 min, credits metered | $6 |
| Crash skip | 1 h change <= -25 % | 25 % | `crash_skip_1h_pct` **NEW** | Scout | OWN price marks | - |
| Anti-top (Z-1) | skip if ((max - min) / min > 60 % over 1 h **or** > 150 % over 6 h) **and** current price within 20 % of the window max; `min` = window LOW | (not set) | `anti_top: {basis: "window_low", range_pct_1h: 60, range_pct_6h: 150, near_high_pct: 20}` **NEW** / null for B | Scout | OWN price marks (6 h history); < 6 h history -> **SKIP `warming`**, never pass (Z-2) | - |
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
| Sample minimum (Z-4) | **A: >= 10 swaps and >= 6 unique buyers; B: >= 15 / 8** in the window, else `None` (pending); still pending at window end -> skip `momentum_pending`. Delay unchanged (A 120 s) | A `min_swaps: 10`, `min_unique_buyers: 6`; B 15 / 8 | OWN | - (PP/HWS subscription for armed pools, $1 if HWS) |
| Swap hygiene | drop swaps < 0.01 SOL; cap any single wallet at 30 % of buy volume | `min_swap_lamports: "10000000"`, `wallet_buy_cap_pct: 30` | OWN | - |
| Higher low (Z-5; must be > 0, else skip) | 30 pts at >= 50 % recovery of the dip distance (local high -> dip low), 0 under 10 %, linear between; the window low must stay above the dip low, else `new_low_veto` | `points.higher_low: 30`, `higher_low: {full_at_recovery_pct: 50, zero_below_recovery_pct: 10}` | OWN marks | - |
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
| **Insider exit** (R2-10) | sell all if the dev or clustered insiders sell **cumulatively >= 1 % of supply within 60 min**; transfers to non-pool wallets count as sells | same | `insider_exit: {sell_supply_pct: 1, window_s: 3600, count_transfers_to_non_pool: true}` **NEW** | HWS `accountSubscribe` on the dev/insider token accounts of held mints (from G5/G6) | $1 (subscriptions) |
| Trailing | off | off | `peak_trail_pct: 0` | - | - |

### 2.6 Guard (REQUIRED, never renormalised; `None`/pending at fill -> reject `guard_unavailable`). Keys under `guard_checks.*`

| # | Check | A | B | JSON key | Source | Cost |
|---|---|---|---|---|---|---|
| base | Mint and freeze authority null | null | null | `allow_mint_authority: false`, `allow_freeze_authority: false` | RPC getAccountInfo | C |
| G2 | LP burned + whitelisted-locked >= 95 % (locker list and lock rule below, B-2/Z-3); A: lock end > max hold + 7 d; **B: lock end >= entry + 7 d** (B-7, R2-3) | 95 | 95 | `lp_safe_pct_fail: 95`, `lp_lockers: [...]` (below), A `lock_min_end_after_max_hold_s: 604800`, B `lock_min_end_after_entry_s: 604800` | RPC LP mint, burn addresses, locker escrow accounts, DAMM v2 position lock fields | $5 |
| G3 | Launch layers: Block0 s0 = **token create slot** (R2-4), s0+1..s0+3, first 60 s; graduated pools **also** scan the pool/migration create slot +3 (B-4). **HARD VETO (A and B)** if those buyers still hold >= 15 % combined, or >= 5 wallets in s0..s0+2 share one funder (R2-5); **10-15 % combined = WARN** | 15 % / 5 wallets; WARN 10 % | same | `launch_layers: {slots_after_s0: 3, migration_slots_after: 3, window_s: 60, holder_veto_pct: 15, holder_warn_pct: 10, shared_funder_veto_wallets: 5, shared_funder_slots: 2}` | RPC getSignaturesForAddress (early slots) + getTransaction + funder tracing | **$2, $3** |
| G3 | Remaining bundler/sniper share | fail > 8 % | fail > 15 % | `bundled_share_pct_fail` / `sniper_share_pct_fail` (8 / 15), `bundler_sniper_abs_fail_pct: 20` (always) | same | $2 |
| G4 | Serial launcher: > 3 prior launches that died = **peak MC < $20K within a 30-day look-back** (B-6, R2-9) | 3 | 3 | `serial_launcher: {max_dead_prior: 3, dead_below_mcap_usd: 20000, mcap_basis: "peak", lookback_s: 2592000}` | RPC creator history + prior mints' pools | **$4** |
| G5 | Entity clustering (owner + funder) BEFORE the top 10 / single-holder caps; insider cluster fail > 20 %, warn > 15 %; distribution network >= 50 wallets or >= 5 % of supply = WARN; **funder depth 2**; CEX hot wallets excluded as funders (Helius identity labels) (B-3, R2-8) | | same | `clustering: {insider_fail_pct: 20, insider_warn_pct: 15, network_warn_wallets: 50, network_warn_supply_pct: 5, funder_hops: 2}`, `cex_exclusion: {enabled: true, source: "helius_identity", extra_wallets: []}` | RPC funder tracing of top holders + Helius identity labels | **$3** (x2 for hop 2, §7) |
| G5b | **Young-pool single funder** (B-1): pool age < 600 s and one funder behind >= 80 % of holder supply -> FAIL; migration + program accounts excluded | | same | `young_pool_s: 600`, `young_pool_single_funder_pct_fail: 80` | from G5 funder data | (in $3) |
| G8 | Single entity cap | <= 5 % | <= 10 % | `single_holder_pct_fail` (entity-level) | after G5 | - |
| G6/G8 | Dev share incl. locked/vesting (Streamflow escrows); dev set = deployer/mint-authority setter + wallets it funded or sent tokens to within 72 h pre-launch; non-pump pools: the pool creator counts as dev unless LP safe >= 95 %; reject if a dev lock unlocks within the max hold | dev <= 2 % | dev <= 5 % | `creator_share_pct_fail` 2 / 5, `dev_window_s: 259200`, `dev_includes_locked: true`, `dev_unlock_within_max_hold: "reject"` | RPC deployer history (72 h) + Streamflow escrow scan | **$3, $5** |
| G7 | Wash trading (B-5, R2-7): FAIL if same-wallet buy+sell within 60 s > 30 % of volume, **or** top-5 wallet pairs > 40 % of volume; WARN at half (15 % / 20 %); warming (< 24 h of OWN data) = skip check, WARN only, no reject | | same | `wash: {roundtrip_window_s: 60, same_wallet_roundtrip_vol_fail_pct: 30, top5_pairs_vol_fail_pct: 40, warn_at_fraction: 0.5, warming_s: 86400, warming: "warn"}` | OWN swap log (start logging watched pools now, local/paper only), BQ if a key is set | **$8** |
| G9 | Token-2022 transfer fee | 0 bps | <= 100 bps | `transfer_fee_bps_fail` 0 / 100 (fail when >) | RPC TLV | C |
| G9 | Token-2022 extensions rejected: TransferHook, PermanentDelegate, DefaultAccountState=Frozen, NonTransferable, Pausable, MintCloseAuthority, ConfidentialTransfer | | same | `reject_extensions: [...]` | RPC getAccountInfo TLV | C |
| G10 | Honeypot: model sim at full position size (`sim-approx` / "model approximation") + Jupiter quote round trip (price impact <= 10 %); neither available -> UNVERIFIED -> reject | | same | `honeypot: {size: "full_position", sell_tax_bps_fail: 500, roundtrip_excess_loss_bps_fail: 800, jupiter_max_price_impact_pct: 10, unverified: "reject"}` | SIM + JUP | **$9** (rate limit) |
| G11 | Safety floor | >= 70 | >= 70 | `scoring.floors.safety: 70` | | |
| G12 | Audit every pool of the mint: warn if > 30 % of liquidity is unlocked and not retail-held; fail if insiders hold > 10 % of liquidity, or a DLMM pool is one-sided token-only | | same | `pool_audit: {unlocked_warn_pct: 30, insider_lp_fail_pct: 10, dlmm_one_sided: "fail"}` | RPC pool enumeration per AMM program + LP holders | **$10** |
| G13 | DESSA = FAIL: dev bought >= 15 % in Block0, fully sold, liquidity < $35K and falling | | same | `dessa: {dev_block0_pct: 15, liq_usd_below: 35000}` | from G3 data + pool ticks | (in $2) |
| G13 | Flag transfers of >= 2 % of supply to fresh wallets | | same | `fresh_wallet_transfer_flag_pct: 2` | RPC transfers of top holders | (in $3) |
| G13 | Flag copycat CAs (same name/symbol/vanity suffix as a known coin) | | same | `copycat_flag: true` | our coin cache | - |
| G-10 | Excluded from holder/funder math: migration, program and AMM-authority accounts | | | `exclude_accounts: [...]` | config | - |

**G2 locker whitelist** (Bubu, mainnet executable, BPFLoaderUpgradeable; supersedes R2-2 "whitelist empty"):

| Locker | Program ID | How the lock is read |
|---|---|---|
| Streamflow | `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m` | stream/escrow account; must be non-cancellable by sender and recipient, non-transferable |
| Raydium Burn&Earn | `LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE` | locked position account (permanent) |
| Jupiter Lock | `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn` | escrow account; cancel/update modes must be "none" |
| Meteora DAMM v1 | `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB` | `lock_escrow` PDA per pool + owner |
| Meteora DAMM v2 | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | position lock fields (permanent / vested liquidity) read on the pool's positions, **not** owner inference (Z-3) |

- Reference only, **not** a locker: Raydium CPMM `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`. PumpSwap migration
  pools burn LP (counts as burned).
- **Excluded (unverified):** UNCX, PinkLock, Team Finance, Fluxbeam. LP held there counts as **unlocked**.
- **Lock rule (B-2):** locked LP counts only if the escrow/position is owned by a whitelisted program **and** is
  non-cancellable, non-transferable and has no early withdraw. Cancellable (by anyone) = unlocked. Unknown or
  unparseable lock state = unlocked (strict).
- Config: `lp_lockers: [{name, program_id, kind: "streamflow"|"raydium_burn_earn"|"jupiter_lock"|"meteora_damm_v1_escrow"|"meteora_damm_v2_position"}]`,
  `lp_lock_rule: {non_cancellable: true, non_transferable: true, no_early_withdraw: true, unknown: "unlocked"}`.

**Safety score** (after vetoes, start 100; Yumi G-18):

| Deduction | Points | Key (`safety.deduct.*`) |
|---|---|---|
| top 10 from 15 % up to the strategy max, scaled | up to -25 | `top10: {from_pct: 15, max_points: 25}` |
| holders near the minimum (min -> 2 x min, R2-11) | up to -15 | `holders: 15` |
| LP safe from the minimum to 100 % (less safe = more deduction) | up to -15 | `lp: 15` |
| pool age < 24 h | -10 | `young_pool: {below_s: 86400, points: 10}` |
| a single entity at 5-10 % | -15 | `single_holder: {from_pct: 5, to_pct: 10, points: 15}` |
| each G3/G5/G7/G12/G13 WARN result (B-8, R2-12) | -10 each, cap -20 | `warns: {points_each: 10, cap: 20}` |
| metadata mutable **and** update authority = dev (B-8) | -10 (counts as a WARN) | `warns.mutable_metadata_dev_authority: true` |

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
with PnL (network fee separate). Every RPC credit-cap hit is logged (`engine_alerts`, reason `credit_cap`), and the
daily report (Nero) carries daily credit usage: used / cap, month-to-date, cap hits, top check types by credits.
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
- Start now (local/paper only, rev 3): swap logging and price tracking on watched pools (feeds G7 wash, anti-top,
  vol24h). Backfill pool history from RPC only if free and within the daily credit cap (Z-2).

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

All §7 checks run asynchronously into caches, **only after Scout + the cheap Guard checks pass** (R2-1), ordered
cheapest first and holders LAST. A candidate whose Guard enrichment is not complete at fill time is rejected `guard_unavailable`. A coin
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

Basis (R2-1, Apex): the Helius plan is unknown, so it is **treated as the free tier**. The numbers below are **calls per deep
candidate**; DAS and `getProgramAccounts` usually bill more credits per call than standard reads. Funnel assumption
for A: roughly 50-150 mints/day reach the deep checks (they passed the cheap Scout filters). Immutable history (launch
layers, deployer history) is cached forever per mint/creator, so each mint pays for it once. The engine meters credits
per candidate and per UTC day, with a **daily hard cap** `ENGINE_RPC_DAILY_CREDIT_CAP` (**default 25000/day**,
configurable) plus a running **monthly meter** (month-to-date, shown in /readyz and the daily report). When the cap is
reached, deep checks stop and those candidates are rejected **`credit_cap`** (accepted by Yumi); every hit is logged.
Never a plan upgrade.

Cache TTLs (rev 3): mint/freeze authorities and Token-2022 extensions **forever** per mint; holders and
clusters **10 min**; launch layers and deployer history forever per mint/creator; wallet -> funder 7 d; lockers 30 min
(lock end re-read for held mints); pool audit 10 min; Jupiter quote 15 s. Order: cheap reads -> Token-2022/authorities
-> lockers -> launch layers -> funder tracing -> serial launcher -> pool audit -> holders (last).

| Flag | Check | Calls per candidate (est.) | Mitigation |
|---|---|---|---|
| $1 | HWS subscriptions: AMM logs / vault / insider token-account `accountSubscribe` for armed + held pools | 0 calls; ~2-25 subscriptions per armed/held mint (WS messages may bill) | armed/held only; drop on expiry/exit; cap total subscriptions (e.g. 200) |
| $2 | **Launch layers** (G3, G13 DESSA): `getSignaturesForAddress` walked back to s0 on the bonding curve / mint, then `getTransaction` for s0..s0+3 + first 60 s | 2-20 sig pages + 50-300 tx = **~60-320** | once per mint, cached forever; after cheap filters; cap 400 calls (cap hit -> UNVERIFIED -> reject) |
| $3 | **Funder tracing** (G3 shared funder, G5 clustering, G5b young-pool funder, G6 dev set 72 h, G13 fresh-wallet transfers): per wallet `getSignaturesForAddress` (bounded by time) + `getTransaction` of the first inbound SOL/token transfer | hop 1: 2-4 per wallet x ~40-70 wallets = ~100-280; **hop 2 (B-3): + up to the same again = ~200-560** | cap 60 wallets at hop 1 and 60 distinct funders at hop 2; CEX-labelled funders stop the walk; wallet->funder cache 7 d (shared across mints) |
| $4 | **Serial launcher** (G4): creator signatures + create txs of prior mints + their current pool/curve state (`getMultipleAccounts`) | 1-10 pages + 10-100 tx + 1-3 batch = **~20-110** | per creator, cached 24 h; stop counting once > 3 dead are found |
| $5 | **LP lockers + Streamflow escrows** (G2, G6): `getProgramAccounts` with a mint/pool memcmp on each of the 5 whitelisted programs (incl. DAMM v2 positions, Z-3) + LP holders | 5 gPA + 1-3 reads = **~6-8 (heavy gPA)** | once per mint, cached 30 min; lock end re-read only for held mints |
| $6 | **Holders** (Scout, last step): DAS `getTokenAccounts` 1000/page, stop as soon as the minimum is reached | A: 2 pages (>= 1500); B: 1 page (>= 500) = **1-2 (DAS)** | last step; cache 10 min; credits metered (Apex G-3) |
| $7 | **Pool enumeration**: startup scan of graduated pools >= 6 h (G-1) and the G12 audit of every pool of a mint: `getProgramAccounts` (memcmp mint) per AMM program (PumpSwap, Raydium AMM v4/CPMM, Meteora DLMM/DAMM) + vault reads | startup: backfill pages of PumpSwap create txs (~5-50 pages + tx) once; G12: **~5-6 gPA + 2-10 reads** per mint | startup scan bounded to 7 d, rate-budgeted (existing backfill limiter); G12 once per mint, cache 10 min |
| $8 | **Wash pattern** (G7): needs trade-level 24 h history (traders, pairs). Pulling it per candidate over RPC = 24 h of pool signatures + every tx (5k-50k for a $300K-vol pool) | **5k-50k: NOT FEASIBLE** on RPC | use OWN 24 h swap log (free stream, warm-up); BQ if a key ever exists; never pull per candidate over RPC (R2-7) |
| $9 | **Jupiter round trip** (G10): 2 keyless quotes (SOL->token at size, token->SOL) | 2 HTTP calls, no Helius credits | 0.5 req/s keyless = max ~15 candidates/min; queue; cache 15 s; JUP down + sim available -> R2-14 |
| $10 | **G12 all-pool audit LP holders**: `getTokenLargestAccounts` on each pool's LP mint | 1 per pool (~1-4) | with $7, cached 10 min |

Rough total for a deep candidate: **~300-1000 calls** with funder depth 2 (rev 2: ~200-750). 50-150 deep
candidates/day would need ~15k-150k calls/day before cross-mint caching, so the **25000/day cap will bind**: it covers
roughly 25-80 deep candidates/day (more as the funder/creator caches warm). Candidates past the cap are rejected
`credit_cap`, logged, and counted in the daily report. 25000 x 31 = 775k/month (monthly meter). Credits per call vary by
method (DAS / gPA bill more), so the meter counts credits, not calls. **No upgrade (STOP rule); projections past the
cap go to Apex.**

## 8. Rev 2 questions: status (rev 3)

| Q | Status | Answer (source) |
|---|---|---|
| R2-1 | answered | free tier assumed; cap 25000/day configurable + monthly meter; cheapest-first after Scout + cheap Guard (Apex 14:50) |
| R2-2 | answered | whitelist = 5 Bubu programs; strict lock rule (Bubu 14:52, supersedes Yumi "empty") |
| R2-3 | answered | B lock end >= 7 d after entry (Yumi 14:50; Bubu B-7 `lock_min_end_after_entry_s: 604800`) |
| R2-4 | answered | Block0 = token create slot; graduated pools also migration create slot +3 (Yumi; Bubu B-4) |
| R2-5 | answered | combined hold cap or shared funder = hard reject A and B; 10-15 % = WARN (Yumi; Bubu B-4) |
| R2-6 | **assumed** | direct balances of the launch-layer buyers only (rev 2 assumption) |
| R2-7 | answered | 60 s round trip > 30 % or top-5 pairs > 40 % = FAIL, WARN at half, warming = WARN (Yumi; Bubu B-5) |
| R2-8 | answered | CEX hot wallets excluded via Helius identity labels; funder depth 2 (Yumi; Bubu B-3) |
| R2-9 | answered | peak MC < $20K, 30-day look-back (Yumi; Bubu B-6) |
| R2-10 | answered | cumulative within 60 min, >= 1 % supply; transfers to non-pool wallets count (Yumi) |
| R2-11 | **assumed** | holders deduction scaled min -> 2 x min |
| R2-12 | answered | -10 per WARN, cap -20 (Yumi; Bubu B-8) |
| R2-13 | **assumed** | liquidity exit on SOL reserve |
| R2-14 | **assumed** | model sim alone suffices when Jupiter is down (labelled `sim-approx`); Jupiter platform fee subtracted before the 8 % check |
| R2-15 | **assumed** | retail-held LP = holders outside insider clusters; insider LP = LP held by dev set / clusters |
| R2-16 | answered, **overridden** | Yumi said vs price 1 h / 6 h ago; **Zola Z-1 (later) applies: from the window low + near-high condition** |
| R2-17 | **assumed** | B grad age >= 0, no max |
| R2-18 | **assumed** | copycat = same name+symbol in our cache or vanity-suffix match; flag only |
| R2-19 | **assumed** | unique-buyer points linear 1x -> 0, 2x -> 20 |
| R2-20 | **assumed** | fill delay seeded by order id |

### 8.1 Rev 2 question text (kept for reference)

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

## 9. New questions (rev 3)

- **R3-1 Credit cap vs funnel.** With funder depth 2, a deep candidate costs ~300-1000 calls, so 25000/day covers only
  ~25-80 deep candidates/day. Accept `credit_cap` rejects, or cap hop 2 (for example, hop 2 only for the top 10 holders)?
- **R3-2 Raydium Burn&Earn transferability.** The locked liquidity is permanent, but the fee-key NFT can be transferred.
  Does that fail "non-transferable" (B-2)? Assumed: it counts as locked, because only fee rights move.
- **R3-3 A lock horizon.** A keeps "lock end > max hold + 7 d" (= entry + 8 d). Should A use B-7's "entry + 7 d"?
- **R3-4 Mutable-metadata WARN (B-8).** Is "update authority = dev" the deployer only, or the whole 72 h dev set?
  Assumed: the whole dev set.
- **R3-5 Higher-low recovery (Z-5).** What is the recovery measured on: the price at decision or the window low?
  Assumed: (price at decision - dip low) / (local high - dip low).
- **R3-6 Z-4 "delay stays 120 s".** Read as A only (B keeps 60 s). Confirm.
- **R3-7 Young-pool single funder (B-1).** Is 80 % measured on holder supply excluding pool/program accounts (assumed),
  or on the top-20 holders?
