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
- Installer from `https://github.com/gigabucks-hash/Centurion_bot/releases` (`desktop-v*`), or the
  MSI/NSIS artifact of a green `desktop.yml` run.
- Paper API reachable over `https://` (or `http://127.0.0.1:<port>` for a local stack) and a paper
  workspace for the Phantom wallet used.
- Web app deployed with `/auth/desktop` reachable over `https://` and pointed at the same paper API.
- No `CENTURION_BACKEND` / `CENTURION_LOGIN_URL` set for the installed app (those env vars win and
  disable the Settings card). Check with `Get-ChildItem Env:CENTURION*`.

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
2. Launch from the Start menu (tray icon appears).
3. Expected: app opens on **mock** data; Settings → Koneksi paper shows chip *Data contoh (demo)*
   and no error line. No login gate.

## B. Point the app at the paper API

Settings (gear) → **Koneksi paper**.

1. *Alamat API*: paste the API base **without a path**, e.g. `https://paper.example.com`
   (plain `http://` is accepted only for `127.0.0.1` / `localhost`).
2. *Halaman login*: paste the web app's desktop sign-in page, e.g.
   `https://app.example.com/auth/desktop`. Leave the inline hint as a check: a page is required for
   login to work (see D2).
3. Press **Simpan dan restart**.

Expected:

- Message *Tersimpan. Restart untuk menyambung…*, then the app restarts by itself (~1.2 s after the
  save returns; a slow old server can delay the save by up to 15 s while it tries to revoke the old
  session).
- After restart: chip **API paper** + the saved URL; the login gate (*Hubungkan wallet Solana* button)
  replaces the terminal.
- Saving only the login page (same API) does not restart: *Tersimpan. Login dengan Phantom…*.

Rejections (inline, nothing saved):

| Input | Message |
|---|---|
| `paper.example.com` | *Alamat harus diawali https:// …* |
| `http://paper.example.com` | *http:// polos hanya untuk 127.0.0.1 atau localhost …* |
| `https://paper.example.com/v1` | *Isi alamat dasarnya saja, tanpa /v1 …* |
| `https://user:pw@host` | *Alamat itu tidak valid.* |

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
   A field the API did not send renders **"—"**, never `0.00`.
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
   `connection_status.active` is what is really in use, not the file contents. Note D5: the status
   bar wording is still mock-flavoured, so read the Settings card, not the bottom bar.
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

## Known gaps (fix before calling this signed off)

Static audit of `0bbef0e`; none of these is exercised by the current CI matrix.

| ID | Severity | Where | Issue |
|---|---|---|---|
| D1 | P2 | `src-tauri/src/commands.rs:787` vs `:790-796` | `connection.json` is written **before** the old session is revoked/cleared. If the process dies in between, the file points at server B while the keychain still holds A's token → next launch sends A's token to B. Fix: clear the session first, then save; or key the credential by backend. |
| D2 | P3 | `src-tauri/src/commands.rs:815-816` | With an API set and the sign-in page empty, login opens the placeholder `https://app.centuriontrade.local/auth/desktop` and hangs for 5 min. Fix: refuse to save an API without a login page, or show a clear message before opening. |
| D3 | P3 | `src-tauri/src/config.rs:174-185` | `remove_file` + `rename` is not atomic on Windows; a crash between them leaves no `connection.json`, which the app reads as "first run" and silently demotes to mock. |
| D4 | P3 | `src-tauri/src/config.rs:54-58`, `src/components/connectionCheck.ts:22-26` | Scheme/host match is case-sensitive: `HTTPS://host` and `LOCALHOST` are rejected as bad scheme. Accept a case-insensitive scheme, or say so in the message. |
| D5 | P3 | `src/views/TerminalView.tsx:253` | Status bar always says "backend (mock) online" / "offline", even on the real paper API. |
| D6 | P3 | `src-tauri/src/commands.rs:755` | `connection_status.restart_required` is hardcoded `false` (dead field; the save response carries the real value). |

Verified good in code (no runtime needed to see it, but step F is the live proof):

- Logout clears the keychain unconditionally, even when the server call fails
  (`auth.rs:617-628` → `auth.rs:465-469`).
- A failed save cannot look connected: `connection_status.active` comes from the live transport
  (`commands.rs:747`), not from the file.
- An unusable **saved** backend falls back to mock **and** surfaces the reason in Settings
  (`lib.rs:42-63`, `config.rs:147-170`).
- The transport is built once at startup, so an API change only takes effect after restart; the old
  session is dropped in the same command.
- Inline validation matches Rust (`scripts/connection-check.test.mjs`, 14 node tests pass).

Proven at runtime here (mock wallet, headless Chrome, production web build on `:3200`):
`/auth/desktop` → loopback returned `state,address,message,signature` with the original `state`, no
token in the URL, no session cookie; non-owner wallet → `wallet_not_allowed`; `https://evil.example/cb`
refused. That covers the **web half** of C; the Rust callback parser is covered by `cargo test` in CI.

## What is not verifiable from the dev machine

- The GUI path itself: this PC has no installed build, no signed release (`latest.json` → 404) and no
  MSVC linker; the GNU test binary aborts with `STATUS_ENTRYPOINT_NOT_FOUND` because the WinRT
  api-set DLLs (`api-ms-win-core-winrt-*`) are absent. Steps A–H must run on the installed app.
- A real Phantom extension on a physical device (the web team used a synthetic ed25519 key).
- Authenticode: unsigned installer, so SmartScreen "Unknown publisher" is expected.

Record the run (date, build, API host, pass/fail per row, screenshots of D and H) in the release
notes.
