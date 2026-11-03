#!/usr/bin/env bash
# Perf baseline for the release build (Linux, headless Xvfb). Mock backend; no network.
# Usage: DISPLAY=:143 scripts/perf-baseline.sh [runs=5]
# Prints: cold start (exec → main window mapped, ms) per run + median, RSS/PSS of the whole process tree
# (centurion + WebKit web/network processes) after 20 s, CPU % over 30 s while marks stream, bundle sizes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; desk="$(dirname "$here")"
bin="$desk/src-tauri/target/release/centurion"
[[ -x "$bin" ]] || { echo "build first: npx tauri build --bundles deb" >&2; exit 2; }
for t in xdotool python3; do command -v "$t" >/dev/null || { echo "missing tool: $t (not installing)" >&2; exit 3; }; done
runs="${1:-5}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/tmp/centurion-perf/data}" XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/centurion-perf/cache}" XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/centurion-perf/config}"
mkdir -p "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME"
tree_pids() { local p=$1; echo "$p"; for c in $(pgrep -P "$p" || true); do tree_pids "$c"; done; }
starts=()
for i in $(seq 1 "$runs"); do
  t0=$(date +%s%N); "$bin" >/dev/null 2>&1 & pid=$!
  xdotool search --sync --onlyvisible --name "Centurion Trade" >/dev/null 2>&1
  t1=$(date +%s%N); starts+=($(( (t1 - t0) / 1000000 )))
  if [[ $i -lt $runs ]]; then kill "$pid"; wait "$pid" 2>/dev/null || true; sleep 1; fi
done
printf 'cold_start_ms runs: %s\n' "${starts[*]}"
printf 'cold_start_ms median: %s\n' "$(printf '%s\n' "${starts[@]}" | sort -n | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}')"
sleep 20
pids=$(tree_pids "$pid" | tr '\n' ' ')
python3 - "$pids" <<'PY'
import sys
rss=pss=0
for p in sys.argv[1].split():
    try:
        for l in open(f"/proc/{p}/smaps_rollup"):
            k,v=l.split(":",1)
            if k=="Rss": rss+=int(v.split()[0])
            if k=="Pss": pss+=int(v.split()[0])
    except FileNotFoundError: pass
print(f"memory_tree_kb rss={rss} pss={pss} (processes: {len(sys.argv[1].split())})")
PY
hz=$(getconf CLK_TCK)
ticks() { local s=0; for p in $pids; do [[ -r /proc/$p/stat ]] && s=$(( s + $(awk '{print $14+$15}' /proc/$p/stat) )); done; echo $s; }
a=$(ticks); sleep 30; b=$(ticks)
echo "cpu_pct_30s (one core = 100): $(python3 -c "print(round(($b-$a)/$hz/30*100,1))")"
kill "$pid"; wait "$pid" 2>/dev/null || true
for f in "$desk"/src-tauri/target/release/bundle/deb/*.deb "$desk"/src-tauri/target/release/bundle/appimage/*.AppImage; do
  [[ -f "$f" ]] && echo "bundle: $(basename "$f") $(stat -c %s "$f") bytes"
done
echo "binary: $(stat -c %s "$bin") bytes"
