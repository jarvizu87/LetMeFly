#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
DATA="$DIST_DIR/data/exercise-intelligence-v1.json"
RUNTIME="$DIST_DIR/ui/exercise-intelligence-runtime-v1.js"
INFO_JS="$DIST_DIR/ui/exercise-intelligence-ui-v1.js"
INFO_CSS="$DIST_DIR/ui/exercise-intelligence-ui-v1.css"
COACH_JS="$DIST_DIR/ui/exercise-intelligence-coach-v1.js"
COACH_CSS="$DIST_DIR/ui/exercise-intelligence-coach-v1.css"
COACH_SUB_JS="$DIST_DIR/ui/exercise-intelligence-coach-substitutions-v1.js"
COACH_SUB_CSS="$DIST_DIR/ui/exercise-intelligence-coach-substitutions-v1.css"
SUB_JS="$DIST_DIR/ui/exercise-intelligence-substitutions-v1.js"
SUB_CSS="$DIST_DIR/ui/exercise-intelligence-substitutions-v1.css"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"
BASE_JSON_SHA="b7bef69e9942568c59cc779ac33a2feaceba2e03535df68a0d663a766aedd350"

for required in "$DATA" "$RUNTIME" "$INFO_JS" "$INFO_CSS" "$COACH_JS" "$COACH_CSS" "$COACH_SUB_JS" "$COACH_SUB_CSS" "$SUB_JS" "$SUB_CSS" "$INDEX" "$SW"; do
  test -s "$required"
done

for js in "$RUNTIME" "$INFO_JS" "$COACH_JS" "$COACH_SUB_JS" "$SUB_JS"; do
  node --check "$js"
done

DATA="$DATA" BASE_JSON_SHA="$BASE_JSON_SHA" RUNTIME="$RUNTIME" node - <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const payload = JSON.parse(fs.readFileSync(process.env.DATA, 'utf8'));
const raw = fs.readFileSync(process.env.DATA);
const runtime = fs.readFileSync(process.env.RUNTIME, 'utf8');

if (payload.integrationStatus !== 'READY_FOR_NON_PRESCRIPTION_APP_INTEGRATION') {
  throw new Error('Exercise Intelligence production integration status mismatch');
}
if (!Array.isArray(payload.exercises) || !Array.isArray(payload.substitutionRules)) {
  throw new Error('Exercise Intelligence production payload shape mismatch');
}

const ids = new Set(payload.exercises.map((exercise) => exercise.id));
if (ids.size !== payload.exercises.length) throw new Error('Duplicate Exercise Intelligence exercise IDs');

const blocked = payload.substitutionRules
  .filter((rule) => rule.promotionStatus === 'DO NOT DEFAULT')
  .map((rule) => `${rule.primaryExerciseId}->${rule.alternativeExerciseId}`)
  .sort();
const expectedBlocked = [
  'overhead-press->push-press',
  'romanian-deadlift->hamstring-curl',
].sort();
if (JSON.stringify(blocked) !== JSON.stringify(expectedBlocked)) {
  throw new Error(`Protected substitutions changed: ${blocked.join(', ')}`);
}

const computed = {
  exercises: payload.exercises.length,
  substitutionRules: payload.substitutionRules.length,
  roleCoverage: payload.exercises.filter((exercise) => Array.isArray(exercise.movementRoles) && exercise.movementRoles.length).length,
  coachingCoverage: payload.exercises.filter((exercise) =>
    Boolean(exercise.purpose) && Array.isArray(exercise.coachingCues) && exercise.coachingCues.length &&
    Array.isArray(exercise.commonMistakes) && exercise.commonMistakes.length
  ).length,
  readyForReview: payload.exercises.filter((exercise) => exercise.reviewStatus === 'READY FOR REVIEW').length,
};
for (const [key, value] of Object.entries(computed)) {
  if (payload.counts?.[key] !== value) {
    throw new Error(`Exercise Intelligence ${key} metadata is stale: ${payload.counts?.[key]} != ${value}`);
  }
}

function expectCounts(expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (payload.counts?.[key] !== value) throw new Error(`${label} ${key} mismatch: ${payload.counts?.[key]} != ${value}`);
  }
}

function assertBlackCrownV21() {
  if (JSON.stringify(payload.bookInformedSupplements || []) !== JSON.stringify(['black-crown-v2-1-lateral-glute'])) {
    throw new Error(`Black Crown v2.1 supplement marker changed: ${JSON.stringify(payload.bookInformedSupplements)}`);
  }
  for (const id of ['machine-hip-abduction', 'seated-band-hip-abduction', 'mini-band-lateral-walk']) {
    if (!ids.has(id)) throw new Error(`Missing governed Black Crown v2.1 exercise: ${id}`);
  }
  for (const id of ['machine-hip-abduction', 'seated-band-hip-abduction']) {
    const exercise = payload.exercises.find((item) => item.id === id);
    if (!exercise?.trainingCategory || 'trainingCategories' in exercise) throw new Error(`Black Crown v2.1 schema mismatch: ${id}`);
    if (exercise.reviewStatus !== 'READY FOR REVIEW') throw new Error(`Black Crown v2.1 exercise not review-ready: ${id}`);
    if (exercise?.demo?.currentStatus !== 'direct-verified') throw new Error(`Black Crown v2.1 demo not direct-verified: ${id}`);
    if (!String(exercise?.demo?.currentUrl || '').startsWith('https://www.youtube.com/watch?v=')) {
      throw new Error(`Black Crown v2.1 demo not a direct watch URL: ${id}`);
    }
    if (exercise?.demo?.candidateRequiresValidation !== false) throw new Error(`Black Crown v2.1 demo validation flag mismatch: ${id}`);
  }
  const machineRules = payload.substitutionRules
    .filter((rule) => rule.primaryExerciseId === 'machine-hip-abduction')
    .map((rule) => rule.alternativeExerciseId)
    .sort();
  const expectedMachineRules = ['mini-band-lateral-walk', 'seated-band-hip-abduction'].sort();
  if (JSON.stringify(machineRules) !== JSON.stringify(expectedMachineRules)) {
    throw new Error(`Machine Hip Abduction fallback hierarchy changed: ${machineRules.join(', ')}`);
  }
}

const schema = payload.schemaVersion || '1.0';
if (schema === '1.2-active-program-coverage') {
  expectCounts({ exercises: 108, substitutionRules: 27, roleCoverage: 108, coachingCoverage: 108, readyForReview: 108 }, 'Active-program coverage');
  assertBlackCrownV21();

  if (JSON.stringify(payload.activeProgramCoverageSupplements || []) !== JSON.stringify(['active-program-coverage-v1'])) {
    throw new Error(`Active-program supplement marker mismatch: ${JSON.stringify(payload.activeProgramCoverageSupplements)}`);
  }
  const requiredActive = [
    '90-90-hip-mobility', 'box-jump', 'box-squat', 'broad-jump', 'explosive-push-up',
    'finger-extension', 'hip-airplane', 'kb-dead-stop-swing', 'medicine-ball-chest-pass',
    'rack-pull', 'reverse-lunge', 'snatch-grip-rdl', 'sorenson-hold', 'trap-3-raise',
  ];
  for (const id of requiredActive) {
    const exercise = payload.exercises.find((item) => item.id === id);
    if (!exercise) throw new Error(`Missing active-program Exercise Intelligence record: ${id}`);
    if (!exercise.trainingCategory || !exercise.purpose || !exercise.movementRoles?.length ||
        !exercise.coachingCues?.length || !exercise.commonMistakes?.length ||
        exercise.reviewStatus !== 'READY FOR REVIEW') {
      throw new Error(`Incomplete active-program Exercise Intelligence record: ${id}`);
    }
    if (exercise?.demo?.currentStatus !== 'search-fallback' ||
        !String(exercise?.demo?.currentUrl || '').startsWith('https://www.youtube.com/results?search_query=') ||
        exercise?.demo?.candidateRequiresValidation !== false) {
      throw new Error(`Active-program demo governance mismatch: ${id}`);
    }
  }

  const expectedCompounds = [
    'Bike / Incline Walk', 'Bike / Row / Walk', 'Bike / Walk', 'Bike or Walk', 'Walk or Bike',
    'Dead Bug or Hollow Hold', 'Front Squat + Bench Ramp Sets',
    'KB Lateral Clean or Outside Swing to Rack', 'Pull-Up or Lat Pulldown',
    'Reverse Crunch or Dead Bug', 'Wide or Neutral Pulldown', 'Curl', 'Pushdown',
  ];
  if (JSON.stringify(payload.compoundProgramDisplayNames || []) !== JSON.stringify(expectedCompounds)) {
    throw new Error('Compound program display-name governance mismatch');
  }
  if (!runtime.includes('108/27')) throw new Error('Exercise Intelligence runtime does not support active-program 108/27 payload');
  console.log('Exercise Intelligence active-program coverage: PASS (108/27 with 108 full coverage)');
} else if (schema === '1.1-black-crown-v2-1') {
  expectCounts({ exercises: 94, substitutionRules: 27, roleCoverage: 94, coachingCoverage: 94, readyForReview: 94 }, 'Black Crown v2.1');
  assertBlackCrownV21();
  if (!runtime.includes('94/27')) throw new Error('Exercise Intelligence runtime does not support Black Crown v2.1 94/27 payload');
  console.log('Exercise Intelligence governed Black Crown v2.1 supplement: PASS (94/27)');
} else {
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  if (digest !== process.env.BASE_JSON_SHA) throw new Error(`Exercise Intelligence base payload digest changed: ${digest}`);
  expectCounts({ exercises: 92, substitutionRules: 25, roleCoverage: 92, coachingCoverage: 92, readyForReview: 92 }, 'Immutable base');
  if ((payload.bookInformedSupplements || []).length || (payload.activeProgramCoverageSupplements || []).length) {
    throw new Error('Base Exercise Intelligence unexpectedly declares supplements');
  }
  console.log('Exercise Intelligence immutable base payload: PASS (92/25)');
}

for (const exercise of payload.exercises) {
  const thumbnail = exercise.thumbnail || {};
  if ('driveFileId' in thumbnail || 'driveUrl' in thumbnail) {
    throw new Error(`Private Drive provenance leaked into production payload: ${exercise.id}`);
  }
}
const serialized = JSON.stringify(payload);
for (const forbidden of ['drive.google.com', 'driveFileId', 'driveUrl', 'service_role', 'DATABASE_PASSWORD']) {
  if (serialized.includes(forbidden)) throw new Error(`Forbidden Exercise Intelligence production value: ${forbidden}`);
}
console.log('Exercise Intelligence final payload governance: PASS');
NODE

for marker in \
  '/ui/exercise-intelligence-runtime-v1.js' \
  '/ui/exercise-intelligence-ui-v1.js' \
  '/ui/exercise-intelligence-ui-v1.css' \
  '/ui/exercise-intelligence-coach-v1.js' \
  '/ui/exercise-intelligence-coach-v1.css' \
  '/ui/exercise-intelligence-coach-substitutions-v1.js' \
  '/ui/exercise-intelligence-coach-substitutions-v1.css' \
  '/ui/exercise-intelligence-substitutions-v1.js' \
  '/ui/exercise-intelligence-substitutions-v1.css'
do
  grep -Fq "$marker" "$INDEX"
done

for marker in \
  "'/data/exercise-intelligence-v1.json'" \
  "'/ui/exercise-intelligence-runtime-v1.js'" \
  "'/ui/exercise-intelligence-ui-v1.js'" \
  "'/ui/exercise-intelligence-ui-v1.css'" \
  "'/ui/exercise-intelligence-coach-v1.js'" \
  "'/ui/exercise-intelligence-coach-v1.css'" \
  "'/ui/exercise-intelligence-coach-substitutions-v1.js'" \
  "'/ui/exercise-intelligence-coach-substitutions-v1.css'" \
  "'/ui/exercise-intelligence-substitutions-v1.js'" \
  "'/ui/exercise-intelligence-substitutions-v1.css'"
do
  grep -Fq "$marker" "$SW"
done

grep -Fq 'function isPrivateOrAuth' "$SW"
grep -Fq "hostname.endsWith('.supabase.co')" "$SW"

grep -Fq 'data-exercise-info' "$INFO_JS"
grep -Fq 'PROGRAM SAFETY' "$INFO_JS"
! grep -Fq 'data-substitute' "$INFO_JS"
! grep -Fq 'localStorage' "$INFO_JS"
! grep -Fq 'sessionStorage' "$INFO_JS"
! grep -Fq 'indexedDB' "$INFO_JS"

grep -Fq 'sessionStorage' "$COACH_JS"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$COACH_JS"
grep -Fq 'EXERCISE COACHING CONTEXT' "$COACH_JS"
! grep -Fq 'localStorage' "$COACH_JS"
! grep -Fq 'indexedDB' "$COACH_JS"
! grep -Fq 'getSubstitutions' "$COACH_JS"
! grep -Fq 'data-substitute' "$COACH_JS"
! grep -Fq 'fetch(' "$COACH_JS"

grep -Fq 'getSubstitutions' "$COACH_SUB_JS"
grep -Fq 'includeBlocked: true' "$COACH_SUB_JS"
grep -Fq 'GOVERNED SUBSTITUTIONS • VIEW ONLY' "$COACH_SUB_JS"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$COACH_SUB_JS"
grep -Fq 'sessionStorage' "$COACH_SUB_JS"
! grep -Fq 'localStorage' "$COACH_SUB_JS"
! grep -Fq 'indexedDB' "$COACH_SUB_JS"
! grep -Fq 'data-action="apply' "$COACH_SUB_JS"
! grep -Fq 'fetch(' "$COACH_SUB_JS"

grep -Fq 'ROLE-PRESERVING SUBSTITUTION GUIDE • VIEW ONLY' "$SUB_JS"
grep -Fq 'includeBlocked: true' "$SUB_JS"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$SUB_JS"
grep -Fq 'NOT A DEFAULT SUBSTITUTE' "$SUB_JS"
! grep -Fq 'localStorage' "$SUB_JS"
! grep -Fq 'sessionStorage' "$SUB_JS"
! grep -Fq 'indexedDB' "$SUB_JS"
! grep -Fq 'data-action="apply' "$SUB_JS"

grep -Fq 'program-packages-only' "$RUNTIME"
echo "LetMeFly final Exercise Intelligence INFO + Coach + substitution production audit: PASS"
