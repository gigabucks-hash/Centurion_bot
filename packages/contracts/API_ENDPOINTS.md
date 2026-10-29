# REST API (draft v1)

Base URL `https://api.<domain>/v1`. JSON only. Wire rules from `EVENTS_SCHEMA.md` section 1 apply
(lamports strings, decimal-string prices, no floats). Errors use the shared enum in
`packages/contracts/errors.json`:

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Approval version is 3, expected 2",
             "details": { "current_version": 3 }, "request_id": "req_01J..." } }
```

## Auth and scopes

- **First-party apps (Web, Flutter, Desktop):** Supabase Auth JWT in `Authorization: Bearer <jwt>`.
  The JWT carries `sub` (user id) and custom claim `app_scopes: ["read","trade"]`. Workspace is chosen
  per request with `X-Workspace-Id` (must be a membership; enforced by RLS and by the API).
- **Third-party agents (MCP / API keys):** OAuth 2.1 Authorization Code + PKCE (S256), public clients,
  Dynamic Client Registration. Scopes:
  - `read` - every GET, SSE stream, guard-impact replay.
  - `trade` - every mutation (strategy writes, approval decisions, pause/resume, manual sell).
    Implies `read`.
- Guard **weakening**, team actions (`sell_all`, `stop_all`, `reset_paper`) and anything touching
  live mode can only be **proposed** by `trade` tokens from MCP; the decision must come from a
  first-party app session (`decided_via != mcp`). Enforced server-side (`APPROVAL_REQUIRES_APP`).
- Member roles: `owner` / `admin` / `viewer`. `viewer` is capped to `read` regardless of token scopes.

| Scope | Column legend below |
|---|---|
| R | requires `read` |
| T | requires `trade` |
| A | requires first-party app session (not MCP) |

## Idempotency and concurrency

- Every mutating request accepts `Idempotency-Key: <uuid>` (required on POSTs that create or decide).
  Stored in `api_idempotency` (workspace, key, request hash, response) for 24 h. Same key + same body
  returns the stored response with `Idempotent-Replayed: true`. Same key + different body returns
  `409 IDEMPOTENCY_KEY_REUSED`.
- Optimistic concurrency: strategies use `rev`, approvals use `version`. Send it as
  `If-Match: "<n>"` or in the body (`expected_rev` / `expected_version`). Mismatch returns
  `409 VERSION_CONFLICT` (approvals) or `409 STRATEGY_REV_CONFLICT` (strategies) with the current value.

## Pagination

- Lists (`coins`, `picks`, `positions`, `fills`, `approvals`): keyset cursor
  `?limit=50&cursor=<opaque>` -> `{ "items": [], "next_cursor": "..." | null }`. Sorted newest first
  by `(created_at, id)`.
- Events: seq cursor `after_seq` / `before_seq` (see EVENTS_SCHEMA section 3).
- Common filters for lists **and** stats (same parser, so numbers always match):
  `strategy_id`, `mode` (`paper`), `window` (`1h|24h|7d|30d|all`, default `24h`) or `from`/`to` (RFC 3339).

## Endpoints

### Auth (Phase 4, Supabase Auth + Edge Functions)
| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/auth/siws/nonce` | public | `{ address }` -> `{ nonce, message, expires_at }` (5 min, single use, `siws_nonces`) |
| POST | `/auth/siws/verify` | public | `{ address, message, signature }` -> Supabase session (Edge Function mints JWT) |
| POST | `/auth/telegram/verify` | public | Telegram Login Widget payload, HMAC verified with bot token, `auth_date` <= 10 min |
| POST | `/auth/email/otp` and `/auth/email/verify` | public | Supabase OTP, 6 digits, 10 min TTL, 5 attempts then 15 min lock |
| GET | `/auth/identities` | R | Linked identities (Google, Apple, Telegram, email, wallet) |
| POST | `/auth/identities/link` / DELETE `/auth/identities/{id}` | T,A | Cannot remove last identity (`LAST_IDENTITY`) |
| POST | `/auth/2fa/totp/enroll`, `/auth/2fa/totp/verify` | T,A | TOTP for sensitive actions (live mode, Phase 7) |
| GET | `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` | public | MCP OAuth metadata |
| POST | `/oauth/register`, GET `/oauth/authorize`, POST `/oauth/token`, POST `/oauth/revoke` | public | OAuth 2.1 + PKCE S256 only |

### Workspaces
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/me` | R | user, memberships, default workspace |
| GET | `/workspaces/{id}` | R | `mode` (`paper`), `paper_start_lamports`, loss stop |
| POST | `/workspaces/{id}/reset-paper` | T | Creates a `team_action` proposal (always needs approval) |

### Strategies
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/strategies?status=` | R | list with `rev`, `status`, headline stats |
| POST | `/strategies` | T | body `{ name, settings }`; settings validated by JSON Schema (`config/strategy.settings.schema.json`) and by DB CHECK; starts `paper`, `paused` |
| GET | `/strategies/{id}` | R | full settings + `rev` |
| GET | `/strategies/{id}/revisions` | R | history of settings revisions |
| PATCH | `/strategies/{id}` | T | `{ expected_rev, settings_patch }` (JSON Merge Patch). Non-weakening -> applied, `rev+1`. Weakening guard/screener -> `202` with a `guard_change` proposal |
| POST | `/strategies/{id}/pause` / `/resume` | T | `expected_rev` |
| POST | `/strategies/{id}/archive` | T | calls `retire_strategy(id,'archive')`: pending proposals expired (`strategy_archived`), events + audit in one txn |
| DELETE | `/strategies/{id}` | T | `retire_strategy(id,'delete')` (soft delete, `deleted_at`), reason `strategy_deleted` |
| POST | `/strategies/{id}/guard-impact` | R | **Replay/impact**: `{ settings_patch }` -> impact over last 7 days. Target p95 < 2 s (see TECH_DESIGN 8) |
| GET | `/strategies/{id}/funnel?window=24h` | R | from `strategy_funnel_hourly` |

`guard-impact` response:
```json
{ "window": { "from": "2026-10-22T08:42:00Z", "to": "2026-10-29T08:42:00Z" },
  "samples": 41210, "truncated": false, "compute_ms": 178,
  "baseline": { "passed": 412, "fail": 40112, "warn": 686 },
  "proposed": { "passed": 655, "fail": 39801, "warn": 754 },
  "newly_passed": 243, "newly_blocked": 0,
  "newly_passed_outcomes": { "rugged": 61, "rug_rate_pct": "25.1",
                             "median_max_gain_pct": "18.4", "median_1h_return_pct": "-42.0" },
  "risk_level": "high", "weakening": true }
```

### Coins and picks
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/coins?strategy_id=&window=` | R | coins touched by the workspace's strategies |
| GET | `/coins/{mint}` | R | coin + `untrusted` metadata + latest guard snapshot |
| GET | `/coins/{mint}/trail?strategy_id=` | R | events for that mint (seq ordered) |
| GET | `/picks?strategy_id=&stage=` | R | `stage`: `scored` `watching` `awaiting_approval` `entering` `entered` `expired` `rejected` |
| GET | `/picks/{id}` | R | checks (hard/weighted) + guard result + entry state |

### Positions and fills
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/positions?state=open|closed&strategy_id=&window=` | R | |
| GET | `/positions/{id}` | R | includes exit plan state |
| POST | `/positions/{id}/sell` | T | `{ sell_pct: "100" }` manual exit (paper) -> job |
| GET | `/fills?position_id=&window=` | R | all `simulated: true` until Phase 7 |

### Events
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/events?after_seq=&before_seq=&limit=&types=&strategy_id=` | R | seq cursor |
| GET | `/events/stream?after_seq=` | R | SSE, `Last-Event-ID` resume |

### Approvals (proposals)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/approvals?status=pending|approved|rejected|expired&kind=` | R | default sort `expires_at asc` for pending |
| GET | `/approvals/{id}` | R | includes `version`, `expires_at`, `decision_token`, `diff`, `impact` |
| POST | `/approvals/{id}/decision` | T (+A for guard weakening / team actions) | see below |
| POST | `/approvals/batch-decision` | T | `buy_pick` only; per-item results |

Decision request (Web):
```http
POST /v1/approvals/0192.../decision
Idempotency-Key: 6f1c...            (optional when token given; token is the natural key)
If-Match: "1"
{ "decision": "approve", "token": "apt_9s8d...", "reason": null, "client": "web" }
```
Flutter calls the same logic via Supabase RPC
`decide_approval(p_approval_id, p_token, p_decision, p_expected_rev, p_client)`.

| Situation | Result |
|---|---|
| pending, token valid, version matches | `200 { status: "approved", version: 2 }`; emits `proposal.approved` |
| same token + same decision again | `200` same body, `replayed: true` |
| same token + different decision | `409 APPROVAL_ALREADY_DECIDED` |
| version mismatch | `409 VERSION_CONFLICT` `{ current_version }` |
| already expired | `409 APPROVAL_EXPIRED` `{ reason }` |
| token wrong | `403 APPROVAL_TOKEN_INVALID` |
| guard_change whose `base_rev` != strategy `rev` | `409 STRATEGY_REV_CONFLICT`; proposal stays pending, the client re-proposes against the new rev |

### Portfolio and stats (single source of truth: `portfolio_snapshots`)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/portfolio/overview` | R | latest row of `portfolio_latest` view (cash, invested, equity, realized, unrealized, peak, drawdown, open positions, `as_of_seq`) |
| GET | `/portfolio/equity?window=72h&step=5m` | R | equity series from snapshots |
| GET | `/stats/strategies?window=` | R | per strategy: pnl, win rate, max drawdown, avg hold |
| GET | `/stats/exits?strategy_id=&mode=&window=` | R | aggregated per `exit_reason`: count, wins, win_rate_pct, avg_pnl_pct, avg_pnl_lamports, total_pnl_lamports, avg_hold_seconds, share_pct. Same filter parser as `/positions` |

### Guard changes and audit
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/guard-changes?strategy_id=` | R | |
| POST | `/guard-changes/{id}/cancel` | T,A | cancels during cooldown (live only, disabled) |
| GET | `/audit-log?window=` | R (owner/admin) | |

### Health
`GET /healthz` (public), `GET /readyz` (public): reports `trading_mode: "paper"`, `live_executor: "disabled"`.
