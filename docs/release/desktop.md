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
| No Windows Authenticode certificate | SmartScreen shows "Unknown publisher" and may block the `.exe`/`.msi` on first run | code-signing certificate (OV or EV) + `bundle.windows.certificateThumbprint` / `signCommand`, secret in CI |
| No Linux package repo | users download a file, no `apt`/`flatpak` channel | hosting decision, not a build change |
| No macOS artifacts | none — macOS support was removed | — |

Unsigned builds are fine for internal testing and for Boss's own machine; they are not distributable to
strangers without the SmartScreen warning. The updater signature is separate from Authenticode.

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