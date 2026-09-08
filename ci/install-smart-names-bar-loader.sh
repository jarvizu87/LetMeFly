#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-v/smart-names-bar-loader-v1.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-v/smart-names-bar-loader-v1.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
node --check "$JS_SOURCE"

grep -Fq "Inc DB Press" "$JS_SOURCE"
grep -Fq "Half-Kneeling Chop" "$JS_SOURCE"
grep -Fq "BAR LOADER" "$JS_SOURCE"
grep -Fq "AVAILABLE PLATES" "$JS_SOURCE"
grep -Fq "data-lmf-bar-loader-open" "$JS_SOURCE"
grep -Fq "programmed workout loads are never changed" <(tr '[:upper:]' '[:lower:]' < "$JS_SOURCE")

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/smart-names-bar-loader-v1.css"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
css = '<link rel="stylesheet" href="/ui/smart-names-bar-loader-v1.css">'
js = '<script defer src="/ui/smart-names-bar-loader-v1.js"></script>'
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

node --check "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
test -s "$DIST_DIR/ui/smart-names-bar-loader-v1.css"
grep -Fq '/ui/smart-names-bar-loader-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/smart-names-bar-loader-v1.js' "$DIST_DIR/index.html"
grep -Fq 'Inc DB Press' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'Half-Kneeling Chop' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'Bar Loader' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq '@media (max-width: 360px)' "$DIST_DIR/ui/smart-names-bar-loader-v1.css"

echo "LetMeFly smart exercise-name abbreviations + standalone/contextual Bar Loader: PASS"
