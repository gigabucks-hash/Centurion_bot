# Centurion Trade Desktop — Architecture (Phase 6)

> Status: prototype, **mock data only**. No real trading, no wallet, no chain network.
> Path: `/workspace/centurion/apps/desktop` (monorepo). Product name **Centurion Trade**, identifier **`com.centuriontrade.app`**
> (rebrand 2026-10-29; internal crate/package names stay `centurion`).
> All code is original. No HOTBOT code was copied; HOTBOT is only a feature-parity reference.

## 1. Goals and non-goals
- A multi-window trading terminal with an approval queue, a chart, an activity feed, positions, native notifications and keyboard-first actions (Approve / Skip / Sell).
- It is a **thin client**. Strategy, signing and the order flow live in the backend (Phase 3–5). The desktop never holds private keys.
- Non-goals for the MVP: code signing, notarization, auto-updater (see §8 and §12), and Real SOL trading from the desktop (Phase 7, C15).

## 2. Monorepo layout
```
/workspace/centurion
├── apps/desktop          ← this app (Tauri v2 + React)
├── apps/web              (placeholder — Web team)
├── apps/mobile           (placeholder — Flutter team)
├── packages/design-tokens (placeholder — UX team)
└── packages/contracts    ← @centurion/contracts: event/command types (desktop draft, Backend to own)
```
- **Contracts:** the TS types live in `packages/contracts/src/index.ts`. The desktop imports them as `@centurion/contracts` (tsconfig `paths` + a Vite alias; no workspace install is needed). The Rust mirror stays in `src-tauri/src/model.rs`, because Rust cannot import TS. Once Backend publishes a schema (JSON Schema/OpenAPI), both sides will be generated from it (milestone W2-D6).
- **Design tokens:** `npm run sync:tokens` copies the first file it finds from this list into `src/design/centurion-tokens.css`:
  1. `packages/design-tokens/tokens/tauri.css` (**used now**: UX v0.2.5, dark + Compact default)
  2. `packages/design-tokens/tokens/tokens.css`
  3. `/workspace/ux-solbot/tokens/tauri.css` (legacy)

  `app.css` uses the v0.2.x names: `--text-*`, `--density-*`, `--duration-*`, `--shadow-e*`. Currently synced: **v0.2.5** (bd58541; `.skeleton` / `--color-skeleton-*`, static under reduced motion — used for the quick-look timeline). WF-20 `surface.sunken` is the official `--color-bg-sunken`; `app.css` uses it everywhere (`--color-bg-inset` is a deprecated alias upstream and no longer used here). The v0.2.0 stray `}` (C18) is fixed upstream, so the workaround has been removed and the script is a plain copy again.

## 3. Windows
| Label | Route | Purpose | Capability |
|---|---|---|---|
| `main` | `#/` | Terminal: queue, chart, positions, activity, status bar | `terminal.json` (all commands) |
| `chart-<mint>` | `#/chart?mint=` | Detached chart (↵) | `viewer.json` (read-only) |
| `activity` | `#/activity` | Detached activity feed (L) | `viewer.json` |
| `approval-popup` | `#/popup` | **Always-on-top approval popup** per UX `DESKTOP_COMPACT_AND_POPUP.md` §4 / WF-13. **Opt-in, OFF by default** (Settings toggle "Popup approval selalu di atas", or P). | `approval.json`: snapshot, candles, approve (Practice only), skip, focus-main hand-off, hide. **No sell, no batch, no window API** |

- One Vite bundle serves every window, with hash routes.
- `single-instance` focuses the existing window instead of starting a second one.
- Every window has a 4px mode strip and a "◇ PRACTICE" label, and its title is prefixed `[PRACTICE]`.

**Keymap (main window):** J/K or ↑/↓ move (roving focus onto the row) · A approve (REAL → dialog + hold 2.5 s) · S skip · X select · ⇧A approve selected (Practice only) · ⇧X sell (dialog + hold 1.2 s / 2.5 s via mouse press, held Space or held ↵ on the hold button) · **Space quick-look, only when a row has focus** (C14; row click also opens it) · **↵ pop-out chart, only from a focused row with no modal open** (C13) · Space/↵ on buttons and checkboxes keep their native behaviour · L activity · P popup · , settings · Esc closes quick-look, else clears the selection.
**Popup:** J/K, A (Practice only), S, Esc hide.
**Global (open-only):** Ctrl/Cmd+Shift+H, Ctrl/Cmd+Shift+A.

### 3.1 Approval popup (UX DESKTOP_COMPACT_AND_POPUP §4, WF-13)
- **Window:** 360×232, fixed size, undecorated, shadow, `skipTaskbar`, `alwaysOnTop`, `visibleOnAllWorkspaces`, dark theme, `visible:false` + `focused:false`. On macOS, `acceptFirstMouse(false)`. It is created once and reused; items never spawn new windows.
- **Placement:** bottom-right of the **work area** of the monitor that holds the main window, 16 px margin, computed in Rust (`current_monitor().work_area()` → `set_position`). Verified on Xvfb 1920×1080: the popup landed at (1544, 832).
- **Showing and hiding:**
  - It auto-shows on a new pick with **no activation** (`show()` without `set_focus()`). Its shortcuts work only after the user clicks it (window `focus` event); the hint says "Klik popup untuk mengaktifkan shortcut".
  - It auto-hides about 3 s after the queue empties. Esc hides it until the next new pick.
- **Content:** one item (soonest expiry) plus "+N lagi: $SYM · mm:ss", with J/K to cycle. A per-second timer bar turns red under 2 min. An expired item shows "Expired · waktu habis" (or "strategi dihapus") for 3 s.
- **Anti mis-click:** buttons lock for 600 ms every time the item changes.
- **PRACTICE:** Skip S and Approve A.
- **REAL SOL:** Skip S and **"Buka untuk approve ↗"**. That button calls `focus_main_for_signal(id)`: Rust focuses the main window and emits `ui:focus-signal` to `main` only. Main then opens the pick in the normal Real confirmation (dialog + hold 2.5 s).
  **Enforced in Rust:** `approve_signal` checks the *calling window label* (`state::check_approve_origin`), so an approve from `approval-popup` in Real is rejected even if the UI were bypassed (unit-tested). Real is still mock-only. Run with `CENTURION_MOCK_MODE=real` to preview the Real chrome and gating.
- **Accessibility:** `role="dialog"`, `aria-modal="false"`, `aria-labelledby`. Reduced motion is respected (no transitions) and `forced-colors` is handled.

## 4. IPC
- **Commands** (webview → Rust), each with its own permission generated by `tauri-build` AppManifest:
  - `get_snapshot`, `get_candles`
  - `approve_signal`, `approve_many` (Practice-only, max 20), `skip_signal`
  - `request_sell(position_key, pct)` → `confirm_sell(nonce)` (sends `If-Match` with the position rev)
  - `set_strategy_paused(id, paused, base_rev)`, `reset_practice` (Practice only, two-step confirm in Settings)
  - `get_coin_timeline(mint)` (last 50 items), `get_exit_reason_stats`
  - `open_chart_window`, `open_activity_window`, `open_approval_window`
  - `set_settings`
  - `focus_main_for_signal(id)` (popup → main hand-off; never approves), `hide_approval_popup`
- **Events** (Rust → all windows): `signal:new`, `signal:update`, `market:ticks` (1 s batches), `activity:event`, `positions:update`, `account:update`, `conn:status`, `settings:update`, `strategies:update`, `write:conflict`, `sync:status`, and `ui:focus-signal` (sent to `main` only).
- **IPC naming:** every view-model field and command argument is **snake_case**, matching the v1.1 wire. Lamports and prices cross IPC as strings, exactly like on the wire.
- **Event bus:** engine methods return `Vec<Out>`, and `events::dispatch` emits them **after the mutex is released**. So no lock is held across emit or notification calls.
- **Sell is two steps.** `request_sell` returns a quote with a random 128-bit nonce and a 15 s TTL. `confirm_sell` consumes the nonce once, so replayed or stale nonces are rejected (unit-tested).

## 5. State
- `AppState { engine: Mutex<Engine> }`.
- Bounded buffers:
  - signals: 200 max; the oldest non-pending signal is dropped first.
  - activity: 1000.
  - ticks: 3600 per mint.
  - tracked mints: 40.
- Frontend: a zustand store hydrated from `get_snapshot`, then patched by events. The queue is sorted soonest-expiry first.
- **Mock backend** (`src-tauri/src/backend/mock.rs`): an in-process stand-in for the server. It implements the same `Transport` trait as the real client, so it speaks the wire, not desktop types.
  - A 1 s loop runs a random-walk price model with shocks, the exit plan and proposal expiry. A new candidate arrives every few seconds; some are blocked by the mock Guard.
  - Paper book: 30 SOL starting cash, 0.25 SOL per approve, 125 bps simulated fee.
  - It deliberately drops some live envelopes so the resync path is exercised all the time.
  - Every 75 s it makes a "mobile" edit to a strategy, so 409s happen naturally. `CENTURION_MOCK_FORCE_CONFLICT=1` forces a conflict before every strategy write.

## 5.1 Contracts v1.1.2 → v1.1.4 integration
- **Source of truth:** `packages/contracts` (Backend-owned; read-only for us). The frontend imports wire types from `@centurion/contracts/wire` (tsconfig `paths` + Vite alias). `src/api/contract.ts` re-exports them and adds only desktop UI types.
- **1.1.3** (packages/contracts 05541b3): `ApprovalRejectReason` (closed enum `user_declined | not_tradeable | price_moved | other`, `APPROVAL_REJECT_REASONS`) on `ApprovalDecisionRequest.reject_reason` (reject only, server default `user_declined`), `ApprovalDecisionResponse.reject_reason` and `proposal.approved|rejected.reject_reason`; `ApprovalWire` (approval resource and the `current` of an approval 409). Skip sends `not_tradeable` for a not-tradeable pick and `user_declined` otherwise; approve never sends one. The mock validates as the server does (approve + reason, or an unknown value → `422 VALIDATION_FAILED`, which maps through `errors.map.json` to `error.code.validation_failed`). The value is part of the idempotency fingerprint. `ConflictError.current` is now required in TS too, matching Rust; `wire.check.ts` has an `@ts-expect-error` for a 409 without it.
- **1.1.4** (packages/contracts 1753c21): `MarketCapFields` (`market_cap_lamports` int string | null, `mcap_usd` decimal string | null, display-only, `mcap_as_of`) on coin.detected / screener.scored / pick.created. Rust: `model::MarketCap` (`#[serde(flatten)]`), merged in `state.rs merge_mcap` (newest `mcap_as_of` wins; nulls never erase a known value) onto the `ScreenedCoin` row. `ExitReason::Stall` (+ `time_stop_s` / `stall_exit` in the exit plan, ignored by the desktop). The mock emits mcap = price × 1e9 supply, with ~10 % null.
- **429 RESET_COOLDOWN:** `ApiFailure` `Display` adds whitelisted detail tags (`[next_allowed_at=…]`, `[retry_after_s=…]`). `errorText()` fills the copy placeholder `{next_allowed_at}` with local date and time, and `errorDetails()` lets Settings disable reset until then.
- **Rust mirror** (`model.rs`, `CONTRACTS_VERSION = "1.1.4"`, packages/contracts 01427df / doc e4eb0c9, 05541b3):
  - Lamports and raw amounts are integer strings (`Lamports(i128)`, `RawQty(u128)`); JSON numbers are rejected.
  - Prices are decimal strings (`Dec`, backed by rust_decimal; exponents are rejected).
  - pct, ratio, bps, USD and scores are JSON numbers (`Num = f64`), used for display and thresholds only. Money math stays in Decimal.
  - **int64 strings (1.1.2):** `seq`, `after_seq`, `before_seq`, `next_after_seq`, `safe_seq`, `as_of_seq`, `job_id` and the SSE id are decimal strings on the wire. Rust: the `seq` / `seq::opt` serde modules (accept string or number, emit string; i64). TS: `Int64String`, compared with `seqCmp()` (BigInt). They also cross IPC as strings.
  - **Typed 1.1.2 shapes:** `PlanState` with a `kind`-tagged `PlanStep` (profit_target, loss_guard, stop_loss, peak_trail, giveback, max_hold, idle, sell_floor, and `Unknown` for forward compatibility), `FillWire` (id, created_at), `OrderWire`, `JobWire`, `ClosePositionResponse` (`CloseResponse`), `PositionWire` (rev, decimals, token_program, practice_epoch), `LossGuard`, `ExitStatsRow` (+`win_rate_pct`, `avg_hold_s`), `WorkspaceWire` and `PortfolioWire` (+`practice_epoch`, `practice_start_lamports`). `decimals` and `token_program` are carried on coins and positions, `practice_epoch` on workspace/portfolio/snapshot/position/fill, and `rev` on every position event.
  - **Settings keys:** `stop_loss_pct` (measured from entry) and `peak_trail_pct` (measured from peak) are separate keys; `loss_guards[{at_loss_pct, sell_portion_pct}]`.
- **Rename point** (`keys.rs`): every settings and exit ID lives here once. `RENAMES` and `VALUE_RENAMES` map v1.0 and camelCase names to v1.1, for example `passMark`/`pass_mark` → `score_threshold`, `stream` → `venue` (curve|amm), `sell_pct` → `sell_portion_pct`, plus the old exit-reason values. `normalize()` runs on every payload before it is decoded. The Indonesian exit labels live here too.
- **Transport trait** (`backend/mod.rs`): `subscribe`, `list_events`, `get_workspace`, `get_portfolio`, `list_strategies`, `get_approval`, `decide`, `close`, `set_strategy_paused`, `patch_strategy`, `reset_practice`, `coin_timeline`, `exit_reason_stats`.
  - Paths are `/v1/workspaces/{ws}/…`.
  - Requested scopes are `read` and `trade` (Practice). The desktop never asks for `trade:real`.
  - SSE: `/v1/workspaces/{ws}/events/stream?mode=practice&include=marks,clock` (Last-Event-ID = the seq string); mark/clock frames use the Broadcast shapes.
  - The real HTTP + SSE client plugs in here in Phase 2, so the mock transport stays. The mock implements the same trait.
  - **Real-transport smoke test: DONE** (`backend/http.rs` `HttpTransport` behind the trait; `ActiveTransport` is an enum chosen by `CENTURION_BACKEND`; `scripts/smoke-real.sh`; `docs/REAL_TRANSPORT_SMOKE.md`: 35/35 pass, 1 server mismatch). Earlier feasibility note: `services/backend/api` (4c554f9) now covers what the desktop calls: healthz, workspace, approvals list/detail/decide (`reject_reason`), positions + close, portfolio, exit-stats, events + SSE (marks, clock, `Last-Event-ID`) on a shared per-workspace poller, practice reset (`429 RESET_COOLDOWN` + `Retry-After`), strategies CRUD/pause/resume (rev/If-Match), coins/picks/fills/orders/jobs reads, devices and account deletion. It needs local Postgres with the migrations, `TRADING_MODE=paper`, `DATABASE_URL`, and a HS256 JWT signed with a test `SUPABASE_JWT_SECRET` (`centurion_client` claim → `desktop`), seeded like `test/seed.sql`. Work on the desktop side: an `HttpTransport` (reqwest + an SSE reader) behind the existing `Transport` trait; mapping `Retry-After` / `ETag`; headers and statuses into `ApiFailure`; and an env switch `CENTURION_BACKEND=http://127.0.0.1:8080`. The mock-specific `get_approval` token flow already matches `GET /approvals/{id}` → `decision_token`. Gaps: no mint/coin events are produced without the ingest pipeline (c3de83a publishes marks only via `pg_notify`), so a smoke test would seed picks/approvals in SQL. Estimate: about 1 day for a decide + close + SSE resume smoke test, mostly the transport and JWT/seed fixture.
- **Envelopes and resync** (`sync.rs`):
  - Each envelope carries a monotonic `seq` and `server_now`. Events are deduplicated by `id`, and unknown event types are ignored.
  - The watermark only advances from page `next_after_seq`, SSE id or `clock.safe_seq`.
  - When a seq gap is seen, the client pages `list_events` from the watermark until it catches up. A unit test proves a lossy live feed is fully recovered.
  - Reconnects use backoff. The status bar shows the contracts version, seq, gaps, resyncs, duplicates and clock skew.
- **Server clock (closes C6):** skew is an EWMA (7/8) of `server_now − local now`. Countdowns and expiry checks use `serverNow()` in the UI and `server_now_ms()` in Rust.
- **Writes:**
  - Every write sends `Idempotency-Key`, which is **fresh per distinct request** and reused only when retrying an identical body. The same key with a different body gets `422 IDEMPOTENCY_KEY_REUSED`; an identical retry returns the stored response with `replayed: true`. The mock enforces both.
  - Writes to versioned resources send `If-Match: "<rev>"`. Approvals use `rev` (`expected_version` is gone): `If-Match` + `expected_rev`, and never `client`/`actor`/`via` (the server reads the JWT).
  - **Manual sell:** `POST /v1/workspaces/{ws}/positions/{id}/close` with `If-Match` (position rev), `Idempotency-Key` and `{fraction_bps}` → `{position, order, order_id, fill|null, job_id, status, replayed, server_now}`. The desktop then follows the `order.submitted` / `order.filled` / `order.failed` and `position.*` events, and bumps the position rev from `order.*` by `position_id`.
  - **409 rev conflicts require `current`** (contracts 1f24d28). `ConflictBody.current` is required and non-null; `from_body` treats a `VERSION_CONFLICT`/`STRATEGY_REV_CONFLICT` without it as a logged contract violation (a plain `Api` failure, never merged). The pre-1.1.2 `details.current_version` path is removed.
  - **Errors** are always `{error:{code, message, …details, server_now}}`. `ApiError::from_body` reads `error.current_rev`, `error.current` and the other fields from inside `error` (the older `details` form and flat bodies are still accepted).
  - `428 PRECONDITION_REQUIRED` is logged as a client bug.
  - `409 STRATEGY_REV_CONFLICT` (and the other rev conflicts) are read from the merge data inside `error`: `current_rev`, `base_rev`, `changed_fields`, `changed_by{actor,via,device}`, `changed_at`, `current`. The desktop shows a conflict toast plus an inline note, takes `current` as the new state, and refetches. It never retries the write blindly.
  - `CONFIRMATION_RESTART_REQUIRED` is flagged in the toast, so the user has to confirm again.
  - An approval `VERSION_CONFLICT` refetches the approval and retries once, but only if it is still pending.
- **Events:**
  - `practice.reset` drops cached positions, quotes and equity, resets the account to the starting balance and new epoch, and refetches the portfolio.
  - `account.deletion_scheduled` and `account.deletion_cancelled` show or clear a banner. `account.deleted` shows a banner, marks the app disconnected and stops the sync loop.
  - Strategy lifecycle events track `rev` and `status`; a `base_rev` gap or an unknown id triggers a refetch.
- **Untrusted text:** symbols, names and notices are rendered as plain React text (`plain_text()` trims them in Rust). `dangerouslySetInnerHTML` and `innerHTML` are never used.
- **Contract tests:**
  - `cargo test` → `contract_tests.rs` reads `packages/contracts` and checks:
    - the version matches (major.minor);
    - the EVENTS_SCHEMA examples deserialize;
    - the API_ENDPOINTS 409 body maps to `Conflict`;
    - errors.json **v4**: every code has `kind` / `sqlstate` / `messages.en` / `messages.id`; `keys::code_kind` matches the registry; `TELEGRAM_AUTH_INVALID` and `PAPER_*` are absent (`PRACTICE_CASH_INSUFFICIENT` is a `notice`); every code the desktop handles exists with the expected http and kind;
    - the typed 1.1.2 examples decode (PlanState, FillWire, the nested ApiError / ConflictBody, JobWire ids above 2^53);
    - the TS vocabularies (exit reasons, expired reasons, venue, actor, decided_via) match the Rust enums;
    - every `EventPayloads` type is decoded.
  - `tsc -b` → `src/api/wire.check.ts`: `satisfies` checks over wire samples, plus an exhaustive switch over event types and an assertion that amounts are strings.

## 5.2 i18n (`@centurion/i18n` 0.4.5)
- **0.4.5** (bd58541): errors.map.json v5 (57 codes, + `GUARD_WEAKEN_REQUIRES_APPROVAL`), `reject_reasons.map.json` (skip chip → wire `reject_reason`; Rust `rejmap.rs` replaces the hand map in `commands::skip_reason`, the feed appends `reject_reason.*` copy), `common.value.unavailable` (tooltip + accessible name of a muted "—" Mcap / Likuiditas cell), `common.state.loading`. UX gaps: no `exit_reason.stall`, no `feed.event.fill` / `feed.event.exit_triggered` (local fallback templates in `local.ts`; package keys win once shipped), no errors.map v6 (`QUOTE_MISSING_OR_STALE` falls back to errors.json messages).
- **Re-QA D9–D11:** D9 quick-look header: title ellipsizes with a full-text `title`, the NT badge has its own line and its label is a real ellipsizing span (`.chip.nt` is inline-flex, so a bare text node could not ellipsize). D10 executor rows (`fill.simulated`, `exit.triggered`) are structured `I18nMsg`s with `bps` / `price` args formatted by format.mjs `formatFractionBps` and `Intl.NumberFormat(LOCALES[lang])`. D11 Likuiditas: mark → screener measured liquidity check → known signal, shown on not-tradeable rows too.
- **0.4.4:** every `t("desktop.*")` was replaced via `key-migrations.json`, with the placeholder renames `{pass}`→`{score_threshold}`, `{quote}`→`{quote_symbol}`, `{max}`→`{max_score}` and `{s}`→`{seconds}`. Headers use `positions.title_paper` (no string concatenation), `positions.empty` takes `{mode}`, and the batch message is `queue.batch.excluded_not_tradeable`. `cta_note` is removed. `local.ts` = the "(mock)" suffix only.
- **0.4.3:** placeholders are wire field names: `{coin}` → `{symbol}` and `{sol}` → `{amount_lamports}`. Rust `I18nMsg` args use them, `amount_lamports` is an `I18nArg::Lamports`, and `wireVars()` formats it with `formatLamports` (exact BigInt split). `fraction_bps` uses `formatFractionBps`.
- **Error mapping = `errors.map.json`** (`src-tauri/src/errmap.rs`, embedded with `include_str!`; frontend imports the same file). `code → {key, source, kind, http, retryable}`, unknown → `error.code.internal`. `keys::code_kind` reads `kind` from the map (no hand list). `system.notice` → `errmap::i18n_key`; `order.failed` → `errmap::order_fail_key`, covering all 8 contracts reason codes (`ORDER_FAIL_REASONS`; anything else → `order.fail_reason.unknown`). The UI resolves the key in the catalog and falls back to `errors.json` `messages.id|en`. The contract test checks map ↔ errors.json (kind, http) ↔ en/id catalogs ↔ the events.ts reason_code set.
- `packages/i18n` is read-only. `src/i18n/index.ts` loads its nested `id` / `en` JSON and formats ICU messages (`icu.ts`: arguments, `plural` with `=N`/`one`/`other`/`#`, and `select`). Numbers and PnL go through the package's `format.mjs` (`pnlSol`, `pnlPct`, and `formatLamports` with `paper: true` → "paper SOL"). Under the T-15 rule an exact zero is neutral "0.00", never red or green.
- The locale lives in `settings.locale` (default `id`) and is switched in Settings → Bahasa.
- Error text: the Rust error string starts with `CODE:`. `errorText()` maps it to `errors.json` v4 `messages[locale]`. Activity lines carry an `I18nMsg {key, args}` from Rust, rendered with `renderMsg()`.
- Negative numbers use U+2212 everywhere: the PnL formatters, the Rust plain-text fallbacks and the status-bar skew. A non-zero PnL never reads as 0 (`<0.0001` / `<0.1%`).

## 5.3 Not-tradeable state (WF-20, Compact)
- Source: `screener.scored` top-level `tradeable` / `skip_reason` / `quote_mint` (1.1.2), `coin.detected.quote_mint`, or `order.failed UNSUPPORTED_QUOTE_MINT` in the race case. The engine (`state.rs`) keeps a `Tradeability` per mint and copies it onto screener rows, picks and positions.
- UI: a neutral `NtChip` (⊘, dashed, `text.tertiary` on `bg.inset`, never red), dimmed rows, an empty Aksi column, filter chips (Semua / Lolos / Ditolak / Tidak bisa ditradingkan), and the `CoinDetail` panel with the WF-20 rows. Its chart stays live, greyed and read-only, and there is a disabled `Approve — tidak tersedia` with the reason written out. Queue cards show `Tidak bisa disetujui`, and positions show `Sell — tidak tersedia` in a sticky last column. A, ⇧A and ⇧X refuse with a text reason in the status bar.
- Rust: `Engine::check_tradeable` guards `approve_signal`, `approve_many`, `request_sell` and `take_quote` (confirm), so a flip between quote and confirm is refused (unit test `not_tradeable_blocks_approve_and_sell_locally_wf20`). The mock server also refuses (`422` + `order.failed`), giving defence in depth.
- UX QA `DESKTOP_WF20_QA.md` D1–D9 fixed:
  - D1: neutral timer and countdown;
  - D2: one-line CTAs;
  - D3: batch checkbox disabled;
  - D4: neutral status line;
  - D5: Mcap column, collapsing Venue/Likuiditas first;
  - D6: `screener.legend`;
  - D7: one-line detail rows, no `cta_note`, Lewati + `skip_hint`;
  - D8: PnL never truncated (a container query hides Strategi/Entry/Hold below 960 px; compact ⊘ chip) and U+2212;
  - D9: one-line quick-look header, neutral pending.
- Skip is allowed (UX Rev 4.4) with `queue.skip_reason.not_tradeable` preselected, and it is sent on the wire as `reject_reason: "not_tradeable"` (contracts 1.1.3). Mock trigger: `CENTURION_MOCK_NOT_TRADEABLE=screener|race|off` (browser `?nt=`).
- The mock keeps a bounded watch set (8) of not-tradeable coins that still get marks, and the engine keeps ticks for screener rows, so the read-only chart has data.

## 6. Frontend stack and licences
| Package | Licence |
|---|---|
| React 19, react-dom | MIT |
| TypeScript 5.9, Vite 8, @vitejs/plugin-react | Apache-2.0 / MIT |
| zustand 5 | MIT |
| lightweight-charts 5 | Apache-2.0 — **keep the TradingView attribution logo** (licence NOTICE requirement) |
| @fontsource/inter, @fontsource/jetbrains-mono (latin subsets) | OFL-1.1 |
| @tauri-apps/api, Tauri plugins | MIT / Apache-2.0 |

- Density: **Compact "Signal Terminal" is the desktop default**; Comfortable is optional (Settings).
- Theme: **dark is the default**; light and system are optional.

## 7. Security
- **No private keys** in the webview or in Rust. Signing happens only in the backend. Backend API tokens (Week 2) go in the OS keychain via `keyring` behind the `keychain` cargo feature (service `com.centuriontrade.app`, account `siws-session`; see D15). They are never stored in localStorage.
- Capabilities are scoped per window label and deny by default. The approval popup and viewers **cannot sell**.
- CSP:
  - `default-src 'self'`, `script-src 'self'`
  - `connect-src ipc: http://ipc.localhost` (the backend origin is added in Week 2)
  - `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`
- `freezePrototype: true`, `withGlobalTauri: false`.
- **Sells always need explicit confirmation:** a dialog, then hold Enter or the button (1.2 s Practice / 2.5 s Real). "Batal" (Cancel) has autofocus.
- **Global shortcuts never approve, skip or sell.** They only focus the terminal (`Ctrl/Cmd+Shift+H`) or open approvals (`Ctrl/Cmd+Shift+A`). Both are configurable.
- In-window hotkeys ignore key repeat and typing in inputs.

## 8. Packaging
- Targets: deb + AppImage (Linux), msi + nsis (Windows), dmg + app (macOS).
- **MVP ships unsigned Linux builds.** Code signing (Windows Authenticode, macOS Developer ID + notarization) and the Tauri updater are **out of MVP scope** and moved to Post-MVP (MILESTONES.md).
- Release profile: LTO, `opt-level = "s"`, strip, `panic = "abort"`.

## 9. Rust plan (modules and crates)
| Module | Role |
|---|---|
| `lib.rs` | builder, plugins, setup (shortcuts from settings, mock spawn), command registry |
| `commands.rs` | thin IPC handlers → `Engine` → `dispatch` |
| `state.rs` | `Engine`: paper book, queues, quotes/nonces, candles (+ unit tests) |
| `events.rs` | `Out` enum, emit, notifications, auto-show of the approval popup |
| `windows.rs` | create/focus chart and activity windows; popup create/place/show-without-focus/hide |
| `hotkeys.rs` | global shortcut bindings (open/focus only) |
| `notify.rs` | `[PRACTICE]` prefix for native notifications |
| `keychain.rs` | OS keychain wrapper (feature `keychain`) |
| `backend/` | `Transport` trait, paths, `ApiFailure` (409/428/…), `mock.rs` in-process mock server |
| `sync.rs` | live stream + page catch-up, seq cursor, refetch, reconnect |
| `keys.rs` | settings/exit IDs, v1.0→v1.1 rename tables, exit labels |
| `model.rs` | serde mirror of `@centurion/contracts` v1.1.4 wire |
| `view.rs` | desktop view-model sent over IPC (snake_case) |
| `contract_tests.rs` | tests against the files in `packages/contracts` |
| `error.rs`, `util.rs` | `AppError` (thiserror), RNG, fake mints, validation |

- Crates: tauri 2, tauri-plugin-{global-shortcut, notification, single-instance}, serde/serde_json, tokio, rust_decimal, chrono, thiserror 2, log, keyring 3 (optional).
- Week 2 adds tokio-tungstenite and reqwest (rustls) for the backend source.

## 10. Performance targets and measurements
- **Targets:** cold start under 1.5 s; idle RSS under 250 MB on a real GPU; tick → paint under 50 ms; the UI stays responsive with 200 signals and 1000 activity rows.
- **Measured** on the box: Xvfb with software rendering (pessimistic).
  - Release `.deb` ≈ 2.4 MB, AppImage ≈ 103 MB, binary ≈ 5.3 MB.
  - RSS ≈ 429 MB total across processes (main ≈ 175 MB); WebKit CPU ≈ 12%.
  - JS bundle 413.6 kB (131.4 kB gzip).

## 11. UX alignment and conflicts
### 11.1 UX `DESKTOP_COMPACT_AND_POPUP.md` + WF-11/WF-13 vs this document (§12)
| # | Spec says | Prototype / §12 | Status |
|---|---|---|---|
| C1 | WF-11 note: "Practice: dialog sama, konfirmasi **Enter (tanpa hold)**" | Sell confirmation is **hold 1.2 s Practice / 2.5 s Real** | **DECIDED** (Apex + UX, 29 Okt): the hold stays in both modes; WF-11 note superseded |
| C2 | `Enter` = detail | `↵` = **detach chart**; row detail = **Space** (toggle quick-look) or **row click**; `X` select, `⇧X` sell | **DECIDED** (Apex + UX, 29 Okt); implemented |
| C3 | Popup capability: event listen/emit + window show/hide/setPosition | Popup gets **no window API**; hide and position are done by Rust commands | Stricter than spec, OK |
| C4 | Drag position remembered per monitor; "monitor kursor" option; move to primary on unplug | Bottom-right of main's monitor only | Gap (W1-D3) |
| C5 | DND: do not show over fullscreen/presentation apps | Not implemented | Gap (W1-D3, needs per-OS checks) |
| C6 | Countdown = server `expires_at` − server_now (clock offset) | Local clock (mock) | Gap (W2-D7, with the backend) |
| C7 | Main window announces the timer per minute via `aria-live` | Not implemented | Gap (W1-D3) |
| C8 | WF-11: equity curve, exit-ladder detail panel, sell sheet docked right | Compact table + exit bar + summary + 25/50/100% chips in the sell **dialog** | Partial (W1-D4/D5) |
| C9 | Queue row 40 px, toasts with Undo 5 s | Queue rows are not re-measured; no toasts | Gap (W1-D3) |
| C10 | Popup label `approval-popup`, url `/popup`, 360×232, `focus:false` … | Implemented as specified | Aligned |
| C11 | Real in popup: no Approve, "Buka untuk approve ↗" | Implemented, plus a Rust-side guard | Aligned |
| C12 | Theme dark default, Compact default, ⇧X Sell, popup opt-in OFF | Same as D1–D4 | Aligned |
| C13 | D1 said "hold **Enter**" while ↵ = pop-out chart | ↵ pops out the chart **only in list context** (focused row, no modal). In the Sell dialog the hold runs on **mouse/touch press, held Space or held ↵** on the hold button (keydown starts, keyup before full = cancel). Pop-out is blocked while any dialog is open (the window keymap is disabled) | **DECIDED** (Apex + UX); implemented |
| C14 | Space quick-look vs native Space (scroll, activate button/checkbox) | Space = quick-look **only when focus is on a row** (`data-row`, roving `tabindex`; J/K move DOM focus). On buttons, checkboxes and links, Space/↵ stay native; elsewhere Space is not consumed. X stays select | **DECIDED**; implemented |
| C15 | WF-11 is drawn in Real, but Real is not MVP | **Real SOL on desktop = Phase 7 (out of MVP).** The MVP build is Practice. The Real guards stay in code (popup cannot approve, Rust label check, 2.5 s hold, "Buka untuk approve ↗") as a post-MVP reference, reachable only through the mock flag `CENTURION_MOCK_MODE=real`, with a "Phase 7 preview · mock" badge | **DECIDED** |
| C16 | Mock TTL 90 s vs UX default 10 min | OK for the demo. A **"MOCK TTL 90s"** badge shows in the queue header and the popup while the source is the mock. Production uses server `expires_at` (C6, before Real) | **DECIDED**; implemented |
| C17 | Theme "system" | "Ikuti OS" optional; explicit `data-theme="dark"` default; no media query in `tauri.css` | **DECIDED**; already so |
| C18 | `tauri.css` v0.2.0 stray `}` | Fixed in design-tokens **v0.2.1** (UX adds brace and lightningcss validation). The desktop workaround is removed | **DECIDED**; done |
| C19 | D11 no-activation popup untested on Windows/macOS | Popup **disabled on Windows and macOS** until W-NOFOCUS passes. Rust: `windows::POPUP_SUPPORTED = cfg!(target_os = "linux")` gates `open_approval_popup`, `set_settings` (forces off) and the global shortcut (falls back to focusing main). UI: runtime OS check greys out the setting with an explanation, and P shows the reason. **Linux: enabled (opt-in)**. Fallback: OS notifications | **DECIDED**; implemented |

### 11.2 Older UX Tauri README conflicts
- Tokens come from `@centurion/design-tokens` v0.2.0 `tauri.css` (dark + Compact default): colours, `--text-*` type ramp, space, radius, `--duration-hold*`, `--density-*`.
- **Conflicts:**
  - Pick TTL: the UX default is 10 min, but the mock uses 90 s so demos show expiry.
  - The UX popup is described as "always-on-top by default"; Apex decided it is **opt-in, OFF**.
  - Theme "system" is optional, because WebKitGTK headless reports light.

## 12. Decisions
| # | Topic | Decision | Status |
|---|---|---|---|
| D1 | Sell hotkey | **⇧X opens a confirmation dialog, then hold to confirm**: mouse/touch press, held Space or held ↵ on the hold button (1.2 s Practice / 2.5 s Real; release early = cancel). The hold is kept in Practice too (C1). ↵ does not pop out the chart while the dialog is open (C13) | **DECIDED** (Apex + UX) |
| D12 | Row detail | **Space** toggles a non-modal quick-look for the **focused row** (signal or position; C14), row click opens it, Esc closes; `↵` stays "pop-out chart" in list context (C2/C13). The quick-look is read-only | **DECIDED** (Apex + UX) |
| D2 | Theme | **Dark is the default**; light and system are optional | **DECIDED** |
| D3 | Density | **Compact "Signal Terminal" is the desktop default** | **DECIDED** |
| D4 | Approval popup | Small always-on-top window, **opt-in, OFF by default** | **DECIDED** |
| D5 | Global shortcuts | Focus or open only; never approve, skip or sell | **DECIDED** |
| D6 | Signing / updater | **Out of MVP scope.** MVP = unsigned Linux builds; signing, notarization and updater come Post-MVP | **DECIDED** |
| D7 | Identity | Product name **Centurion Trade** (from i18n `app.name`: window titles, tray tooltip, notification titles, loopback page), identifier `com.centuriontrade.app`; crate `centurion` / `centurion_lib` and `@centurion/*` unchanged | **DONE** (rebrand, Boss 2026-10-29) |
| D8 | Contracts | Backend owns `packages/contracts` (v1.1.2). The desktop imports `src/wire` types directly. The Rust mirror is hand-written and guarded by contract tests until codegen exists | **DONE for v1.1.4** (codegen open) |
| D10 | Popup in REAL SOL | No Approve; "Buka untuk approve ↗" hands off to main (dialog + hold 2.5 s). Enforced in Rust by window label | **DECIDED** (UX, via Apex) |
| D11 | Popup focus | Shown without activation; shortcuts only after a click. **Enabled on Linux only**; Windows/macOS are disabled until W-NOFOCUS passes (C19) | **DECIDED** (test gate) |
| D9 | Real mode on desktop | **Real SOL on desktop = Phase 7 (out of MVP).** It needs the backend signer, the server clock (C6, done for countdowns in v1.1), 2.5 s hold and per-trade caps. The Real code paths remain as a mock-flag-only reference (C15) | **DECIDED** |
| D15 | Desktop login (SIWS) | **Wallet-only, system browser, never the webview.** Rust opens the browser (`xdg-open` / `open` / `rundll32 url.dll`, URL built from config only) to the Web `/auth/desktop` page with `redirect_uri` + 128-bit `state`. The page connects Phantom, asks `POST /v1/auth/siws/nonce` (its origin = SIWS domain), the wallet signs the **message** (no transaction), and the page returns `state` + `address` + `message` + `signature` to a **loopback** listener (`127.0.0.1:<random>/siws/callback`; exact method/path, constant-time state, size caps, 20-request / 5-min limit, single use). Rust pre-checks the message (domain, address, expiry) and calls `/siws/verify {client:"desktop"}` itself. Session → OS keychain only. Refresh: **single-flight** (one tokio mutex held across the refresh; the rotated token is saved before release; a 401 seen with an old access token reuses the new one) because a reused refresh token revokes the family. `refresh_reused/revoked/expired/invalid` → signed out + keychain cleared; `403 FORBIDDEN_ROLE wallet_not_allowed` → its own screen. **Target (Boss): `centurion://auth` deep link carrying only a one-time code, PKCE S256 verifier kept and exchanged in Rust** — implemented and tested as `deeplink.rs` (strict scheme/host/path, no extra params, state, single use, 5-min expiry), **not wired** because (a) `tauri-plugin-deep-link` is not in the offline crate cache (not installed without review) and (b) Backend has no code/PKCE exchange endpoint. Proposed: `/siws/verify {…, code_challenge, code_challenge_method:"S256", client:"desktop"}` → `{code}`; `POST /v1/auth/desktop/exchange {code, code_verifier}` → Session. Threats: a local process can hit the loopback port, but it cannot forge a signed SIWS message or guess the state; no token is ever in a URL. Full browser round trip = manual test (Phantom is not headless) | **PARTIAL** (loopback live; deep link blocked) |
| D16 | Stop | One Rust command `stop_trading(mode, source, confirm)`, with validated args (mode = current mode, source ∈ ui/tray/shortcut, confirm == "STOP"). It pauses every running strategy with If-Match. The in-app button, tray "Stop trading…" and the `--stop` app-shortcut action (Linux `.desktop` `Actions=Stop`, `linux/main.desktop.hbs`) only *request* it: they open the confirm dialog. No workspace stop / kill-switch endpoint exists yet (1.1.5 reserves phase7 KillSwitch types only), so there is no sell_all and proposals are not expired server-side | **DONE** (gap reported) |
| D17 | Windows / macOS quick actions | Windows jump list (`ICustomDestinationList` task "Stop trading" → `"Centurion Trade.exe" --stop`) and macOS dock menu (`applicationDockMenu:` item → the same `stop::request`). Neither is buildable or testable on this Linux box | **DOCUMENTED** |
