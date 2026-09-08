#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
INDEX="$DIST/index.html"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aa/mobile-recording-regression-v1.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aa/mobile-recording-regression-v1.js"

if [[ ! -d "$DIST" || ! -s "$INDEX" ]]; then
  echo "LetMeFly production dist is missing: $DIST" >&2
  exit 1
fi

test -s "$CSS_SRC"
test -s "$JS_SRC"
node --check "$JS_SRC"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$DIST/ui/mobile-recording-regression-v1.css"
cp "$JS_SRC" "$DIST/ui/mobile-recording-regression-v1.js"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['INDEX'])
text = p.read_text()
# Remove prior cache-busted variants before injecting the current UI layer.
import re
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/mobile-recording-regression-v1\.css\?v=\d+">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/mobile-recording-regression-v1\.js\?v=\d+"></script>\s*', '\n', text)
css = '<link rel="stylesheet" href="/ui/mobile-recording-regression-v1.css?v=4">'
js = '<script defer src="/ui/mobile-recording-regression-v1.js?v=4"></script>'

if '</head>' not in text:
    raise SystemExit('production index is missing </head>')
text = text.replace('</head>', f'  {css}\n</head>', 1)
if '</body>' not in text:
    raise SystemExit('production index is missing </body>')
text = text.replace('</body>', f'  {js}\n</body>', 1)
p.write_text(text)
PY

# Recording-led regression boundaries: active workout media and future-day cards
# keep canonical exercise art square/full-frame, while future previews cannot write state.
grep -Fq '/ui/mobile-recording-regression-v1.css?v=4' "$INDEX"
grep -Fq '/ui/mobile-recording-regression-v1.js?v=4' "$INDEX"
grep -Fq 'active-exercise.lmf-workout-flow-card > .lmf-exercise-media' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'background-size:contain!important' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'aspect-ratio:1/1!important' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'data-lmf-preview-collapsed' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'lmfPreviewDay1Style' "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq "Preview only — readiness is locked" "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq "['start-workout', 'save-readiness']" "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq 'MAKE CURRENT POSITION' "$DIST"/assets/*.js

# This layer is UI-only and must never mutate program source, local athlete data,
# or cloud/private records.
! grep -Eq 'indexedDB\.|localStorage\.setItem|supabase|programInstances|current_day_key|current_week' "$DIST/ui/mobile-recording-regression-v1.js"

echo "LetMeFly mobile recording regression fixes v4: PASS"
