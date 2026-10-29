#!/usr/bin/env bash
# CI gate: copies of monorepo packages that are not Dart packages (no pubspec, so
# no path dependency possible; Dart can't import files outside lib/) must stay
# byte-identical to their source. Fix drift with the printed cp command.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
check() { # <source in monorepo> <copy in app>
  if ! cmp -s "$1" "$2"; then
    echo "::error::$2 differs from $1; copy it: cp $1 $2 (then flutter gen-l10n for ARB)" >&2
    fail=1
  else
    echo "ok  $2 == $1"
  fi
}
check ../../packages/i18n/arb/app_en.arb lib/l10n/app_en.arb
check ../../packages/i18n/arb/app_id.arb lib/l10n/app_id.arb
check ../../packages/design-tokens/tokens/app_tokens.dart lib/core/theme/app_tokens.dart
exit $fail
