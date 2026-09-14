#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?reconstructed app root required}"
SRC="$ROOT_DIR/overlays/exercise-intelligence/completion"

for required in \
  "$SRC/exact-fallback-art-v1.css" \
  "$SRC/machine-hip-abduction.svg" \
  "$SRC/seated-band-hip-abduction.svg" \
  "$TARGET/src/command-v2.css" \
  "$TARGET/public"
do
  test -e "$required"
done

mkdir -p "$TARGET/public/ui/exercises"
cp "$SRC/machine-hip-abduction.svg" "$TARGET/public/ui/exercises/machine-hip-abduction.svg"
cp "$SRC/seated-band-hip-abduction.svg" "$TARGET/public/ui/exercises/seated-band-hip-abduction.svg"
cat "$SRC/exact-fallback-art-v1.css" >> "$TARGET/src/command-v2.css"

grep -Fq 'MACHINE HIP ABDUCTION' "$TARGET/public/ui/exercises/machine-hip-abduction.svg"
grep -Fq 'SEATED BAND HIP ABDUCTION' "$TARGET/public/ui/exercises/seated-band-hip-abduction.svg"
grep -Fq '[data-exercise-art="machine-hip-abduction"]' "$TARGET/src/command-v2.css"
grep -Fq '[data-exercise-art="seated-band-hip-abduction"]' "$TARGET/src/command-v2.css"

echo 'LetMeFly Exercise Intelligence exact lateral-glute fallback art: APPLIED'
