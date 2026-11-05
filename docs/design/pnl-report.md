# PnL report (unrealized + realized)

Approved request: show a PnL card/report on every platform, with unrealized PnL while a trade is open
and realized PnL once it is closed.

## One definition, no new client-side maths

The card can be built from numbers that already existed; the two gaps that were server-side are now closed by
migration `0022_pnl_report.sql` (additive, no contract bump).

| Number | Source | Meaning |
|---|---|---|
| Unrealized | `overview.unrealized_pnl_lamports` / `unrealizedPnlSol` / `unrealized_pnl_lamports`, or `GET /stats/pnl` | Mark-to-market of the open remainder, partial sells included |
| Realized | `overview.realized_pnl_lamports` / `get /stats/pnl` `realized_pnl_lamports` | Closed-trade ledger: take-profits + fully closed trades, net of swap fees |
| Total | realized + unrealized (`/stats/pnl` returns it already summed) | Exactly the delta the equity hero shows |
| Per trade | closed position `pnl_lamports` + `pnl_pct` (REST, 0022) | Locked at close; it must not change with price |
| Range report | `GET /stats/pnl?window=7d` + `GET /positions?state=closed&window=7d` | Windowed realized, closed count, win rate, avg hold; ledger ordered by `closed_at` |

Rules:

- Never recompute realized from the open position list — closed trades are not in that list.
- Never sum a paginated page to get realized for a range: `/stats/pnl` computes it in SQL. The range value and
  the all-time snapshot value may differ (partial take-profits on open positions, closes outside the range);
  say so, do not "fix" it.
- `fees_lamports` is reported context, not a second subtraction: the swap fee is already inside `sol_in`/`sol_out`.
- The total is an exact BigInt/lamport sum, not a float round-trip.
- Realized and unrealized are per mode (Paper / Real). Never add the two modes together.
- Loss is never profit-toned. Exact zero stays neutral (`0,00`, no arrow) per T-15.
- A trade's realized PnL is locked when it closes; the per-trade surface labels it `realized`
  (`Realized PnL` on web) instead of plain "PnL", so open and closed rows cannot be confused.

## Surfaces

| Platform | Surface | Shape |
|---|---|---|
| Mobile | Portfolio home | Flat card `PnlReportCard`: unrealized + realized, total, open-position count; tap opens `/pnl` |
| Mobile | Positions | Same card under the equity card; closed rows and the closed detail show `terealisasi` / `Realized PnL` |
| Mobile | `/pnl` report | 1D/7D/30D/All chips, server strip (realized·range, closed, win rate, avg hold, fees), all-time footer, range ledger with logos |
| Web | Dashboard | `PnlReport`: 3-cell partitioned strip (unrealized / realized / total) + closed-trade line; "Full report" link |
| Web | `/pnl` report | Bot + range filters (1D/7D/30D/All, default 7D), all-time card, 5-cell range strip, reconciliation note, keyset ledger 50/page with entry→exit and reported fees |
| Web | Coin trail | Closed position's stat cell is labelled `Realized` |
| Desktop | Positions panel | `PnlReport` strip above the table (unrealized / realized / total), fed by `portfolio.snapshot` |
| Desktop | PnL report dialog | Range chips, server strip, reconciliation + fees note, closed ledger newest first |

The legacy `/stats` exit-reason breakdown stays as the exit-reason view; `/pnl` is the money view and
links to it instead of duplicating the breakdown.

## Desktop plumbing

`PortfolioSnapshot.realized_pnl_lamports` was already in the Rust contract but was dropped when the
snapshot was copied into the UI `Account` view. It is now passed through
(`state.rs::set_portfolio` → `view::Account.realized_pnl_lamports` → `Account` in `contract.ts`).
The browser mock tracks realized on each mock sell. No DB or API change.

## Backend (0022)

`GET /stats/pnl` is the one call a card needs: `unrealized_pnl_lamports`, `realized_pnl_lamports` (portfolio,
all-time), `total_pnl_lamports`, plus the range's `realized_pnl_window_lamports`, `closed_count`, `win_rate_pct`,
`avg_hold_s`, `fees_lamports`, best/worst. `GET /positions?state=closed&window=7d` now filters by `closed_at`
and returns each closed row's `pnl_lamports`, `pnl_pct`, `hold_seconds`. Definition: `sol_out - sol_in`; fees
are reported, never subtracted twice. Tests: `api/test/pnl.test.ts`.

## Verification

- mobile: `dart format` clean, `flutter analyze` no issues, full `flutter test`
- web: eslint 0 errors, `tsc --noEmit`, `npm test`, `npm run build`
- desktop: `npm run build`, `npm run test:ui`; Rust compiles in CI (local cargo is blocked by
  Application Control 4551)

## Known gaps (v1.1)

Deliberate, tracked scope that v1 ships without:

- **Full receipt per closed trade on desktop and mobile.** Web's ledger already carries in, out,
  reported fees, entry→exit and bot; desktop and mobile rows show realised PnL, %, hold, exit reason
  and close time, and link to the position detail. SOL in/out and reported fees per row are next.
- **Bot filter on mobile and desktop.** The strip's unrealised/realised/total are a workspace+mode
  snapshot and do not narrow by `strategy_id`, so a bot filter would mix two scopes in one strip.
  Web exposes it and states the scope; mobile and desktop show workspace numbers only.
- **Mobile string extraction.** The 23 report strings live in `pnl_strings.dart` until an
  `@sentra/i18n` round publishes them to ARB and the vendored copies and pin are updated.
- **Web visual check.** `/pnl` is covered by typecheck, tests and the build, but no light/dark
  screenshot pass has been recorded yet.
- **REST adapter mapping on mobile.** The repository override outside `lib/` still has to map
  `pnl_lamports`, `pnl_pct`, `hold_seconds`, `logo_hash` and `logo_url` onto `Position`.
