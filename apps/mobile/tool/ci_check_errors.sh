#!/usr/bin/env bash
# CI gate: lib/data/api/api_errors.g.dart must equal fresh generator output from
# the monorepo's packages/contracts/errors.json (Backend owns it; no vendored copy
# since the move into centurion/apps/mobile). Override with $ERRORS_JSON.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${ERRORS_JSON:-../../packages/contracts/errors.json}"
if [[ ! -f "$SRC" ]]; then
  echo "::error::$SRC not found (run from centurion/apps/mobile inside the monorepo)" >&2
  exit 1
fi

echo "errors.json source: $SRC ($(grep -c '"code"' "$SRC") codes)"
dart run tool/gen_errors.dart --source "$SRC"
if ! git diff --exit-code -- lib/data/api/api_errors.g.dart; then
  echo "::error::lib/data/api/api_errors.g.dart is stale. Run: dart run tool/gen_errors.dart && commit" >&2
  exit 1
fi
echo "api_errors.g.dart up to date"
