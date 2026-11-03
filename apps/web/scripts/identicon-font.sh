#!/usr/bin/env bash
# Identicon initials font (UX COIN_LOGO §4: Inter 700). Source: packages/design-tokens/fonts/Inter-Bold.ttf
# (design-tokens 0.3.4 5594cee, rsms/inter v4.1, OFL). Verifies the published sha256, then writes a self-hosted subset
# with only the glyphs initials can use (A-Z, 0-9, U+2022) to app/fonts/inter-bold-initials.woff2 (next/font/local).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
src="$here/../../packages/design-tokens/fonts/Inter-Bold.ttf"
want="288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f"
got="$(sha256sum "$src" | cut -d' ' -f1)"
[ "$got" = "$want" ] || { echo "Inter-Bold.ttf sha256 mismatch: $got" >&2; exit 1; }
out="$here/app/fonts/inter-bold-initials.woff"
pyftsubset "$src" --unicodes="U+0030-0039,U+0041-005A,U+2022" --layout-features='' --no-hinting --desubroutinize \
  --name-IDs='*' --flavor=woff --output-file="$out"
cp "$here/../../packages/design-tokens/fonts/Inter-OFL.txt" "$here/app/fonts/Inter-OFL.txt"
echo "ok $got -> $(wc -c < "$out") bytes"
