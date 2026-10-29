# Sentra Desktop — 2-week milestone plan

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
| D6 | Contracts: BE schema → codegen TS (`packages/contracts`) + Rust (`model.rs`) | BE: schema |
| D7 | `source::backend`: WS client, reconnect/backoff, token in OS keychain | BE: WS endpoint + auth |
| D8 | Approve/skip/sell → BE commands; idempotency keys; error surfaces | BE: command API |
| D9 | **Unsigned Linux packaging** (deb + AppImage) + performance pass (RSS/CPU targets) | — |
| D10 | Hardening, CSP for the backend origin, QA (incl. **W-NOFOCUS** below on a Windows VM), demo | UX + BE review; Windows test machine |

## Test plan item W-NOFOCUS — popup must not steal focus (Windows; also macOS)
**Release gate (C19):** the approval popup ships **disabled on Windows and macOS**. `windows::POPUP_SUPPORTED = cfg!(target_os = "linux")` in Rust is the enforcement, and the UI greys out the setting with an explanation. It is enabled per OS only after every case below passes on that OS: flip the cfg for that target, re-run the cases, and record the result here. Until then those OSes use OS notifications only.

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
- macOS: a non-activating `NSPanel` (e.g. `tauri-nspanel`) with `acceptFirstMouse:false`.
- Fallback when focus is still stolen: disable the popup and use OS notifications only.

## Post-MVP (out of MVP scope)
- Code signing: Windows Authenticode, macOS Developer ID + notarization.
- Tauri updater (signed update manifests, release channel).
- Windows and macOS installers as release artifacts.
- **Phase 7:** Real SOL trading from the desktop (backend signer, server `expires_at`, 2.5 s hold, per-trade caps). The Real UI and guards already exist as a mock-flag-only reference (C15).
