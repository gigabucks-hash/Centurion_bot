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

pin_text() { # text pin: ignore CR so a Windows working tree verifies too (CI checks out LF)
  local got
  got="$(tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1)"
  if [[ "$got" != "$2" ]]; then
    echo "::error::$1 is not $3 (sha256 $got)" >&2
    echo "  restore: $4" >&2
    fail=1
  else
    echo "ok  $1 == $3"
  fi
}

# @centurion/i18n 0.4.11 @ 714beb2 plus the mobile PnL keys (pnl.*, added 2026-11-06) and the mobile
# positions exit/sell keys (positions*, added 2026-11-06). The vendored copy is still a verbatim copy, so the
# monorepo ARB is the source of truth: restore from packages/i18n/arb, never from the 0.4.11 tag (it does not
# have those keys). Then run `flutter gen-l10n`.
pin_text lib/l10n/app_en.arb 87edf194d85b0b52b429ce44b43341e12748842fd0ff113c099eed0a2e194f99 "i18n 0.4.11 + pnl/positions keys" \
  "cp ../../packages/i18n/arb/app_en.arb lib/l10n/app_en.arb"
pin_text lib/l10n/app_id.arb f5525123d1732aa3fcdb4ef43ab926631c9b91a379bc49d1223850ea139dff96 "i18n 0.4.11 + pnl/positions keys" \
  "cp ../../packages/i18n/arb/app_id.arb lib/l10n/app_id.arb"

# design-tokens 0.3.4 (5234c44): G1-blue palette. Copied verbatim; the 0.3.x generator header already says
# "Centurion Trade (@centurion/design-tokens)", so no rename edit is needed.
TOKENS_PIN=5234c44
pin lib/core/theme/app_tokens.dart 5043960aa540def820cc376868332ee5792cf239d6b1d9693592c6027f06417f \
  "design-tokens 0.3.4 ($TOKENS_PIN)" \
  "git show $TOKENS_PIN:packages/design-tokens/tokens/app_tokens.dart > lib/core/theme/app_tokens.dart"

# Inter Bold (rsms/inter v4.1, OFL) for identicon initials: design-tokens 5594cee fonts/Inter-Bold.ttf.
pin assets/fonts/Inter-Bold.ttf 288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f \
  "Inter-Bold.ttf (5594cee)" "git show 5594cee:packages/design-tokens/fonts/Inter-Bold.ttf > assets/fonts/Inter-Bold.ttf"
exit $fail
