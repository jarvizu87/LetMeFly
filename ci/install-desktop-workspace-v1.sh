#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v1.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v1.css"
JS_POLISH_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v2-polish.js"
CSS_POLISH_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v2-polish.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
test -s "$JS_POLISH_SOURCE"
test -s "$CSS_POLISH_SOURCE"
node --check "$JS_SOURCE"
node --check "$JS_POLISH_SOURCE"

grep -Fq "Presentation only" "$JS_SOURCE"
grep -Fq "never writes athlete data" "$JS_SOURCE"
grep -Fq "(min-width: 1100px)" "$JS_SOURCE"
grep -Fq 'data-lmf-desktop-workspace' "$JS_SOURCE"
grep -Fq '#swipe-viewport' "$JS_SOURCE"
grep -Fq '.exercise-stack > .active-exercise' "$JS_SOURCE"
grep -Fq 'data-exercise-art' "$JS_SOURCE"
grep -Fq '@media (min-width: 1100px)' "$CSS_SOURCE"
grep -Fq 'grid-template-columns: minmax(230px, .78fr) minmax(500px, 1.55fr) minmax(260px, .88fr)' "$CSS_SOURCE"
grep -Fq '.lmf-desktop-flow-panel' "$CSS_SOURCE"
grep -Fq '.lmf-desktop-context-panel' "$CSS_SOURCE"
grep -Fq 'html[data-lmf-desktop-ui="true"] .navbar' "$CSS_SOURCE"

grep -Fq "Presentation-only bridge" "$JS_POLISH_SOURCE"
grep -Fq "never writes athlete/program data" "$JS_POLISH_SOURCE"
grep -Fq 'data-lmf-desktop-v2-action' "$JS_POLISH_SOURCE"
grep -Fq '.lmf-desktop-context-panel-v2' "$CSS_POLISH_SOURCE"
grep -Fq 'height: clamp(140px, 12vw, 190px)' "$CSS_POLISH_SOURCE"

# Desktop presentation layers must not become a second program/workout engine.
for source in "$JS_SOURCE" "$JS_POLISH_SOURCE"; do
  if grep -Eq 'indexedDB\.put|localStorage\.setItem|sessionStorage\.setItem|supabase\.(from|rpc)|fetch\([^)]*(workout|program)|data-action="toggle-set"' "$source"; then
    echo "Desktop workspace runtime contains a forbidden persistence/program-write boundary: $source" >&2
    exit 1
  fi
done

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/desktop-workspace-v1.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/desktop-workspace-v1.css"
cp "$JS_POLISH_SOURCE" "$DIST_DIR/ui/desktop-workspace-v2-polish.js"
cp "$CSS_POLISH_SOURCE" "$DIST_DIR/ui/desktop-workspace-v2-polish.css"

DIST_DIR="$DIST_DIR" python3 - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
css_v1 = '<link rel="stylesheet" href="/ui/desktop-workspace-v1.css">'
css_v2 = '<link rel="stylesheet" href="/ui/desktop-workspace-v2-polish.css">'
js_v1 = '<script defer src="/ui/desktop-workspace-v1.js"></script>'
js_v2 = '<script defer src="/ui/desktop-workspace-v2-polish.js"></script>'

for css in (css_v1, css_v2):
    if css not in text:
        if not re.search(r'</head>', text, re.I):
            raise SystemExit('index.html is missing </head>')
        text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)

for js in (js_v1, js_v2):
    if js not in text:
        if not re.search(r'</body>', text, re.I):
            raise SystemExit('index.html is missing </body>')
        text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)

checks = {
    'single desktop v1 stylesheet': text.count('/ui/desktop-workspace-v1.css') == 1,
    'single desktop v2 stylesheet': text.count('/ui/desktop-workspace-v2-polish.css') == 1,
    'single desktop v1 runtime': text.count('/ui/desktop-workspace-v1.js') == 1,
    'single desktop v2 runtime': text.count('/ui/desktop-workspace-v2-polish.js') == 1,
    'desktop v2 css after v1': text.index('/ui/desktop-workspace-v2-polish.css') > text.index('/ui/desktop-workspace-v1.css'),
    'desktop v2 js after v1': text.index('/ui/desktop-workspace-v2-polish.js') > text.index('/ui/desktop-workspace-v1.js'),
    'single doctype': len(re.findall(r'<!doctype\s+html[^>]*>', text, re.I)) == 1,
    'single body close': len(re.findall(r'</body>', text, re.I)) == 1,
    'single html close': len(re.findall(r'</html>', text, re.I)) == 1,
}
failed = [label for label, ok in checks.items() if not ok]
if failed:
    raise SystemExit('desktop workspace install validation failed: ' + ', '.join(failed))

p.write_text(text.rstrip() + '\n')
PY

node --check "$DIST_DIR/ui/desktop-workspace-v1.js"
node --check "$DIST_DIR/ui/desktop-workspace-v2-polish.js"
test -s "$DIST_DIR/ui/desktop-workspace-v1.css"
test -s "$DIST_DIR/ui/desktop-workspace-v2-polish.css"
grep -Fq '/ui/desktop-workspace-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/desktop-workspace-v2-polish.css' "$DIST_DIR/index.html"
grep -Fq '/ui/desktop-workspace-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/desktop-workspace-v2-polish.js' "$DIST_DIR/index.html"

echo "LetMeFly Desktop Workspace v1 + v2 polish install: PASS"
