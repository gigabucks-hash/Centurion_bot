#!/usr/bin/env bash
# Release build with Dart obfuscation (MASVS-RESILIENCE). Symbol maps go to
# build/symbols/<platform>/ (gitignored): keep them per release, privately, to
# symbolize crash stack traces (`flutter symbolize -i <trace> -d <symbols>`).
#   tool/build_release.sh apk|appbundle|ipa [extra flutter build args]
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:-appbundle}"; shift || true
flutter build "$target" --release --obfuscate --split-debug-info="build/symbols/$target" "$@"
