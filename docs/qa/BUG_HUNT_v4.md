# Web Paper Bug Hunt v4 — v3 defect recheck

**Target:** `C:\cw\app` at HEAD `c03154ac7286770b42e030d4b3aba6c78b2432ee` (= `origin/main`), tested 2026-11-08. The v3 report tested `025e488`; this is a delta recheck, not a new full sweep. Paper only; no app fixes by QA; no git add/commit/push.

The tree was dirty while tested (other agents' work). Web files that matter to this recheck were modified but uncommitted: `apps/web/lib/contracts.ts`, `apps/web/lib/http-api.ts`, `apps/web/lib/marks.ts`, `apps/web/lib/types.ts`. The production build and the probes below exercised that dirty tree, so the USD/mark fixes are verified **as uncommitted work**; re-run after the Lead commits if the diff changes.

## Verdict

All seven v3 findings are fixed at this tree except **V3-P3-EXIT-NULL**, which is unchanged and remains a latent, non-reachable-in-practice coercion. F1 is still green. The coin-detail gap that v3 had to mark UNVERIFIED is now rendered and verified. No new P1/P2 was found in the rechecked paths.

## v3 → v4 status

| v3 ID | v4 status | Evidence at `c03154a` (+ dirty web files) |
|---|---|---|
| V3-P1-COIN-REAL | **Fixed, verified** | `apps/web/lib/http-api.ts:283-287` treats a failed Real probe as empty (`mode === "real" && e instanceof ApiError`); practice errors still surface. API `/coins/{mint}/timeline?mode=real` still returns 403 `REAL_SOL_DISABLED`. Real render: `GET /coins/EPjF…Dt1v` and `/coins/DezX…` both **200** (were 500). |
| V3-P2-OVERVIEW-NULL | **Fixed, verified** | `http-api.ts:198-210` now leaves `positions_cost`, `realized`, `unrealized` and `open_positions` null. Dashboard renders `Realized PnL — — vs start`, `Open positions — — used · unrealized —`, and three `data-testid="pnl-not-reported"` cells. No `flat 0.00` and no `0 /` count. |
| V3-P2-STRATEGY-STATS | **Fixed, verified** | `http-api.ts:101-106` maps missing `stats` keys to `null`. `/strategies` card for `BB v4 recheck` renders `Realized —`, not `0.00`; dashboard table renders `—`. |
| V3-P3-EXIT-NULL | **Still present (latent P3)** | `apps/web/lib/contracts.ts:723-728` still does `lamportsToSolNumber(...) ?? 0` and `avg_pnl_pct ?? 0`. `decoder_recheck_v4.ts` observed `{totalPnlSol:0, avgPnlSol:0, avgPnlPct:0, winRate:0}` for null inputs. Server emits null `avg_pnl_pct` only when every closed row in a bucket has `sol_in_lamports = 0` (`0003_contracts_v1_1_2.sql:319-320`), which current fills do not produce. Hardening item, not observed on paper data. |
| V3-P3-TRAIL-PNL | **Fixed in code/decoder; not render-reachable in http** | Dashboard link now passes `sol={trail.positions[0].pnlSol ?? null}` (`app/(app)/(dashboard)/page.tsx:122`) and `trailPositionFromWire` keeps `pnlSol: … ?? null` (`http-api.ts:469`). HTTP `coinRows` never yields status `closed`, so the trail card is mock-only today; no live HTTP render path to re-test. |
| V3-P3-USD-DERIVED | **Fixed, verified (uncommitted)** | `contracts.ts:700-704` and `positionView` return `entryPriceUsd/nowPriceUsd = NaN` plus `nowPriceSol`; `marks.ts` rescales realtime marks from the SOL mark. Decoder observed `NaN/NaN/0.000015` and a 2× SOL mark producing `+0.53 SOL` without a USD price. Positions HTML contains no `$0.00225` (no 150 USD/SOL derivation). |
| V3-P3-MOCK-PAUSE | **Fixed** | `apps/web/lib/mock/trading.ts:16` no longer writes `agentTradeEnabled` on pause/resume; the source invariant in `decoder_recheck_v4.ts` passes. |

### Previously UNVERIFIED, now verified

- Coin detail's not-tradeable reason and disabled CTA render in http paper mode: the page is 200, contains `data-not-tradeable`, and shows `Not tradeable … No SOL quote pair for this coin`.

## Method and stack

Fresh scratch stack, separate from the stack another agent already had on 8080/3100:

- Postgres 17 `127.0.0.1:55432`, database `centurion_bbv4`, local shim plus migrations `0001`–`0027`.
- Paper API on `127.0.0.1:8197` with the synthetic test owner `9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj` (deterministic ed25519 seed in the repro; not Phantom).
- Web built with `npm run build` and served with `next start` on `127.0.0.1:3121`, `DATA_SOURCE=http`, `API_BASE_URL=http://127.0.0.1:8197`.

Method note: the first attempt used port 8091, which another agent's API already held, so it read a different workspace/database. That run was discarded; all evidence above is from the isolated 8197/3121 stack. A `next dev` server on 3111 (another agent) refused a second dev instance, hence the production build.

## Commands

```powershell
# apps/web, with the API above already running
npm.cmd run build
npm.cmd test

# repo root
$env:PGDATABASE="centurion_bbv4"; $env:BB_API="http://127.0.0.1:8197"; $env:BB_WEB="http://127.0.0.1:3121"
node docs/qa/repro/v4/recheck_v4.mjs
node --import ./apps/web/node_modules/tsx/dist/loader.mjs docs/qa/repro/v4/decoder_recheck_v4.ts
```

Results: `recheck_v4.mjs` **12/12 checks, exit 0** (SIWS, null overview, no-stats strategy wire, practice/real timeline, coin detail 200 + reason, dashboard em dashes, strategy card em dash, open mark `+0.015`, no synthetic USD, F1 ledger/card, page 200s). `decoder_recheck_v4.ts` **exit 0**. Web build exit 0. Web tests **108 total, 107 pass, 0 fail, 1 skip**. `git diff --check -- docs/qa` clean.

The v3 repros are superseded: they assert the old defect behavior (500, `0.00`, `?? 0`), so a failure there is expected and is not a regression signal.

## Unverified / scope

- Phantom browser login and real wallet signatures: still **UNVERIFIED**; synthetic SIWS proves session/API behavior only.
- Browser gestures: manual sell followed by the `position_after` USD path, D8 hold hint, mode-switch hold, Stop confirm are **UNVERIFIED** as pointer interactions. The decoders, routes, and static HTML were verified.
- Realtime mark push in a browser: unit-level only (`applyMark`).
- Desktop/mobile rendering, deploy/HTTPS, Docker runtime beyond the prior CI evidence: out of scope.

## Written by this sweep

- `docs/qa/BUG_HUNT_v4.md`, `docs/qa/repro/v4/recheck_v4.mjs`, `docs/qa/repro/v4/decoder_recheck_v4.ts`.
- Scratch: DB `centurion_bbv4`, `.next` production build in `apps/web`, temp logs/JSON under `C:\cw\` and `%TEMP%\opencode\`. No source changes, no staging/commits.
