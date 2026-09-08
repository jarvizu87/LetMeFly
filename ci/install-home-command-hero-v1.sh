#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ab/home-command-hero-v1.css"
CSS_TARGET="$DIST_DIR/ui/home-command-hero-v1.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$CSS_SOURCE"
grep -Fq 'LetMeFly Home Command Hero v1' "$CSS_SOURCE"
grep -Fq '.command-hero' "$CSS_SOURCE"
grep -Fq '.dashboard-grid' "$CSS_SOURCE"
grep -Fq '.coach-focus-card{order:4!important;display:block!important}' "$CSS_SOURCE"
grep -Fq '@media(max-width:520px)' "$CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$CSS_SOURCE" "$CSS_TARGET"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
marker = '<link rel="stylesheet" href="/ui/home-command-hero-v1.css">'
if marker not in text:
    if '</head>' not in text:
        raise SystemExit('index.html is missing </head>')
    text = text.replace('</head>', f'  {marker}\n</head>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one HTML document')
p.write_text(text)
PY

test -s "$CSS_TARGET"
grep -Fq '/ui/home-command-hero-v1.css' "$DIST_DIR/index.html"
grep -Fq 'LetMeFly Home Command Hero v1' "$CSS_TARGET"
grep -Fq 'grid-template-columns:repeat(2,minmax(0,1fr))!important' "$CSS_TARGET"
grep -Fq 'var(--v2-wolf)' "$CSS_TARGET"
grep -Fq 'var(--v2-mountain)' "$CSS_TARGET"

echo "LetMeFly Home Command Hero v1 production layer: PASS"
