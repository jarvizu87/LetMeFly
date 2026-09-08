#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
INDEX="$DIST/index.html"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aa/mobile-recording-regression-v1.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aa/mobile-recording-regression-v1.js"
PREVIEW_CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ab/preview-readonly-set-cards-v1.css"
PREVIEW_JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ab/preview-readonly-set-cards-v1.js"

if [[ ! -d "$DIST" || ! -s "$INDEX" ]]; then
  echo "LetMeFly production dist is missing: $DIST" >&2
  exit 1
fi

test -s "$CSS_SRC"
test -s "$JS_SRC"
test -s "$PREVIEW_CSS_SRC"
test -s "$PREVIEW_JS_SRC"
node --check "$JS_SRC"
node --check "$PREVIEW_JS_SRC"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$DIST/ui/mobile-recording-regression-v1.css"
cp "$JS_SRC" "$DIST/ui/mobile-recording-regression-v1.js"
cp "$PREVIEW_CSS_SRC" "$DIST/ui/preview-readonly-set-cards-v1.css"
cp "$PREVIEW_JS_SRC" "$DIST/ui/preview-readonly-set-cards-v1.js"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ['INDEX'])
text = p.read_text()
for pattern in (
    r'\s*<link rel="stylesheet" href="/ui/mobile-recording-regression-v1\.css\?v=\d+">\s*',
    r'\s*<script defer src="/ui/mobile-recording-regression-v1\.js\?v=\d+"></script>\s*',
    r'\s*<link rel="stylesheet" href="/ui/preview-readonly-set-cards-v1\.css\?v=\d+">\s*',
    r'\s*<script defer src="/ui/preview-readonly-set-cards-v1\.js\?v=\d+"></script>\s*',
):
    text = re.sub(pattern, '\n', text)

css = '<link rel="stylesheet" href="/ui/mobile-recording-regression-v1.css?v=5">'
preview_css = '<link rel="stylesheet" href="/ui/preview-readonly-set-cards-v1.css?v=1">'
js = '<script defer src="/ui/mobile-recording-regression-v1.js?v=5"></script>'
preview_js = '<script defer src="/ui/preview-readonly-set-cards-v1.js?v=1"></script>'

if '</head>' not in text:
    raise SystemExit('production index is missing </head>')
text = text.replace('</head>', f'  {css}\n  {preview_css}\n</head>', 1)
if '</body>' not in text:
    raise SystemExit('production index is missing </body>')
text = text.replace('</body>', f'  {js}\n  {preview_js}\n</body>', 1)
p.write_text(text)
PY

# Recording-led regression boundaries: active workout media stays square/full-frame,
# and future-day prescriptions use the live Day 1 set-card visual language without writes.
grep -Fq '/ui/mobile-recording-regression-v1.css?v=5' "$INDEX"
grep -Fq '/ui/mobile-recording-regression-v1.js?v=5' "$INDEX"
grep -Fq '/ui/preview-readonly-set-cards-v1.css?v=1' "$INDEX"
grep -Fq '/ui/preview-readonly-set-cards-v1.js?v=1' "$INDEX"
grep -Fq 'active-exercise.lmf-workout-flow-card > .lmf-exercise-media' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'background-size:contain!important' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'aspect-ratio:1/1!important' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'lmfPreviewDay1Style' "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq 'lmf-preview-readonly-logger' "$DIST/ui/preview-readonly-set-cards-v1.js"
grep -Fq 'data-lmf-preview-set-index' "$DIST/ui/preview-readonly-set-cards-v1.js"
grep -Fq 'lmf-preview-rich-source' "$DIST/ui/preview-readonly-set-cards-v1.css"
grep -Fq 'RPE / RIR' "$DIST/ui/preview-readonly-set-cards-v1.js"
grep -Fq "Preview only — readiness is locked" "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq "['start-workout', 'save-readiness']" "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq 'MAKE CURRENT POSITION' "$DIST"/assets/*.js

# These layers are presentation-only and must never mutate program source or private records.
! grep -Eq 'indexedDB\.|localStorage\.setItem|supabase|programInstances|current_day_key|current_week' "$DIST/ui/mobile-recording-regression-v1.js"
! grep -Eq 'indexedDB\.|localStorage\.setItem|supabase|programInstances|current_day_key|current_week|\.click\(\)' "$DIST/ui/preview-readonly-set-cards-v1.js"

echo "LetMeFly mobile recording fixes v5 + future read-only set-card parity: PASS"
