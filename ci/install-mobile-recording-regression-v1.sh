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
css = '<link rel="stylesheet" href="/ui/mobile-recording-regression-v1.css?v=2">'
js = '<script defer src="/ui/mobile-recording-regression-v1.js?v=2"></script>'

if css not in text:
    if '</head>' not in text:
        raise SystemExit('production index is missing </head>')
    text = text.replace('</head>', f'  {css}\n</head>', 1)
if js not in text:
    if '</body>' not in text:
        raise SystemExit('production index is missing </body>')
    text = text.replace('</body>', f'  {js}\n</body>', 1)
p.write_text(text)
PY

# Recording-led regression boundaries: future-day cards share the compact live
# workout visual language, keep exact details expandable, and cannot write state.
grep -Fq '/ui/mobile-recording-regression-v1.css?v=2' "$INDEX"
grep -Fq '/ui/mobile-recording-regression-v1.js?v=2' "$INDEX"
grep -Fq 'width:78px!important' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'background-image:var(--exercise-art' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'lmf-preview-plan-toggle' "$DIST/ui/mobile-recording-regression-v1.css"
grep -Fq 'lmfPreviewCollapsed' "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq "Preview only — readiness is locked" "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq "['start-workout', 'save-readiness']" "$DIST/ui/mobile-recording-regression-v1.js"
grep -Fq 'MAKE CURRENT POSITION' "$DIST"/assets/*.js

# This layer is UI-only and must never mutate program source, local athlete data,
# or cloud/private records.
! grep -Eq 'indexedDB\.|localStorage\.setItem|supabase|programInstances|current_day_key|current_week' "$DIST/ui/mobile-recording-regression-v1.js"

echo "LetMeFly mobile recording regression fixes v2: PASS"
