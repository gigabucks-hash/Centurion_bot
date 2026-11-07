# Web Paper Bug Hunt v3

**Target:** `C:\cw\app` shared tree, HEAD `025e4884f321706f8647ed5b1cc19b16fe7cd606` (`origin/main` matched at start). Paper mode only; contracts `1.1.6` and token `0.3.4` unchanged. No application fixes were made by this sweep. The initial uncommitted tree contained other agents' web/backend work; final paths are shown by `git status --short` and must not be staged by QA.

## Verdict

F1 is **PASS** in the tested web paths: missing PnL remains `null` through the wire decoders and renders as an em dash, not `0.00`. Real HTTP server-render evidence covered the dashboard PnL report and `/pnl`; the unit repro separately covered decoder/report helpers. The paper web surface is usable for the tested dashboard, strategies, positions, PnL, screener, settings Stop, and strategy mode card flows, subject to the open defects below.

F1 proof is specific: `render_http_v3.mjs` observed three `data-testid="pnl-not-reported"` cells on `/` when the all-time summary values were null; `/pnl` showed an em dash in the all-time reconciliation side while the range side had a reported value; the ledger showed a nonzero closed PnL. `f1_retest_v3.ts` and `null_money_audit_v3.ts` exercise `pnlSummaryFromWire`, `pnlReportFromSummary`, and the coin decoder. `PositionsBoard.tsx` also passes unknown marks as `null` to `Pnl` (`PositionsBoard.tsx:177,232-233`). This proves the tested null paths, not every future component.

## Defects

| ID | Severity | Status | File:line | Reproduction / expected vs actual |
|---|---:|---|---|---|
| V3-P1-COIN-REAL | P1 | Reproduced | `apps/web/lib/http-api.ts:275-284` | In HTTP paper mode, request `/coins/{mint}`. `getCoinTrail()` probes both timelines and `timeline("real")` receives `403 REAL_SOL_DISABLED`; the catch only handles `NOT_FOUND`/`VALIDATION_FAILED` at `:279-281`. The page (`apps/web/app/(app)/coins/[mint]/page.tsx:164`) returns HTTP 500. Expected: paper coin detail renders the trail, or treats disabled Real as empty. Actual: 500. Server log stack: `http-api.ts:277,284` → page `:164`; API body says `REAL_SOL_DISABLED`. |
| V3-P2-OVERVIEW-NULL | P2 | Reproduced | `apps/web/lib/http-api.ts:194-197` | With `/portfolio/overview` returning `null`, dashboard PnL card correctly shows em dashes, but overview tile receives `realized = ... ?? 0` and renders `Realized PnL flat 0.00 paper SOL` (`apps/web/app/(app)/(dashboard)/page.tsx:76`). Expected: missing value remains missing / em dash. Actual: 0.00. The same method also coerces missing positions cost/unrealized at `:195,197`. |
| V3-P2-STRATEGY-STATS | P2 | Reproduced | `apps/web/lib/http-api.ts:98-105` | API `/strategies` wire has no `stats`; render `/strategies` or dashboard strategy table. `strategyFromWire()` hardcodes `realizedPnlSol: 0` at `:103`; cards render `0.00` at `apps/web/app/(app)/strategies/(list)/page.tsx:50` and dashboard `:109`. Expected: unavailable/— until stats exist. Actual: 0.00. |
| V3-P3-EXIT-NULL | P3 | Decoder repro; server shape not produced by current fills | `apps/web/lib/contracts.ts:719-724` | Call `exitStatFromWire()` with `count:1`, `pnl_lamports:null`, `avg_pnl_pct:null`. The API can emit null `avg_pnl_pct` when every closed row in a bucket has `sol_in_lamports = 0` (`0003_contracts_v1_1_2.sql:319-320`); current fills always spend SOL, so this is hardening rather than an observed paper loss. `null_money_audit_v3.ts` observed `totalPnlSol:0`, `avgPnlSol:0`, `avgPnlPct:0`, `winRate:0`. Expected unknown fields to remain null/—. Actual zero coercions. |
| V3-P3-TRAIL-PNL | P3 | Reproduced by helper/source audit | `apps/web/app/(app)/(dashboard)/page.tsx:122`, `apps/web/lib/http-api.ts:442-466` | A trail position with unknown PnL reaches the dashboard coin-trail link; the HTTP mapper can produce `NaN` and the Pnl formatter path displays `0.00 paper SOL`. Expected em dash for unknown PnL. Actual 0.00. `trail_nan_v3.ts` exits 0 with this observation. |
| V3-P3-USD-DERIVED | P3 | Reproduced by helper/source audit | `apps/web/lib/contracts.ts:574,700-701`; `apps/web/lib/client.ts:154` | `positionFromWire()` receives valid SOL entry/mark but no USD fields (the wire has none) and derives USD with `MOCK_SOL_USD = 150`; audit observed `$0.00225` for `0.000015 SOL`. Reachable in http mode after a manual sell, when the close response's `position_after` replaces a row that had `priceUnknown:true` (`client.ts:154`), so USD cells switch from em dash to synthetic USD. Expected server-reported USD or explicit unavailable state. |
| V3-P3-MOCK-PAUSE | P3 | Reproduced by source audit | `apps/web/lib/mock/trading.ts:16` | Mock `pauseBuys()` changes `agentTradeEnabled` to `!paused`, while HTTP trading wire preserves server `agent_settings.trade_enabled`. Expected mock and HTTP semantics to match; actual mock couples agent execution flag to buy pause. |

The dashboard tile and strategy-card findings are real render observations from `render_http_v3.mjs`, not inferred solely from source. The remaining P3 findings are executable helper/source audit evidence and are labelled accordingly.

### Null-money audit scope

`grep` for `?? 0` / `|| 0` across the money paths (`http-api.ts`, `contracts.ts`, `pnl-report.ts`, `mock/trading.ts`, `mock/store.ts`, `client.ts`) found hits in every one of those modules. Most are safe or guarded: `positionView()` keeps `markUnknown` and `priceUnknown` so the positions board and its summary pass `null` to `Pnl` (`PositionsBoard.tsx:177,232-233`); `/pnl` guards every nullable card value (`pnl/page.tsx:94-102,130-154`); `closedTradeFromWire`, `pnlSummaryFromWire`, `Pnl.tsx`, and `PnlReport.tsx` keep null. The render-reaching coercions are V3-P2-OVERVIEW-NULL, V3-P2-STRATEGY-STATS, V3-P3-TRAIL-PNL, and V3-P3-USD-DERIVED (after a manual sell); V3-P3-EXIT-NULL is latent at the decoder and V3-P3-MOCK-PAUSE is mock-only. `pnlReport()`'s `|| 0` fallback (`pnl-report.ts:75-77`) is only used when `GET /stats/pnl` fails; the primary dashboard path uses `pnlReportFromSummary`, which preserves null (verified by `null_money_audit_v3.ts`).

## Passing HTTP checks

Using a synthetic deterministic ed25519 SIWS owner (not Phantom), scratch Postgres `centurion_bbv3` on `127.0.0.1:55432`, paper API `127.0.0.1:8091`, and Next dev server `127.0.0.1:3111` with `DATA_SOURCE=http API_BASE_URL=http://127.0.0.1:8091`:

- SIWS nonce/verify, session cookie minting, authenticated page requests: PASS.
- Dashboard, `/pnl`, `/strategies`, `/positions`, `/coins`, `/settings`, strategy edit: HTTP 200 and expected content PASS.
- Strategy mode surface: edit page contains `data-testid="paper-progress"`; paper→Real remains server locked (the separate HTTP flow probe observed `403 MODE_NOT_ALLOWED` / `needs_owner_approval`). PASS for safe paper behavior.
- Workspace Stop: real HTTP pause returned 200; paused banner rendered on dashboard and strategies; resume returned 200 and banner cleared. PASS.
- Screener tradeable chip: non-wSOL quote row rendered `data-not-tradeable`. PASS.
- Open position: mark-driven unrealized rendered `+0.015`; unknown-mark paths stay em dash in the PositionsBoard. PASS.
- `/pnl` keyset paging: API page 1 = 50, page 2 = 6, no overlap; rendered page 1 = 50 rows, older cursor link, page 2 = 6 rows; `window=24h` retained three em-dash cells. PASS.
- Practice reset: first reset 200, archived 57 positions and closed one open position; immediate second reset 429 `RESET_COOLDOWN` with `next_allowed_at`; open state empty and reset history row present. PASS.
- Approval approve/reject, If-Match revision conflict, idempotency, positions manual sell, and pause/resume replay: PASS in `http_paper_flows_v3.mjs` using the scratch API. Manual sell replay returned the same order ID with `Idempotent-Replayed`; a second queued close is accepted until fill-time guards run, which is documented by the repro.

## Exact repro commands and order

Run from repo root. The scratch DB is disposable; `http_reset_v3.mjs` is destructive and must be last.

```powershell
$env:PATH="C:\Users\H P\OpenBot\Shared\toolchain\node;$env:PATH"
node --import ./apps/web/node_modules/tsx/dist/loader.mjs docs/qa/repro/v3/f1_retest_v3.ts
node --import ./apps/web/node_modules/tsx/dist/loader.mjs docs/qa/repro/v3/null_money_audit_v3.ts
node docs/qa/repro/v3/http_paper_v3.mjs
node docs/qa/repro/v3/http_paper_flows_v3.mjs
node docs/qa/repro/v3/render_http_v3.mjs
$env:PGDATABASE="centurion_bbv3"
node docs/qa/repro/v3/http_pnl_paging_v3.mjs
node docs/qa/repro/v3/strategy_stats_v3.ts
node docs/qa/repro/v3/trail_nan_v3.ts
node docs/qa/repro/v3/http_reset_v3.mjs  # LAST; resets the scratch practice epoch
```

`render_http_v3.mjs` expects the API and Next server already running. Launch the latter from `apps/web` with `DATA_SOURCE=http`, `API_BASE_URL=http://127.0.0.1:8091`, `next dev -p 3111`. `http_pnl_paging_v3.mjs` seeds 55 disposable closed rows and must run before reset. The commands above were run; `null_money_audit_v3.ts`, render (13/13 checks, 4/4 defects), paging (all checks), and reset (all checks) exited 0.

Stack used: Postgres 17 on `127.0.0.1:55432`, scratch DB `centurion_bbv3` with the migration shim and all 26 SQL migrations applied in order; paper API from `services/backend/api` (`node src/main.ts`) on `127.0.0.1:8091` with `TRADING_MODE=paper`, `AUTH_SIWS_DOMAINS=localhost:3100`, and the synthetic owner address below in `OWNER_WALLETS`; session/JWT secrets supplied as local test values, never committed. All `v3` probes derive the same test-only ed25519 key from seed bytes 1..32 (`9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj`), so they can sign SIWS without Phantom. Put the PostgreSQL `bin` on `PATH` for the paging probe's `psql`, and set `PGDATABASE=centurion_bbv3`.

## Unverified / scope exclusions

- Phantom browser login and real wallet signatures: **UNVERIFIED**; synthetic SIWS proves API/session behavior only.
- Browser-level interactions (approval decision buttons, sell-sheet hold gesture/D8, strategy mode hold, Settings Stop confirm dialog): **UNVERIFIED** as UI gestures. The same routes, If-Match/Idempotency behavior, and server-rendered controls were verified over HTTP and in HTML; no real pointer interaction was driven.
- Coin-detail trail's intended tradeable reason and disabled CTA: **UNVERIFIED in HTTP render**, because the page is blocked by V3-P1 and returns 500. The screener chip itself is verified.
- Real-mode execution: intentionally unavailable / not tested; paper-only requirement.
- Desktop/mobile-only behavior and viewport pixel checks: out of scope; do not treat as web defects here.
- Production deployment, secrets, and real database: not tested.

## Initial/final tree record

Exact initial HEAD: `025e4884f321706f8647ed5b1cc19b16fe7cd606`; `origin/main` matched. `git status --short` during the sweep (other agents' uncommitted work plus this sweep's QA files; QA changed only `docs/qa/BUG_HUNT_v3.md` and `docs/qa/repro/v3/**`):

```text
 M apps/web/app/(app)/(dashboard)/page.tsx
 M apps/web/app/(app)/settings/page.tsx
 M apps/web/app/(app)/strategies/(list)/page.tsx
 M apps/web/app/(app)/strategies/[id]/edit/page.tsx
 D apps/web/app/api/mock/strategies/[id]/mode/route.ts
 M apps/web/components/positions/PositionsBoard.tsx
 M apps/web/components/strategy/StrategyModeCard.tsx
 M apps/web/lib/api.ts
 M apps/web/lib/client.ts
 M apps/web/lib/http-api.ts
 M apps/web/lib/i18n/en.ts
 M apps/web/lib/i18n/id.ts
 M apps/web/lib/mock/index.ts
 M apps/web/lib/mock/store.ts
 M apps/web/lib/schemas/wire.ts
 M apps/web/lib/types.ts
 M docs/qa/QA_PLAN_v1.md
 M docs/release/web-local.md
 M services/backend/api/src/routes_strategies.ts
 M services/backend/docs/TECH_DESIGN.md
?? apps/web/app/api/v1/workspaces/[ws]/strategies/[id]/mode/
?? apps/web/app/api/v1/workspaces/[ws]/trading/
?? apps/web/components/BuyingPausedBanner.tsx
?? apps/web/components/settings/TradingControls.tsx
?? apps/web/lib/__tests__/trading-store.test.ts
?? apps/web/lib/__tests__/web-gaps.test.ts
?? apps/web/lib/hold-hint.ts
?? apps/web/lib/mock/trading.ts
?? apps/web/lib/trading-client.ts
?? apps/web/lib/trading.ts
?? docs/qa/repro/v3/
?? services/backend/api/test/strategy_mode.test.ts
?? services/backend/docs/STRATEGY_MODE.md
?? services/backend/supabase/migrations/0026_strategy_mode_switch.sql
```

`docs/qa/QA_PLAN_v1.md` is the Product Tester's concurrent work, not this sweep's. The Lead remains the only committer; QA did not stage, commit, or push.

