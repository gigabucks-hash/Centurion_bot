#!/usr/bin/env bash
# CI gate: lib/data/api/api_errors.g.dart must equal fresh generator output from packages/contracts/errors.json
# AT THE PINNED COMMIT (lib/data/api/contracts_pin.dart `contractsPin`), not the working tree, so Backend WIP never
# breaks mobile CI. Override the source with $ERRORS_JSON. Needs git history for the pin (fetch-depth: 0); on a
# shallow clone the working-tree file is used only if its "version" equals contractsErrorsJsonVersion.
set -euo pipefail
cd "$(dirname "$0")/.."

PIN="$(sed -n "s/^const contractsPin = '\(.*\)';/\1/p" lib/data/api/contracts_pin.dart)"
WANT_V="$(sed -n 's/^const contractsErrorsJsonVersion = \([0-9]*\);/\1/p' lib/data/api/contracts_pin.dart)"
SRC="${ERRORS_JSON:-}"
if [[ -z "$SRC" ]]; then
  SRC="$(mktemp)"
  trap 'rm -f "$SRC"' EXIT
  if git show "$PIN:packages/contracts/errors.json" >"$SRC" 2>/dev/null; then
    echo "errors.json source: contracts @ $PIN"
  else
    cp ../../packages/contracts/errors.json "$SRC"
    got_v="$(sed -n 's/^ *"version": *\([0-9]*\).*/\1/p' "$SRC" | head -1)"
    if [[ "$got_v" != "$WANT_V" ]]; then
      echo "::error::no git history for contracts pin $PIN and working-tree errors.json is v$got_v (want v$WANT_V)" >&2
      exit 1
    fi
    echo "errors.json source: working tree (no history for $PIN; version $got_v matches)"
  fi
fi
if [[ ! -f "$SRC" ]]; then
  echo "::error::$SRC not found" >&2
  exit 1
fi

echo "$(grep -c '"code"' "$SRC") codes"
dart run tool/gen_errors.dart --source "$SRC"
if ! git diff --exit-code -- lib/data/api/api_errors.g.dart; then
  echo "::error::lib/data/api/api_errors.g.dart is stale. Run: tool/ci_check_errors.sh && commit" >&2
  exit 1
fi
echo "api_errors.g.dart up to date (contracts $PIN)"
