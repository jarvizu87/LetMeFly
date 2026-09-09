#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ag/workout-mobile-scroll-v1.css"
CSS_OUT="$DIST/ui/workout-mobile-scroll-v1.css"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"
ASSET_DIR="$DIST/assets"

for required in "$CSS_SRC" "$INDEX" "$SW" "$ASSET_DIR"; do
  test -e "$required"
done

grep -Fq '#swipe-viewport.swipe-viewport' "$CSS_SRC"
grep -Fq 'overflow-x:hidden!important' "$CSS_SRC"
grep -Fq 'scroll-snap-type:none!important' "$CSS_SRC"
grep -Fq '#swipe-viewport .lmf-set-tabs' "$CSS_SRC"
grep -Fq 'scroll-snap-type:x proximity!important' "$CSS_SRC"
grep -Fq 'Tap a section or use arrows' "$CSS_SRC"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$CSS_OUT"

# Keep the accessible/raw DOM copy aligned with the rendered mobile behavior.
# The visual CSS guard already replaces the old text, but screen readers and
# browser audits must not keep receiving the obsolete instruction to swipe.
ASSET_DIR="$ASSET_DIR" python - <<'PY'
from pathlib import Path
import os
asset_dir = Path(os.environ['ASSET_DIR'])
old = 'Swipe or tap a section'
new = 'Tap a section or use arrows'
files = list(asset_dir.glob('*.js'))
if not files:
    raise SystemExit('production JS asset missing')
old_count = 0
new_count = 0
for path in files:
    text = path.read_text()
    count = text.count(old)
    if count:
        old_count += count
        text = text.replace(old, new)
        path.write_text(text)
    new_count += text.count(new)
if old_count == 0 and new_count == 0:
    raise SystemExit('workout section navigation copy not found in production JS')
if old_count > 1:
    raise SystemExit(f'unexpected duplicate workout navigation copy: {old_count}')
PY

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/workout-mobile-scroll-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
marker = '<link rel="stylesheet" href="/ui/workout-mobile-scroll-v1.css?v=1">'
if '</head>' not in text:
    raise SystemExit('production index missing </head>')
text = text.replace('</head>', f'  {marker}\n</head>', 1)
p.write_text(text)
PY

SW="$SW" python - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = ['/ui/workout-mobile-scroll-v1.css']
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/workout-mobile-scroll-v1.css?v=1' "$INDEX"
grep -Fq "'/ui/workout-mobile-scroll-v1.css'" "$SW"
grep -Fq 'overflow-x:hidden!important' "$CSS_OUT"
grep -Fq 'scroll-snap-type:none!important' "$CSS_OUT"
grep -Fq '#swipe-viewport .lmf-set-tabs' "$CSS_OUT"
if grep -R -Fq 'Swipe or tap a section' "$ASSET_DIR"; then
  echo 'obsolete mobile workout swipe copy remains in production JS' >&2
  exit 1
fi
grep -R -Fq 'Tap a section or use arrows' "$ASSET_DIR"

echo "LetMeFly mobile workout vertical-scroll guard: PASS"
