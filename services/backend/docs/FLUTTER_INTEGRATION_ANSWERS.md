# Answers for Flutter (Phase 5 mobile)

To: Flutter Mobile Specialist. From: Backend API Specialist. Contract v1. I adopted all six of Apex's
calls; refinements are noted inline. `ARCHITECTURE.md` was **not on disk** after the restore; these
answers are checked against `app/lib/data/models/models.dart` and `repositories/repositories.dart`.

## 1. Auth: Supabase Auth; Telegram and SIWS via Edge Functions that mint the JWT  - ADOPTED
- Google, Apple (required on iOS since Google is offered), email OTP: native Supabase Auth providers.
- Telegram: Edge Function `auth-telegram` verifies the Login Widget HMAC (bot token in env), `auth_date`
  <= 10 min, then upserts `auth_identities(provider='telegram')` and mints a session via the admin API.
  Mobile: open the Telegram login in an in-app browser / deep link back (`solbot://auth/telegram`).
- SIWS: `POST /auth/siws/nonce` -> sign message with Phantom / Solflare / Mobile Wallet Adapter ->
  `POST /auth/siws/verify`; ed25519 verify, nonce single-use 5 min (`siws_nonces`), domain + URI bound.
- The login wallet is **not** a trading wallet; no keys ever leave the wallet app.

## 2. Approvals model  - ADOPTED, aligned with `decide_approval(token)` and `expected_rev`
- RPC: `decide_approval(p_approval_id uuid, p_token text, p_decision text, p_expected_rev int, p_client text)`.
  `p_expected_rev` = the approval's `version` (your `baseRev` stays the *strategy* rev for guard changes).
- Idempotent: same token + same decision returns the same status (no error). Mismatch -> Postgres error
  with SQLSTATE `P0409` and `MESSAGE` = an error code from the shared enum (`VERSION_CONFLICT`,
  `APPROVAL_ALREADY_DECIDED`, `APPROVAL_EXPIRED`, `APPROVAL_TOKEN_INVALID`). Map those to your
  `ConflictException`.
- Status wire values: `pending | approved | rejected | expired`. Your `ApprovalStatus.skipped` maps to
  wire `rejected` (keep the "Skipped" label).
- `ExpireReason` wire values: `timeout | strategy_deleted | strategy_archived | guard_failed | price_moved`
  (map your `timedOut`, `guardFailedWhileWaiting`, `priceRanPastLimit`).
- `ApprovalKind` wire: `buy_pick | guard_change | team_action`. `PickType` wire: `first_buy` boolean on
  the proposal plus `rebuy` flag on the pick. `approval_mode` wire: `off | ask_first_buy | ask_every_buy`.
- The backend owns `expires_at` (10 min pick, 24 h guard change). The worker owns transitions;
  deleting/archiving a strategy expires its pending proposals in the same transaction and emits
  `proposal.expired`. Ask mode also covers a portfolio's first buy.

## 3. RPC error codes  - ADOPTED
Shared enum `packages/contracts/errors.json` (source), generated `src/errors.ts` and Rust
`crates/common/src/error_codes.rs`. Please add a Dart generator (or I can add one to
`scripts/gen-errors.mjs`; tell me the target path). REST returns `{error:{code,...}}`; RPC raises with
the code as the message.

## 4. Mark price over Realtime Broadcast  - ADOPTED
Channel `marks:<workspace_id>` (private), event `mark`, payload `MarkMessage` (decimal strings). Not
persisted, not in `seq`. Compute unrealized PnL locally from `qty_raw` and the mark for live display, but
use `portfolio.snapshot` / `GET /portfolio/overview` as the authoritative numbers. Drop your `double`
fields in favour of `Decimal` / `BigInt` (`solIn` -> `sol_in_lamports`).

## 5. Firebase push  - ADOPTED as an external dependency
Firebase project is owned by Boss's org account and set up at integration. Backend side: `outbox`
rows with `channel='push'` are delivered by a push worker via FCM HTTP v1 using a service account
from env (`FCM_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`). Device tokens table arrives with Phase 4
(`device_tokens`). Practice notifications may carry approve/skip actions that call `decide_approval`
with `p_client='push'`; Real SOL never actions from a notification.

## 6. Real SOL confirmation  - ADOPTED, all disabled until Phase 7
Server-side 2FA (TOTP, checked by the API) **plus** device biometric (local_auth) gating the
confirmation call. App Attest / Play Integrity are post-MVP add-ons. Today the DB CHECK rejects
`mode='live'` and the API returns `REAL_SOL_DISABLED`; build the UI flow behind a flag only.
