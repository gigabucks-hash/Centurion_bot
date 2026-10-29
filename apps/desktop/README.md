# Sentra Desktop (apps/desktop)

Tauri v2 + React 19 trading terminal prototype. **Mock data only**: no wallet, no chain network, no real trading.
See `ARCHITECTURE.md` and `MILESTONES.md`. Types come from `../../packages/contracts`.

## Prerequisites (Linux)
- Rust stable (rustup) and Node 20+.
- System libraries: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev`.
- Tauri CLI: `cargo install tauri-cli --version ^2`.

## Commands
```bash
cd /workspace/sentra/apps/desktop
npm install
npm run dev                 # browser-only UI with the built-in mock adapter (http://localhost:1420)
cargo tauri dev             # full desktop app
npm run build               # typecheck + Vite build
(cd src-tauri && cargo check && cargo test)
cargo tauri build --bundles deb   # unsigned Linux release (MVP)
npm run sync:tokens         # pull tokens from packages/design-tokens (falls back to the embedded copy)
```

## Keys
| Key | Action |
|---|---|
| J/K or ↑/↓ | Move through the queue |
| A | Approve |
| S | Skip |
| X | Select |
| ⇧A | Approve selected (Practice only) |
| ⇧X | Sell: opens the dialog, then hold the confirm button with the mouse, Space or ↵ (1.2 s Practice / 2.5 s Real) |
| Space | Quick-look for the **focused row** (J/K focuses rows; row click also opens it). On buttons/checkboxes Space works natively |
| ↵ | Pop out the chart (only from a focused row, no dialog open) |
| C | Toggle the centre tab Chart ↔ **Koin · screener** (WF-20 screener rows incl. not-tradeable) |
| L | Activity window |
| P | Approval popup (Linux only for now; disabled on Windows/macOS until W-NOFOCUS passes; 360×232, bottom-right; PRACTICE: Approve/Skip; REAL: Skip + "Buka untuk approve ↗") |
| , | Settings |
| Esc | Close |

Global shortcuts: Ctrl/Cmd+Shift+H focuses the terminal; Ctrl/Cmd+Shift+A opens approvals. They never trade.

## Preview REAL SOL chrome (Phase 7 reference, still mock)
```bash
SENTRA_MOCK_MODE=real cargo tauri dev   # desktop
# browser: http://localhost:1420/?mode=real
```
In REAL mode the popup cannot approve. Approve from main needs the dialog + a 2.5 s hold. No wallet and no network in either mode.

Screenshots: `docs/` (screenshot-v11-terminal, screenshot-v11-conflict, screenshot-v11-after-sell, popup-practice, popup-real, real-handoff-confirm, positions-compact-sell, wf20-screener-tab, wf20-coin-detail, wf20-queue-card-not-tradeable, wf20-positions-sell-unavailable, wf20-sell-shortcut-blocked, wf20-quicklook-not-tradeable, …).

## What is mocked
- The whole backend, as an in-process mock server that speaks the contracts v1.1.4 wire. It is the default; `SENTRA_BACKEND=http://127.0.0.1:…` switches to the real HTTP+SSE transport (see "Real backend" below and `docs/REAL_TRANSPORT_SMOKE.md`). It covers the token stream, prices, guard and screener results, the exit plan, the paper book (30 SOL, 0.25 SOL per trade, 125 bps fee), strategies with rev, practice reset, coin timeline and exit-reason stats.
- It lives in `src-tauri/src/backend/mock.rs`. The desktop reaches it only through the `Transport` trait.

## Mock environment variables
| Var | Default | Effect |
|---|---|---|
| `SENTRA_MOCK_SKEW_MS` | `2500` | Offsets the mock server clock from the local clock, to show the skew correction (C6) |
| `SENTRA_MOCK_FORCE_CONFLICT` | off | `1` makes the mock "edit on mobile" before every strategy write, so each pause/resume returns a 409 conflict toast |
| `SENTRA_MOCK_MODE` | `practice` | `real` previews the Phase 7 Real chrome (still mock, no wallet) |
| `SENTRA_MOCK_NOT_TRADEABLE` | `screener` | WF-20 not-tradeable state. `screener`: ~15% of new coins are USDC/USDT-quoted, so they show only as screener rows (guard not run, never proposed). `race`: also flips ~40% of SOL coins to a non-SOL quote ~8 s after they are proposed (queue card goes disabled) and ~40% of opened positions (Sell disabled; a sell that still reaches the mock gets `422` + `order.failed UNSUPPORTED_QUOTE_MINT`). `off`: every coin is SOL-quoted |

Browser preview (`npm run dev`, no Tauri): `?nt=screener|race|off` mirrors `SENTRA_MOCK_NOT_TRADEABLE`, `?tab=coins` opens the screener tab, `?mode=real` previews Real.

### Not tradeable (WF-20)
Not tradeable is a product limit, not a danger, so the chip is neutral (⊘, dashed, `text.tertiary` on `bg.inset`) and never red. The row is dimmed, the Aksi column is empty, and the detail panel explains why (`ⓘ`, Pair quote `USDC · bukan SOL`, Pair SOL `tidak ada`, Skor `… (informasi saja)`, Guard `tidak dijalankan`, Reason code). The chart stays live but greyed and read-only, and there is a disabled `Approve — tidak tersedia` with the reason written out (not tooltip-only). It is blocked three times:
1. UI: buttons are disabled, and A / ⇧A / ⇧X refuse with a text reason in the status bar.
2. Rust commands: `approve_signal`, `approve_many`, `request_sell` and `confirm_sell` (re-checked at confirm, so a quote taken before a flip is refused) return `UNSUPPORTED_QUOTE_MINT: …`.
3. Mock server: `422` + `order.failed`.

Skip stays allowed on a not-tradeable card (rejecting is not a trade; UX Rev 4.4), with `queue.skip_reason.not_tradeable` preselected. Contracts 1.1.3 sends it on the wire: a skip carries `reject_reason: "not_tradeable"` for a not-tradeable card and `"user_declined"` for a normal one (`commands.rs skip_reason`). `reject_reason` is only sent with `decision=reject`; the mock refuses it on approve, and refuses unknown values, with `422 VALIDATION_FAILED`, like the server. The card is left out of batch approve (checkbox disabled; `queue.batch.excluded_not_tradeable`). Its timer, countdown and status are neutral, never red, and so is the status-bar reason. The coin detail offers Lewati + `screener.detail.skip_hint` when the coin has a pending pick. The screener Mcap column shows contracts 1.1.4 `mcap_usd` (display-only); the tooltip shows `market_cap_lamports` as SOL and `mcap_as_of`, and a null value shows "—".

### Practice cash: two different codes
- `order.failed` `INSUFFICIENT_PRACTICE_BALANCE` (kind error): one order failed, shown as a red feed line.
- `system.notice` `PRACTICE_CASH_INSUFFICIENT` (kind notice): strategy entries are paused, shown as a neutral, persistent "entries paused" strip. It clears when an entry fills again or Practice is reset.

### Language
UI text comes from `@sentra/i18n` 0.4.4 (`packages/i18n`, read-only; ICU messages via `src/i18n/icu.ts`, numbers via its `format.mjs`). Settings → Bahasa switches `id` (default) and `en`. Error text: code → key via the package `errors.map.json` (56 codes, incl. fallback keys), catalog copy in the UI locale, falling back to `errors.json` v4 `messages.id/en`; unknown code → `error.code.internal`. Placeholders are wire field names (`{symbol}`, `{amount_lamports}` formatted with `formatLamports`). All former `desktop.*` strings are package keys since 0.4.4 (`key-migrations.json`); `src/i18n/local.ts` keeps only the "(mock)" dev suffix.

Real backend (dev): `SENTRA_BACKEND=http://127.0.0.1:<port>` + `SENTRA_WORKSPACE_ID` + `SENTRA_BACKEND_TOKEN` switches to the REST/SSE `HttpTransport` (default: mock; plain http only to loopback). `scripts/smoke-real.sh` runs the real-transport smoke test against `services/backend/api` (35 cases; results and contract mismatches in `docs/REAL_TRANSPORT_SMOKE.md`). `--serve` keeps the API up for the app. The dev JWT secret lives in the gitignored `.env.local`.

Contracts: `packages/contracts` **v1.1.4** (read-only; mirror `CONTRACTS_VERSION = "1.1.4"`; tests read the committed HEAD version). `cargo test` includes contract tests against those files (errors.json v4+, typed 1.1.2 examples, 1.1.3 `ApprovalRejectReason` / `ApprovalWire`, 1.1.4 `MarketCapFields` / `stall`), and `npm run build` typechecks `src/api/wire.check.ts`. Design tokens: `packages/design-tokens` v0.2.4 (`--color-bg-sunken`).

Practice reset is limited to once per 24 h. A second reset gets `429 RESET_COOLDOWN` with `{next_allowed_at}` and `Retry-After` (the in-process mock carries `retry_after_s`). Settings shows it as neutral text, not an error ("Berikutnya: <local date, time>"), and disables the button until then (`docs/practice-reset-cooldown.png`).
