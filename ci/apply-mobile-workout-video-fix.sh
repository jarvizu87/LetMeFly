#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"
CSS_FILE="$ROOT_DIR/overlays/ui-command-v2/batch-p/mobile-workout-video-fix.css"
AUTO_ART_JS="$ROOT_DIR/overlays/ui-command-v2/batch-r/exercise-art-auto.js"

if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" || ! -f "$TARGET_DIR/src/command-v2.css" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

test -s "$CSS_FILE"
test -s "$AUTO_ART_JS"
node --check "$AUTO_ART_JS"

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

# Audit every embedded exercise video record. Any remaining legacy Vimeo direct
# links are demoted to honest exact-name YouTube search fallbacks until a new
# direct instructional source has been manually approved.
bash "$ROOT_DIR/ci/apply-exercise-video-audit.sh" "$TARGET_DIR"

cat "$CSS_FILE" >> "$TARGET_DIR/src/command-v2.css"

# Make the approved Style 2 Cloudinary thumbnails render automatically on the
# current SSO-protected release without requiring a phone-side JSON import.
mkdir -p "$TARGET_DIR/public/ui"
cp "$AUTO_ART_JS" "$TARGET_DIR/public/ui/exercise-art-auto.js"
TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET_DIR']) / 'index.html'
text = p.read_text()
marker = '<script defer src="/ui/exercise-art-auto.js"></script>'
if marker not in text:
    if '</body>' not in text:
        raise SystemExit('index.html is missing </body>')
    text = text.replace('</body>', f'  {marker}\n</body>', 1)
p.write_text(text)
PY

grep -Rq 'https://www.youtube.com/watch?v=-fNfycATWUo' "$TARGET_DIR/src"
! grep -Rq 'vimeo.com/' "$TARGET_DIR/src/data/exercise-library.ts"
grep -Fq 'grid-template-areas:' "$TARGET_DIR/src/command-v2.css"
grep -Fq '"set set check"' "$TARGET_DIR/src/command-v2.css"
grep -Fq '"reps load rpe"' "$TARGET_DIR/src/command-v2.css"
grep -Fq '.set-target-cell{display:none!important}' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'height:62px!important' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'font-size:17px!important' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'font-size:11px!important' "$TARGET_DIR/src/command-v2.css"
test -s "$TARGET_DIR/public/ui/exercise-art-auto.js"
grep -Fq '/ui/exercise-art-auto.js' "$TARGET_DIR/index.html"
grep -Fq 'jp-${slug}-v2' "$TARGET_DIR/public/ui/exercise-art-auto.js"
grep -Fq "'glute-bridge-iso': 'jp-glute-bridge-isometric-hold-v2'" "$TARGET_DIR/public/ui/exercise-art-auto.js"
grep -Fq "'rear-delt-fly': 'jp-rear-deltoid-fly-v2'" "$TARGET_DIR/public/ui/exercise-art-auto.js"

echo "LetMeFly mobile workout + exercise video + automatic exercise art reliability pass: PASS"
