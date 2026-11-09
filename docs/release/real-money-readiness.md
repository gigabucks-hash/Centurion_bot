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

## Data-model blockers (closed before Real can even be tested)

These come from the Phase-7 review in `docs/qa/BUG_HUNT_v1.md` and were **not** cosmetic. Both are fixed in
`0028_per_mode_practice_reset.sql` and proved by `supabase/tests/97_per_mode_reset.sql` (commit `babfa7b`,
CI backend `sql` + `rust` green):

| ID | Was | Now | Proof |
|---|---|---|---|
| L1 | `portfolio_latest` kept one row per workspace (`distinct on (workspace_id)`), so a newer real snapshot hid the practice snapshot | one row per `(workspace_id, mode)`; the practice epoch only filters practice rows | `97_per_mode_reset.sql:30-70`: overview practice stays 29.75 SOL while a newer real snapshot exists |
| L2 | Practice reset closed/archived **every** mode, including real positions and approvals | reset touches `mode='practice'` only (positions, approvals, fill/snapshot counts, `first_buy_at`); per-mode epoch in `0022:69` and `routes.ts:127-130` | `97_per_mode_reset.sql:72-116`: real positions, approvals and snapshots survive a practice reset |

Enabling Real still cannot corrupt practice history, but it remains locked: the lock is about custody,
signing, limits and approval, not about these two bugs.

## Decisions only the owner can make

1. **Custody and signing**: Turnkey, Crossmint, or a self-custodied signer. This decides whether keys ever
   exist server-side, which the security review has to sign off on.
2. **Withdrawal policy**: allowlist, per-transaction cap, daily cap, and who can change them.
3. **Risk limits**: max position SOL, max slippage, max open positions, kill switch behaviour.
4. **Funding**: which wallet, how much for the first canary, and who can top it up.
5. **Legal/tax**: entity, jurisdiction, and what the app may claim about performance.
6. **Phase 7 approval**: the explicit go/no-go, with L1/L2 closed and the executor audited.

## Order of work once the owner decides

1. ~~Land L1/L2 with tests (paper behaviour unchanged).~~ Done in `babfa7b`.
2. Build the executor behind a compile-time feature that CI proves is off by default.
3. Devnet canary with the smallest possible size; every order needs hold-to-confirm.
4. Live canary with hard caps, reconciled against the chain, with an incident runbook.
5. Only then remove the `practice -> real` 403 for strategies that pass the per-strategy gate.

## What is still unverified today

- Real Phantom signature on a physical device (probes use a synthetic ed25519 key).
- Custody provider integration (none chosen, none coded).
- Chain reconciliation, withdrawal, and any live order path (do not exist).
- RLS visibility of the per-mode overview with a JWT that carries `trade:real` is not exercised by a test; the
  paper API never issues one while Real is locked.
