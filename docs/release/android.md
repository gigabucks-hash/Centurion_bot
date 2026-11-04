# Android release: APK, AAB and the Google Play upload

Everything here is about `apps/mobile` and `.github/workflows/mobile.yml`. Package id: `com.centuriontrade.app`
(`apps/mobile/android/app/build.gradle.kts`). No secret value belongs in this file or anywhere in the repo — the
pipeline reads them from GitHub Actions repository secrets only.

## 1. What CI does today

`mobile.yml` has two jobs that matter for a release:

| Job | Trigger | Output |
|---|---|---|
| `flutter` | every push / PR touching `apps/mobile/**` | format, vendored-file sync, `flutter analyze`, `flutter test` |
| `release-build` | push to `main` only, after `flutter` is green | APK + AAB + Dart symbol maps, cert check, optional Play upload |

`release-build` builds through `apps/mobile/tool/build_release.sh`, i.e.
`flutter build <target> --release --obfuscate --split-debug-info=build/symbols/<target>`:

| Step | Result | Artifact (14 days unless noted) |
|---|---|---|
| release APK, `android-arm64` | `build/app/outputs/flutter-apk/app-release.apk` | `mobile-apk-<sha>` |
| release AAB | `build/app/outputs/bundle/release/app-release.aab` | `mobile-aab-<sha>` |
| Dart symbol maps | `build/symbols/{apk,appbundle}/` | `mobile-debug-symbols-<sha>` (90 days) |

Keep the symbol artifacts private: they de-obfuscate Dart stack traces
(`flutter symbolize -i <trace> -d <symbols>`). They are not uploaded to Play.

### Signing behaviour

`app/build.gradle.kts` loads `apps/mobile/android/key.properties` when that file exists (gitignored). It requires
`storeFile`, `storePassword`, `keyAlias`, `keyPassword`, creates the `release` signing config, and fails the build if
the file exists but a field is blank. Without the file, `release` falls back to the debug key and Gradle logs one
`lifecycle` line — that is what makes `flutter run --release` work on a fresh clone and in PR builds.

CI recreates both files from secrets inside the job:

1. `ANDROID_KEYSTORE_BASE64` → `apps/mobile/android/upload-keystore.jks` (`umask 077`).
2. `key.properties` written from the four secrets.
3. `apksigner verify --print-certs` on the APK, `keytool -printcert -jarfile` on the AAB.
4. If a keystore secret is set but the cert is still `CN=Android Debug`, the step exits 1. If the keystore secret is
   unset, it only emits `::warning::` so forks stay green while `main` cannot silently ship debug artifacts.

## 2. One-time: create the upload keystore (Boss, local machine)

Use the JDK that ships with the Android SDK toolchain (JDK 21 here). Create the keystore **outside the repo** and
outside any folder that gets committed or shared; back the file up in a password manager as well.

```bash
keytool -genkeypair -v \
  -keystore "$HOME/keys/centurion-upload.jks" \
  -storetype PKCS12 \
  -alias centurion-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

- Let `keytool` prompt for the passwords; do not put `-storepass` / `-keypass` on the command line (shell history).
- PKCS12 is a single-password store, so the store password and key password end up identical. That is fine: use the
  same value for both secrets.
- Read back the certificate before uploading anything:

```bash
keytool -list -v -keystore "$HOME/keys/centurion-upload.jks" -alias centurion-upload
```

Copy the `SHA256` line; the CI log must show the same fingerprint. Keep the keystore file and both passwords; if the
upload key is lost, Play Console must be asked to reset it (Play Console → App integrity → App signing).

### The four Android secrets

GitHub → repository → Settings → Secrets and variables → Actions → New repository secret.

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 of the `.jks` file, one string |
| `ANDROID_KEYSTORE_PASSWORD` | store password from `keytool` |
| `ANDROID_KEY_ALIAS` | `centurion-upload` (whatever `-alias` was) |
| `ANDROID_KEY_PASSWORD` | key password (same as store password for PKCS12) |

Base64 commands:

```bash
# macOS
base64 -i "$HOME/keys/centurion-upload.jks" | pbcopy
# Linux
base64 -w0 "$HOME/keys/centurion-upload.jks"
```

```powershell
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\keys\centurion-upload.jks")) |
  Set-Clipboard
```

Newlines inside the secret are harmless (`base64 -d` ignores them on the Ubuntu runner), but a single-line string is
easier to paste correctly.

## 3. The fifth secret: Google Play service account

`release-build` ends with `r0adkll/upload-google-play@v1`, gated on
`env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON != '' && env.ANDROID_KEYSTORE_BASE64 != ''`. It targets
`com.centuriontrade.app`, uploads `app-release.aab`, `tracks: internal`, `status: draft`. With `status: draft` the
action only creates a Play edit with a draft release — a human still presses **Roll out** in the Play Console, so the
pipeline cannot publish to testers on its own.

Onboarding, in order:

1. **Create the app entry in Play Console** for `com.centuriontrade.app` and upload one release manually (the API
   answers `Package not found` for a package that does not exist yet). Complete store listing, content rating, data
   safety and target audience while you are there.
2. Enable the **Google Play Android Developer API** in a Google Cloud project
   (`https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com`).
3. Create a **service account** in that project, add a **JSON** key, and download it.
4. Play Console → **Users and permissions** → invite the service account email → give it app access to this app with
   release permissions for the testing tracks only.
5. Store the **entire JSON file content** as the secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Never commit it, never
   paste it into a doc, an issue or a chat.

Input-name note: v1 of the action documents `tracks` and `status`. The older `track` / `releaseStatus` keys still work
but are deprecated aliases, so this workflow uses the current names (`tracks: internal`, `status: draft`).

If either secret is missing the upload is skipped and the job emits `::warning::` — the AAB is still built and
attached as `mobile-aab-<sha>`. A debug-signed AAB is never uploaded.

## 4. Verify a signed artifact locally

APK (`apksigner` only understands APK):

```bash
"$ANDROID_HOME"/build-tools/36.0.0/apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk
```

AAB — **`apksigner` cannot read an `.aab`**. An AAB is a JAR with a v1 signature, so use `keytool`:

```bash
keytool -printcert -jarfile build/app/outputs/bundle/release/app-release.aab
```

Expected: `Owner: CN=…` matching the upload keystore, and a `SHA256:` equal to `keytool -list -v`. If it prints
`Owner: CN=Android Debug`, the build fell back to the debug key: `key.properties` is missing or one of the four
secrets is wrong.

Local release build, same flags as CI:

```bash
cd apps/mobile
flutter build appbundle --release --obfuscate --split-debug-info=build/symbols/appbundle
```

`key.properties` lives at `apps/mobile/android/key.properties`; `storeFile` inside it is resolved relative to that
`android/` directory (Gradle `rootProject.file(...)`).

## 5. What is still missing

| Gap | Owner | Effect |
|---|---|---|
| Upload keystore + 4 Android secrets | Boss | until set, APK/AAB are debug-signed: not distributable, not uploadable |
| Play Console app entry + one manual release | Boss | `upload-google-play` returns `Package not found` without it |
| Play service account JSON + app permissions | Boss | upload step stays skipped (warning only) |
| Store listing, content rating, data safety, privacy policy | Boss / UX | Play can reject `Precondition check failed` on rollout |
| `versionCode` bump per upload | whoever cuts the release | `apps/mobile/pubspec.yaml` `version: 0.1.0+1` drives `versionCode`; Play rejects a reused code |
| This Play-upload change has not run in CI yet | Apex Dev Lead | `release-build` only runs on a push to `main`, so the first green run is after the commit lands |
| iOS distribution | not planned here | needs a macOS runner plus Apple certificate and provisioning profile; `mobile.yml` covers Android only |
