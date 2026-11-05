# Desktop release: installers from CI

`apps/desktop` is Tauri 2. `.github/workflows/desktop.yml` builds the frontend and the Rust shell, runs
the UI/contract tests, and — on a push to `main` only — bundles installers per OS. Everything here is
unsigned; no certificate exists yet.

## What CI produces

| Job | Runner | Command | Artifact | Contains |
|---|---|---|---|---|
| `web` | ubuntu | `npm run build`, `npm run test:ui` | — | gate only |
| `rust` | ubuntu | `cargo fmt/clippy/test` | — | gate only |
| `bundle` | ubuntu | `npx tauri build --bundles deb,appimage` | `desktop-linux-<sha>` (30 d) | `.deb`, `.AppImage` |
| `windows-bundle` | windows | `npx tauri build --bundles nsis,msi` | `desktop-windows-<sha>` (30 d) | setup `.exe` (NSIS), `.msi` (WiX) |

The two bundle jobs run only when `github.event_name == 'push'` and the ref is `main`, after `web` and
`rust` pass. The bundled app uses the mock backend, same as `npm run dev`.

Windows needs no Tauri system packages: `bundle.windows.webviewInstallMode` is `downloadBootstrapper`,
so the installer downloads WebView2 on first run instead of carrying it. The Tauri CLI fetches WiX and
NSIS itself; no extra workflow step.

## Version

`apps/desktop/src-tauri/tauri.conf.json` → `"version": "0.1.0"` is the installer version (the package
version in `Cargo.toml` and `package.json` is not what the bundler writes). Bump all three when cutting a
release so the file name, Add/Remove Programs entry and upgrade path agree.

## Signing gaps

| Gap | Effect | Needed |
|---|---|---|
| No Windows Authenticode certificate | SmartScreen shows "Unknown publisher" and may block the `.exe`/`.msi` on first run | code-signing certificate (OV or EV) + `bundle.windows.certificateThumbprint` / `signCommand`, secret in CI |
| No macOS job | no `.dmg`/`.app` artifact | a macOS runner plus Developer ID certificate and notarization credentials (out of scope for now) |
| No Linux package repo | users download a file, no `apt`/`flatpak` channel | hosting decision, not a build change |

Unsigned builds are fine for internal testing and for Boss's own machine; they are not distributable to
strangers without the SmartScreen warning.

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