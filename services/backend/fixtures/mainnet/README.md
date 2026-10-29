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
- **The quote side is not always SOL.** The captured create's bonding curve holds a non-SOL quote token, and the event carries no quote mint. So the parser does **not** turn the event's reserves into a SOL `PoolState`. Pool state has to come from the bonding-curve account, with the quote mint checked, before Helius-sourced coins feed paper fills.
- **`CompleteEvent` is the curve-complete signal.** The pool migration itself (PumpSwap `migrate`) is a separate, later transaction, and it is not captured here.
- **Failed transactions:** the parser drops every failed tx (`err != null`). The failed-tx test still uses a synthetic frame (`crates/ingest/fixtures/helius/logs_failed.json`).

Re-capture: `HELIUS_API_KEY=… python3 scripts/capture_mainnet_fixtures.py 1200`. This writes new dated files, and the tests then need to point at them (`CAPTURE` const in `source/helius.rs`).
