# `tradeable` / `skip_reason` on coin reads

`GET /v1/workspaces/{ws}/coins` and `GET .../coins/{mint}` now carry the screener's
tradeability pair, additive to contracts 1.1.6:

| key | type | meaning |
|---|---|---|
| `tradeable` | boolean | practice mode can trade this pool |
| `skip_reason` | string / null | `UNSUPPORTED_QUOTE_MINT` when `tradeable` is false |

## Rule

The rule is the same one the screener uses (`common::is_sol_quote`):

- no `quote_mint` (legacy source, unknown) -> tradeable
- `So11111111111111111111111111111111111111112` (wSOL) -> tradeable
- any other mint -> not tradeable, `skip_reason = UNSUPPORTED_QUOTE_MINT`

This is a quote-capability flag, not the pick verdict. A SOL-quoted coin can still be
rejected by score, guards, or hype checks; the screener list keeps showing those rows.

## Consumers

The web screener passes the flag through (`RawCoin.tradeable/skip_reason`) and renders the
`Not tradeable` chip plus the `?status=not_tradeable` filter (WF-20/21). A response without
the keys keeps the old behaviour (treated as tradeable) so older servers stay compatible.
