#!/usr/bin/env bash
# CI gate: lib/data/api/api_errors.g.dart must equal fresh generator output
# from errors.json. Source precedence:
#   1. $ERRORS_JSON
#   2. ../../packages/contracts/errors.json  (after the D3–4 move into sentra/apps/mobile)
#   3. tool/contracts/errors.json            (vendored copy, standalone repo)
# If both 2 and 3 exist they must be identical (vendored copy not stale).
set -euo pipefail
cd "$(dirname "$0")/.."

VENDORED=tool/contracts/errors.json
UPSTREAM=../../packages/contracts/errors.json
SRC="${ERRORS_JSON:-}"
if [[ -z "$SRC" ]]; then
  if [[ -f "$UPSTREAM" ]]; then SRC="$UPSTREAM"; else SRC="$VENDORED"; fi
fi
if [[ -f "$UPSTREAM" && "$SRC" != "$VENDORED" ]] && ! cmp -s "$UPSTREAM" "$VENDORED"; then
  echo "::error::$VENDORED differs from $UPSTREAM; copy it: cp $UPSTREAM $VENDORED" >&2
  exit 1
fi

echo "errors.json source: $SRC ($(grep -c '"code"' "$SRC") codes)"
dart run tool/gen_errors.dart --source "$SRC"
if ! git diff --exit-code -- lib/data/api/api_errors.g.dart; then
  echo "::error::lib/data/api/api_errors.g.dart is stale. Run: dart run tool/gen_errors.dart && commit" >&2
  exit 1
fi
echo "api_errors.g.dart up to date"
