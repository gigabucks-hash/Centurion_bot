#!/usr/bin/env bash
# CI gate: copies of monorepo packages that are not Dart packages (no pubspec, so no path dependency; Dart can't
# import files outside lib/) must equal a COMMITTED, pinned version of their source, never the working tree
# (other agents' WIP must not break mobile CI). sha256 pins work on shallow clones. See docs/TOKENS_PIN.md.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
pin() { # <app copy> <expected sha256> <label> <restore command>
  local got
  got="$(sha256sum "$1" | cut -d' ' -f1)"
  if [[ "$got" != "$2" ]]; then
    echo "::error::$1 is not $3 (sha256 $got)" >&2
    echo "  restore: $4" >&2
    fail=1
  else
    echo "ok  $1 == $3"
  fi
}

# @centurion/i18n 0.4.11 @ 714beb2 (verbatim ARB; then flutter gen-l10n).
I18N_PIN=714beb2
pin lib/l10n/app_en.arb afc446840b81ef64c4a31014507c60a68d1ade00c449d74da086dc811cfd9085 "i18n 0.4.11 ($I18N_PIN)" \
  "git show $I18N_PIN:packages/i18n/arb/app_en.arb > lib/l10n/app_en.arb"
pin lib/l10n/app_id.arb cb68043ac0a2ef4ca591960072c45de8e35003b560c87c7b98d14eb45b19dd47 "i18n 0.4.11 ($I18N_PIN)" \
  "git show $I18N_PIN:packages/i18n/arb/app_id.arb > lib/l10n/app_id.arb"

# design-tokens PINNED to 0.2.5 (bd58541): 0.3.x is the G1-blue palette, which waits for Boss's visual approval.
# Only the rename-only Sentra -> Centurion edit differs. To adopt 0.3.x later, copy the package file and re-pin.
TOKENS_PIN=bd58541
pin lib/core/theme/app_tokens.dart 1ecfd53a5f77172eb7c1bffe70595512dd73c2458554314224b09a67bde76950 \
  "design-tokens 0.2.5 ($TOKENS_PIN, pinned)" \
  "git show $TOKENS_PIN:packages/design-tokens/tokens/app_tokens.dart | sed -e 's/Sentra (working name)/Centurion (working name)/' -e 's#@sentra/#@centurion/#g'"

# Inter Bold (rsms/inter v4.1, OFL) for identicon initials: design-tokens 5594cee fonts/Inter-Bold.ttf.
pin assets/fonts/Inter-Bold.ttf 288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f \
  "Inter-Bold.ttf (5594cee)" "git show 5594cee:packages/design-tokens/fonts/Inter-Bold.ttf > assets/fonts/Inter-Bold.ttf"
exit $fail
