# Desktop paper acceptance (Windows x64)

Runbook for the **installed** Centurion desktop app talking to the real paper API and the web
sign-in page. Paper only: this build can never trade real SOL (backend `real_gate`, practice→real
403 `MODE_NOT_ALLOWED`).

Scope owner: Desktop. The web/API side is proven separately in [`web-local.md`](web-local.md).

## What this proves

| # | Claim | How |
|---|---|---|
| A | Installer runs and starts on mock data | clean install, first launch |
| B | The paper API can be set **inside the app** (no env var) | Settings → Koneksi paper |
| C | Phantom sign-in works through the system browser (Windows = loopback) | login → approve |
| D | Paper trading works end to end | approve → position → sell → PnL |
| E | The session survives a restart, without a new login | kill app, relaunch |
| F | Changing the API base drops the old session | switch A → B, inspect Credential Manager |
| G | A wrong/dead API never looks "connected" | save a dead but valid URL |
| H | In-app update installs the latest GitHub release | check → download → restart |

## Preconditions

- Windows 10/11 x64, signed-in desktop session (Credential Manager needs it).
- **Check Smart App Control before promising an install.** Run
  `(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy').VerifiedAndReputablePolicyState`.
  `1` means Smart App Control is enforcing and Windows will refuse to start an unsigned installer
  ("An Application Control policy has blocked this file") with no Run-anyway option. Either install on a
  PC where it is `0`, or sign the installer with Authenticode first. The Tauri updater signature does
  not satisfy this check.
- Installer from `https://github.com/gigabucks-hash/Centurion_bot/releases` (`desktop-v*`), or the
  MSI/NSIS artifact of a green `desktop.yml` run.
- Paper API reachable over `https://` (or `http://127.0.0.1:<port>` for a local stack) and a paper
  workspace for the Phantom wallet used.
- Web app deployed with `/auth/desktop` reachable over `https://` and pointed at the same paper API.
- No `CENTURION_BACKEND` / `CENTURION_LOGIN_URL` set for the installed app (those env vars win and
  disable the Settings card). Check with `Get-ChildItem Env:CENTURION*`.

**No deploy needed to run this runbook.** `tools/paper/up.ps1` starts the paper API and the built web
app on this PC (`down.ps1` stops them). Use its loopback URLs: API `http://127.0.0.1:<api port>`,
sign-in page `http://127.0.0.1:<web port>/auth/desktop`. Both are legal on loopback; the LAN URL the
script prints is for the phone/web client only — the desktop refuses plain `http://` to a non-loopback
host. A deployed HTTPS pair works the same way.

Where the app keeps state:

- Settings file: `%APPDATA%\com.centuriontrade.app\connection.json` (`{"backend":…,"login_url":…}`;
  missing file = mock, the normal first run).
- Session token: Windows Credential Manager, generic credential, target/service
  `com.centuriontrade.app`, account `siws-session`. One fixed entry — not per server.
- Uninstall/remove: delete the app; the credential stays until sign-out or manual delete, so always
  run step F before handing the PC to someone else.

## A. Install and first run

1. Run the installer. SmartScreen shows **"Unknown publisher"** — expected: the installer has no
   Authenticode certificate (the updater signature is separate). Choose *More info → Run anyway*.
   With Smart App Control enforcing there is no such button: the installer is blocked before it runs
   (see Preconditions — that needs a certificate or a different PC).
2. Launch from the Start menu (tray icon appears).
3. Expected: app opens on **mock** data; Settings → Koneksi paper shows chip *Data contoh (demo)*
   and no error line. No login gate.

## B. Point the app at the paper API

Settings (gear) → **Koneksi paper**.

1. *Alamat API*: paste the API base **without a path**, e.g. `https://paper.example.com`
   (plain `http://` is accepted only for `127.0.0.1` / `localhost`).
2. *Halaman login*: paste the web app's desktop sign-in page, e.g.
   `https://app.example.com/auth/desktop`. It is required with an API address: saving without it is
   refused, so the app never opens a placeholder host and waits for a callback that cannot come.
3. Press **Simpan dan restart**.

Expected:

- Message *Tersimpan. Restart untuk menyambung…*, then the app restarts by itself (~1.2 s after the
  save returns; a slow old server can delay the save by up to 15 s while it tries to revoke the old
  session).
- After restart: chip **API paper** + the saved URL; the login gate (*Hubungkan wallet Solana* button)
  replaces the terminal. The status bar at the bottom says *API paper online* (not *backend (mock)*).
- Saving only the login page (same API) does not restart: *Tersimpan. Login dengan Phantom…*.
- If a restart was skipped or crashed, the card shows *Perubahan API sudah tersimpan tapi belum
  aktif…* until the app is relaunched.

Rejections (inline, nothing saved):

| Input | Message |
|---|---|
| `paper.example.com` | *Alamat harus diawali https:// …* |
| `http://paper.example.com` | *http:// polos hanya untuk 127.0.0.1 atau localhost …* |
| `https://paper.example.com/v1` | *Isi alamat dasarnya saja, tanpa /v1 …* |
| `https://user:pw@host` | *Alamat itu tidak valid.* |
| API set, sign-in page empty | *Alamat API harus disertai halaman login …* |

If `CENTURION_BACKEND` is set, the card shows *Backend diatur lewat CENTURION_BACKEND …* and the
inputs are disabled. Close the app, unset the var, relaunch.

## C. Sign in with Phantom (Windows: loopback)

1. Press **Hubungkan wallet Solana**. The **system browser** opens
   `<login page>?redirect_uri=http%3A%2F%2F127.0.0.1%3A<port>%2Fsiws%2Fcallback&state=…&client=desktop`.
2. Expected on the page: the server-built SIWS message; approve it in Phantom.
3. Browser returns to `http://127.0.0.1:<port>/siws/callback?state=…&address=…&message=…&signature=…`
   and the page says the signature was sent.
4. Expected in the app within ~2 s: gate disappears, terminal loads the paper workspace (positions,
   strategies, balance from the API — not the mock seed).

Failure paths:

- Reject in Phantom → *Tanda tangan ditolak. Tidak ada yang ditandatangani.* (state `signed_out`,
  reason `user_rejected`).
- No answer for 5 min → login fails with a timeout reason; press the button again.
- Wallet not on the allow-list → *wallet not allowed* screen with *Use another wallet*.
- Page shows an error and the app stays on the gate → the page could not reach the API; check the
  API host and the `/auth/desktop` deployment, then retry.

The app never sees the wallet key: the page sends a signature, Rust exchanges it for tokens and
writes only the session token to Credential Manager.

**Already proven from this PC (2026-11-08, mock wallet, headless Chrome against the production web
build):** the page returns exactly `state,address,message,signature` to
`http://127.0.0.1:<port>/siws/callback`, `state` unchanged, no token in the URL, no session cookie
(`centurion_at`/`centurion_rt`) set; a non-allow-listed wallet returns `error=wallet_not_allowed`
(the 403 on `/api/v1/auth/siws/nonce` is that refusal); `redirect_uri=https://evil.example/cb` is
refused and nothing navigates. The Rust parser for the same URL shape is covered by `cargo test` in
CI. Still unproven here: the installed app receiving that callback, and a real Phantom signature.

## D. Paper trading end to end

1. **Approvals**: wait for or trigger a proposal; the card shows mint, side, size, quote and a
   countdown (server clock). Approve it.
2. Expected: the approval leaves the queue, the position appears in *Posisi* with entry/mark, and
   Activity shows the event. Numbers must match the API (`GET /v1/workspaces/{ws}/positions`).
3. **Sell**: open the position, hold the sell control (practice hold 1.2 s) or ⇧X, confirm.
4. Expected: position closes (or shrinks for a partial), Activity records the exit with its reason,
   and a receipt is available read-only.
5. **PnL**: open the PnL report (R) → realized/unrealized/fees/total, epoch, window (7D default).
   A field the API did not send renders **"—"**, never `0.00`. A brand-new paper workspace has no
   portfolio snapshot yet (`GET …/portfolio/overview` → `data: null`), so cash/PnL may stay "—" until
   the first fill; that is correct, not a defect.
6. **Reset practice** (Settings) → positions close, epoch increments; repeating immediately hits the
   429 cooldown (shown as a message, not a crash).

## E. Session survives restart

1. While signed in, quit the app (tray → Quit) and start it again.
2. Expected: no login gate; the terminal loads directly. The stored session is reused and the access
   token is refreshed silently when it expires.

## F. Changing the API drops the old session

1. Note that you are signed in on server A. Settings → Koneksi paper → set server B (or *Pakai data
   contoh*) → **Simpan dan restart**.
2. The message *Tersimpan. Restart untuk menyambung…* appears only after the old session has been
   revoked and cleared, so wait for the restart instead of racing the 1.2 s window.
3. After the restart, **before** signing in, run in PowerShell: `cmdkey /list | Select-String centurion`.
   Expected: **no** `com.centuriontrade.app` entry. The app shows the login gate, and B's access log
   must never receive A's token. (Logout clears the keychain even when server A is unreachable; a
   dead server only delays the save by up to ~15 s.)
4. Sign in again on B.

## G. Wrong API / API down

1. Save a well-formed but dead base, e.g. `https://paper.invalid`.
2. Expected: the app restarts on **API paper** (it does not silently fall back to mock), the login
   gate appears, and requests fail with a visible error instead of a "connected" state.
   `connection_status.active` is what is really in use, not the file contents; the status bar names
   the paper API, and Settings shows *API paper* with the saved URL.
3. A *malformed* saved value (bad scheme/path) is different: startup keeps mock data and Settings
   shows the reason on the card (`connection-load-error`). Fix it there.
4. *Pakai data contoh* switches back to mock and also restarts (the old session is dropped first).

## H. Update from the latest release

Settings → **Update aplikasi**.

1. *Cek update*.
   - No release published yet → *Belum ada rilis update yang dipublikasikan. Pasang installer terbaru
     dari GitHub Releases sekali saja.* (not a raw 404).
   - Same version → *Kamu sudah pakai versi terbaru.*
   - Newer → *Versi X.Y.Z tersedia.*
2. *Unduh & pasang* → progress, then *Memasang. Aplikasi akan restart.* → app restarts on the new
   version.
3. Expected after restart: *Versi terpasang X.Y.Z* matches the release; Settings, connection and the
   signed-in session are intact.

Note: the update feed is `releases/latest`, so **only desktop releases** may be published as
"latest"; a non-desktop release would break `latest.json`. The release tag must equal the version in
`tauri.conf.json`, `Cargo.toml` and `package.json` (`npm run check:versions` enforces it in CI).

## Defect status

The gaps below were found in a static audit of `0bbef0e`; D1–D6 are fixed in `d54d543` and steps F/G
are still the live proof. D7 was found in the follow-up review.

| ID | Severity | Where (before the fix) | Issue | Now |
|---|---|---|---|---|
| D1 | P2 | `src-tauri/src/commands.rs:787` vs `:790-796` | `connection.json` was written **before** the old session was revoked/cleared. If the process died in between, the file pointed at server B while the keychain still held A's token → next launch sent A's token to B. | Fixed: the session is cleared first, then the file is written. |
| D2 | P3 | `src-tauri/src/commands.rs:815-816` | With an API set and the sign-in page empty, login opened the placeholder `https://app.centuriontrade.local/auth/desktop` and hung for 5 min. | Fixed: saving an API without a sign-in page is refused (UI + Rust); login without a page errors at once. |
| D3 | P3 | `src-tauri/src/config.rs:174-185` | `remove_file` + `rename` was not atomic on Windows; a crash between them left no `connection.json`, which reads as "first run" and silently demotes to mock. | Fixed: rename in one step when possible, otherwise move the old file aside and restore it if the swap fails. |
| D4 | P3 | `src-tauri/src/config.rs:54-58`, `src/components/connectionCheck.ts:22-26` | Scheme/host match was case-sensitive: `HTTPS://host` and `LOCALHOST` were rejected. | Fixed in Rust and TS; the saved value is normalised to a lower-case scheme. |
| D5 | P3 | `src/views/TerminalView.tsx:253` | Status bar always said "backend (mock) online", even on the paper API. | Fixed: it names the transport this run really uses. |
| D6 | P3 | `src-tauri/src/commands.rs:755` | `connection_status.restart_required` was hardcoded `false`. | Fixed: true while the saved API differs from the running transport, and the card says the change is not active yet. |
| D7 | P3 | `src-tauri/src/config.rs:173-193` (save side `:209-226`) | **Open.** `save()` moves `connection.json` → `connection.json.bak` before the `tmp` rename. A crash or power loss in that window leaves only the backup, and `load()` treats a missing `connection.json` as a first run: the app starts on demo data with **no error**, so mock data can be mistaken for paper. | Patch specified, not applied (owner: Lead) — when the main file is `NotFound` and `connection.json.bak` exists, read and re-validate the backup, rename it back to `connection.json`, and keep a note in the card's error line. Do not fall back to `.tmp` (it may hold a half-written file). |

Two new regression tests cover D2/D4 (`cargo test` in CI) plus one node test for D4; `cargo fmt` and
`cargo clippy -D warnings` stay green in CI.

Gate on the dirty desktop tree at `c03154a` (2026-11-09, no commit): `npm run typecheck` exit 0;
`npm run test:ui` **64/64**; `npm run check:versions` 0.2.0 in all three files and
`--tag desktop-v0.2.1` correctly fails; `npm run check:updater` OK (key `2F57B840B40EAA22`);
`--online` reports 404 "no desktop release exists yet"; `npm run build` exit 0. A synthetic
`latest.json` passes and a wrong one (version/date/windows entry) fails. Rust gates (`cargo fmt`,
`clippy`, `test`) cannot run on this PC: Smart App Control blocks `cargo-fmt`/`cargo`
("Application Control policy has blocked this file", os error 4551) and the default 1.85 toolchain is
below the 1.90 MSRV of the Tauri dependencies — CI is the proof for those.

Verified good in code (no runtime needed to see it, but step F is the live proof):

- Logout clears the keychain unconditionally, even when the server call fails
  (`auth.rs:617-628` → `auth.rs:465-469`).
- A failed save cannot look connected: `connection_status.active` comes from the live transport
  (`commands.rs:747`), not from the file.
- An unusable **saved** backend falls back to mock **and** surfaces the reason in Settings
  (`lib.rs:42-63`, `config.rs:167-193`), except the D7 backup-only state.
- The transport is built once at startup, so an API change only takes effect after restart; the old
  session is dropped in the same command.
- Inline validation matches Rust (`scripts/connection-check.test.mjs`; the full count is in the gate
  line above).
- **Route parity** (checked 2026-11-08): every path `http.rs` builds exists in the paper API router
  (`/v1/workspaces/:ws` + `/portfolio/overview`, `/positions`, `/approvals/:id/decision`,
  `/positions/:id/close`, `/strategies`, `/strategies/:id/pause|resume`, `PATCH /strategies/:id`,
  `/practice/reset`, `/coins/:mint/timeline`, `/stats/pnl`, `/stats/exit-reasons`, `/events`,
  `/events/stream`, `/v1/auth/{siws/nonce,siws/verify,session/refresh,session/logout,desktop/exchange}`).
  Query names (`mode`, `state`, `window`, `from`, `to`, `cursor`, `after_seq`, `limit`) match the
  handlers' validation.

Proven at runtime here (mock wallet, headless Chrome, production web build on `:3200`):
`/auth/desktop` → loopback returned `state,address,message,signature` with the original `state`, no
token in the URL, no session cookie; non-owner wallet → `wallet_not_allowed`; `https://evil.example/cb`
refused. That covers the **web half** of C; the Rust callback parser is covered by `cargo test` in CI.

## What is not verifiable from the dev machine

- The GUI path itself: this PC has no installed build, no signed release (`latest.json` → 404) and no
  MSVC linker; the GNU test binary aborts with `STATUS_ENTRYPOINT_NOT_FOUND` because the WinRT
  api-set DLLs (`api-ms-win-core-winrt-*`) are absent. Since 2026-11-09 Smart App Control also refuses
  to start `cargo-fmt`/`cargo` from the toolchain ("Application Control policy has blocked this file",
  os error 4551), so the Rust gates run only in CI. Steps A–H must run on the installed app.
- A real Phantom extension on a physical device (the web team used a synthetic ed25519 key).
- Authenticode: unsigned installer, so SmartScreen "Unknown publisher" is expected.

Record the run (date, build, API host, pass/fail per row, screenshots of D and H) in the release
notes.
