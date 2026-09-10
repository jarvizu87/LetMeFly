#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
OVERLAY_DIR="$ROOT_DIR/overlays/exercise-intelligence/runtime"
SOURCE="$OVERLAY_DIR/exercise-intelligence-substitutions-v1.js"
CSS_SOURCE="$OVERLAY_DIR/exercise-intelligence/runtime/exercise-intelligence-substitutions-v1.css"
OUT="$DIST_DIR/ui/exercise-intelligence-substitutions-v1.js"
CSS_OUT="$DIST_DIR/ui/exercise-intelligence-substitutions-v1.css"
SW_FILE="$DIST_DIR/service-worker.js"

if [[ ! -f "$DIST_DIR/index.html" || ! -f "$SW_FILE" ]]; then
  echo "LetMeFly production dist is incomplete: $DIST_DIR" >&2
  exit 1
fi

test -s "$DIST_DIR/data/exercise-intelligence-v1.json"
test -s "$DIST_DIR/ui/exercise-intelligence-runtime-v1.js"
test -s "$SOURCE"
test -s "$CSS_SOURCE"
node --check "$SOURCE"
! grep -Fq 'localStorage' "$SOURCE"
! grep -Fq 'sessionStorage' "$SOURCE"
! grep -Fq 'indexedDB' "$SOURCE"
grep -Fq 'data-substitute' "$SOURCE"
grep -Fq 'getSubstitutions' "$SOURCE"
grep -Fq 'includeBlocked: true' "$SOURCE"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$SOURCE"
grep -Fq 'VIEW ONLY' "$SOURCE"
grep -Fq 'WORKOUT INSTANCE ONLY' "$SOURCE"
grep -Fq 'USE THIS SUBSTITUTE FOR TODAY' "$SOURCE"
grep -Fq 'LetMeFlyWorkoutSubstitutionBridge' "$SOURCE"
! grep -Fq 'data-action="apply' "$SOURCE"
# Full production assemblies contain compiled assets and must expose the narrow
# Workout Mode bridge. The installer's tiny standalone smoke fixture intentionally
# has no compiled asset directory, so source/build audits carry that assertion there.
if [[ -d "$DIST_DIR/assets" ]]; then
  grep -Rq 'LetMeFlyWorkoutSubstitutionBridge' "$DIST_DIR/assets"
fi

mkdir -p "$DIST_DIR/ui"
cp "$SOURCE" "$OUT"
cp "$CSS_SOURCE" "$CSS_OUT"
node --check "$OUT"

INDEX_FILE="$DIST_DIR/index.html"
INDEX_FILE="$INDEX_FILE" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['INDEX_FILE'])
text = p.read_text()
runtime = '<script defer src="/ui/exercise-intelligence-runtime-v1.js"></script>'
css = '<link rel="stylesheet" href="/ui/exercise-intelligence-substitutions-v1.css">'
js = '<script defer src="/ui/exercise-intelligence-substitutions-v1.js"></script>'

if runtime not in text:
    raise SystemExit('Exercise Intelligence runtime must be installed before substitution viewer')
if css not in text:
    if not re.search(r'</head>', text, re.I):
        raise SystemExit('index.html is missing </head>')
    text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)
if js not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)
if text.index(runtime) > text.index(js):
    raise SystemExit('Substitution viewer is ordered before Exercise Intelligence runtime')
p.write_text(text.rstrip() + '\n')
PY

SW_FILE="$SW_FILE" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['SW_FILE'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = [
    '/ui/exercise-intelligence-substitutions-v1.js',
    '/ui/exercise-intelligence-substitutions-v1.css',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/exercise-intelligence-substitutions-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/exercise-intelligence-substitutions-v1.css' "$DIST_DIR/index.html"
grep -Fq "'/ui/exercise-intelligence-substitutions-v1.js'" "$SW_FILE"
grep -Fq "'/ui/exercise-intelligence-substitutions-v1.css'" "$SW_FILE"
grep -Fq 'NOT A DEFAULT SUBSTITUTE' "$OUT"
grep -Fq 'FUTURE LIBRARY CANDIDATES' "$OUT"
grep -Fq 'USE THIS SUBSTITUTE FOR TODAY' "$OUT"
grep -Fq 'WORKOUT INSTANCE ONLY' "$OUT"
grep -Fq '.lmf-sub-modal' "$CSS_OUT"
grep -Fq '.lmf-substitution-active' "$CSS_OUT"
! grep -Fq 'localStorage' "$OUT"
! grep -Fq 'sessionStorage' "$OUT"
! grep -Fq 'indexedDB' "$OUT"

echo "LetMeFly governed Exercise Intelligence workout-scoped substitution viewer: PASS"
