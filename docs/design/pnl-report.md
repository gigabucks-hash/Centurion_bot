# PnL report (unrealized + realized)

Approved request: show a PnL card/report on every platform, with unrealized PnL while a trade is open
and realized PnL once it is closed.

## One definition, no new API

Nothing was added to the wire contract: the numbers already exist and are authoritative.

| Number | Source | Meaning |
|---|---|---|
| Unrealized | `overview.unrealized_pnl_lamports` / `unrealizedPnlSol` / `unrealized_pnl_lamports` | Mark-to-market of the open remainder, partial sells included |
| Realized | `overview.realized_pnl_lamports` / `realizedPnlSol` / `realized_pnl_lamports` | Closed-trade ledger: take-profits + fully closed trades, net of fees |
| Total | realized + unrealized | Exactly the delta the equity hero shows |
| Per trade | closed position `pnl_lamports` + `pnl_pct` | Locked at close; it must not change with price |

Rules:

- Never recompute realized from the open position list — closed trades are not in that list.
- The total is an exact BigInt/lamport sum, not a float round-trip.
- Realized and unrealized are per mode (Paper / Real). Never add the two modes together.
- Loss is never profit-toned. Exact zero stays neutral (`0,00`, no arrow) per T-15.
- A trade's realized PnL is locked when it closes; the per-trade surface labels it `realized`
  (`Realized PnL` on web) instead of plain "PnL", so open and closed rows cannot be confused.

## Surfaces

| Platform | Surface | Shape |
|---|---|---|
| Mobile | Portfolio home | Flat card `PnlReportCard`: unrealized + realized rows, total, open-position count |
| Mobile | Positions | Same card under the equity card; closed rows and the closed detail show `terealisasi` / `Realized PnL` |
| Web | Dashboard | `PnlReport`: 3-cell partitioned strip (total / unrealized / realized) + closed-trade ledger line, link to the full exit report (`/stats`) |
| Web | Coin trail | Closed position's stat cell is labelled `Realized` |
| Desktop | Positions panel | `PnlReport` strip above the table (total / unrealized / realized), fed by `portfolio.snapshot` |

The full closed-trade report already exists on web at `/stats` (closed count, win rate, total realized,
breakdown per exit reason); the PnL card links to it rather than duplicating it.

## Desktop plumbing

`PortfolioSnapshot.realized_pnl_lamports` was already in the Rust contract but was dropped when the
snapshot was copied into the UI `Account` view. It is now passed through
(`state.rs::set_portfolio` → `view::Account.realized_pnl_lamports` → `Account` in `contract.ts`).
The browser mock tracks realized on each mock sell. No DB or API change.

## Verification

- mobile: `dart format` clean, `flutter analyze` no issues, full `flutter test`
- web: eslint 0 errors, `tsc --noEmit`, `npm test`, `npm run build`
- desktop: `npm run build`, `npm run test:ui`; Rust compiles in CI (local cargo is blocked by
  Application Control 4551)
