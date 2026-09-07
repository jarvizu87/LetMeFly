#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"
CSS_FILE="$ROOT_DIR/overlays/ui-command-v2/batch-p/mobile-workout-video-fix.css"

if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" || ! -f "$TARGET_DIR/src/command-v2.css" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

test -s "$CSS_FILE"

# Replace the dead legacy Front Squat Vimeo demo wherever the current modular
# exercise library owns it. This changes exercise intelligence only; governed
# Crownforge prescriptions remain untouched.
TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

root = Path(os.environ['TARGET_DIR']) / 'src'
old = 'https://vimeo.com/152122947'
new = 'https://www.youtube.com/watch?v=-fNfycATWUo'

matches = []
for p in root.rglob('*.ts'):
    text = p.read_text()
    count = text.count(old)
    if count:
        matches.append((p, count, text))

total = sum(count for _, count, _ in matches)
if total != 1:
    locations = ', '.join(f'{p.relative_to(root)}:{count}' for p, count, _ in matches) or 'none'
    raise SystemExit(f'expected exactly one legacy Front Squat Vimeo URL across src, found {total} ({locations})')

p, _, text = matches[0]
p.write_text(text.replace(old, new, 1))
print(f'Front Squat demo updated in {p.relative_to(root)}')
PY

cat "$CSS_FILE" >> "$TARGET_DIR/src/command-v2.css"

grep -Rq 'https://www.youtube.com/watch?v=-fNfycATWUo' "$TARGET_DIR/src"
! grep -Rq 'https://vimeo.com/152122947' "$TARGET_DIR/src"
grep -Fq 'grid-template-areas:' "$TARGET_DIR/src/command-v2.css"
grep -Fq '"set target target target target check"' "$TARGET_DIR/src/command-v2.css"
grep -Fq '"reps reps load load rpe rpe"' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'font-size:17px!important' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'font-size:11px!important' "$TARGET_DIR/src/command-v2.css"

echo "LetMeFly mobile workout + Front Squat video reliability pass: PASS"
