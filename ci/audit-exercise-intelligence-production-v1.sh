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
SUB_JS="$DIST_DIR/ui/exercise-intelligence-substitutions-v1.js"
SUB_CSS="$DIST_DIR/ui/exercise-intelligence-substitutions-v1.css"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"
EXPECTED_JSON_SHA="b7bef69e9942568c59cc779ac33a2feaceba2e03535df68a0d663a766aedd350"

for required in "$DATA" "$RUNTIME" "$INFO_JS" "$INFO_CSS" "$COACH_JS" "$COACH_CSS" "$SUB_JS" "$SUB_CSS" "$INDEX" "$SW"; do
  test -s "$required"
done

echo "$EXPECTED_JSON_SHA  $DATA" | sha256sum -c -
node --check "$RUNTIME"
node --check "$INFO_JS"
node --check "$COACH_JS"
node --check "$SUB_JS"

DATA="$DATA" node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.DATA, 'utf8'));
if (payload.integrationStatus !== 'READY_FOR_NON_PRESCRIPTION_APP_INTEGRATION') {
  throw new Error('Exercise Intelligence production integration status mismatch');
}
if (payload.counts?.exercises !== 92 || payload.counts?.substitutionRules !== 25) {
  throw new Error('Exercise Intelligence production count mismatch');
}
if (new Set(payload.exercises.map((exercise) => exercise.id)).size !== 92) {
  throw new Error('Exercise Intelligence production exercise IDs are not unique');
}
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
for (const exercise of payload.exercises) {
  const thumbnail = exercise.thumbnail || {};
  if ('driveFileId' in thumbnail || 'driveUrl' in thumbnail) {
    throw new Error(`Private Drive provenance leaked into production payload: ${exercise.id}`);
  }
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

# Set-focus Coach may keep only transient exercise context; it may not become a
# program/substitution/network mutation layer.
grep -Fq 'sessionStorage' "$COACH_JS"
grep -Fq 'PROGRAM PRESCRIPTION LOCKED' "$COACH_JS"
grep -Fq 'SET COACHING CONTEXT' "$COACH_JS"
! grep -Fq 'localStorage' "$COACH_JS"
! grep -Fq 'indexedDB' "$COACH_JS"
! grep -Fq 'getSubstitutions' "$COACH_JS"
! grep -Fq 'data-substitute' "$COACH_JS"
! grep -Fq 'fetch(' "$COACH_JS"

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

echo "LetMeFly final Exercise Intelligence INFO + Coach + substitution production audit: PASS"
