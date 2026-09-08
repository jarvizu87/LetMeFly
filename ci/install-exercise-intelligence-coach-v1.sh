#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
OVERLAY_DIR="$ROOT_DIR/overlays/exercise-intelligence/runtime"
COACH_SOURCE="$OVERLAY_DIR/exercise-intelligence-coach-v1.js"
COACH_CSS_SOURCE="$OVERLAY_DIR/exercise-intelligence-coach-v1.css"
COACH_OUT="$DIST_DIR/ui/exercise-intelligence-coach-v1.js"
COACH_CSS_OUT="$DIST_DIR/ui/exercise-intelligence-coach-v1.css"
SW_FILE="$DIST_DIR/service-worker.js"

if [[ ! -f "$DIST_DIR/index.html" || ! -f "$SW_FILE" ]]; then
  echo "LetMeFly production dist is incomplete: $DIST_DIR" >&2
  exit 1
fi

# This layer depends on the read-only Exercise Intelligence runtime already being installed.
test -s "$DIST_DIR/data/exercise-intelligence-v1.json"
test -s "$DIST_DIR/ui/exercise-intelligence-runtime-v1.js"
test -s "$COACH_SOURCE"
test -s "$COACH_CSS_SOURCE"
node --check "$COACH_SOURCE"
! grep -Fq 'localStorage' "$COACH_SOURCE"
! grep -Fq 'data-substitute' "$COACH_SOURCE"
grep -Fq 'sessionStorage' "$COACH_SOURCE"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$COACH_SOURCE"
grep -Fq 'data-action="go-coach"' "$COACH_SOURCE"
grep -Fq 'focusQuestion' "$COACH_SOURCE"
grep -Fq 'whyQuestion' "$COACH_SOURCE"
grep -Fq 'muscleQuestion' "$COACH_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$COACH_SOURCE" "$COACH_OUT"
cp "$COACH_CSS_SOURCE" "$COACH_CSS_OUT"
node --check "$COACH_OUT"

INDEX_FILE="$DIST_DIR/index.html"
INDEX_FILE="$INDEX_FILE" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['INDEX_FILE'])
text = p.read_text()

runtime = '<script defer src="/ui/exercise-intelligence-runtime-v1.js"></script>'
coach_css = '<link rel="stylesheet" href="/ui/exercise-intelligence-coach-v1.css">'
coach_js = '<script defer src="/ui/exercise-intelligence-coach-v1.js"></script>'

if runtime not in text:
    raise SystemExit('Exercise Intelligence runtime must be installed before Coach integration')

if coach_css not in text:
    if not re.search(r'</head>', text, re.I):
        raise SystemExit('index.html is missing </head>')
    text = re.sub(r'</head>', f'  {coach_css}\n</head>', text, count=1, flags=re.I)

if coach_js not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {coach_js}\n</body>', text, count=1, flags=re.I)

if text.index(runtime) > text.index(coach_js):
    raise SystemExit('Coach integration is ordered before Exercise Intelligence runtime')

p.write_text(text.rstrip() + '\n')
PY

# Descriptive exercise coaching is public-shell knowledge and remains useful offline.
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
    '/ui/exercise-intelligence-coach-v1.js',
    '/ui/exercise-intelligence-coach-v1.css',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/exercise-intelligence-coach-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/exercise-intelligence-coach-v1.css' "$DIST_DIR/index.html"
grep -Fq "'/ui/exercise-intelligence-coach-v1.js'" "$SW_FILE"
grep -Fq "'/ui/exercise-intelligence-coach-v1.css'" "$SW_FILE"
grep -Fq 'EXERCISE COACHING CONTEXT' "$COACH_OUT"
grep -Fq 'Why ' "$COACH_OUT"
grep -Fq 'Muscle Emphasis' "$COACH_OUT"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$COACH_OUT"
grep -Fq '.lmf-coach-intel-context' "$COACH_CSS_OUT"
! grep -Fq 'localStorage' "$COACH_OUT"
! grep -Fq 'data-substitute' "$COACH_OUT"

echo "LetMeFly Exercise Intelligence descriptive Coach integration: PASS"
