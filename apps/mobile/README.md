# apps/mobile: Centurion mobile (Flutter, Android + iOS)

Companion app for Centurion: approval queue (Approve/Skip picks and guard changes),
positions, screener (WF-20/21), activity feed and push notifications. Practice
(paper SOL) only; Real SOL is behind a server-side flag until Phase 7.
Data comes from an in-process mock backend until the API is wired.

| | |
|---|---|
| Package | `centurion_mobile` |
| Android applicationId / namespace | `com.centuriontrade.app` |
| iOS bundle id | `com.centuriontrade.app` (tests: `com.centuriontrade.app.RunnerTests`) |
| Display name | Centurion |
| Toolchain | Flutter 3.47.8 / Dart 3.13.7 (pinned in `.github/workflows/mobile.yml`) |

## Run

```bash
cd apps/mobile
flutter pub get
flutter run            # device/emulator
flutter run -d chrome  # quick UI check
```

## Checks (same as CI: `.github/workflows/mobile.yml`)

```bash
cd apps/mobile
dart format --output=none --set-exit-if-changed .   # page_width 120
bash tool/ci_check_errors.sh                        # api_errors.g.dart == packages/contracts/errors.json
bash tool/ci_check_vendored.sh                      # ARB + app_tokens.dart == packages/
flutter analyze
flutter test
```

## Shared monorepo packages

| Source | Used as | Why |
|---|---|---|
| `packages/contracts/errors.json` | read directly by `tool/gen_errors.dart` (relative path) → `lib/data/api/api_errors.g.dart` (committed) | Backend owns the JSON; CI regenerates and fails on a stale `.g.dart` |
| `packages/i18n/arb/app_{en,id}.arb` | byte-identical copies in `lib/l10n/` → gen-l10n → `lib/l10n/gen/` | not a Dart package (no pubspec); gen-l10n wants ARBs in the app; `ci_check_vendored.sh` blocks drift |
| `packages/design-tokens/tokens/app_tokens.dart` | byte-identical copy in `lib/core/theme/` | not a Dart package; Dart can't import outside `lib/`; drift check as above |

Update an ARB or token drop: `cp ../../packages/i18n/arb/app_*.arb lib/l10n/ && flutter gen-l10n`
(read `packages/i18n/CHANGELOG.md` first: gen-l10n orders positional params alphabetically).

## Docs

- `docs/ARCHITECTURE.md`: structure, state, contracts, notifications, decisions
- `docs/TOKENS_REVIEW.md`: design-token / i18n review log
- `docs/TELEGRAM_LOGIN_REVIEW.md`: Telegram login options (flag off)
- `docs/screens/`: prototype screenshots

History: this directory was the standalone `solbot_mobile` repo (`app/` = this
folder); its history was merged with `git filter-repo`, so
`git log --follow` works across the move.
