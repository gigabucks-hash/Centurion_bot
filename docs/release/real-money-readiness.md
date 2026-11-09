# Real-money readiness (gate document)

Real money is **off in code, not by configuration alone**. This page records what is already true, what is
still missing, and in which order the missing pieces have to land. It is not an approval and not a
compliance statement.

## What is enforced today

| Control | Where | Evidence |
|---|---|---|
| The whole product runs paper only | `services/backend/api/src/config.ts:153-155` | `REAL_TRADING_ENABLED` is refused at start; probe shows `real_enabled:false` |
| A strategy cannot move to Real | strategy mode route + `0026`/`0027` | HTTP probe: `POST .../mode` practice -> real = `403 MODE_NOT_ALLOWED` (`real_locked_reason: needs_owner_approval`) |
| No live executor | backend features + `.env.example` | CI fails if `live-execution` is compiled into `ingest`; `LIVE_EXECUTION_ENABLED=false` |
| No keys, no signing, no withdrawal | backend + desktop | no key material in the repo; desktop asks for `read` + `trade`, never `trade:real` |
| Real UI is a locked card, not a hidden switch | web + desktop | Paper/Real card explains the lock; server refuses regardless of the client |

The Windows installer published as `desktop-v0.2.0` ships with Real locked. Installing it cannot enable
real trading.

## Data-model blockers (must be fixed before Real can even be tested)

These come from the Phase-7 review in `docs/qa/BUG_HUNT_v1.md` and are **not** cosmetic:

| ID | Problem | Location | Effect if Real were enabled |
|---|---|---|---|
| L1 | `portfolio_latest` keeps one row per workspace (`distinct on (workspace_id)`), not per workspace+mode | `supabase/migrations/0002_contracts_v1_1.sql:300-305` | A newer real snapshot hides the practice snapshot; `/stats/pnl` loses the practice card |
| L2 | Practice reset closes/archives **every** mode and advances the workspace `practice_epoch` | `0002_contracts_v1_1.sql:346-354`, `0022_pnl_report.sql:69`, `routes.ts:127-128` | Resetting practice would close and archive real positions with `exit_reason=practice_reset` |

Both are being fixed as per-mode isolation with SQL regression tests. Until those tests exist and pass,
enabling Real would corrupt history, so the lock stays.

## Decisions only the owner can make

1. **Custody and signing**: Turnkey, Crossmint, or a self-custodied signer. This decides whether keys ever
   exist server-side, which the security review has to sign off on.
2. **Withdrawal policy**: allowlist, per-transaction cap, daily cap, and who can change them.
3. **Risk limits**: max position SOL, max slippage, max open positions, kill switch behaviour.
4. **Funding**: which wallet, how much for the first canary, and who can top it up.
5. **Legal/tax**: entity, jurisdiction, and what the app may claim about performance.
6. **Phase 7 approval**: the explicit go/no-go, with L1/L2 closed and the executor audited.

## Order of work once the owner decides

1. Land L1/L2 with tests (paper behaviour unchanged).
2. Build the executor behind a compile-time feature that CI proves is off by default.
3. Devnet canary with the smallest possible size; every order needs hold-to-confirm.
4. Live canary with hard caps, reconciled against the chain, with an incident runbook.
5. Only then remove the `practice -> real` 403 for strategies that pass the per-strategy gate.

## What is still unverified today

- Real Phantom signature on a physical device (probes use a synthetic ed25519 key).
- Custody provider integration (none chosen, none coded).
- Chain reconciliation, withdrawal, and any live order path (do not exist).
