# Centurion Desktop — 2-week milestone plan

Dependencies: **UX** = design tokens and specs; **BE** = backend API/WS and contracts.

## Week 1 — prototype → real UI shell
| Day | Work | Depends on |
|---|---|---|
| D1 | Monorepo setup, CI (`npm run build`, `cargo check/clippy/test`) | — |
| D2 | Token pipeline from `packages/design-tokens`; Compact/Comfortable density QA | UX: tokens in `packages/design-tokens` |
| D3 | Queue/approval polish (queue row 40, toasts + Undo), popup gaps C4/C5/C7 (per-monitor position, DND, aria-live), empty and error states | UX: DESKTOP_COMPACT_AND_POPUP |
| D4 | Chart: timeframes, buy/sell markers; WF-11 equity curve | UX: chart spec |
| D5 | Positions: WF-11 exit-ladder detail panel + docked sell sheet (⇧X, dialog, hold Enter: **decided**; partial 25/50/100 done) | UX: resolve C1 (Practice hold vs Enter) |

## Week 2 — wire to the backend (still Practice)
| Day | Work | Depends on |
|---|---|---|
| D6 | ~~Contracts~~ **Done early (v1.1.1 → v1.1.2 → v1.1.3):** reject_reason (not_tradeable on NT skips) + ApprovalWire, ConflictError.current required, 429 RESET_COOLDOWN UI; int64 seq strings, approvals by rev, nested errors, positions/{id}/close, errors.json v4, typed PlanState/Order/Fill/Job; wire types imported, Rust mirror + contract tests, Transport trait, resync, server clock, If-Match/409/428, practice.reset, account.*. Remaining: codegen instead of a hand mirror | BE: schema answers Q1–Q18 |
| D7 | Real `Transport`: Broadcast marks/clock + SSE events (Last-Event-ID) + REST, reconnect/backoff (logic exists in `sync.rs`), token in OS keychain | BE: WS/SSE endpoints + auth |
| D8 | Approve/skip/sell/strategy/reset → BE REST (idempotency keys, If-Match and error surfaces already wired against the mock) | BE: sell job schema (Q7) |
| D9 | **Unsigned Linux packaging** (deb + AppImage) + performance pass (RSS/CPU targets) | — |
| D10 | Hardening, CSP for the backend origin, QA (incl. **W-NOFOCUS** below on a Windows VM), demo | UX + BE review; Windows test machine |

**Also done (Week 1 extras):** i18n 0.4.4 (id/en, Settings → Bahasa, errors.map.json, no desktop-local keys), design-tokens v0.2.4, the WF-20 not-tradeable state (screener tab + detail, queue/positions disabled, blocked in UI + Rust + mock).

## Test plan item W-NOFOCUS — popup must not steal focus (Windows)
**Release gate (C19):** the approval popup ships **disabled on Windows**. macOS is not a product target. `windows::POPUP_SUPPORTED = cfg!(target_os = "linux")` in Rust is the enforcement, and the UI greys out the setting with an explanation. Enable it on Windows only after every case below passes there: flip the cfg for that target, re-run the cases, and record the result here. Until then Windows uses OS notifications only.

This cannot be tested on the Linux build box (Xvfb has no window manager).

**Test cases**
1. Typing in Notepad or a browser while a new pick arrives: the popup appears, every keystroke keeps going to Notepad, and the taskbar does not flash.
2. Clicking the popup activates it, and A, S, J/K and Esc then work.
3. Approve stays locked for 600 ms after an item appears under the cursor.
4. With a fullscreen app or presentation open, the popup does not show (DND option); only the OS notification does.
5. Multi-monitor: the popup appears on main's monitor, above the taskbar.

**Planned implementation**
- Tauri `focused(false)` + `show()` without `set_focus()` (already done).
- If tao's `show()` still activates the window on Windows, add a `#[cfg(windows)]` path using the `windows` crate:
  - Get `hwnd()` and set `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` (also `WS_EX_TOPMOST`).
  - Show with `ShowWindow(SW_SHOWNOACTIVATE)` / `SetWindowPos(HWND_TOPMOST, …, SWP_NOACTIVATE)`. Never call `SetForegroundWindow`.
  - Clear `WS_EX_NOACTIVATE` on the first pointer-down so a click can give the popup keyboard focus (WebView2 needs it).
- Fallback when focus is still stolen: disable the popup and use OS notifications only. macOS is not a target, so there is no NSPanel path.

## Post-MVP (out of MVP scope)
- Code signing: Windows Authenticode (macOS was dropped from the product).
- ~~Tauri updater (signed update manifests, release channel).~~ **Done:** `desktop-vX.Y.Z` publishes a signed Windows release with `latest.json`; Settings → App update checks, downloads and installs it.
- Windows installers as release artifacts. **Done**; macOS installers are no longer a target.
- **Phase 7:** Real SOL trading from the desktop (backend signer, server `expires_at`, 2.5 s hold, per-trade caps). The Real UI and guards already exist as a mock-flag-only reference (C15).
