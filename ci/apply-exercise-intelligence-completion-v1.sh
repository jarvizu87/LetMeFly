#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?reconstructed app root required}"
SRC="$ROOT_DIR/overlays/exercise-intelligence/completion"
SW="$TARGET/public/service-worker.js"

for required in \
  "$SRC/exact-fallback-art-v1.css" \
  "$SRC/machine-hip-abduction.svg" \
  "$SRC/seated-band-hip-abduction.svg" \
  "$TARGET/src/command-v2.css" \
  "$TARGET/public" \
  "$SW"
do
  test -e "$required"
done

mkdir -p "$TARGET/public/ui/exercises"
cp "$SRC/machine-hip-abduction.svg" "$TARGET/public/ui/exercises/machine-hip-abduction.svg"
cp "$SRC/seated-band-hip-abduction.svg" "$TARGET/public/ui/exercises/seated-band-hip-abduction.svg"
cat "$SRC/exact-fallback-art-v1.css" >> "$TARGET/src/command-v2.css"

SW="$SW" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = [
    '/ui/exercises/machine-hip-abduction.svg',
    '/ui/exercises/seated-band-hip-abduction.svg',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq 'MACHINE HIP ABDUCTION' "$TARGET/public/ui/exercises/machine-hip-abduction.svg"
grep -Fq 'SEATED BAND HIP ABDUCTION' "$TARGET/public/ui/exercises/seated-band-hip-abduction.svg"
grep -Fq '[data-exercise-art="machine-hip-abduction"]' "$TARGET/src/command-v2.css"
grep -Fq '[data-exercise-art="seated-band-hip-abduction"]' "$TARGET/src/command-v2.css"
grep -Fq "'/ui/exercises/machine-hip-abduction.svg'" "$SW"
grep -Fq "'/ui/exercises/seated-band-hip-abduction.svg'" "$SW"

echo 'LetMeFly Exercise Intelligence exact lateral-glute fallback art + offline precache: APPLIED'
