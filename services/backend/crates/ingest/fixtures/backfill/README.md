# Backfill fixtures

`signatures_page1.json`: a `getSignaturesForAddress` page shaped like the RPC response. The 912 and 906 entries use
the real mainnet signatures of `../../../../fixtures/mainnet/get_transaction_create.2026-10-29.json` and
`logs_trade.2026-10-29.json`; the 950 (unknown tx), 940 (failed) and 890 (older than the stream cursor) entries are
synthetic, so the test covers skip-failed, dedup, not-available and the lower bound.
