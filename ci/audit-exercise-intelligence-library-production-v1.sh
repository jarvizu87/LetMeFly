#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
DATA="$DIST_DIR/data/exercise-intelligence-v1.json"
LIB_JS="$DIST_DIR/ui/exercise-intelligence-library-v1.js"
LIB_CSS="$DIST_DIR/ui/exercise-intelligence-library-v1.css"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"

for required in "$DATA" "$LIB_JS" "$LIB_CSS" "$INDEX" "$SW"; do
  test -s "$required"
done

node --check "$LIB_JS"

DATA="$DATA" node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.DATA, 'utf8'));
if (payload.schemaVersion !== '1.3-program-name-coverage') {
  throw new Error(`Full catalog final audit requires program-name coverage schema, got ${payload.schemaVersion}`);
}
const expected = {
  exercises: 112,
  substitutionRules: 27,
  roleCoverage: 112,
  coachingCoverage: 112,
  readyForReview: 112,
};
for (const [key, value] of Object.entries(expected)) {
  if (payload.counts?.[key] !== value) throw new Error(`Full catalog final count mismatch ${key}: ${payload.counts?.[key]} != ${value}`);
}
if (payload.exercises.length !== 112 || new Set(payload.exercises.map((exercise) => exercise.id)).size !== 112) {
  throw new Error('Full catalog final exercise identity audit failed');
}
const required = [
  'machine-hip-abduction', 'seated-band-hip-abduction',
  '90-90-hip-mobility', 'box-jump', 'box-squat', 'broad-jump', 'explosive-push-up',
  'finger-extension', 'hip-airplane', 'kb-dead-stop-swing', 'medicine-ball-chest-pass',
  'rack-pull', 'reverse-lunge', 'snatch-grip-rdl', 'sorenson-hold', 'trap-3-raise',
  'cable-pull-through', 'pause-bench-press', 'hip-opener', 'relaxed-breathing',
];
for (const id of required) {
  if (!payload.exercises.some((exercise) => exercise.id === id)) throw new Error(`Full catalog missing ${id}`);
}
if (JSON.stringify(payload.activeProgramCoverageSupplements || []) !== JSON.stringify(['active-program-coverage-v1'])) {
  throw new Error('Full catalog active-program coverage marker mismatch');
}
if (JSON.stringify(payload.programNameCoverageSupplements || []) !== JSON.stringify(['program-name-coverage-v1'])) {
  throw new Error('Full catalog program-name coverage marker mismatch');
}
if (!Array.isArray(payload.compoundProgramDisplayNames) || payload.compoundProgramDisplayNames.length !== 20) {
  throw new Error('Full catalog program-owned choice/ambiguity label governance mismatch');
}
if (!Array.isArray(payload.programControlDisplayNames) || payload.programControlDisplayNames.length !== 7) {
  throw new Error('Full catalog program-control/rest label governance mismatch');
}
console.log('Full governed catalog runtime data: PASS (112 canonical exercises / 20 program-owned choice labels / 7 control-rest labels)');
NODE

grep -Fq '/ui/exercise-intelligence-library-v1.js' "$INDEX"
grep -Fq '/ui/exercise-intelligence-library-v1.css' "$INDEX"
grep -Fq "'/ui/exercise-intelligence-library-v1.js'" "$SW"
grep -Fq "'/ui/exercise-intelligence-library-v1.css'" "$SW"

grep -Fq 'FULL GOVERNED CATALOG' "$LIB_JS"
grep -Fq 'getAllExercises' "$LIB_JS"
grep -Fq 'getSubstitutions' "$LIB_JS"
grep -Fq 'data-lmf-intel-added' "$LIB_JS"
grep -Fq 'data-lmf-intel-watch' "$LIB_JS"
grep -Fq 'visible library entries' "$LIB_JS"
grep -Fq 'programmed aliases remain visible' "$LIB_JS"
grep -Fq 'const artKey = exercise?.thumbnail?.canonicalKey || exercise.id' "$LIB_JS"
grep -Fq 'data-exercise-art="${esc(artKey)}"' "$LIB_JS"
grep -Fq "['machine', 'Machine']" "$LIB_JS"
grep -Fq "['band', 'Band']" "$LIB_JS"
grep -Fq "['olympic', 'Olympic']" "$LIB_JS"
grep -Fq 'program packages remain prescription authority' "$LIB_JS"

! grep -Fq 'localStorage' "$LIB_JS"
! grep -Fq 'sessionStorage' "$LIB_JS"
! grep -Fq 'indexedDB' "$LIB_JS"
! grep -Fq 'fetch(' "$LIB_JS"
! grep -Fq 'data-action="apply' "$LIB_JS"
! grep -Fq 'data-action="swap' "$LIB_JS"

grep -Fq "const existing = [...library.querySelectorAll('[data-library-card]')]" "$LIB_JS"
grep -Fq 'existing.forEach((card) => enrichExistingCard' "$LIB_JS"
grep -Fq 'const missing = all.filter' "$LIB_JS"
! grep -Fq 'library.innerHTML =' "$LIB_JS"

echo "LetMeFly final full governed Exercise Intelligence catalog audit: PASS (112 canonical exercises)"
