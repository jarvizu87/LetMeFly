#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-y/strength-maxes-v1.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-y/strength-maxes-v1.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
node --check "$JS_SOURCE"

grep -Fq 'STRENGTH MAXES' "$JS_SOURCE"
grep -Fq 'Actual 1RM' "$JS_SOURCE"
grep -Fq 'All-time PR' "$JS_SOURCE"
grep -Fq 'Estimated 1RM' "$JS_SOURCE"
grep -Fq 'Training Max' "$JS_SOURCE"
grep -Fq 'MAX HISTORY' "$JS_SOURCE"
grep -Fq 'letmefly_private_strength_maxes_v1' "$JS_SOURCE"
grep -Fq 'lmf:strength-maxes-updated' "$JS_SOURCE"
grep -Fq 'calculateE1RM' "$JS_SOURCE"
grep -Fq '.lmf-strength-maxes-section' "$CSS_SOURCE"
grep -Fq '.lmf-strength-maxes-progress' "$CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/strength-maxes-v1.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/strength-maxes-v1.css"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
css = '<link rel="stylesheet" href="/ui/strength-maxes-v1.css">'
js = '<script defer src="/ui/strength-maxes-v1.js"></script>'
if css not in text:
    if '</head>' not in text:
        raise SystemExit('index.html is missing </head>')
    text = text.replace('</head>', f'  {css}\n</head>', 1)
if js not in text:
    if '</body>' not in text:
        raise SystemExit('index.html is missing </body>')
    text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one HTML document')
p.write_text(text)
PY

node --check "$DIST_DIR/ui/strength-maxes-v1.js"
test -s "$DIST_DIR/ui/strength-maxes-v1.css"
grep -Fq '/ui/strength-maxes-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/strength-maxes-v1.js' "$DIST_DIR/index.html"
grep -Fq 'STRENGTH MAXES' "$DIST_DIR/ui/strength-maxes-v1.js"
grep -Fq 'letmefly_private_strength_maxes_v1' "$DIST_DIR/ui/strength-maxes-v1.js"
grep -Fq 'MAXES & ESTIMATES' "$DIST_DIR/ui/strength-maxes-v1.js"

echo "LetMeFly private Strength Maxes profile + progress feature: PASS"
