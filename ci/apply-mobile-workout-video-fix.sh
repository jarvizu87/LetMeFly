#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"
CSS_FILE="$ROOT_DIR/overlays/ui-command-v2/batch-p/mobile-workout-video-fix.css"
AUTO_ART_JS="$ROOT_DIR/overlays/ui-command-v2/batch-r/exercise-art-auto.js"
FLOW_JS="$ROOT_DIR/overlays/ui-command-v2/batch-s/workout-flow-v1.js"
FLOW_CSS="$ROOT_DIR/overlays/ui-command-v2/batch-s/workout-flow-v1.css"

if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" || ! -f "$TARGET_DIR/src/command-v2.css" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

test -s "$CSS_FILE"
test -s "$AUTO_ART_JS"
test -s "$FLOW_JS"
test -s "$FLOW_CSS"
node --check "$AUTO_ART_JS"
node --check "$FLOW_JS"

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

bash "$ROOT_DIR/ci/apply-exercise-video-audit.sh" "$TARGET_DIR"
cat "$CSS_FILE" >> "$TARGET_DIR/src/command-v2.css"
cat "$FLOW_CSS" >> "$TARGET_DIR/src/command-v2.css"

mkdir -p "$TARGET_DIR/public/ui"
cp "$AUTO_ART_JS" "$TARGET_DIR/public/ui/exercise-art-auto.js"
cp "$FLOW_JS" "$TARGET_DIR/public/ui/workout-flow-v1.js"
TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os
p = Path(os.environ['TARGET_DIR']) / 'index.html'
text = p.read_text()
markers = [
    '<script defer src="/ui/exercise-art-auto.js"></script>',
    '<script defer src="/ui/workout-flow-v1.js"></script>',
]
if '</body>' not in text:
    raise SystemExit('index.html is missing </body>')
for marker in markers:
    if marker not in text:
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

test -s "$TARGET_DIR/public/ui/workout-flow-v1.js"
grep -Fq '/ui/workout-flow-v1.js' "$TARGET_DIR/index.html"
grep -Fq 'lmf-set-tabs' "$TARGET_DIR/public/ui/workout-flow-v1.js"
grep -Fq 'lmf-compact-summary' "$TARGET_DIR/public/ui/workout-flow-v1.js"
grep -Fq 'Between Rounds' "$TARGET_DIR/public/ui/workout-flow-v1.js"
grep -Fq 'scroll-snap-type:x proximity' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'background-size:contain' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'lmf-flow-node' "$TARGET_DIR/src/command-v2.css"
grep -Fq 'lmf-set-tab' "$TARGET_DIR/src/command-v2.css"

# Keep installed PWAs current, expose an install path even inside in-app browsers,
# and replace legacy crown branding with the official LetMeFly logo.
bash "$ROOT_DIR/ci/apply-brand-pwa-fix.sh" "$TARGET_DIR"

test -s "$TARGET_DIR/public/app-icon-v4.svg"
test -s "$TARGET_DIR/public/ui/pwa-install.js"
test -s "$TARGET_DIR/public/ui/pwa-update.js"
grep -Fq '"id": "/letmefly-pwa-v2"' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq 'source=pwa&app=letmefly-v2' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq 'letmefly-app-icon-192-v2.png' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq '"sizes": "192x192"' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq 'letmefly-app-icon-512-v2.png' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq '"sizes": "512x512"' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq 'letmefly-app-icon-512-maskable-v2.png' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq '"purpose": "maskable"' "$TARGET_DIR/public/manifest.webmanifest"
grep -Fq '/manifest.webmanifest?v=brand-v5' "$TARGET_DIR/index.html"
grep -Fq '/ui/pwa-install.js' "$TARGET_DIR/index.html"
grep -Fq '/ui/pwa-update.js' "$TARGET_DIR/index.html"
grep -Fq 'lmf-official-brand-mark' "$TARGET_DIR/src/main.ts"
grep -Fq 'lmf-official-more-logo' "$TARGET_DIR/src/main.ts"
grep -Fq 'Open in Chrome' "$TARGET_DIR/public/ui/pwa-install.js"
grep -Fq "params.get('app') === 'letmefly-v2'" "$TARGET_DIR/public/ui/pwa-install.js"
grep -Fq 'letmefly-shell-v5-4-command-v2-7-brand-v5' "$TARGET_DIR/public/service-worker.js"
test ! -e "$TARGET_DIR/public/icon-192.png"
test ! -e "$TARGET_DIR/public/icon-512.png"
test ! -e "$TARGET_DIR/public/app-icon-v3.svg"

echo "LetMeFly mobile workout + video + automatic art + Workout Flow v1 + official branding/install/update reliability pass: PASS"
