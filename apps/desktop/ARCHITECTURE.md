# Sentra Desktop — Architecture (Phase 6)

> Status: prototype, **mock data only**. No real trading, no wallet, no chain network.
> Path: `/workspace/sentra/apps/desktop` (monorepo). Product name **Sentra**, identifier **`com.sentra.app`** (placeholder).
> All code is original. No HOTBOT code was copied; HOTBOT is only a feature-parity reference.

## 1. Goals and non-goals
- A multi-window trading terminal with an approval queue, a chart, an activity feed, positions, native notifications and keyboard-first actions (Approve / Skip / Sell).
- It is a **thin client**. Strategy, signing and the order flow live in the backend (Phase 3–5). The desktop never holds private keys.
- Non-goals for the MVP: code signing, notarization, auto-updater (see §8 and §12), and Real SOL trading from the desktop (Phase 7, C15).

## 2. Monorepo layout
```
/workspace/sentra
├── apps/desktop          ← this app (Tauri v2 + React)
├── apps/web              (placeholder — Web team)
├── apps/mobile           (placeholder — Flutter team)
├── packages/design-tokens (placeholder — UX team)
└── packages/contracts    ← @sentra/contracts: event/command types (desktop draft, Backend to own)
```
- **Contracts:** the TS types live in `packages/contracts/src/index.ts`. The desktop imports them as `@sentra/contracts` (tsconfig `paths` + a Vite alias; no workspace install is needed). The Rust mirror stays in `src-tauri/src/model.rs`, because Rust cannot import TS. Once Backend publishes a schema (JSON Schema/OpenAPI), both sides will be generated from it (milestone W2-D6).
- **Design tokens:** `npm run sync:tokens` copies the first file it finds from this list into `src/design/sentra-tokens.css`:
  1. `packages/design-tokens/tokens/tauri.css` (**used now**: UX v0.2.1, dark + Compact default)
  2. `packages/design-tokens/tokens/tokens.css`
  3. `/workspace/ux-solbot/tokens/tauri.css` (legacy)

  `app.css` uses the v0.2.x names: `--text-*`, `--density-*`, `--duration-*`, `--shadow-e*`. Currently synced: **v0.2.1**. The v0.2.0 stray `}` (C18) is fixed upstream, so the workaround has been removed and the script is a plain copy again.

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
  **Enforced in Rust:** `approve_signal` checks the *calling window label* (`state::check_approve_origin`), so an approve from `approval-popup` in Real is rejected even if the UI were bypassed (unit-tested). Real is still mock-only. Run with `SENTRA_MOCK_MODE=real` to preview the Real chrome and gating.
- **Accessibility:** `role="dialog"`, `aria-modal="false"`, `aria-labelledby`. Reduced motion is respected (no transitions) and `forced-colors` is handled.

## 4. IPC
- **Commands** (webview → Rust), each with its own permission generated by `tauri-build` AppManifest:
  - `get_snapshot`, `get_candles`
  - `approve_signal`, `approve_many` (Practice-only, max 20), `skip_signal`
  - `request_sell` → `confirm_sell(nonce)`
  - `open_chart_window`, `open_activity_window`, `open_approval_window`
  - `set_settings`
  - `focus_main_for_signal(id)` (popup → main hand-off; never approves), `hide_approval_popup`
- **Events** (Rust → all windows): `signal:new`, `signal:update`, `market:ticks` (1 s batches), `activity:event`, `positions:update`, `account:update`, `conn:status`, `settings:update`, and `ui:focus-signal` (sent to `main` only).
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
- **Mock source** (`src-tauri/src/mock`):
  - A 1 s loop runs a random-walk price model with shocks, a mock exit plan (TP 2×, trailing stop 20% after +30%, SL −40%) and signal expiry.
  - It emits a new candidate every 4–11 s; 30% of them are blocked by the mock Guard.
  - Paper book: 30 SOL starting cash, 0.25 SOL per approve, 125 bps simulated fee.
  - Week 2 replaces it with `source::backend` (WebSocket to Backend), which emits the same `Out` events.

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
- **No private keys** in the webview or in Rust. Signing happens only in the backend. Backend API tokens (Week 2) go in the OS keychain via `keyring` behind the `keychain` cargo feature (service `com.sentra.app`). They are never stored in localStorage.
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
| `mock/` | mock market/strategy source |
| `model.rs` | serde mirror of `@sentra/contracts` |
| `error.rs`, `util.rs` | `AppError` (thiserror), RNG, fake mints, validation |

- Crates: tauri 2, tauri-plugin-{global-shortcut, notification, single-instance}, serde/serde_json, tokio, thiserror 2, log, keyring 3 (optional).
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
| C15 | WF-11 is drawn in Real, but Real is not MVP | **Real SOL on desktop = Phase 7 (out of MVP).** The MVP build is Practice. The Real guards stay in code (popup cannot approve, Rust label check, 2.5 s hold, "Buka untuk approve ↗") as a post-MVP reference, reachable only through the mock flag `SENTRA_MOCK_MODE=real`, with a "Phase 7 preview · mock" badge | **DECIDED** |
| C16 | Mock TTL 90 s vs UX default 10 min | OK for the demo. A **"MOCK TTL 90s"** badge shows in the queue header and the popup while the source is the mock. Production uses server `expires_at` (C6, before Real) | **DECIDED**; implemented |
| C17 | Theme "system" | "Ikuti OS" optional; explicit `data-theme="dark"` default; no media query in `tauri.css` | **DECIDED**; already so |
| C18 | `tauri.css` v0.2.0 stray `}` | Fixed in design-tokens **v0.2.1** (UX adds brace and lightningcss validation). The desktop workaround is removed | **DECIDED**; done |
| C19 | D11 no-activation popup untested on Windows/macOS | Popup **disabled on Windows and macOS** until W-NOFOCUS passes. Rust: `windows::POPUP_SUPPORTED = cfg!(target_os = "linux")` gates `open_approval_popup`, `set_settings` (forces off) and the global shortcut (falls back to focusing main). UI: runtime OS check greys out the setting with an explanation, and P shows the reason. **Linux: enabled (opt-in)**. Fallback: OS notifications | **DECIDED**; implemented |

### 11.2 Older UX Tauri README conflicts
- Tokens come from `@sentra/design-tokens` v0.2.0 `tauri.css` (dark + Compact default): colours, `--text-*` type ramp, space, radius, `--duration-hold*`, `--density-*`.
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
| D7 | Identity | Product name `Sentra`, identifier `com.sentra.app` (placeholder) | **DECIDED** (identifier may change before signing) |
| D8 | Contracts | TS in `packages/contracts`; Rust mirror hand-written until codegen | Open — Backend to own the schema |
| D10 | Popup in REAL SOL | No Approve; "Buka untuk approve ↗" hands off to main (dialog + hold 2.5 s). Enforced in Rust by window label | **DECIDED** (UX, via Apex) |
| D11 | Popup focus | Shown without activation; shortcuts only after a click. **Enabled on Linux only**; Windows/macOS are disabled until W-NOFOCUS passes (C19) | **DECIDED** (test gate) |
| D9 | Real mode on desktop | **Real SOL on desktop = Phase 7 (out of MVP).** It needs the backend signer, server `expires_at` (C6), 2.5 s hold and per-trade caps. The Real code paths remain as a mock-flag-only reference (C15) | **DECIDED** |
