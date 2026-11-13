# desktop-v0.3.0 (prepared, not published)

Windows installer for Centurion Trade. Do not publish this GitHub release until the owner says so.

Suggested tag: `desktop-v0.3.0`

The three version files are `0.3.0`:

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/package.json`

The updater endpoint and minisign public key are unchanged. After this tag is published from `main`, an installed 0.2.x app can update from Settings → Update aplikasi.

## What changed

- The product name a person sees is Centurion Trade. Installer publisher is Centurion Trade. The window, tray and titles do not say Tauri.
- Paper trading: Stop pauses new buys only. Jual semua sells every open position, including while buys are paused. Missing PnL stays an em dash.
- Real trading can be turned on in the app. It stays off until the owner signs with their own wallet. Limits start at 0.05 SOL / trade, 0.5 SOL / day, 2 SOL cap and 3 positions, and can be set higher. Tightening applies immediately. Loosening needs a dialog of old versus new values and a wallet signature. Guard and Risk vetoes apply. Transfers to any other wallet are refused.
- The desktop contracts pin now includes the PnL report commit `117bd09`.

## Owner still decides

See `docs/release/real-money-readiness.md`. Publishing this release, Authenticode, funding the wallet, and which RPC to keep are not done by this change.
