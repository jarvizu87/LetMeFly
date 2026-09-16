#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
INDEX="$DIST/index.html"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aw/workout-prescription-input-hydration-v1.js"
JS_DST="$DIST/ui/workout-prescription-input-hydration-v1.js"

if [[ ! -d "$DIST" || ! -s "$INDEX" ]]; then
  echo "LetMeFly production dist is missing: $DIST" >&2
  exit 1
fi

test -s "$JS_SRC"
node --check "$JS_SRC"

# This layer may seed only blank unfinished logging controls from prescription data
# already rendered on the card. It must never write program/history/private storage.
! grep -Eq 'indexedDB\.|localStorage\.setItem|sessionStorage\.setItem|supabase|workoutSets\.(put|add)|programInstances|trainingMaxHistory|fetch\(' "$JS_SRC"
grep -Fq 'isDone(row)' "$JS_SRC"
grep -Fq 'isUserEdited(input)' "$JS_SRC"
grep -Fq 'programmedLoadDefault' "$JS_SRC"
grep -Fq 'programmedLoad' "$JS_SRC"
grep -Fq 'data-lmf-prescription-hydrated' "$JS_SRC" || grep -Fq 'lmfPrescriptionHydrated' "$JS_SRC"
grep -Fq '__LMF_WORKOUT_PRESCRIPTION_INPUT_HYDRATION_V1__' "$JS_SRC"

mkdir -p "$DIST/ui"
cp "$JS_SRC" "$JS_DST"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<script defer src="/ui/workout-prescription-input-hydration-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
tag = '<script defer src="/ui/workout-prescription-input-hydration-v1.js?v=1"></script>'
logging = re.search(r'<script defer src="/ui/workout-logging-v2\.js(?:\?v=\d+)?"></script>', text)
if logging:
    text = text[:logging.end()] + '\n  ' + tag + text[logging.end():]
elif '</body>' in text:
    text = text.replace('</body>', f'  {tag}\n</body>', 1)
else:
    raise SystemExit('production index is missing </body>')
p.write_text(text)
PY

grep -Fq '/ui/workout-prescription-input-hydration-v1.js?v=1' "$INDEX"
node --check "$JS_DST"

echo "LetMeFly governed workout prescription -> logging-input hydration: PASS"
