# Mainnet fixtures (read-only capture)

Captured **2026-10-29 09:36–09:39 UTC (16:36–16:39 WIB)** with `scripts/capture_mainnet_fixtures.py`.
Read-only: one WebSocket subscription plus one `getTransaction` call. No keys, no signing, no transactions sent.
The API key came from the env `HELIUS_API_KEY`; it does not appear in any file (grep-checked).
The frames are stored byte-for-byte as received (one JSON document per file). `capture_meta.2026-10-29.json` holds the same index.

| File | Type | Slot | Signature | Source |
|---|---|---|---|---|
| `logs_create.2026-10-29.json` | pump.fun `CreateEvent` (instruction `CreateV2`, Token-2022 mint) | 462832912 | `5DT6QVW9gAz6rwcFezH3CA4PK5NpuhVW51B63wpWXV398yhH7WHsNPjUQvFqcHLSqqNhaZ6xp5FdPN52Cc449GLM` | Helius standard mainnet WS, `logsSubscribe {mentions:[6EF8…F6P]}`, `confirmed` |
| `logs_trade.2026-10-29.json` | pump.fun `TradeEvent` (sell, routed via CPI; the tx also carries one non-pump event, which the parser skips) | 462832906 | `2jm2SzCUzrvCU6KJZM8yDdfMHDAhvnD5zjAZVeq7c6RFYMyFFVKsxkvWZUAErk6NaMtdicA9mFpwYGgEedQbVbJ9` | same WS |
| `logs_complete.2026-10-29.json` | final `TradeEvent` + `CompleteEvent` (curve complete, mapped to `Migrated`) | 462833663 | `4wHtByUKpco48BzXP9jo2Hy8c9wZ6vGeHaeJudnFjuemU4WCSuYu23P3GSg9x82fsR5R2aTtdzhkS3U9r3T3T3BA` | same WS |
| `get_transaction_create.2026-10-29.json` | `getTransaction` enrichment for the create above | 462832912 | `5DT6QVW9…449GLM` | Helius mainnet RPC `getTransaction` (`json`, `confirmed`, `maxSupportedTransactionVersion: 0`) |

What the capture showed (it is now covered by tests):
- **`CreateEvent`.** It has trailing fields after `user`: `creator` (which differs from the fee payer), `timestamp`, the reserve fields, `token_program`, a mode flag, and more. The parser reads the prefix and ignores the rest.
- **The quote side is not always SOL.** The captured create's bonding curve holds a non-SOL quote token, and the event carries no quote mint. So the parser does **not** turn the event's reserves into a SOL `PoolState`. Pool state therefore comes from the bonding-curve account, with the quote mint checked (see below).
- **`CompleteEvent` is the curve-complete signal.** The pool migration itself (PumpSwap `migrate`) is a separate, later transaction, and it is not captured here.
- **Failed transactions:** the parser drops every failed tx (`err != null`). The failed-tx test still uses a synthetic frame (`crates/ingest/fixtures/helius/logs_failed.json`).

Re-capture: `HELIUS_API_KEY=… python3 scripts/capture_mainnet_fixtures.py 1200`. This writes new dated files, and the tests then need to point at them (`CAPTURE` const in `source/helius.rs`).

## Bonding-curve and mint accounts (read-only `getAccountInfo`)

Captured 2026-10-29 with `scripts/capture_curve_accounts.py` (Helius mainnet RPC `getAccountInfo`, `encoding: base64`,
`commitment: confirmed`; raw JSON-RPC response stored as received, including `context.slot`). Curves at ~16:45 WIB
(09:45 UTC), mints at 17:01 WIB (10:01 UTC). Key scan of every file: clean.

| File | Pubkey | For mint | Slot | Quote mint | Decoded |
|---|---|---|---|---|---|
| `curve_sol_quote.2026-10-29.json` | `Eyp21gEasyUn85yrySC13DoXBSRG5sw8vexe7eLcMSoF` | `Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump` | 462834787 | SOL (all-zero field) | vtok 1397948479570101, vquote 95584963, rtok 1118048479570101, rquote 6, supply 1e15, complete false, creator `DAqfZQBc…NLPf` |
| `curve_sol_quote_complete.2026-10-29.json` | `AouJcarH7kyP86Rf1swYHbYpAt9Js7hRtddt9VqKbfne` | `F6LeVR2QMkzNXcQy6593Kf1hM7CPLnQaQ4eyBAvrpump` | 462834787 | SOL | reserves 0, complete true, creator `92rjsyV1…TKU4` |
| `curve_non_sol_quote.2026-10-29.json` | `BDtQDnH38Y3ab97yP9WFSjwZTPawjvTsuGZH779j2efN` | `McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW` | 462834787 | `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn` | vtok 1072993568334454, vquote 773916469047, rtok 793093568334454, rquote 4638936, creator `9R55983j…sejSQJ` |
| `mint_sol_quote.2026-10-29.json` | `Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump` | (mint) | 462839823 | — | Token-2022, decimals 6 |
| `mint_non_sol_quote.2026-10-29.json` | `McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW` | (mint) | 462839823 | — | Token-2022, decimals 6 |
| `mint_wsol_spl.2026-10-29.json` | `So11111111111111111111111111111111111111112` | (mint) | 462839824 | — | SPL Token, decimals 9 |

BondingCurve layout, worked out from these 166-byte accounts (little-endian; discriminator =
`sha256("account:BondingCurve")[..8]` = `17b7f83760d8ac60`):

| Offset | Size | Field |
|---|---|---|
| 0 | 8 | discriminator |
| 8 | 8 | virtual_token_reserves (u64) |
| 16 | 8 | virtual_quote_reserves (u64; lamports when the quote is SOL) |
| 24 | 8 | real_token_reserves (u64) |
| 32 | 8 | real_quote_reserves (u64) |
| 40 | 8 | token_total_supply (u64) |
| 48 | 1 | complete (bool) |
| 49 | 32 | creator |
| 81 | 2 | two flag bytes (not used) |
| 83 | 32 | quote_mint (all-zero = SOL; wSOL also = SOL) |
| 115+ | — | ignored |

Accounts shorter than 115 bytes have no quote field and are treated as **not tradeable** (never assumed SOL).
Mint layout (SPL Token and Token-2022 base): decimals at byte 44, is_initialized at byte 45; the owner gives
`token_program`. Tests: `crates/ingest/src/curve.rs` (exact decode of every file above) and
`source/helius.rs` (create -> curve + mint fetch, trade cache/fallback).

Re-capture: `HELIUS_API_KEY=… python3 scripts/capture_curve_accounts.py sol_quote=<curve> mint_sol_quote=<mint> …`.
