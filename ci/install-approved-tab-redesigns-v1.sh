#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
SOURCE_DIR="$ROOT_DIR/overlays/ui-command-v2/batch-ao"
JS_SOURCE="$SOURCE_DIR/approved-tab-redesigns-v1.js"
CSS_SOURCE="$SOURCE_DIR/approved-tab-redesigns-v1.css"
JS_OUT="$DIST_DIR/ui/approved-tab-redesigns-v1.js"
CSS_OUT="$DIST_DIR/ui/approved-tab-redesigns-v1.css"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"

for required in "$JS_SOURCE" "$CSS_SOURCE" "$INDEX" "$SW"; do
  test -s "$required"
done

node --check "$JS_SOURCE"

# This is a visual/navigation bridge. It must not become a second data or
# program engine and must not replace governed exercise artwork.
! grep -Eq 'localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setItem\(|\.write\(' "$JS_SOURCE"
! grep -Eq 'programInstances|trainingMaxHistory|workoutSessions|personalRecords|bodyweightEntries' "$JS_SOURCE"
! grep -Eq 'background-image:[^;]*exercise-art|url\([^)]*exercise[^)]*\)' "$CSS_SOURCE"
grep -Fq "new Set(['program', 'progress', 'exercises', 'profile'])" "$JS_SOURCE"
grep -Fq 'lmf-approved-program-tabs-v1' "$JS_SOURCE"
grep -Fq 'lmf-progress-worldbar-v1' "$JS_SOURCE"
grep -Fq 'lmf-approved-exercises-layout-v1' "$JS_SOURCE"
grep -Fq 'lmf-profile-character-sheet-v1' "$JS_SOURCE"
grep -Fq 'GOAL TRACKER' "$JS_SOURCE"
grep -Fq '.lmf-profile-v2-avatar{display:none!important}' "$CSS_SOURCE"
grep -Fq "html[data-lmf-approved-route='program']" "$CSS_SOURCE"
grep -Fq '.lmf-approved-progress-v1' "$CSS_SOURCE"
grep -Fq '.lmf-approved-exercises-layout-v1' "$CSS_SOURCE"
grep -Fq '.lmf-profile-character-sheet-v1' "$CSS_SOURCE"
grep -Fq '@media(max-width:720px)' "$CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$JS_OUT"
cp "$CSS_SOURCE" "$CSS_OUT"
node --check "$JS_OUT"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['INDEX'])
text = p.read_text()
css = '<link rel="stylesheet" href="/ui/approved-tab-redesigns-v1.css">'
js = '<script defer src="/ui/approved-tab-redesigns-v1.js"></script>'

if css not in text:
    if not re.search(r'</head>', text, re.I):
        raise SystemExit('index.html is missing </head>')
    text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)
if js not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)

# The approved tab layer is intentionally late in the cascade: it completes
# the locked mockups without changing the earlier feature/data layers.
consistency = '/ui/app-consistency-v1.css'
if consistency in text and text.index(consistency) > text.index('/ui/approved-tab-redesigns-v1.css'):
    raise SystemExit('approved-tab-redesigns-v1.css must load after app-consistency-v1.css')

p.write_text(text.rstrip() + '\n')
PY

SW="$SW" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = ['/ui/approved-tab-redesigns-v1.js','/ui/approved-tab-redesigns-v1.css']
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/approved-tab-redesigns-v1.js' "$INDEX"
grep -Fq '/ui/approved-tab-redesigns-v1.css' "$INDEX"
grep -Fq "'/ui/approved-tab-redesigns-v1.js'" "$SW"
grep -Fq "'/ui/approved-tab-redesigns-v1.css'" "$SW"

echo "LetMeFly approved Program/Progress/Exercises/Profile redesigns v1: PASS"
