# Centurion Trade Mobile: Performance & Security (Phase 5 → MVP)

> Rebrand 29 Okt 2026: app id `com.centuriontrade.app`, skema `centurion://` (custom scheme bisa dibajak app lain: lihat threat model login Phantom). Nama paket internal tetap `sentra_mobile`.

Status: 29 Oct 2026 (WIB). Owner: Mobile. Targets from Apex/Boss: **cold start p95 < 2 s
(goal 1.5 s) on a mid-range Android, 60 fps, tap response < 100 ms**. Security baseline:
**OWASP MASVS v2**. Nothing in this doc is a guessed number: everything not measured is
marked **PENDING** with the exact procedure.

## 0. Context (Boss decisions, 29 Oct)

- **Private app, single user (Boss only).** Login is **wallet-only SIWS** (Sign-In With
  Solana, Phantom); wallet SDK review is in progress, nothing installed. App authority is
  limited to **trading actions** (approve/skip picks, sell, pause/resume, guard proposals);
  no withdrawals, no key custody.
- **Telegram OIDC removed from MVP**: stub kept behind `FeatureFlags.telegramOidcEnabled=false`,
  not developed further. Email OTP is not part of the MVP either.
- **iOS distribution:** TestFlight internal / ad-hoc on Boss's personal Apple account; no
  public App Store release. Android: sideload / Play internal testing (see decisions).

## 1. Performance baseline

### 1.1 What the box can and cannot measure (honest status)

| Capability | Status on the build box |
|---|---|
| Android SDK | **Installed this session** (user space: Temurin JDK 17, cmdline-tools, platform 36, build-tools 36.0.0). Release builds work. |
| KVM / emulator | `/dev/kvm` exists (root:pulse-access). With a temporary ACL the emulator reported "KVM usable", but an Android 35 x86_64 image **never finished booting** (adb `offline` after ~25 min, nested virtualisation + SwiftShader). ACL reverted. **No on-device startup/frame numbers from the box.** An emulator would not be a mid-range device anyway. |
| Linux desktop profile (`--trace-startup`) | Not attempted: no `clang++` and no `linux/` runner in the app; it would measure a desktop GPU, not a phone. Low value. |
| Physical device | None attached. |

### 1.2 Measured (real numbers, 29 Oct 2026)

| Metric | Value | Command |
|---|---|---|
| Release APK, arm64 only, not obfuscated | **19.9 MB** (compressed APK) | `flutter build apk --release --analyze-size --target-platform android-arm64` |
| └ `libflutter.so` (engine, arm64) | 11.76 MB | `unzip -lv` |
| └ `libapp.so` (Dart AOT, arm64) | 6.75 MB | 〃 |
| └ of which `package:sentra_mobile` | 330 KB | `--analyze-size` tree |
| └ `package:flutter` / `flutter_localizations` / `go_router` / `intl` / `riverpod` | 3 MB / 181 KB / 93 KB / 89 KB / 66 KB | 〃 |
| └ bundled fonts (5 TTF) | 1.26 MB raw / 0.61 MB compressed | 〃 |
| └ `classes.dex` | 537 KB raw / 245 KB compressed | 〃 |
| `libapp.so` arm64 **obfuscated + split-debug-info** | **5.70 MB** (−1.05 MB vs 6.75 MB) | `tool/build_release.sh apk --target-platform android-x64,android-arm64` |
| Web release `main.dart.js` | 3.40 MB (996 KB gzip); whole output 43 MB incl. CanvasKit 37 MB | `flutter build web --release` |
| Unit/widget suite | 125 tests, all pass (§4) | `flutter test` |

Notes: APK `.so` files are stored uncompressed (page-aligned for `mmap`), so Play delivery
of an AAB per-ABI split is smaller than the fat/ABI APKs above. Material icons are
tree-shaken (1.6 MB → 6 KB).

### 1.3 PENDING: mid-range Android device (exact procedure)

Device class to use: e.g. Samsung Galaxy A35 / A54 or Pixel 6a, Android 14+, battery > 50 %,
not charging, airplane off, fresh install. Record model, Android version, and the git hash.

```bash
cd apps/mobile
# A) Cold start (process killed every run), 20 runs, take p50/p95 of TotalTime
tool/build_release.sh apk --target-platform android-arm64
adb install -r build/app/outputs/flutter-apk/app-release.apk
for i in $(seq 1 20); do
  adb shell am force-stop com.centuriontrade.app; sleep 2
  adb shell am start -W -n com.centuriontrade.app/.MainActivity | grep TotalTime
done
# B) Engine/framework split of startup (profile mode)
flutter run --profile --trace-startup -d <device>      # → build/start_up_info.json
#    (timeToFirstFrameMicros, timeToFrameworkInitMicros, timeAfterFrameworkInitMicros)
# C) Frames: 60 s scroll on Positions/Queue/Coins with the mock tick on
flutter run --profile -d <device>   # DevTools → Performance: jank %, p90/p99 build+raster ms
# D) Tap latency: DevTools timeline, tap → first frame with the new state (target < 100 ms)
```

| Metric (mid-range Android) | Target | Value |
|---|---|---|
| Cold start p50 / p95 (`am start -W` TotalTime) | p95 < 2000 ms (goal 1500) | **PENDING** |
| `timeToFirstFrameMicros` (profile) | – | **PENDING** |
| Jank (frames > 16.6 ms) while scrolling + live updates | < 1 % | **PENDING** |
| Tap → frame (approve/skip/sell sheet) | < 100 ms | **PENDING** |
| iOS (TestFlight build, Instruments "App Launch") | p95 < 2 s | **PENDING** |

## 2. Performance changes made (this commit)

| # | Item | Status | Where |
|---|---|---|---|
| P1 | Measure first, record baseline | **Done** (box-measurable) / **PENDING** (device, §1.3) | this doc |
| P2 | Lazy init: nothing awaited before `runApp`; push/Realtime/Telegram/analytics only after the first frame, one per event-loop turn, failures isolated | **Done** | `core/startup/deferred_init.dart`, `app/app.dart`; mock tick (Realtime stand-in) no longer starts inside the provider; test `perf_test.dart` |
| P2b | No runtime font download (`GoogleFonts.config.allowRuntimeFetching=false` was only set in tests, not in `main()`) | **Done** | `main.dart` |
| P3 | Large JSON off the UI isolate: `parseEventsPage` uses `compute` for bodies ≥ 32 KB (events catch-up pages), sync below (isolate spawn ~1–3 ms) | **Done** | `core/perf/background_json.dart` + tests (600-envelope page, int64 seq exact) |
| P4a | Lists: builder/sliver for unbounded lists (Positions open+closed, Coins). Queue/Activity/Strategies already used `.builder/.separated` | **Done** | `positions_screen.dart`, `coins_screen.dart` |
| P4b | `RepaintBoundary` around live price rows (position cards, coin cards) | **Done** | same |
| P4c | Marks throttled to **4 Hz per row** (leading + trailing edge, latest price never lost), per-row `liveMarkProvider` so one hot mint doesn't rebuild the list | **Done** (provider ready; rows switch to it when Realtime marks are wired) | `core/perf/per_key_throttle.dart`, `data/providers.dart`; tests |
| P4d | `const` constructors | Already enforced (`prefer_const_*` lints via flutter_lints, analyze clean) | – |
| P5 | Images: `cacheWidth/cacheHeight`, WebP, no new caching package | **N/A today**: the app shows no raster images (icons are glyphs, token logos not in MVP). Rule for when token logos arrive: `Image.network(..., cacheWidth: (size*dpr).round())`, WebP from the server, Flutter's built-in `ImageCache`, no `cached_network_image` | – |
| P6 | Baseline Profiles | **Not done, by design**: Flutter's Dart code is AOT already; a Baseline Profile only affects the small Java/Kotlin embedding (`classes.dex` 245 KB). `androidx.profileinstaller` is already in the APK. Only add if §1.3 shows class-loading time in the startup trace. | – |

### 2.1 Top 3 bottlenecks (code analysis; confirm with §1.3)

1. **Coarse stream fan-out.** Every backend change (`_notify()` on each 2 s tick, every
   decision) re-emits *whole* lists (positions, approvals, screener, summary), so entire
   screens rebuild. With real Realtime marks (many per second per mint) this would rebuild
   the full Positions list per mark. Mitigation started: per-row throttled `liveMarkProvider`
   + RepaintBoundary; next: `select()`/family providers per row id and diffing on refetch.
2. **One `Timer.periodic(1 s)` + `setState` per visible pending card** (`ExpiryCountdown`).
   Each card rebuilds its whole countdown subtree every second; cost grows with the queue.
   Fix (next): one shared 1 Hz ticker provider and a `RepaintBoundary` around the countdown
   bar so only the bar repaints.
3. **Startup payload.** 6.75 MB AOT + 11.8 MB engine are fixed costs; on top: `intl` +
   `flutter_localizations` for 2 locales, 5 font files resolved through the asset manifest on
   first text, and the dashboard (KPIs + equity chart over 120 points) as the first route.
   Mitigations available: deferred init (done), start on a light route, measure whether the
   equity chart should paint after the first frame. Needs the device trace (§1.3) to rank.

## 3. Security (OWASP MASVS v2)

### 3.1 Threat model (single user, wallet allowlist)

- **Assets:** the Supabase session (access JWT 15 min + rotating refresh token); the ability
  to approve trades/sells on Boss's workspace; portfolio data (privacy).
- **Not assets in the app:** private keys (never in the app; SIWS signs in the wallet app),
  Real SOL custody (Phase 7, server/wallet side), service-role keys (server only).
- **Actors:** (1) thief with the unlocked or locked phone; (2) malware/other apps on the
  device; (3) network attacker (public Wi-Fi, malicious CA); (4) someone who obtains the
  APK/IPA and tries to sign in or reverse it; (5) supply-chain (compromised pub package).
- **Key control: server-side wallet allowlist.** SIWS verify accepts only Boss's wallet
  address(es); any other wallet gets no session even with a valid signature. A leaked APK is
  therefore useless without Boss's wallet. Refresh-token reuse revokes the session (1.1.4).
- **Blast radius:** a stolen session can approve/skip **practice** picks and sell positions
  within guards; Real SOL is server-flag-off and will need biometric + server confirmation.
- **Phantom deeplink login over a custom scheme (1 Nov 2026, Android first).** `centurion://auth`
  is not verified (no domain yet → no App Links), so another app can register the same scheme
  and receive or forge redirects. Controls (`lib/core/auth/phantom_deeplink.dart`,
  SIWS_LOGIN_REVIEW §12):
  - x25519 + XSalsa20-Poly1305 session with Phantom (pinenacl `Box`): fresh keypair per login,
    memory only; a low-order `phantom_encryption_public_key` (all-zero shared secret) is rejected;
    the MAC authenticates every redirect payload;
  - pending-login state: random 128-bit `state`, TTL 5 min, single use per step (connect/sign),
    bound to the in-memory keypair + Phantom `session`; any redirect with another state/step,
    after expiry, or replayed is dropped without parsing its payload;
  - payload checks before `/v1/auth/siws/verify`: address = base58 of 32 bytes and equal to the
    connected wallet, signature = base58 of 64 bytes, signed text byte-identical to the server's
    message, whose header must name our domain and that address (we never sign other text);
  - the server re-verifies ed25519 + single-use nonce + allowlist, so a hijacker can at most
    make a login attempt fail (DoS), never obtain a session for Boss's wallet.
  - Residual: a malicious app that wins the scheme can see the encrypted `data`/`nonce` (useless
    without our in-memory key) and can make the login fail; the Phantom `session` it could see in
    a forged flow is bound to its own dapp key. App Links (`autoVerify`) remove this once Boss has
    a domain.
- **Session storage:** only the rotating refresh token is persisted (flutter_secure_storage,
  Keystore/Keychain `first_unlock_this_device`); access token, Phantom session and x25519 key
  are memory only. Refresh is single-flight; refresh reuse/revocation → forced logout + wipe.

### 3.2 Checklist

| # | MASVS | Item | Status |
|---|---|---|---|
| S1 | STORAGE-1/2 | No secrets in the app: only the Supabase **anon** key (public by design, RLS-protected) + short-lived tokens. Repo scan: no keys/tokens committed | **Done** (no backend wiring yet; anon key will come from `--dart-define`, never a service key) |
| S1b | STORAGE-1 | Tokens in Keystore/Keychain via `flutter_secure_storage` | **Done** (1 Nov 2026): 11.2.0 pinned + hash-verified, refresh token only (`SecureTokenStore`, SIWS_LOGIN_REVIEW §11.7) |
| S2a | RESILIENCE-3 | `--obfuscate --split-debug-info` in release builds | **Done**: `tool/build_release.sh`, CI `release-build` job (symbols as a private 90-day artifact) |
| S2b | RESILIENCE-2 | `debuggable=false` in release | **Done**: explicit `isDebuggable = false`; verified the release manifest has no `debuggable` (aapt2) |
| S2c | STORAGE-2 | `android:allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules` (cloud + device transfer excluded) | **Done**, verified in the release APK |
| S2d | PLATFORM-1 | Explicit `android:exported`: only `MainActivity` (launcher) is `true`. Library components: `ProfileInstallReceiver` exported but guarded by `android.permission.DUMP` (androidx) | **Done** |
| S2e | NETWORK-1 | No cleartext: `usesCleartextTraffic=false` + `network_security_config.xml` (HTTPS only, system CAs only, no user CAs). Debug-only override allows `10.0.2.2/localhost` for local Supabase | **Done** |
| S2f | NETWORK-1 | iOS ATS: `NSAllowsArbitraryLoads=false` (+ web content, local networking), `ITSAppUsesNonExemptEncryption=false` for TestFlight | **Done** (`Info.plist`) |
| S2g | NETWORK-2 | Certificate pinning | **Not planned** (Supabase/Cloudflare rotate certs; pin failure = lockout for a single-user app). Revisit if threat model changes |
| S2h | CODE | R8 minify + resource shrink for the Android side | **Done** (`isMinifyEnabled`, `isShrinkResources`); release build verified |
| S2i | PRIVACY | No runtime font download (no third-party request at startup) | **Done** |
| S3 | AUTH-2/3 | **Biometric gate for Real SOL** (Phase 7): `local_auth` (BiometricPrompt Class 3 / Face ID) before every Real approve, Real resume and guard weakening; result bound to a server nonce (`real_confirmation.dart` design) so a hooked client can't skip it; server re-checks. No private key in the app | **Design only** (Phase 7; Real flag OFF) |
| S4 | RESILIENCE-4 | **Play Integrity / App Attest**: `/auth/siws/verify` and Real confirmations carry an integrity token (Android: Play Integrity standard request, nonce = SIWS nonce hash; iOS: App Attest key + assertion over the nonce). Server verifies with Google/Apple, fails closed for Real, logs-only for practice at first. Note: TestFlight/ad-hoc builds support App Attest (development environment entitlement); sideloaded APKs fail Play Integrity "app recognized", so Android needs Play internal testing for it | **Design only**, decision D5 |
| S5a | CODE-3 | `pubspec.lock` committed | **Done** (tracked since the move) |
| S5b | CODE-3 | **osv-scanner** in `mobile.yml` (`google/osv-scanner-action` reusable workflow v2.7.0, `--lockfile=apps/mobile/pubspec.lock`) | **Added, non-blocking: PENDING REVIEW** (decision D3: flip `fail-on-vuln: true`, pin to full SHA). Not installed on the box |
| S5c | CODE-3 | SBOM (CycloneDX) | **Documented only, PENDING REVIEW**: no first-party Dart CycloneDX generator; options: (a) `anchore/syft` (Apache-2.0, reads `pubspec.lock`, CycloneDX/SPDX) via `anchore/sbom-action` in CI; (b) `osv-scanner --format cyclonedx-1-5` (same tool as S5b, so no new vendor). Recommendation: (b). Not installed |
| S5d | CODE | MobSF static scan | **Plan only**: run the official container `opensecurity/mobile-security-framework-mobsf` (pin by digest, GPL-3.0) on a disposable runner/VM with no network secrets, upload the release APK/IPA, keep the PDF report as an artifact. Pending review; not pulled on the box |
| S6 | PLATFORM-2 | Untrusted token metadata (symbol/name) rendered as plain text only, never as links/HTML | **Done** (existing `untrusted` handling) |
| S7 | AUTH-1 | SIWS: nonce single-use + expiry, domain/URI/chain-id in the signed message, allowlist check server-side; access 15 min, refresh rotation with reuse detection → forced logout | **Done (client)**: Phantom deeplink SIWS + `/session/refresh` single-flight + `/logout`; mock/fake tests (`test/phantom_login_test.dart`). Device test with real Phantom PENDING |
| S8 | PLATFORM-1 | Custom-scheme redirect hijack (`centurion://auth`) | **Mitigated**: state/TTL/single-use + Box MAC + payload checks (§3.1). App Links when a domain exists |

### 3.3 Review: `flutter_secure_storage` (installed 1 Nov 2026 after Boss approval; review kept for reference)

| Aspect | Finding (pub.dev, 29 Oct 2026) |
|---|---|
| Version | 11.2.0 (published ~42 days ago) |
| Source / maintainer | github.com/juliansteenbakker/flutter_secure_storage; publisher `steenbakker.dev` (long-standing maintainer of this package and `mobile_scanner`) |
| License | BSD-3-Clause (deps: federated `_darwin`, `_linux`, `_windows`, `_web`, `_platform_interface`, `meta`) |
| Android | v10+: own ciphers, RSA-OAEP-wrapped AES-GCM key in Android Keystore (Jetpack `EncryptedSharedPreferences` dropped); min SDK 23; optional biometric-bound keys (`AndroidOptions.biometric`, API 28+ to enforce). Data lives in SharedPreferences (encrypted) and **must be excluded from backup** (done: S2c) or restore fails with `InvalidKeyException` |
| iOS | Keychain; choose `KeychainAccessibility.first_unlock_this_device` (not synced to iCloud, not migrated to a new device) |
| Permissions | none by default; `USE_BIOMETRIC` only if biometric-bound storage is used |
| Risks / open issues | Web implementation is experimental (we don't ship web auth). Keychain items survive app uninstall on iOS → clear on first launch after reinstall. Open-issue count and latest CVEs to be re-checked on GitHub/OSV at approval time |
| Alternative | `supabase_flutter`'s own storage hook with a custom `LocalStorage` backed by the same package; no alternative avoids a native plugin |
| Recommendation | Approve 11.x, pinned exactly in `pubspec.yaml`, `AndroidOptions()` default ciphers, iOS `first_unlock_this_device`; store only the refresh token (access token in memory) |

## 4. Verification (this commit)

From `apps/mobile`: `flutter analyze` clean · `flutter test` all pass (incl. `perf_test.dart`:
throttle ≤ 4 Hz with trailing latest value, null-key passthrough + no leaked timers, compute
path equals sync path, deferred tasks only after the first frame and failure isolation,
mock tick not started at provider creation, `liveMarkProvider` throttling) · `dart format`
0 changed · `tool/ci_check_errors.sh` OK · `tool/ci_check_vendored.sh` OK · release APK
(obfuscated, arm64 + x64) built and its manifest checked with `aapt2`.

## 5. Decisions needed from Boss

| # | Decision | Recommendation |
|---|---|---|
| D1 | Approve `flutter_secure_storage` 11.x (§3.3) | Yes, refresh token only, exact pin |
| D2 | A mid-range test device (or Firebase Test Lab / BrowserStack budget) to fill §1.3 | One physical mid-range Android (e.g. Galaxy A35) |
| D3 | Make osv-scanner blocking (`fail-on-vuln: true`) and pin to SHA | Yes after the first green run |
| D4 | SBOM tool | `osv-scanner --format cyclonedx` (no new vendor) |
| D5 | Android distribution: sideload vs Play internal testing (Play Integrity needs Play) | Play internal testing (private, allowlisted tester = Boss) |
| D6 | Play Integrity / App Attest enforcement: practice log-only, Real fail-closed | Yes |
| D7 | Certificate pinning | No (single user; lockout risk > benefit) |
| D8 | MobSF run on a disposable VM per release | Yes, before each TestFlight/Play upload |
| D9 | Analytics/crash reporting vendor (or none) for a single-user app | None at MVP; symbolized local crash logs only |
