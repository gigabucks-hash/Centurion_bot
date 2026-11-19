#!/usr/bin/env bash
# Typecheck the desktop against the COMMITTED packages/contracts (HEAD), ignoring any uncommitted Backend
# WIP in the working tree. Read-only: exports `git archive HEAD packages/contracts` into a temp dir.
set -euo pipefail
desk="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$desk/../.." && pwd)"
tmp="$(mktemp -d -t centurion-tsc-pinned.XXXX)"
trap 'rm -rf "$tmp"' EXIT
git -C "$root" archive HEAD packages/contracts | tar -x -C "$tmp"
cat > "$tmp/tsconfig.json" <<JSON
{
  "extends": "$desk/tsconfig.json",
  "compilerOptions": {
    "types": ["$desk/node_modules/vite/client"],
    "typeRoots": ["$desk/node_modules/@types"],
    "paths": {
      "@centurion/contracts/wire": ["$tmp/packages/contracts/src/wire/index.ts"],
      "@centurion/i18n/*": ["$root/packages/i18n/*"],
      "@explore/*": ["$root/packages/explore/src/*"]
    }
  },
  "include": ["$desk/src", "$tmp/packages/contracts/src/wire"]
}
JSON
"$desk/node_modules/.bin/tsc" --noEmit -p "$tmp/tsconfig.json"
echo "tsc (committed contracts $(git -C "$root" log -1 --format=%h -- packages/contracts)): ok"
