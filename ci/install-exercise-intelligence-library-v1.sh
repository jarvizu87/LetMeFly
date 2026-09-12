#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
SOURCE_DIR="$ROOT_DIR/overlays/exercise-intelligence/runtime"
LIB_SOURCE="$SOURCE_DIR/exercise-intelligence-library-v1.js"
LIB_CSS_SOURCE="$SOURCE_DIR/exercise-intelligence-library-v1.css"
LIB_OUT="$DIST_DIR/ui/exercise-intelligence-library-v1.js"
LIB_CSS_OUT="$DIST_DIR/ui/exercise-intelligence-library-v1.css"
DATA="$DIST_DIR/data/exercise-intelligence-v1.json"
RUNTIME="$DIST_DIR/ui/exercise-intelligence-runtime-v1.js"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"

for required in "$DATA" "$RUNTIME" "$INDEX" "$SW" "$LIB_SOURCE" "$LIB_CSS_SOURCE"; do
  test -s "$required"
done

node --check "$LIB_SOURCE"
grep -Fq 'FULL GOVERNED CATALOG' "$LIB_SOURCE"
grep -Fq 'data-lmf-intel-added' "$LIB_SOURCE"
grep -Fq 'data-lmf-intel-watch' "$LIB_SOURCE"
grep -Fq 'getAllExercises' "$LIB_SOURCE"
grep -Fq 'getSubstitutions' "$LIB_SOURCE"
grep -Fq 'program packages remain prescription authority' "$LIB_SOURCE"
! grep -Fq 'localStorage' "$LIB_SOURCE"
! grep -Fq 'sessionStorage' "$LIB_SOURCE"
! grep -Fq 'indexedDB' "$LIB_SOURCE"
! grep -Fq 'fetch(' "$LIB_SOURCE"
! grep -Fq 'data-action="apply' "$LIB_SOURCE"

# The full catalog enhancer belongs after all governed Exercise Intelligence supplements.
DATA="$DATA" node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.DATA, 'utf8'));
if (payload.schemaVersion !== '1.3-program-name-coverage') {
  throw new Error(`Full catalog requires final governed program-name Exercise Intelligence schema, got ${payload.schemaVersion}`);
}
const expected = {
  exercises: 112,
  substitutionRules: 27,
  roleCoverage: 112,
  coachingCoverage: 112,
  readyForReview: 112,
};
for (const [key, value] of Object.entries(expected)) {
  if (payload.counts?.[key] !== value) throw new Error(`Full catalog count mismatch ${key}: ${payload.counts?.[key]} != ${value}`);
}
if (JSON.stringify(payload.activeProgramCoverageSupplements || []) !== JSON.stringify(['active-program-coverage-v1'])) {
  throw new Error(`Full catalog active-program coverage marker mismatch: ${JSON.stringify(payload.activeProgramCoverageSupplements)}`);
}
if (JSON.stringify(payload.programNameCoverageSupplements || []) !== JSON.stringify(['program-name-coverage-v1'])) {
  throw new Error(`Full catalog program-name coverage marker mismatch: ${JSON.stringify(payload.programNameCoverageSupplements)}`);
}
if ((payload.compoundProgramDisplayNames || []).length !== 20) {
  throw new Error(`Full catalog program-owned choice label count mismatch: ${payload.compoundProgramDisplayNames?.length}`);
}
if ((payload.programControlDisplayNames || []).length !== 7) {
  throw new Error(`Full catalog program-control/rest label count mismatch: ${payload.programControlDisplayNames?.length}`);
}
console.log('Full Exercise Intelligence catalog prerequisite: PASS (112/27, complete governed program-name coverage)');
NODE

mkdir -p "$DIST_DIR/ui"
cp "$LIB_SOURCE" "$LIB_OUT"
cp "$LIB_CSS_SOURCE" "$LIB_CSS_OUT"
node --check "$LIB_OUT"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['INDEX'])
text = p.read_text()
runtime = '<script defer src="/ui/exercise-intelligence-runtime-v1.js"></script>'
css = '<link rel="stylesheet" href="/ui/exercise-intelligence-library-v1.css">'
js = '<script defer src="/ui/exercise-intelligence-library-v1.js"></script>'

if runtime not in text:
    raise SystemExit('Exercise Intelligence runtime must be installed before full catalog enhancer')
if css not in text:
    if not re.search(r'</head>', text, re.I):
        raise SystemExit('index.html is missing </head>')
    text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)
if js not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)
if text.index(runtime) > text.index(js):
    raise SystemExit('Full catalog enhancer is ordered before Exercise Intelligence runtime')
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
required = [
    '/ui/exercise-intelligence-library-v1.js',
    '/ui/exercise-intelligence-library-v1.css',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/exercise-intelligence-library-v1.js' "$INDEX"
grep -Fq '/ui/exercise-intelligence-library-v1.css' "$INDEX"
grep -Fq "'/ui/exercise-intelligence-library-v1.js'" "$SW"
grep -Fq "'/ui/exercise-intelligence-library-v1.css'" "$SW"
grep -Fq 'FULL GOVERNED CATALOG' "$LIB_OUT"
grep -Fq 'data-lmf-intel-added' "$LIB_OUT"
grep -Fq 'data-lmf-intel-watch' "$LIB_OUT"
! grep -Fq 'localStorage' "$LIB_OUT"
! grep -Fq 'sessionStorage' "$LIB_OUT"
! grep -Fq 'indexedDB' "$LIB_OUT"
! grep -Fq 'fetch(' "$LIB_OUT"

# Keep the existing approved exercise art but give Train/library/detail surfaces
# one consistent LetMeFly black/steel/purple treatment. This layer is presentation-only.
bash "$ROOT_DIR/ci/install-exercise-image-theme-v1.sh" "$DIST_DIR"

echo "LetMeFly full governed Exercise Intelligence catalog enhancer: PASS (112 canonical exercises)"
