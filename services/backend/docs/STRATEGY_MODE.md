# Per-strategy Paper/Real switch

Status: implemented (additive to contracts 1.1.6). Phase: paper-only. Owner: Backend API Specialist.

The web Strategy card needs a real REST route for its Paper/Real toggle. This document is the contract for
`POST /v1/workspaces/{ws}/strategies/{id}/mode`. It is additive: no existing contracts or wire fields change.
The Dart/TS clients keep reading `mode`, `rev`, `real_locked` and `real_locked_reason` from the strategy wire.

## Route

```
POST /v1/workspaces/{ws}/strategies/{id}/mode
Authorization: Bearer <access token>        # app_scopes includes "trade"
If-Match: "<rev>"                            # or {"expected_rev": n} in the body
Idempotency-Key: <8..128 visible ASCII>       # replay-safe
Content-Type: application/json

{"mode": "practice" | "real"}
```

Auth chain: `authenticate` -> `requireScope(p, "trade")` -> `asUser requireMember(ws)` -> SQL function
`set_strategy_mode()` (definer) re-checks workspace membership and the `owner|admin|trader` role. The actor and
`via` come from the JWT only (`request_client()`), never from the body. `device` is optional metadata.

### Success

`200` with the usual strategy wire plus the Real-gate fields and `server_now`; `ETag: "<rev>"`.

```json
{
  "data": {
    "id": "…", "workspace_id": "…", "name": "Momentum", "mode": "practice", "status": "running",
    "rev": 5, "settings": {}, "created_at": "…", "updated_at": "…",
    "real_locked": true, "real_locked_reason": "needs_owner_approval",
    "paper_progress": {"days_done": 0, "days_required": null, "trades_done": 0, "trades_required": null}
  },
  "server_now": "2026-11-07T…Z"
}
```

A retried key returns the stored response with `"replayed": true` and `Idempotent-Replayed: true`.

## Semantics

| Current | Requested | Result |
|---|---|---|
| any | same mode | `200`, no rev bump, no `updated_at` change, no event, no audit row (still rev-checked) |
| practice | real | `403 MODE_NOT_ALLOWED` — always, while this phase is paper-only |
| real | practice | `200`; `mode='practice'`, `rev+1`, `updated_at=now()`, audit row, event |
| archived (`status='archived'`) | any | `403 MODE_NOT_ALLOWED` (`reason:"archived"`) |
| other workspace / not a member | any | `404 NOT_FOUND` |
| stale `rev` | any | `409 STRATEGY_REV_CONFLICT` with `current` (same shape as pause/resume) |

`real -> practice` emits:

```json
{"type": "strategy.mode_changed",
 "payload": {"rev": 6, "base_rev": 5, "from_mode": "real", "to_mode": "practice"}}
```

and writes `audit_log(action='strategy.mode_changed', before={mode,rev}, after={mode,rev})`. A mode flip bumps
`rev` through `strategies_bump_rev()` (now includes `mode`), so it appears in the revision list like any other
user-visible change.

## Errors

| HTTP | Code | Extra |
|---|---|---|
| 428 | `PRECONDITION_REQUIRED` | missing `If-Match`/`expected_rev` or `Idempotency-Key` |
| 409 | `STRATEGY_REV_CONFLICT` | `current_rev`, `base_rev`, `changed_by`, `changed_at`, `current` |
| 403 | `MODE_NOT_ALLOWED` | practice -> real: `{reason:"real_locked", real_locked_reason:"needs_owner_approval", hint}`; archived: `{reason:"archived"}` |
| 403 | `FORBIDDEN_SCOPE` / `FORBIDDEN_ROLE` | token without `trade`; member below trader |
| 404 | `NOT_FOUND` | unknown id, not this workspace, not a member |
| 422 | `VALIDATION_FAILED` | `mode` is not `practice|real`; bad `expected_rev`; replayed key with another body |
| 422 | `IDEMPOTENCY_KEY_REUSED` | same key, different request |

Unlike `?mode=` and strategy creation (which answer `REAL_SOL_DISABLED`), this route accepts `"mode":"real"` as a
valid request and answers `MODE_NOT_ALLOWED` with the lock reason, so the web card can render the server's
explanation inline instead of a generic validation error.

## Why Real stays locked

- `real_gate.ts` is unchanged: every strategy wire reports `real_locked:true`,
  `real_locked_reason:"needs_owner_approval"`, and `paper_progress` against config-only thresholds.
- `set_strategy_mode()` refuses `p_mode='real'` before any write. There is no code path that stores
  `mode='real'` in this phase, no live executor, no signing, and `TRADING_MODE=paper` remains the only accepted
  service mode.
- The `strategies` table keeps its `strategies_practice_only` CHECK (`mode='practice'`). The `real -> practice`
  branch exists for the phase-7 contract; it is reachable only after that constraint is lifted in phase 7 (the
  API test seeds that state on a throwaway database and restores the CHECK `NOT VALID`). See
  `TECH_DESIGN.md` section 16 for the phase-7 gate.

## Consumer notes (web)

- Remove the `modeEndpointMissing` placeholder and call this route in both mock and http mode.
- Keep the 2.5 s hold for practice -> real. On `403 MODE_NOT_ALLOWED` show `error.hint` (and
  `real_locked_reason`) inline, then refresh the card. Real -> practice is immediate.
- Always send the current `rev` from the strategy wire as `If-Match`; on `409` reload the strategy and retry the
  user's click only after they see the new state.

## Consumer notes (desktop)

- The Tauri terminal ships the same control in Settings → strategy rows (2.5 s hold; Real is disabled while
  `real_locked` and shows the same inline reason). Desktop 0.2.0+ also updates itself from the latest GitHub
  release; no desktop-specific backend change is needed.

## Tests

`api/test/strategy_mode.test.ts` covers 428, 422 (mode/scope/role), 409 with `current`, 403 practice -> real with
`real_locked_reason` and no write/event, same-mode no-op + key replay, cross-workspace 404, archived 403, and the
real -> practice flip (rev bump, audit row, `strategy.mode_changed` payload, one-event-only repeat).
