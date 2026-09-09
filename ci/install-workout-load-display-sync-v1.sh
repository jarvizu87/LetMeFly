#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ai/workout-load-display-sync-v1.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ai/workout-load-display-sync-v1.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
node --check "$JS_SOURCE"

grep -Fq "Never writes workout/program prescription data" "$JS_SOURCE"
grep -Fq "data-lmf-live-load" "$CSS_SOURCE"
grep -Fq "closest" "$JS_SOURCE"
grep -Fq "per side:" "$JS_SOURCE"
grep -Fq "min-width: 0 !important" "$CSS_SOURCE"
grep -Fq "font-size: clamp(20px, 5.7vw, 24px)" "$CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/workout-load-display-sync-v1.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/workout-load-display-sync-v1.css"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
css = '<link rel="stylesheet" href="/ui/workout-load-display-sync-v1.css">'
js = '<script defer src="/ui/workout-load-display-sync-v1.js"></script>'

if css not in text:
    if '</head>' not in text.lower():
        raise SystemExit('index.html is missing </head>')
    text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)

if js not in text:
    if '</body>' not in text.lower():
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)

checks = {
    'single sync stylesheet': text.count('/ui/workout-load-display-sync-v1.css') == 1,
    'single sync runtime': text.count('/ui/workout-load-display-sync-v1.js') == 1,
    'single doctype': len(re.findall(r'<!doctype\s+html[^>]*>', text, re.I)) == 1,
    'single body close': len(re.findall(r'</body>', text, re.I)) == 1,
    'single html close': len(re.findall(r'</html>', text, re.I)) == 1,
}
failed = [label for label, ok in checks.items() if not ok]
if failed:
    raise SystemExit('workout load display install validation failed: ' + ', '.join(failed))

p.write_text(text.rstrip() + '\n')
PY

node --check "$DIST_DIR/ui/workout-load-display-sync-v1.js"
test -s "$DIST_DIR/ui/workout-load-display-sync-v1.css"
grep -Fq '/ui/workout-load-display-sync-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/workout-load-display-sync-v1.js' "$DIST_DIR/index.html"
grep -Fq 'data-lmf-live-load' "$DIST_DIR/ui/workout-load-display-sync-v1.css"
grep -Fq 'per side:' "$DIST_DIR/ui/workout-load-display-sync-v1.js"

echo "LetMeFly mobile load legibility + live inline bar-load sync: PASS"
