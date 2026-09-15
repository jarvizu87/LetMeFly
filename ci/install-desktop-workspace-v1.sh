#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
RAIL_GUARD_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-aj/desktop-nav-fixed-guard-v1.js"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$RAIL_GUARD_SOURCE"
node --check "$RAIL_GUARD_SOURCE"
grep -Fq "style.setProperty('position', 'fixed', 'important')" "$RAIL_GUARD_SOURCE"
grep -Fq "style.removeProperty('position')" "$RAIL_GUARD_SOURCE"

# The legacy three-column Desktop Workspace is retired. Desktop now uses the
# same approved Train/Home/Coach DOM as mobile/tablet, with responsive CSS.
# Keep only a narrow viewport-state marker plus the independent fixed-nav guard.
mkdir -p "$DIST_DIR/ui"
cat > "$DIST_DIR/ui/desktop-viewport-state-v1.js" <<'JS'
(() => {
  'use strict'
  const media = window.matchMedia('(min-width: 1100px)')
  const sync = () => {
    if (media.matches) document.documentElement.dataset.lmfDesktopUi = 'true'
    else delete document.documentElement.dataset.lmfDesktopUi
  }
  sync()
  if (typeof media.addEventListener === 'function') media.addEventListener('change', sync)
  else if (typeof media.addListener === 'function') media.addListener(sync)
})()
JS
cp "$RAIL_GUARD_SOURCE" "$DIST_DIR/ui/desktop-nav-fixed-guard-v1.js"

# Remove any stale workspace artifacts carried over by a reused build directory.
rm -f \
  "$DIST_DIR/ui/desktop-workspace-v1.js" \
  "$DIST_DIR/ui/desktop-workspace-v1.css" \
  "$DIST_DIR/ui/desktop-workspace-v2-polish.js" \
  "$DIST_DIR/ui/desktop-workspace-v2-polish.css"

DIST_DIR="$DIST_DIR" python3 - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()

# Strip every historical Desktop Workspace tag. This is deliberately idempotent
# so a stale intermediate build cannot resurrect the retired presentation.
legacy = (
    'desktop-workspace-v1.css',
    'desktop-workspace-v1.js',
    'desktop-workspace-v2-polish.css',
    'desktop-workspace-v2-polish.js',
)
for name in legacy:
    text = re.sub(r'\s*<link\b[^>]*href=["\'][^"\']*' + re.escape(name) + r'[^"\']*["\'][^>]*>', '', text, flags=re.I)
    text = re.sub(r'\s*<script\b[^>]*src=["\'][^"\']*' + re.escape(name) + r'[^"\']*["\'][^>]*>\s*</script>', '', text, flags=re.I)

state = '<script defer src="/ui/desktop-viewport-state-v1.js"></script>'
rail = '<script defer src="/ui/desktop-nav-fixed-guard-v1.js"></script>'
if state not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {state}\n</body>', text, count=1, flags=re.I)
if rail not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {rail}\n</body>', text, count=1, flags=re.I)

checks = {
    'single desktop viewport state runtime': text.count('/ui/desktop-viewport-state-v1.js') == 1,
    'single desktop rail guard': text.count('/ui/desktop-nav-fixed-guard-v1.js') == 1,
    'legacy workspace v1 css absent': 'desktop-workspace-v1.css' not in text,
    'legacy workspace v1 js absent': 'desktop-workspace-v1.js' not in text,
    'legacy workspace polish css absent': 'desktop-workspace-v2-polish.css' not in text,
    'legacy workspace polish js absent': 'desktop-workspace-v2-polish.js' not in text,
    'single doctype': len(re.findall(r'<!doctype\s+html[^>]*>', text, re.I)) == 1,
    'single body close': len(re.findall(r'</body>', text, re.I)) == 1,
    'single html close': len(re.findall(r'</html>', text, re.I)) == 1,
}
failed = [label for label, ok in checks.items() if not ok]
if failed:
    raise SystemExit('desktop legacy cutover validation failed: ' + ', '.join(failed))

p.write_text(text.rstrip() + '\n')
PY

node --check "$DIST_DIR/ui/desktop-viewport-state-v1.js"
node --check "$DIST_DIR/ui/desktop-nav-fixed-guard-v1.js"
grep -Fq '/ui/desktop-viewport-state-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/desktop-nav-fixed-guard-v1.js' "$DIST_DIR/index.html"
! grep -Eq 'desktop-workspace-v1|desktop-workspace-v2-polish' "$DIST_DIR/index.html"
test ! -e "$DIST_DIR/ui/desktop-workspace-v1.js"
test ! -e "$DIST_DIR/ui/desktop-workspace-v1.css"
test ! -e "$DIST_DIR/ui/desktop-workspace-v2-polish.js"
test ! -e "$DIST_DIR/ui/desktop-workspace-v2-polish.css"

echo "LetMeFly legacy Desktop Workspace removal + responsive desktop state install: PASS"
