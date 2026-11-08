# Desktop release: installers, Windows updates

`apps/desktop` is Tauri 2. `.github/workflows/desktop.yml` builds the frontend and the Rust shell, runs
the UI/contract tests, bundles Linux and Windows installers, and — on a `desktop-v*` tag — publishes a
signed Windows release that the installed app can update from.

Windows is the supported desktop target. macOS (`dmg`, `app`) was removed on purpose: the product ships
as the web app (phones included) plus the Windows desktop app.

## What CI produces

| Job | Runner | Command | Artifact | Contains |
|---|---|---|---|---|
| `web` | ubuntu | `npm run build`, `npm run test:ui` | — | gate only |
| `rust` | ubuntu | `cargo fmt/clippy/test` | — | gate only |
| `bundle` | ubuntu | `npx tauri build --bundles deb,appimage` | `desktop-linux-<sha>` (30 d) | `.deb`, `.AppImage` |
| `windows-bundle` | windows | `npx tauri build --bundles nsis,msi` | `desktop-windows-<sha>` (30 d) | setup `.exe` (NSIS), `.msi` (WiX) |
| `release` | windows | `tauri-action` + `tauri.updater.conf.json` | GitHub Release `desktop-v*` | signed `.exe`/`.msi`, `.sig`, `latest.json` |

The bundle jobs run only on a push to `main`, after `web` and `rust` pass. The app uses the mock backend,
same as `npm run dev`.

Windows needs no Tauri system packages: `bundle.windows.webviewInstallMode` is `downloadBootstrapper`,
so the installer downloads WebView2 on first run instead of carrying it. The Tauri CLI fetches WiX and
NSIS itself; no extra workflow step.

## Version

Keep these three in sync — the installer name and the updater comparison read the Tauri config, while the
Cargo/package versions are what the build tools stamp:

- `apps/desktop/src-tauri/tauri.conf.json` → `"version"`
- `apps/desktop/src-tauri/Cargo.toml` → `[package] version`
- `apps/desktop/package.json` → `"version"`

Current version: **0.2.0**.

CI enforces this: `npm run check:versions` runs on every desktop change, and the release job fails when the `desktop-vX.Y.Z` tag does not equal `tauri.conf.json` - otherwise the release would carry an app the updater never offers.

## Cut a release

```powershell
# 1. bump the three files above, commit and push to main (CI green)
git tag desktop-v0.2.1
git push origin desktop-v0.2.1
```

Equivalent: Actions → `desktop` → Run workflow → tag `desktop-v0.2.1`. The workflow creates the tag and
release if they do not exist.

Then open the installed app → `Pengaturan` → **Update aplikasi** → **Cek update** → **Unduh & pasang**.
The app verifies the minisign signature, installs, and restarts. The endpoint it reads is:

```
https://github.com/gigabucks-hash/Centurion_bot/releases/latest/download/latest.json
```

`releases/latest` means the newest **published, non-prerelease** release. Publish desktop releases only;
a draft or a non-desktop release with a newer timestamp would hide `latest.json` from the updater.

## Signing

Updater artifacts must be signed. The public key is committed in
`apps/desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`; the private key never enters the
repo or CI logs — it lives in two GitHub Actions repository secrets:

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | contents of the generated `tauri-updater.key` file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password used when the key was generated |

Generate a new pair (only if the key is lost — existing installs cannot verify a new key):

```powershell
npx tauri signer generate -w .\tauri-updater.key
# copy the public key (tauri-updater.key.pub) into plugins.updater.pubkey
```

Normal `npx tauri build` stays unsigned and needs no key: `createUpdaterArtifacts` is only enabled by
`src-tauri/tauri.updater.conf.json`, which the release job passes with `--config`.

## Signing gaps

| Gap | Effect | Needed |
|---|---|---|
| No Windows Authenticode certificate | SmartScreen shows "Unknown publisher" and may block the `.exe`/`.msi` on first run. On a PC with **Smart App Control** on (`VerifiedAndReputablePolicyState=1`), Windows refuses to start the unsigned installer at all ("An Application Control policy has blocked this file") — there is no "Run anyway" button | code-signing certificate (OV or EV) + `bundle.windows.certificateThumbprint` / `signCommand`, secret in CI |
| No Linux package repo | users download a file, no `apt`/`flatpak` channel | hosting decision, not a build change |
| No macOS artifacts | none — macOS support was removed | — |

Unsigned builds are fine for internal testing **where Smart App Control is off or the app is code-signed**;
on a default Windows 11 install with Smart App Control on, they cannot be installed at all. That blocks
the "install once, then update" proof on such a machine until a certificate exists. The updater signature
is separate from Authenticode and does not help here: Windows checks the installer's Authenticode
signature before the app can run.

## Connecting the installed app to the paper API

The installer starts on the in-process **mock** (demo data). To use a real paper account, open
**Settings → Koneksi paper** and set:

| Field | Rule | Example |
|---|---|---|
| API base URL | `https://` anywhere; plain `http://` only to this machine; no path (`/v1` is added) | `https://paper.example.com` or `http://127.0.0.1:8080` |
| Sign-in page | the web app's `/auth/desktop` page; `https` or loopback `http` | `https://app.example.com/auth/desktop` |

Saving a **different API base** restarts the app and drops the stored session (a token is never
carried to another server, and the session is cleared *before* the new address is written, so a
crash mid-save cannot pair an old token with a new server). An API base needs a sign-in page: the
save is refused without one, because the app would otherwise open a placeholder host and wait for a
callback that never comes. Saving only the sign-in page applies immediately. If a relaunch was
skipped, the card says the change is saved but not active. **Use demo data**
clears the API base and returns to the mock. Values live in `connection.json` in the OS config
directory (`%APPDATA%\com.centuriontrade.app\` on Windows), never in the repo. Scheme and host are
case-insensitive (`HTTPS://Host` is accepted).

`CENTURION_BACKEND` (and `CENTURION_BACKEND_TOKEN` for dev) still override the file; the Settings
card then shows that the value comes from outside the app and stays read-only. Paper only: this
build requests `read` + `trade` scopes and never `trade:real`.

## Troubleshooting an update

| Symptom | Cause |
|---|---|
| "You are on the latest version." | No published release newer than the installed version, or `latest.json` not in the latest release |
| `Update failed: … 404` | `latest.json` missing (release is a draft, or another release became "latest") |
| `Update failed: … signature` | Key mismatch: the app's `pubkey` and the CI private key are not a pair |
| Install runs, no restart | `process:allow-restart` capability missing from `capabilities/terminal.json` |

## Verifying an artifact

```powershell
# Windows
Get-AuthenticodeSignature .\Centurion*.msi | Select-Object Status, StatusMessage
.\Centurion*.exe  # installs per-user, no admin prompt with the NSIS default
```

```bash
# Linux
dpkg-deb --info Centurion*.deb
chmod +x Centurion*.AppImage && ./Centurion*.AppImage
```

`Status: NotSigned` is expected today. `NotTrusted` or a blocked launch means the SmartScreen gap above,
not a broken build.