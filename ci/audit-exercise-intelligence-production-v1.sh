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

node --check "$RUNTIME"
node --check "$INFO_JS"
node --check "$COACH_JS"
node --check "$COACH_SUB_JS"
node --check "$SUB_JS"

# Exercise Intelligence v1 is immutable at 92/25. A governed program supplement may
# extend the descriptive payload, but only through an explicitly recognized schema.
DATA="$DATA" BASE_JSON_SHA="$BASE_JSON_SHA" RUNTIME="$RUNTIME" node - <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const payload = JSON.parse(fs.readFileSync(process.env.DATA, 'utf8'));
const raw = fs.readFileSync(process.env.DATA);
const runtime = fs.readFileSync(process.env.RUNTIME, 'utf8');

if (payload.integrationStatus !== 'READY_FOR_NON_PRESCRIPTION_APP_INTEGRATION') {
  throw new Error('Exercise Intelligence production integration status mismatch');
}

const schema = payload.schemaVersion || '1.0';
const ids = new Set(payload.exercises.map((exercise) => exercise.id));
const blocked = payload.substitutionRules
  .filter((rule) => rule.promotionStatus === 'DO NOT DEFAULT')
  .map((rule) => `${rule.primaryExerciseId}->${rule.alternativeExerciseId}`)
  .sort();
const expectedBlocked = [
  'overhead-press->push-press',
  'romanian-deadlift->hamstring-curl',
].sort();
if (JSON.stringify(blocked) !== JSON.stringify(expectedBlocked)) {
  throw new Error(`Exercise Intelligence protected substitutions changed: ${blocked.join(', ')}`);
}

if (schema === '1.1-black-crown-v2-1') {
  if (payload.counts?.exercises !== 94 || payload.counts?.substitutionRules !== 27) {
    throw new Error(`Black Crown v2.1 Exercise Intelligence count mismatch: ${JSON.stringify(payload.counts)}`);
  }
  if (ids.size !== 94) {
    throw new Error('Black Crown v2.1 Exercise Intelligence exercise IDs are not unique');
  }
  const supplements = payload.bookInformedSupplements || [];
  if (supplements.length !== 1 || supplements[0] !== 'black-crown-v2-1-lateral-glute') {
    throw new Error(`Unexpected Exercise Intelligence supplement set: ${JSON.stringify(supplements)}`);
  }
  for (const required of ['machine-hip-abduction', 'seated-band-hip-abduction', 'mini-band-lateral-walk']) {
    if (!ids.has(required)) throw new Error(`Missing governed Black Crown v2.1 exercise: ${required}`);
  }
  const machineRules = payload.substitutionRules
    .filter((rule) => rule.primaryExerciseId === 'machine-hip-abduction')
    .map((rule) => rule.alternativeExerciseId)
    .sort();
  const expectedMachineRules = ['mini-band-lateral-walk', 'seated-band-hip-abduction'].sort();
  if (JSON.stringify(machineRules) !== JSON.stringify(expectedMachineRules)) {
    throw new Error(`Machine Hip Abduction fallback hierarchy changed: ${machineRules.join(', ')}`);
  }
  if (!runtime.includes('94/27')) {
    throw new Error('Exercise Intelligence runtime is not synchronized to Black Crown v2.1 94/27 catalog');
  }
  console.log('Exercise Intelligence governed Black Crown v2.1 supplement: PASS (94/27)');
} else {
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  if (digest !== process.env.BASE_JSON_SHA) {
    throw new Error(`Exercise Intelligence base payload digest changed: ${digest}`);
  }
  if (payload.counts?.exercises !== 92 || payload.counts?.substitutionRules !== 25) {
    throw new Error('Exercise Intelligence production count mismatch');
  }
  if (ids.size !== 92) {
    throw new Error('Exercise Intelligence production exercise IDs are not unique');
  }
  if ((payload.bookInformedSupplements || []).length) {
    throw new Error('Base Exercise Intelligence payload unexpectedly declares supplements');
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
for (const forbidden of ['drive.google.com', 'service_role', 'DATABASE_PASSWORD']) {
  if (serialized.includes(forbidden)) throw new Error(`Forbidden Exercise Intelligence production value: ${forbidden}`);
}
console.log('Exercise Intelligence final payload governance: PASS');
NODE

# Final shell must retain every descriptive runtime layer after all later installers.
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

# All Exercise Intelligence public-shell resources must remain offline-capable.
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

# INFO is descriptive only.
grep -Fq 'data-exercise-info' "$INFO_JS"
grep -Fq 'PROGRAM SAFETY' "$INFO_JS"
! grep -Fq 'data-substitute' "$INFO_JS"
! grep -Fq 'localStorage' "$INFO_JS"
! grep -Fq 'sessionStorage' "$INFO_JS"
! grep -Fq 'indexedDB' "$INFO_JS"

# Exercise-aware Coach may keep only transient exercise context; it may not become
# a program/substitution/network mutation layer.
grep -Fq 'sessionStorage' "$COACH_JS"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$COACH_JS"
grep -Fq 'EXERCISE COACHING CONTEXT' "$COACH_JS"
grep -Fq 'focusQuestion' "$COACH_JS"
grep -Fq 'whyQuestion' "$COACH_JS"
grep -Fq 'muscleQuestion' "$COACH_JS"
grep -Fq 'The exact reason it appears in today’s slot' "$COACH_JS"
! grep -Fq 'localStorage' "$COACH_JS"
! grep -Fq 'indexedDB' "$COACH_JS"
! grep -Fq 'getSubstitutions' "$COACH_JS"
! grep -Fq 'data-substitute' "$COACH_JS"
! grep -Fq 'fetch(' "$COACH_JS"

# Coach substitution guidance may read governed substitution rules and the same
# transient exercise context, but may never apply or persist a workout change.
grep -Fq 'getSubstitutions' "$COACH_SUB_JS"
grep -Fq 'includeBlocked: true' "$COACH_SUB_JS"
grep -Fq 'GOVERNED SUBSTITUTIONS • VIEW ONLY' "$COACH_SUB_JS"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$COACH_SUB_JS"
grep -Fq 'sessionStorage' "$COACH_SUB_JS"
! grep -Fq 'localStorage' "$COACH_SUB_JS"
! grep -Fq 'indexedDB' "$COACH_SUB_JS"
! grep -Fq 'data-action="apply' "$COACH_SUB_JS"
! grep -Fq 'fetch(' "$COACH_SUB_JS"

# Substitution UI is an explanation viewer, never an auto-apply engine.
grep -Fq 'ROLE-PRESERVING SUBSTITUTION GUIDE • VIEW ONLY' "$SUB_JS"
grep -Fq 'includeBlocked: true' "$SUB_JS"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$SUB_JS"
grep -Fq 'NOT A DEFAULT SUBSTITUTE' "$SUB_JS"
! grep -Fq 'localStorage' "$SUB_JS"
! grep -Fq 'sessionStorage' "$SUB_JS"
! grep -Fq 'indexedDB' "$SUB_JS"
! grep -Fq 'data-action="apply' "$SUB_JS"

# Program packages must remain the declared authority in the public runtime.
grep -Fq 'program-packages-only' "$RUNTIME"

echo "LetMeFly final Exercise Intelligence INFO + descriptive Coach + Coach substitution + substitution viewer production audit: PASS"
