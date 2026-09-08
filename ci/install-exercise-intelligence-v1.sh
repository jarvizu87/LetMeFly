#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
OVERLAY_DIR="$ROOT_DIR/overlays/exercise-intelligence"
RUNTIME_SOURCE="$OVERLAY_DIR/runtime/exercise-intelligence-runtime-v1.js"
DATA_OUT="$DIST_DIR/data/exercise-intelligence-v1.json"
RUNTIME_OUT="$DIST_DIR/ui/exercise-intelligence-runtime-v1.js"
EXPECTED_JSON_SHA="b7bef69e9942568c59cc779ac33a2feaceba2e03535df68a0d663a766aedd350"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$RUNTIME_SOURCE"
node --check "$RUNTIME_SOURCE"
bash "$ROOT_DIR/ci/verify-exercise-intelligence.sh"

mkdir -p "$DIST_DIR/data" "$DIST_DIR/ui"
node "$OVERLAY_DIR/materialize.mjs" --output="$DATA_OUT"
echo "$EXPECTED_JSON_SHA  $DATA_OUT" | sha256sum -c -
cp "$RUNTIME_SOURCE" "$RUNTIME_OUT"
node --check "$RUNTIME_OUT"

DATA_OUT="$DATA_OUT" node - <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.env.DATA_OUT, 'utf8'));
if (data.integrationStatus !== 'READY_FOR_NON_PRESCRIPTION_APP_INTEGRATION') {
  throw new Error('Exercise Intelligence integration status mismatch');
}
if (data.counts.exercises !== 92 || data.counts.substitutionRules !== 25) {
  throw new Error('Exercise Intelligence record-count mismatch');
}
if (!Array.isArray(data.exercises) || data.exercises.length !== 92) {
  throw new Error('Exercise Intelligence exercise array mismatch');
}
const ids = new Set(data.exercises.map((exercise) => exercise.id));
if (ids.size !== 92) throw new Error('Exercise Intelligence duplicate exercise IDs');
for (const exercise of data.exercises) {
  const thumbnail = exercise.thumbnail || {};
  if ('driveFileId' in thumbnail || 'driveUrl' in thumbnail) {
    throw new Error(`Private thumbnail provenance leaked into runtime payload: ${exercise.id}`);
  }
}
const blocked = data.substitutionRules.filter((rule) => String(rule.promotionStatus || '').startsWith('DO NOT'));
if (blocked.length !== 2) throw new Error(`Expected 2 default-blocked substitutions, found ${blocked.length}`);
console.log('Exercise Intelligence runtime data privacy + boundary audit: PASS');
NODE

INDEX_FILE="$DIST_DIR/index.html"
INDEX_FILE="$INDEX_FILE" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['INDEX_FILE'])
text = p.read_text()
marker = '<script defer src="/ui/exercise-intelligence-runtime-v1.js"></script>'
if marker not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {marker}\n</body>', text, count=1, flags=re.I)
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/exercise-intelligence-runtime-v1.js' "$DIST_DIR/index.html"
grep -Fq 'READY_FOR_NON_PRESCRIPTION_APP_INTEGRATION' "$DATA_OUT"
grep -Fq 'program-packages-only' "$RUNTIME_OUT"
grep -Fq 'getPromotableSubstitutions' "$RUNTIME_OUT"
! grep -Fq 'drive.google.com' "$DATA_OUT"
! grep -Fq 'driveFileId' "$DATA_OUT"
! grep -Fq 'driveUrl' "$DATA_OUT"

echo "LetMeFly Exercise Intelligence v1 read-only runtime install: PASS"
