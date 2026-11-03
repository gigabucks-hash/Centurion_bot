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
# design-tokens is PINNED to 0.2.5 (bd58541), the last version approved for the app: 0.3.x is the
# G1-blue palette, which waits for Boss's visual approval (docs/TOKENS_PIN.md). The only allowed
# difference is the rename-only Sentra -> Centurion edit. To adopt 0.3.x later: drop this pin and
# go back to `check ../../packages/design-tokens/tokens/app_tokens.dart lib/core/theme/app_tokens.dart`.
TOKENS_PIN=bd58541 # sha256 below = that file after the rename-only sed; works on shallow CI clones
TOKENS_SHA256=1ecfd53a5f77172eb7c1bffe70595512dd73c2458554314224b09a67bde76950
got="$(sha256sum lib/core/theme/app_tokens.dart | cut -d' ' -f1)"
if [[ "$got" != "$TOKENS_SHA256" ]]; then
  echo "::error::lib/core/theme/app_tokens.dart is not design-tokens 0.2.5 ($TOKENS_PIN, pinned): sha256 $got" >&2
  echo "  restore: git show $TOKENS_PIN:packages/design-tokens/tokens/app_tokens.dart | sed -e 's/Sentra (working name)/Centurion (working name)/' -e 's#@sentra/#@centurion/#g'" >&2
  fail=1
else
  echo "ok  lib/core/theme/app_tokens.dart == design-tokens 0.2.5 ($TOKENS_PIN, pinned; package is $(
    sed -n 's/.*"version": "\(.*\)".*/\1/p' ../../packages/design-tokens/package.json))"
fi
exit $fail
