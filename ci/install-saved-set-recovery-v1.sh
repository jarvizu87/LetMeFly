#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-af/saved-set-controls-v1.js"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-af/saved-set-controls-v1.css"
JS_OUT="$DIST/ui/saved-set-controls-v1.js"
CSS_OUT="$DIST/ui/saved-set-controls-v1.css"

for required in "$INDEX" "$SW" "$JS_SRC" "$CSS_SRC"; do
  test -s "$required" || { echo "Missing saved-set recovery asset: $required" >&2; exit 1; }
done

node --check "$JS_SRC"
grep -Fq "edit: 'Edit'" "$JS_SRC"
grep -Fq "undo: 'Undo'" "$JS_SRC"
grep -Fq "restore: 'Restore'" "$JS_SRC"
grep -Fq 'button.dataset.lmfSavedSetAction = action' "$JS_SRC"
grep -Fq '.set-check[data-action="toggle-set"]' "$JS_SRC"
grep -Fq 'nativeSetToggle' "$JS_SRC"
grep -Fq 'const recovery = new Map()' "$JS_SRC"
! grep -Eq 'indexedDB|localStorage|sessionStorage|supabase|fetch\(|\.put\(|\.add\(' "$JS_SRC"

mkdir -p "$DIST/ui"
cp "$JS_SRC" "$JS_OUT"
cp "$CSS_SRC" "$CSS_OUT"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/saved-set-controls-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/saved-set-controls-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
css = '<link rel="stylesheet" href="/ui/saved-set-controls-v1.css?v=1">'
js = '<script defer src="/ui/saved-set-controls-v1.js?v=1"></script>'
if '</head>' not in text or '</body>' not in text:
    raise SystemExit('production index is missing document boundaries')
text = text.replace('</head>', f'  {css}\n</head>', 1)
text = text.replace('</body>', f'  {js}\n</body>', 1)
workout = '/ui/workout-logging-v2.js?v=2'
if workout not in text:
    raise SystemExit('Workout Logging v2 must be installed before saved-set recovery')
if text.index(workout) > text.index('/ui/saved-set-controls-v1.js?v=1'):
    raise SystemExit('Saved-set recovery must load after Workout Logging v2')
p.write_text(text)
PY

SW="$SW" python3 - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = [
    '/ui/saved-set-controls-v1.js?v=1',
    '/ui/saved-set-controls-v1.css?v=1',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

bash "$ROOT_DIR/ci/audit-saved-set-controls-production-v1.sh" "$DIST"
echo "LetMeFly saved-set Edit + Undo + Restore recovery install: PASS"
