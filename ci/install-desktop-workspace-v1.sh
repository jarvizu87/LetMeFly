#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v1.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v1.css"
JS_POLISH_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v2-polish.js"
CSS_POLISH_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-workspace-v2-polish.css"
RAIL_GUARD_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-nav-fixed-guard-v1.js"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
test -s "$RAIL_GUARD_SOURCE"
test -s "$JS_POLISH_SOURCE"
test -s "$CSS_POLISH_SOURCE"
node --check "$JS_POLISH_SOURCE"
node --check "$JS_SOURCE"
node --check "$RAIL_GUARD_SOURCE"

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
grep -Fq "style.setProperty('position', 'fixed', 'important')" "$RAIL_GUARD_SOURCE"
grep -Fq "style.removeProperty('position')" "$RAIL_GUARD_SOURCE"
grep -Fq "data-lmf-desktop-ui" "$RAIL_GUARD_SOURCE"

# Desktop v1 must not become a second program/workout engine.
if grep -Eq 'indexedDB\.put|localStorage\.setItem|sessionStorage\.setItem|supabase\.(from|rpc)|fetch\([^)]*(workout|program)|data-action="toggle-set"' "$JS_SOURCE" "$RAIL_GUARD_SOURCE" "$JS_POLISH_SOURCE"; then
  echo "Desktop workspace runtime contains a forbidden persistence/program-write boundary" >&2
  exit 1
fi

grep -Fq 'Presentation-only bridge' "$JS_POLISH_SOURCE"
grep -Fq 'never writes athlete/program data' "$JS_POLISH_SOURCE"
grep -Fq 'data-lmf-desktop-v2-action' "$JS_POLISH_SOURCE"
grep -Fq 'height: clamp(140px, 12vw, 190px)' "$CSS_POLISH_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_POLISH_SOURCE" "$DIST_DIR/ui/desktop-workspace-v2-polish.js"
cp "$CSS_POLISH_SOURCE" "$DIST_DIR/ui/desktop-workspace-v2-polish.css"
cp "$JS_SOURCE" "$DIST_DIR/ui/desktop-workspace-v1.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/desktop-workspace-v1.css"
cp "$RAIL_GUARD_SOURCE" "$DIST_DIR/ui/desktop-nav-fixed-guard-v1.js"

DIST_DIR="$DIST_DIR" python3 - <<'PY'
from pathlib import Path
import os
import re

runtime = Path(os.environ['DIST_DIR']) / 'ui/desktop-workspace-v1.js'
source = runtime.read_text()
boundary = "    if (!(panel instanceof Element) || !(body instanceof Element)) return\n"
assert source.count(boundary) == 1, 'Desktop context ownership boundary moved'
source = source.replace(boundary, boundary + "    if (panel.classList.contains('lmf-desktop-context-panel-v2')) return\n", 1)
runtime.write_text(source)

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
css = '<link rel="stylesheet" href="/ui/desktop-workspace-v1.css">'
js = '<script defer src="/ui/desktop-workspace-v1.js"></script>'
rail_guard = '<script defer src="/ui/desktop-nav-fixed-guard-v1.js"></script>'

if css not in text:
    if not re.search(r'</head>', text, re.I):
        raise SystemExit('index.html is missing </head>')
    text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)

if js not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)

if rail_guard not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {rail_guard}\n</body>', text, count=1, flags=re.I)

polish_css = '<link rel="stylesheet" href="/ui/desktop-workspace-v2-polish.css">'
polish_js = '<script defer src="/ui/desktop-workspace-v2-polish.js"></script>'
if polish_css not in text:
    text = re.sub(r'</head>', lambda _: f'  {polish_css}\n</head>', text, count=1, flags=re.I)
if polish_js not in text:
    text = re.sub(r'</body>', lambda _: f'  {polish_js}\n</body>', text, count=1, flags=re.I)

checks = {
    'single desktop polish stylesheet': text.count('/ui/desktop-workspace-v2-polish.css') == 1,
    'single desktop polish runtime': text.count('/ui/desktop-workspace-v2-polish.js') == 1,
    'polish stylesheet after base': text.index('/ui/desktop-workspace-v2-polish.css') > text.index('/ui/desktop-workspace-v1.css'),
    'polish runtime after base': text.index('/ui/desktop-workspace-v2-polish.js') > text.index('/ui/desktop-workspace-v1.js'),
    'single desktop stylesheet': text.count('/ui/desktop-workspace-v1.css') == 1,
    'single desktop runtime': text.count('/ui/desktop-workspace-v1.js') == 1,
    'single desktop rail guard': text.count('/ui/desktop-nav-fixed-guard-v1.js') == 1,
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
node --check "$DIST_DIR/ui/desktop-nav-fixed-guard-v1.js"
test -s "$DIST_DIR/ui/desktop-workspace-v1.css"
grep -Fq '/ui/desktop-workspace-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/desktop-workspace-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/desktop-nav-fixed-guard-v1.js' "$DIST_DIR/index.html"

echo "LetMeFly Desktop Workspace v1 + fixed rail + desktop tool polish install: PASS"
