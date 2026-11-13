# Real money: go-live checklist

Real is **off** until the owner turns it on in the installed Centurion Trade app and signs with their own wallet. Installing 0.3.0 does not trade. This page is the owner's checklist, not a statement that live trading is already switched on.

## What the app already enforces

| Rail | What it does |
|---|---|
| Opt-in | Settings → Real money → Enable Real. The system browser opens so the owner's wallet can sign. The app stores the public key and the signature only. |
| Keys | There is no export, no upload, and no field in `real.json` for a private key. Swaps are signed by the wallet. |
| Defaults | 0.05 SOL per trade, 0.5 SOL per day, 2 SOL capital cap, 3 open positions. These are starting values. There is no hard maximum. |
| Tighter limits | Save immediately. |
| Looser limits | A dialog lists every old value and the new value. The new values are stored only after the wallet signs that exact text. |
| Where | Global, and a separate copy per strategy. |
| Other knobs | Slippage, priority fee, tip, take-profit, stop-loss, trailing stop, max hold, and buy filters (market cap, liquidity, volume, top-10, holders, age, LP burn, pool share). |
| Stop | Pauses new buys only. Exit plans keep running. Resume is immediate. |
| Jual semua | Sells every open position, including while buys are paused. |
| Guard and Risk | A buy is refused unless the guard verdict is pass and the risk manager has not vetoed. The size, daily, cap, position and slippage checks run as well. |
| Transfers | A transaction that sends SOL or tokens to any address other than the owner's wallet is refused. A tip is allowed only up to the tip setting, and only to the public Jito tip accounts. |
| RPC | Uses the URL in Settings. `https://` anywhere, or `http://` only to this PC. The public Solana mainnet URL is the default. No paid plan is configured. |
| Server | The paper API still refuses `REAL_TRADING_ENABLED` and does not receive keys. Live swaps are built on this PC (public Jupiter quote) and sent through the owner's RPC. |

L1 and L2 (practice and real books no longer hide each other, and a practice reset does not touch real rows) stay closed. See `supabase/tests/97_per_mode_reset.sql`.

## What the owner does to turn Real on

1. Install the Windows build from the `desktop-v0.3.0` release after you publish it. Do not publish it until you have read these notes.
2. On that PC, turn Smart App Control off or sign the installer with an Authenticode certificate. An unsigned installer will not start while Smart App Control is enforcing.
3. Open Centurion Trade → Settings → Real money.
4. Paste the wallet address that will sign. Press **Enable Real** and approve the message in that wallet. The key never leaves the wallet.
5. Set the RPC URL if you do not want the public mainnet endpoint.
6. Set the limits. Raising any of them shows the old and new numbers and asks for another signature.
7. Tick the strategies that may trade Real.
8. Fund that wallet yourself. The app does not move funds in from anywhere else.
9. Approve a buy. The app builds the swap, checks Guard, Risk, the limits and the destination, then asks the wallet to sign the transaction. Until you sign, nothing is sent.
10. Stop pauses new buys. **Jual semua** sells the open positions. Each of those sells is still signed by the wallet.

## Still an owner decision

These are not code. The build does not do them.

| Decision | Why it is still open |
|---|---|
| Publish `desktop-v0.3.0` | The tag, notes and installer job are ready. This change does not publish the GitHub release. |
| Authenticode certificate | Without it, SmartScreen shows an unknown publisher and Smart App Control can block the installer. The updater signature is separate and is already wired. |
| Which wallet and how much to fund | The app will not pick a wallet or move funds into it. |
| Which RPC to rely on | The public endpoint is the default. A private URL is a setting. No plan was purchased. |
| Leave the paper API where it is | No server was deployed and no VPS was rented. Real signing happens on the PC. |
| Legal and tax | Not decided here. |
| Stay on, or turn Real back off | Delete the enable signature by signing out of Real on a future build, or don't press Enable. The default install is off. |

## Names left as they are

The window title, installer product, publisher, tray tooltip and About text say **Centurion Trade**. The crate name `centurion`, the folder `src-tauri`, and the `@tauri-apps/*` packages stay. Renaming those breaks the Windows build and the updater. They are not shown as the product name.
