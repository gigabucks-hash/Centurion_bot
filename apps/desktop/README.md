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

Screenshots: `docs/` (screenshot-v11-terminal, screenshot-v11-conflict, screenshot-v11-after-sell, popup-practice, popup-real, real-handoff-confirm, positions-compact-sell, …).

## What is mocked
- The whole backend, as an in-process mock server that speaks the contracts v1.1 wire. It covers the token stream, prices, guard and screener results, the exit plan, the paper book (30 SOL, 0.25 SOL per trade, 125 bps fee), strategies with rev, practice reset, coin timeline and exit-reason stats.
- It lives in `src-tauri/src/backend/mock.rs`. The desktop reaches it only through the `Transport` trait.

## Mock environment variables
| Var | Default | Effect |
|---|---|---|
| `SENTRA_MOCK_SKEW_MS` | `2500` | Offsets the mock server clock from the local clock, to show the skew correction (C6) |
| `SENTRA_MOCK_FORCE_CONFLICT` | off | `1` makes the mock "edit on mobile" before every strategy write, so each pause/resume returns a 409 conflict toast |
| `SENTRA_MOCK_MODE` | `practice` | `real` previews the Phase 7 Real chrome (still mock, no wallet) |

Contracts: `packages/contracts` v1.1.1 (read-only). `cargo test` includes contract tests against those files, and `npm run build` typechecks `src/api/wire.check.ts`.
