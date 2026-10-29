# Sentra backend: technical design (Phase 1 in detail, then Phases 2 and 4)

Owner: Backend API Specialist. Status: v1.1, 2026-10-29. Contracts: `packages/contracts/*`.
**Hard rules:** paper trading only. No private keys anywhere. Only `PaperExecutor` ships; `LiveExecutor`
is a stub behind the `live-execution` cargo feature (off) and returns `LiveDisabled`. The service refuses
to start unless `TRADING_MODE=paper`, and the DB rejects `mode='real'`. All code, names and vocabulary are
original; a third-party reference bot was consulted only to understand the feature set.

## 1. Architecture

```mermaid
flowchart LR
  subgraph Sources
    HWS[Helius WS logsSubscribe + getTransaction] --> ING
    PP[PumpPortal WS] --> ING
    YS[Yellowstone gRPC: pending provider choice] -.-> ING
    HEL[Helius RPC/DAS] --> GRD
  end
  ING[ingest: normalise + dedupe] --> SCR[screener: rules -> score]
  SCR --> GRD[guard: rug checks -> verdict]
  GRD --> ENT[entry state machine]
  ENT -->|ask mode| APQ[(approvals)]
  APQ -->|approved| EXE
  ENT -->|auto| EXE[PaperExecutor: fill model]
  EXE --> EXIT[exit engine: plans as data]
  EXIT --> EXE
  subgraph Postgres / Supabase
    EV[(events = outbox)]; POS[(positions/fills)]; SNAP[(portfolio_snapshots)]; JOBS[(jobs)]
  end
  SCR & GRD & ENT & EXE & EXIT --> EV
  EV --> RT[Supabase Realtime] --> Clients
  EV --> SSE[Node/TS API: REST + SSE] --> Clients[Web / Flutter / Desktop]
  MARK[mark price worker] --> BC[Realtime Broadcast marks:ws:mode] --> Clients
  SSE --> MCP[MCP server: OAuth 2.1 PKCE, read/trade]
```

Processes: (1) the **Rust worker** (`services/backend/crates/*`) handles ingest, screening, guard, entry,
paper execution, exits, the sweeper and snapshots. (2) The **Node/TS API** (Phase 2) serves REST, SSE and
MCP, does auth glue and mints tokens. (3) **Supabase**: Postgres, RLS, Auth, Realtime and Edge Functions
(SIWS, Telegram OIDC, OTP).

Ingest sources implement one provider-agnostic trait, `StreamSource` (`crates/ingest/src/source`). Paper
mode defaults to **Helius standard WebSocket** (`logsSubscribe {mentions:[launch program]}`, `confirmed`;
Anchor `Program data:` events decoded for create / trade / curve-complete; `getTransaction` enrichment
over HTTPS RPC; 30 s ping, jittered backoff 1–60 s, resubscribe on reconnect; key only from
`HELIUS_API_KEY`, redacted from logs). Parser tests use captured mainnet frames (`services/backend/fixtures/mainnet/`). The capture
showed that some curves use a non-SOL quote token, so pool state for paper fills must come from the bonding-curve
account, never from the event's reserves. PumpPortal stays as an alternative; Yellowstone is a stub until
Boss picks the provider. `INGEST_SOURCES` selects them.

## 2. Data flow (per coin)
1. Source event -> `CoinCandidate` (mint, stream, pool, creator, untrusted metadata). Dedupe on
   `(mint, stream)`. Emit `coin.detected`.
2. Screener: rules from strategy settings (JSON, validated by schema + DB CHECK). Stream rules gate,
   hard rules must pass, weighted rules add points against `score_threshold`. Emit `screener.scored`.
3. Guard: input snapshot (authorities, LP, holder concentration, dev/bundler/sniper %, transfer fee, sell
   simulation, creator history). Saved to `guard_input_snapshots` for replay. Emit `guard.result`.
4. Pick + entry state machine (section 3). Then the approval gate (section 6), then the executor.
5. PaperExecutor: constant-product fill on a pool snapshot with latency drift, competing flow, the
   125 bps swap fee and network/priority fees. Emit `fill.simulated` and `position.opened`.
6. Exit engine on marks (section 4), then `exit.triggered`, a sell fill, then `position.updated|closed`,
   then `portfolio.snapshot`.

## 3. Entry state machine
`detected -> screened -> guarded -> armed -> (awaiting_approval) -> filling -> open` with terminal
`rejected | expired | failed`.
- `armed`: optional entry condition (dip %, momentum, max wait). Timeout emits `entry.expired`.
- `awaiting_approval` when `approval_mode = ask_every_buy`, or `ask_first_buy` and the portfolio has no
  prior buy (the default). The proposal TTL is 10 min. While waiting the guard and price are re-checked;
  failures expire the proposal with `guard_failed|price_moved`.
- `filling`: a job row (`jobs`, `FOR UPDATE SKIP LOCKED`) runs the PaperExecutor idempotently, keyed by
  `ck`.
- Rebuy rules: cooldown per mint, max entries per coin, and a per-strategy concurrency cap.

## 4. Exit engine (plans are data)
A plan is an ordered list of rules in strategy settings, evaluated on every mark tick and on a 1 s timer.
**`sell_floors` is evaluated first** (`{enabled, max_loss_pct: 35, liquidity_drop_pct: 80}`): PnL <= -35% or
pool liquidity down >= 80% from entry triggers a 100% sell (`exit_reason = sell_floor`). Then, in
declared order: `profit_targets` (ladders), `peak_trail_pct` with activation, ratchet, `loss_guards`,
`max_hold`, `idle_exit_seconds` / no-new-high timeout, `sell_pressure_exit`, rug detection. Each rule is
`{kind, params, sell_portion_pct}`; exit reasons are listed in EVENTS_SCHEMA.md. State (peaks, executed
steps) lives in `positions.plan_state` jsonb, so restarts resume exactly. A strategy archive/delete
closes positions with `strategy_retired` only if the setting says so; otherwise they keep running
under the frozen plan.

## 5. Job queue, events feed, outbox
- `jobs`: `(id, kind, key unique, run_at, attempts, locked_until, payload)`. Workers `SELECT ... FOR
  UPDATE SKIP LOCKED`, with exponential backoff, at most 8 attempts, then a `system.notice` dead letter.
- `events` **is the outbox**: domain writes and their events commit in one transaction. `seq` is a
  global identity (monotonic, gaps possible). Publishers (SSE, webhooks) read up to
  `events_safe_seq()` (derived from `pg_snapshot_xmin` + `xid8`) and advance `outbox_cursors`.
  Side-channel deliveries (push/email/webhook) go in `outbox` rows created in the same transaction.
- Deterministic event ids (`<subject>:<ms>:<type>`) plus a unique constraint make writes idempotent.

## 6. Approval queue
- Kinds `buy_pick` (TTL 10 min), `guard_change` (24 h), `team_action` (1 h); configurable in
  `workspaces` settings and env.
- Status `pending -> approved|rejected|expired`, `approved -> expired` (if not executed in time).
  `approvals_guard` trigger **only rejects illegal transitions**; the worker drives them.
- Decide: `decide_approval()` (security definer) checks the token (sha256, single use, TTL <=
  expires_at), then the MCP/app rule, role, replay (same token or same Idempotency-Key with the same
  decision), key reuse, already decided, expired, `expected_rev` vs `version`, and `base_rev` vs
  strategy `rev`. It then applies the decision, emits `proposal.approved|rejected`, writes `audit_log`
  and burns the token.
- Expire: the sweeper runs `expire_due_proposals()` every 2 s. `retire_strategy(id, archive|delete)` locks
  the strategy and expires everything pending in the same transaction (`proposal.expired {proposal_id,
  kind, version, reason, at}`), plus the strategy event and audit row.

## 7. Guard change and replay; the < 2 s answer
- A settings PATCH is diffed per field against the "weakening" direction table (e.g. raising
  `top_holders_share_pct_max`, lowering `liquidity_usd_min`, disabling a check).
- **Static estimate** (`guard::static_estimate`, ships first): uses the stored per-rule `blocked_by`
  counts over the window to bound the extra passes and classify risk low/medium/high/critical. O(rules),
  under 1 ms in-process.
- **Full replay** (`guard::impact`, behind `GUARD_REPLAY_ENABLED`): re-runs the old and new configs
  over `guard_input_snapshots` joined with `coin_outcomes` in a 7-day window capped at 50k samples.
  Returns `ImpactReport` (newly passing and blocked, newly passing rugged, average drawdown).
- **Measured on 2026-10-29 (box, release build):** 50,000 samples x 2 configs = **172.5 / 175.8 / 180.1
  ms**. A cold Postgres fetch of 50k snapshot rows (jsonb) took **121–133 ms**; JSON decode in Rust is
  estimated at 100–200 ms.
- **Verdict: yes, the replay can respond in under 2 s.** Expected p50 is about 0.2 s with a warm
  in-memory window and about 0.5 s cold; p95 is under 1 s. It ships only after staging p95 under 2 s is
  observed. Over budget, it returns `503 REPLAY_UNAVAILABLE` and the UI uses the estimate.
- **Real SOL weakening** (designed, disabled): a mandatory 10 min cooldown (`cooling_down`, cancellable),
  then apply, then a mandatory 24 h auto-revert job. Enforced by a CHECK on `guard_changes`. Requires
  proof-of-confirmation (WebAuthn, typed name, 2.5 s hold, TOTP), notifies every device plus email, and
  appends to `audit_log` with a risk snapshot. `LIVE_GUARD_WEAKENING_ENABLED=false`.

## 8. API (Node/TS) and MCP
- REST and SSE as in `packages/contracts/API_ENDPOINTS.md`. Every response carries `server_now`; the
  `Idempotency-Key` store is `api_idempotency`; the error enum is shared.
- MCP: Streamable HTTP. OAuth 2.1 authorization code with **PKCE S256**, dynamic client registration,
  protected-resource metadata, audience-bound tokens. Scopes `read` and `trade`; `trade:real` never.
  MCP tools: list strategies/positions/events, propose a settings change, approve a `buy_pick` in
  practice. Guard weakening and team actions are **app-only** (`APPROVAL_REQUIRES_APP`). Token metadata
  is passed to the LLM only inside an `untrusted` field.

## 9. Auth
Supabase Auth: Google and Apple (native PKCE), email OTP (6 digits, HMAC-hashed, 10 min, 5 attempts,
then a 15 min lock, 60 s resend), Telegram (official OIDC id_token, see below), and SIWS (nonce 5 min,
single use, bound to domain and address; ed25519). Identities link to one user in `auth_identities`; the
last one cannot be removed (DB trigger, `422 LAST_LOGIN_METHOD`); link/unlink need re-auth within 5 min,
are audited and email every verified address. Login wallets are identity only and never trade; a DB
trigger forbids the same address being both a SIWS identity and a `wallets` row (`WALLET_ROLE_CONFLICT`).

**Telegram OIDC (design-only, `AUTH_TELEGRAM_OIDC_ENABLED=false` until Boss approves the security review).**
Our own Edge Function, not Supabase's custom OIDC provider. `POST /auth/telegram/nonce` issues a
single-use 5 min nonce bound to the install's `device_id` (stored as sha256 in `telegram_login_nonces`),
because the native SDK carries no nonce/state. `POST /auth/telegram/verify {nonce, id_token, device_id}`:
JWKS from `https://oauth.telegram.org/.well-known/jwks.json` cached 1 h, refetched at most every 5 min on an
unknown `kid`, fail closed; RS256/ES256 only; `iss`, `aud = TELEGRAM_CLIENT_ID`, `exp`, `iat <= 120 s`;
`consume_telegram_nonce()` consumes the nonce once and records `sha256(id_token)` so a token is never
accepted twice; numeric Telegram id from the `id` claim (`profile` scope, else `AUTH_TG_NO_PROFILE`);
rate limit 10/min/IP and 5/min per subject; upsert `auth_identities(provider='telegram')`; mint the
Supabase session.

**Account deletion.** `request_account_deletion` (re-auth, no Real positions / active wallet) -> state
`pending_deletion`, grace from the server setting `ACCOUNT_DELETION_GRACE_DAYS` (default 7, allowed 1–30, enforced by function and
table CHECK), cancellable at any time until it ends; the worker's
`finalize_due_account_deletions` deletes credentials, tokens, devices and memberships, archives
strategies, closes owned workspaces, anonymizes `audit_log` (ip/user agent/device) while keeping the rows,
and tombstones `users`; then the API deletes the `auth.users` row.

**Revisions.** Every mutable row has `rev`; writes require `If-Match`/`expected_rev` (428 otherwise) and a
stale write returns 409 with `{current_rev, base_rev, changed_fields, changed_by, changed_at, current}`.
Strategy writes go only through `update_strategy` (direct UPDATE revoked); `strategy_revisions` keeps the
merge base. A stale write that carries a Real confirmation burns the challenge and returns
`CONFIRMATION_RESTART_REQUIRED`.

**Practice reset.** `reset_practice` bumps `workspaces.practice_epoch`; rows are stamped with their epoch
by trigger, open positions close with `practice_reset` and are archived (never deleted), balance returns
to 30 SOL, once per 24 h (`429 RESET_COOLDOWN`), event `practice.reset`.

**Push.** `register_device` / `revoke_device` (rotation by `device_id`, a token moves to the latest user,
token column not client-readable); data-only payload per EVENTS_SCHEMA.md section 6; Real SOL is never
actionable from a push.

## 10. Security model
- No private keys. `wallets` is a custody **reference** (public address, label), with no secret columns.
- Defence in depth for paper-only: the env gate (`TRADING_MODE=paper`, required explicitly), a cargo
  feature that is off by default, a `LiveExecutor` that returns an error, DB CHECKs on every `mode`
  column, a `trade:real` scope that is never minted, and CI checks that the feature is off.
- RLS on every table: workspace membership plus the mode gate. Service role is used only by the worker
  and API. Security definer functions use `set search_path`, and EXECUTE is revoked from public.
- Untrusted token metadata is isolated, length-capped and rendered as plain text.
- Secrets only in env vars (`.env.example` holds no values); gitleaks runs in CI.
- Append-only `audit_log`; proof hashes; rate limits on auth and decision endpoints.

## 11. Observability
`tracing` JSON logs with `request_id`, `ck`, `workspace_id`. Metrics (OpenTelemetry/Prometheus):
ingest lag, events/s, screener pass rate, guard verdict mix, fill latency, queue depth, sweeper lag,
outbox lag (`max(seq) - cursor`), replay `compute_ms` p50/p95, and 409 rates by code. Health
`/healthz` and `/readyz` (DB, sources, `trading_mode`). Alerts: outbox lag over 10 s, sweeper lag over
10 s, ingest silence over 60 s.

## 12. Testing
- Unit: screener rules, guard checks, the fill formula (fees, slippage, latency), approval decide/expire
  precedence, portfolio maths, static estimate, units/no-floats.
- Contract: errors.json parity (Rust and TS), TS typecheck, an end-to-end pipeline test asserting there
  are no floats on the wire, `mode=practice`, and integer seq.
- SQL: `scripts/check_sql.sh` covers the migration plus smoke tests (RLS isolation, mode gate, tokens,
  decide replay/conflict, retire, settings CHECK, confirmation challenge).
- Performance: an ignored release test, `replay_budget_50k_samples`, which CI runs.
- Later: property tests on exits, and replay fixtures from recorded streams.

## 13. Phase 1 plan (week by week)
| Week | Deliverable |
|---|---|
| 1 | Contracts v1 frozen. Workspace skeleton, migration 0001 with RLS, CI. *(done)* |
| 2 | Real PumpPortal + Yellowstone clients behind the traits; dedupe; replay source; metrics. |
| 3 | Screener and guard on live data; `guard_input_snapshots`/`coin_outcomes` writer; static estimate. |
| 4 | Entry state machine, jobs, PaperExecutor wired; positions/fills; portfolio snapshots. |
| 5 | Exit engine with sell floors; sweeper; `retire_strategy`; events SSE in the minimal API. |
| 6 | Soak test (72 h practice), dashboards, bug-bash, Phase 2 hand-off (approvals API, MCP). |
Phase 2: Node API (REST/SSE/approvals/auth Edge Functions) and the replay endpoint behind its flag.
Phase 4: MCP with OAuth 2.1, push worker, device tokens.

## 14. Risks
Data source rate limits or outages (mitigation: two sources plus replay). Fill-model optimism
(calibrate against observed swaps). Realtime fan-out cost (filtered subscriptions, Broadcast throttling).
Replay window growth (cap and
sample).

## 15. Open questions (for Apex)
Resolved in v1.1 (Apex, 2026-10-29): own vocabulary (CHANGELOG rename table); percentages/ratios stay
JSON numbers, lamports and prices are strings; snake_case everywhere; Flutter owns the Dart error
generator; practice 30 SOL, reset any time, once per 24 h, history archived.

Still open (Boss): Yellowstone provider; Telegram OIDC security-review sign-off.
Deletion grace: the 7–30 day range was Apex's decision as lead; the server currently allows 1–30 (default 7), pending Apex's final decision.
