# Contracts changelog

## 1.1.1 (2026-10-29)

### Changed
- Account deletion grace period: default 7 days, **server-side** setting `ACCOUNT_DELETION_GRACE_DAYS`, allowed
  range **1–30 days** (was 7–30). `POST /me/deletion` no longer accepts `grace_days` from the client; the
  value is reported in `GET /me/deletion` and `account.deletion_scheduled {scheduled_for, grace_days}`. Cancel is
  allowed at any time until `scheduled_for`; afterwards credentials are hard-deleted and personal data anonymized,
  `audit_log` is retained (actor ip / user agent / device nulled).
- Ingest parser tests run against captured mainnet fixtures (`services/backend/fixtures/mainnet/`).

## 1.1.0 (2026-10-29)

Breaking pre-release corrections. No producer had shipped v1.0 payloads, so per-event `version` stays `1`;
`CONTRACTS_VERSION` = `1.1.0`, `ERROR_CODES_VERSION` = `2`.

### Changed
- **One wire convention: snake_case** for every key (envelope, payloads, REST, settings, SQL) and enum value.
- **Number rule**: SOL amounts = lamport integer strings, raw token amounts = integer strings, prices = decimal strings;
  percentages, ratios, bps, USD notionals, scores, measured values = JSON numbers (were decimal strings).
- Settings keys, exit-preset ids, enum values and identifiers renamed to Sentra's own vocabulary (table below).
- `LAST_IDENTITY` -> `LAST_LOGIN_METHOD` (now HTTP 422).
- Paths: `/coins/{mint}/trail` -> `/coins/{mint}/timeline`, `/stats/exits` -> `/stats/exit-reasons`,
  `/workspaces/{ws}/reset-practice` -> `POST /workspaces/{ws}/practice/reset` (direct, no proposal).
- Telegram login: Login Widget HMAC replaced by official OIDC id_token flow (design-only, flag off).

### Added
- `rev` on every mutable resource, `If-Match` / `expected_rev` required (428), 409 conflict body
  `{current_rev, base_rev, changed_fields, changed_by, changed_at, current}`, `CONFIRMATION_RESTART_REQUIRED`.
- Practice reset (30 SOL, archive by epoch, once per 24 h): endpoint, `practice.reset` event, `RESET_COOLDOWN`.
- Account deletion: `/me/deletion` GET/POST/DELETE, `account.deletion_scheduled|deletion_cancelled|deleted` events.
- Devices / push: `PUT|GET|DELETE /devices`, `DeviceRegistration`, `PushPayload` (EVENTS_SCHEMA.md section 6).
- Error codes: PRECONDITION_REQUIRED, CONFIRMATION_RESTART_REQUIRED, REAUTH_REQUIRED, WALLET_ROLE_CONFLICT,
  RESET_COOLDOWN, ACCOUNT_DELETION_PENDING, ACCOUNT_DELETION_BLOCKED, DEVICE_TOKEN_INVALID, AUTH_TG_INVALID,
  AUTH_TG_REPLAY, AUTH_TG_NO_PROFILE.
- Exit reason `practice_reset`; expire reasons `practice_reset`, `account_deleted`.

### Deprecated
- TS `CoinStream` (alias of `Venue`), removed in 1.2.

### Rename table (v1.0 name -> v1.1 name)

#### Settings

| v1.0 name | v1.1 name |
|---|---|
| `budgetLamports` | `bankroll_lamports` |
| `tradeLamports` | `ticket_lamports` |
| `maxOpen` | `max_concurrent_positions` |
| `maxPoolSharePct` | `max_pool_impact_pct` |
| `askFirst` | (removed; use approval_mode) |
| `approvalMode` | `approval_mode` |
| `codeOnly` | `deterministic_only` |
| `lossStopPct` | `real_drawdown_halt_pct` |
| `practiceStopPct` | `practice_drawdown_halt_pct` |
| `skipTwinCoins` | `avoid_practice_overlap` |
| `streams` | `venues` |
| `minAgeMinutes` | `age_minutes_min` |
| `maxAgeMinutes` | `age_minutes_max` |
| `minGraduatedSeconds` | `since_migration_seconds_min` |
| `minMarketCapUsd` | `mcap_usd_min` |
| `maxMarketCapUsd` | `mcap_usd_max` |
| `minLiquidityUsd` | `liquidity_usd_min` |
| `minVolume24hUsd` | `volume_24h_usd_min` |
| `minHolders` | `holder_count_min` |
| `minBuyers1h` | `unique_buyers_1h_min` |
| `minBuySellRatio` | `buy_to_sell_ratio_min` |
| `maxTop10Percent` | `top_holders_share_pct_max` |
| `minLpBurnPct` | `lp_burned_pct_min` |
| `minTurnover1h` | `volume_to_mcap_1h_min` |
| `maxTurnover1h` | `volume_to_mcap_1h_max` |
| `minMove1hPct` | `change_1h_pct_min` |
| `maxMove1hPct` | `change_1h_pct_max` |
| `sweetMove1hLowPct` | `change_1h_pct_preferred_low` |
| `sweetMove1hHighPct` | `change_1h_pct_preferred_high` |
| `maxDrawdownPct` | `off_high_pct_max` |
| `hourCrashLimit` | `one_minute_dump_pct_max` |
| `mustHave` | `required_checks` |
| `passMark` | `score_threshold` |
| `recheckMovePct` | `revisit_after_move_pct` |
| `rules` | `screen_rules` |
| `shield` | `guard_checks` |
| `maxDevPercent` | `creator_share_pct_max` |
| `maxBundlersPercent` | `bundled_share_pct_max` |
| `maxSnipersPercent` | `sniper_share_pct_max` |
| `dipPct` | `entry_discount_pct` |
| `entryDelayMinutes` | `observe_before_entry_minutes` |
| `entryMaxUpPct` | `skip_if_risen_pct` |
| `breakout` | `range_break_entry` |
| `activeTrading` | `liveness_gate` |
| `rebuy` | `reentry` |
| `tradingDays` | `entry_weekdays_utc` |
| `tradingHours` | `entry_hours_utc` |
| `exitPlan` | `exit_preset` |
| `exits` | `exit_rules` |
| `takeProfits` | `profit_targets` |
| `stopLosses` | `loss_guards` |
| `gainPct` | `at_gain_pct` |
| `sellPct` | `sell_portion_pct` |
| `pullbackPct` | `giveback_pct` |
| `stopLossPct` | `peak_trail_pct` |
| `noTradeSeconds` | `idle_exit_seconds` |
| `drain` | `sell_pressure_exit` |
| `sellFloors` | `sell_floors` |
| `maxLossPct` | `max_loss_pct` |
| `liquidityDropPct` | `liquidity_drop_pct` |

#### Exit Presets

| v1.0 name | v1.1 name |
|---|---|
| `clip` | `momentum_trail` |
| `stake` | `principal_recovery` |
| `flip` | `double_out` |
| `ladder` | `three_step_ladder` |
| `trailingTp` | `peak_giveback` |
| `trail` | `trail_stop_only` |
| `scaleOut` | `incremental_trim` |
| `scalp` | `fast_half` |
| `take30` | `fixed_thirty` |
| `stall` | `new_high_timeout` |
| `stepLock` | `ratchet` |
| `tighten` | `tightening_trail` |
| `doubling` | `geometric_ladder` |

#### Required checks

| v1.0 name | v1.1 name |
|---|---|
| `liquidity` | `liquidity_usd` |
| `volume` | `volume_24h_usd` |
| `marketCap` | `mcap_usd` |
| `age` | `age_minutes_min` |
| `maxAge` | `age_minutes_max` |
| `top10` | `top_holders_share_pct` |
| `lpBurn` | `lp_burned_pct` |

#### Venues

| v1.0 name | v1.1 name |
|---|---|
| `bonding` | `curve` |
| `graduated` | `amm` |

#### Exit Reasons

| v1.0 name | v1.1 name |
|---|---|
| `take_profit` | `profit_target` |
| `stop_loss` | `loss_guard` |
| `trailing_stop` | `peak_trail` |
| `time_out` | `max_hold` |
| `inactivity` | `idle` |
| `drain` | `sell_pressure` |
| `stall` | `no_new_high` |
| `rug` | `rug_detected` |
| `loss_stop` | `drawdown_halt` |

#### Metrics

| v1.0 name | v1.1 name |
|---|---|
| `liquidityUsd` | `liquidity_usd` |
| `marketCapUsd` | `mcap_usd` |
| `volume1hUsd` | `volume_1h_usd` |
| `volume24hUsd` | `volume_24h_usd` |
| `holders` | `holder_count` |
| `buyers1h` | `unique_buyers_1h` |
| `buySellRatio` | `buy_to_sell_ratio` |
| `turnover1h` | `volume_to_mcap_1h` |
| `top10Pct` | `top_holders_share_pct` |
| `lpBurnPct` | `lp_burned_pct` |
| `move1hPct` | `change_1h_pct` |
| `drawdownPct` | `off_high_pct` |
| `devPct` | `creator_share_pct` |
| `bundlersPct` | `bundled_share_pct` |
| `snipersPct` | `sniper_share_pct` |
| `ageMinutes` | `age_minutes` |
| `graduatedSeconds` | `since_migration_seconds` |
| `curveProgressPct` | `curve_progress_pct` |

#### Ruleset

| v1.0 name | v1.1 name |
|---|---|
| `passMark` | `score_threshold` |
| `onMissing` | `on_missing` |
| `zeroAt` | `zero_at` |
| `streams` | `venues` |

#### Other

| v1.0 name | v1.1 name |
|---|---|
| `Stream (coin source type)` | `Venue` |
| `stream (coin field)` | `venue` |
| `pass_mark (screener result / picks column)` | `score_threshold` |
| `coin_outcomes.max_drawdown_pct` | `coin_outcomes.worst_drawdown_pct` |
| `GET /coins/{mint}/trail` | `GET /coins/{mint}/timeline` |
| `GET /stats/exits` | `GET /stats/exit-reasons` |
| `GuardConfig keys dev/bundlers/snipers/top10 (camelCase)` | `creator_share/bundled_share/sniper_share/top_holders_share (snake_case)` |
