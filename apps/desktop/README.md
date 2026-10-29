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
| ⇧X | Sell: opens the dialog, then hold Enter |
| ↵ | Detach the chart |
| L | Activity window |
| P | Approval popup (360×232, bottom-right; PRACTICE: Approve/Skip; REAL: Skip + "Buka untuk approve ↗") |
| , | Settings |
| Esc | Close |

Global shortcuts: Ctrl/Cmd+Shift+H focuses the terminal; Ctrl/Cmd+Shift+A opens approvals. They never trade.

## Preview REAL SOL chrome (still mock)
```bash
SENTRA_MOCK_MODE=real cargo tauri dev   # desktop
# browser: http://localhost:1420/?mode=real
```
In REAL mode the popup cannot approve. Approve from main needs the dialog + a 2.5 s hold. No wallet and no network in either mode.

Screenshots: `docs/` (popup-practice, popup-real, real-handoff-confirm, positions-compact-sell, …).

## What is mocked
- Token stream, prices, guard and screener results, the exit plan, and the paper book (30 SOL, 0.25 SOL per trade, 125 bps fee).
- Everything lives in `src-tauri/src/mock` and `src-tauri/src/state.rs`.
