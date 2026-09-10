#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-v1.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-v1.js"
MOUNTAIN_SRC="$ROOT_DIR/overlays/ui-command-v2/static/mountain-foundation.svg"
CSS_OUT="$DIST/ui/home-main-option1-v1.css"
JS_OUT="$DIST/ui/home-main-option1-v1.js"
MOUNTAIN_OUT="$DIST/ui/home-mountain-foundation-v1.svg"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

for required in "$CSS_SRC" "$JS_SRC" "$MOUNTAIN_SRC" "$INDEX" "$SW"; do
  test -s "$required" || { echo "Missing Option 1 Home dependency: $required" >&2; exit 1; }
done

node --check "$JS_SRC"
grep -Fq 'Approved Option 1 Command layout' "$CSS_SRC"
grep -Fq '.lmf-home-option1-progress' "$CSS_SRC"
grep -Fq "grid-template-areas:'readiness performance' 'milestone coach'" "$CSS_SRC"
grep -Fq 'home-mountain-foundation-v1.svg' "$CSS_SRC"
grep -Fq 'letmefly-logo-display-512.png' "$CSS_SRC"
grep -Fq "const HOME_CLASS = 'lmf-home-ref3-active'" "$JS_SRC"
grep -Fq 'ensureProgress' "$JS_SRC"
! grep -Eq 'localStorage\.setItem|indexedDB\.(open|deleteDatabase)|workoutSessions.*put|programInstances.*put|fetch\(' "$JS_SRC"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$CSS_OUT"
cp "$JS_SRC" "$JS_OUT"
cp "$MOUNTAIN_SRC" "$MOUNTAIN_OUT"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/home-main-option1-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/home-main-option1-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
css = '<link rel="stylesheet" href="/ui/home-main-option1-v1.css?v=1">'
js = '<script defer src="/ui/home-main-option1-v1.js?v=1"></script>'
if '</head>' not in text or '</body>' not in text:
    raise SystemExit('production index missing document anchors')
text = text.replace('</head>', f'  {css}\n</head>', 1)
text = text.replace('</body>', f'  {js}\n</body>', 1)
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
    '/ui/home-main-option1-v1.css',
    '/ui/home-main-option1-v1.js',
    '/ui/home-mountain-foundation-v1.svg',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

node --check "$JS_OUT"
test -s "$CSS_OUT"
test -s "$MOUNTAIN_OUT"
grep -Fq '/ui/home-main-option1-v1.css?v=1' "$INDEX"
grep -Fq '/ui/home-main-option1-v1.js?v=1' "$INDEX"
grep -Fq "'/ui/home-main-option1-v1.css'" "$SW"
grep -Fq "'/ui/home-main-option1-v1.js'" "$SW"
grep -Fq "'/ui/home-mountain-foundation-v1.svg'" "$SW"

echo "LetMeFly approved Option 1 Home install: PASS"
