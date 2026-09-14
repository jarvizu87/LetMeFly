#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-am/exercise-image-theme-v1.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-am/exercise-image-theme-v1.js"
SYNC_SRC="$ROOT_DIR/overlays/exercise-intelligence/runtime/exercise-intelligence-art-key-sync-v1.js"
CSS_OUT="$DIST/ui/exercise-image-theme-v1.css"
JS_OUT="$DIST/ui/exercise-image-theme-v1.js"
SYNC_OUT="$DIST/ui/exercise-intelligence-art-key-sync-v1.js"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

for required in "$CSS_SRC" "$JS_SRC" "$SYNC_SRC" "$INDEX" "$SW"; do
  test -s "$required"
done

node --check "$JS_SRC"
node --check "$SYNC_SRC"
! grep -Eq 'indexedDB|localStorage|sessionStorage|supabase|fetch\(' "$JS_SRC"
! grep -Eq 'indexedDB|localStorage|sessionStorage|supabase|fetch\(|\.from\(|\.insert\(|\.update\(|\.delete\(' "$SYNC_SRC"
grep -Fq 'data-exercise-art' "$JS_SRC"
grep -Fq 'thumbnail?.canonicalKey || exercise.id' "$SYNC_SRC"
grep -Fq 'data-exercise-art' "$SYNC_SRC"
grep -Fq 'data-lmf-intel-id' "$SYNC_SRC"
grep -Fq '.library-thumb[data-exercise-art]' "$CSS_SRC"
grep -Fq '.lmf-intel-art' "$CSS_SRC"
grep -Fq '.active-exercise.lmf-workout-flow-card' "$CSS_SRC"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$CSS_OUT"
cp "$JS_SRC" "$JS_OUT"
cp "$SYNC_SRC" "$SYNC_OUT"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/exercise-image-theme-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/exercise-image-theme-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/exercise-intelligence-art-key-sync-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
css = '<link rel="stylesheet" href="/ui/exercise-image-theme-v1.css?v=1">'
js = '<script defer src="/ui/exercise-image-theme-v1.js?v=1"></script>'
sync = '<script defer src="/ui/exercise-intelligence-art-key-sync-v1.js?v=1"></script>'
if '</head>' not in text or '</body>' not in text:
    raise SystemExit('production index missing document boundaries')
text = text.replace('</head>', f'  {css}\n</head>', 1)
# Exercise Intelligence library enhancer is installed before this layer. Keep the
# canonical art-key sync after the theme so existing/program-driven cards are
# normalized only after their governed Exercise Intelligence identity is known.
text = text.replace('</body>', f'  {js}\n  {sync}\n</body>', 1)
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
required = [
    '/ui/exercise-image-theme-v1.css',
    '/ui/exercise-image-theme-v1.js',
    '/ui/exercise-intelligence-art-key-sync-v1.js',
    '/ui/exercise-intelligence-art-key-sync-v1.js?v=1',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/exercise-image-theme-v1.css?v=1' "$INDEX"
grep -Fq '/ui/exercise-image-theme-v1.js?v=1' "$INDEX"
grep -Fq '/ui/exercise-intelligence-art-key-sync-v1.js?v=1' "$INDEX"
grep -Fq "'/ui/exercise-image-theme-v1.css'" "$SW"
grep -Fq "'/ui/exercise-image-theme-v1.js'" "$SW"
grep -Fq "'/ui/exercise-intelligence-art-key-sync-v1.js'" "$SW"
grep -Fq "'/ui/exercise-intelligence-art-key-sync-v1.js?v=1'" "$SW"
node --check "$JS_OUT"
node --check "$SYNC_OUT"

echo "LetMeFly unified exercise image treatment + canonical private-art key sync v1: PASS"