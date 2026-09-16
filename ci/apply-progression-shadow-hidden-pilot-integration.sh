#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

MAIN="$TARGET/src/main.ts"
AUTHORITY="$TARGET/src/services/program-progression-service.ts"
MANIFEST="$TARGET/src/services/progression-shadow-hidden-pilot-manifest.ts"
CHECKSUM="$TARGET/PROGRESSION_SHADOW_HIDDEN_PILOT_AUTHORITY.sha256"

required=(
  "$MAIN"
  "$AUTHORITY"
  "$TARGET/src/services/progression-shadow-pilot.ts"
  "$TARGET/src/services/progression-shadow-review-engine.ts"
  "$TARGET/src/services/progression-shadow-read-adapter.ts"
  "$TARGET/src/services/progression-shadow-pilot-journal.ts"
  "$TARGET/src/services/progression-shadow-provenance-review.ts"
  "$TARGET/src/services/progression-shadow-pilot-operations.ts"
  "$TARGET/src/services/progression-shadow-restore-authorization.ts"
)
for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Hidden Pilot Integration requires prior green Shadow runtime: missing $file" >&2
    exit 1
  fi
done

before_authority="$(sha256sum "$AUTHORITY" | awk '{print $1}')"

# This manifest is deliberately inert. It makes the hidden-pilot integration
# contract machine-readable without adding UI, network calls, training authority,
# operator authorization, or any new automatic action to workout completion.
cat > "$MANIFEST" <<'TS'
/**
 * LetMeFly Progression Shadow — Hidden Real-Workout Pilot Integration.
 *
 * Candidate-only integration contract. The only automatic path is the already
 * audited post-completion evidence capture. Human review and every operational
 * or authorization action remain explicit/manual. This module has no side effects.
 */
export const progressionShadowHiddenPilotManifest = Object.freeze({
  schemaVersion: 'lmf.progression.shadow.hidden-pilot-integration.current.v1' as const,
  mode: 'hidden-real-workout-pilot-candidate' as const,
  candidateOnly: true as const,
  canonicalTrainingAuthority: 'program-progression-service' as const,
  automaticCapture: Object.freeze([
    'completed-workout-evidence',
    'original-hook-receipt',
    'original-hook-provenance',
  ] as const),
  manualOnly: Object.freeze([
    'human-review',
    'review-disposition',
    'replacement-link',
    'audit-export',
    'audit-restore',
    'operator-authorization',
  ] as const),
  visibilityEnabled: false as const,
  autoApplyAllowed: false as const,
  gamificationEnabled: false as const,
  networkAccessAdded: false as const,
  canonicalWritesAdded: false as const,
  programMutationAdded: false as const,
})
TS

after_authority="$(sha256sum "$AUTHORITY" | awk '{print $1}')"
if [[ "$before_authority" != "$after_authority" ]]; then
  echo "Hidden Pilot Integration changed authoritative program progression source" >&2
  exit 1
fi
printf '%s\n' "$after_authority" > "$CHECKSUM"

# The real-workout automatic boundary must already exist before this integration
# contract is accepted. These calls are observational and remain inside fail-open
# handling between canonical completion and authoritative program progression.
grep -Fq "await completeWorkout(state.athlete.id, completedSessionId)" "$MAIN"
grep -Fq "progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)" "$MAIN"
grep -Fq "progressionShadowRecordOriginalHookReceipt(shadowReview)" "$MAIN"
grep -Fq "progressionShadowRecordOriginalHookProvenance(shadowReview, shadowReceipt)" "$MAIN"
grep -Fq "await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)" "$MAIN"

echo "LetMeFly Progression Shadow hidden real-workout pilot integration boundary: APPLIED"
