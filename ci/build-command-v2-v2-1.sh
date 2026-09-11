#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT_DIR/.build-src/letmefly_app"

# Reconstruct the current hardened production source, then apply the two
# intentional program amendments as governed final program layers:
# Black Crown Revised v2.1 first, then Crownforge v2.2.
bash "$ROOT_DIR/ci/build-command-v2-cloudinary.sh"
bash "$ROOT_DIR/ci/apply-black-crown-v2-1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-black-crown-v2-1-ui.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-crownforge-v2-2.sh" "$TARGET"

# Issue #50: preserve structured round execution, immutable prescription display,
# metric-aware logging targets, and per-set load prescription signatures after
# the final governed program layers have landed. This does not migrate or rewrite
# completed athlete history.
bash "$ROOT_DIR/ci/apply-workout-prescription-fidelity-v1.sh" "$TARGET"
# Normalize the generated TypeScript block before any downstream overlays/typecheck.
# This companion step keeps regex/newline escaping deterministic across the legacy
# source-reconstruction patch mechanism without changing the governed behavior.
bash "$ROOT_DIR/ci/normalize-workout-prescription-fidelity-source-v1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-workout-metric-layout-v1.sh" "$TARGET"
node "$ROOT_DIR/ci/audit-workout-prescription-fidelity-v1.mjs" "$TARGET"

# Issue #54: governed "Use This Substitute for Today" behavior. The first layer
# installs workout-only apply/revert persistence; the second completes structured
# load governance, reason/safety context, previous-performance lookup, and the
# equipment-aware profile-enrichment path. The history-lock layer makes performed
# substitute identity immutable once a set has actually been logged.
bash "$ROOT_DIR/ci/apply-workout-substitution-today-v1.sh" "$TARGET"
bash "$ROOT_DIR/ci/normalize-workout-substitution-governance-v1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-workout-substitution-today-v2.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-workout-substitution-history-lock-v1.sh" "$TARGET"
node "$ROOT_DIR/ci/audit-workout-substitution-today-v1.mjs" "$TARGET"

# Supabase's hosted default email sends a magic link unless custom SMTP allows
# the project template to be changed to a numeric OTP. Consume the PKCE callback
# in-app so authenticated private sync works with either supported email mode.
bash "$ROOT_DIR/ci/apply-magic-link-auth-v1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-cloud-bootstrap-v2.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-conflict-recovery-v1.sh" "$TARGET"

# The foundational mobile build must already have isolated set-tab centering
# from page-level vertical scroll. Program overlays may not regress that runtime.
grep -Fq "tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })" "$TARGET/public/ui/workout-flow-v1.js"
! grep -Fq "activeTab.scrollIntoView" "$TARGET/public/ui/workout-flow-v1.js"

# Recording-driven workout persistence fix. The native IndexedDB write already
# succeeds; refresh the visible Session Review from the authoritative reloaded
# workout bundle without rerendering/resetting Workout Mode position.
bash "$ROOT_DIR/ci/apply-workout-review-live-count-v1.sh" "$TARGET"

# Issues #57-59, discovered by #53: preserve all-or-nothing substitutions and
# reject overlapping stale database writes. No program or athlete-data migration.
bash "$ROOT_DIR/ci/apply-native-database-boundaries-v1.sh" "$TARGET"
# Issue #53: persist completion intent and recover it through governed progression.
bash "$ROOT_DIR/ci/apply-workout-completion-recovery-v1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-profile-context-v1.sh" "$TARGET"

# Assert the source-level persistence/count boundary before minification. Vite is
# allowed to rename local identifiers such as refreshedStats in the final bundle.
grep -Fq "const refreshedStats = state.workout ? completionStats(state.workout) : null" "$TARGET/src/main.ts"
grep -Fq "Set saved locally\${refreshedStats ? \` • \${refreshedStats.done}/\${refreshedStats.total}\` : ''}" "$TARGET/src/main.ts"
grep -Fq "await supabase.auth.exchangeCodeForSession(code)" "$TARGET/src/auth/auth-service.ts"
grep -Fq "LetMeFlyWorkoutSubstitutionBridge" "$TARGET/src/main.ts"
grep -Fq "getSubstitutions?.(governedPrimaryKey, { includeBlocked: true })" "$TARGET/src/main.ts"
grep -Fq "substituted_from_exercise_key: prescribedKey" "$TARGET/src/services/workout-service.ts"
grep -Fq "updateSubstitutionEquipmentProfile" "$TARGET/src/services/athlete-service.ts"
grep -Fq "previousExercisePerformance" "$TARGET/src/services/workout-service.ts"
grep -Fq "substitutionPerformanceLoggedAt" "$TARGET/src/services/workout-service.ts"

cd "$TARGET"
npm run audit:source
npm run audit:crownforge
npm run audit:exercise-library
npm run audit:ui
npm run typecheck
npm run build

node "$ROOT_DIR/ci/audit-black-crown-runtime.mjs" "$TARGET"
node "$ROOT_DIR/ci/audit-black-crown-v2-1.mjs" "$TARGET"
node "$ROOT_DIR/ci/audit-crownforge-v2-2.mjs" "$TARGET"
node "$ROOT_DIR/ci/audit-workout-substitution-today-v1.mjs" "$TARGET"

test -f dist/index.html
test -f dist/service-worker.js
grep -Rq 'Black Crown Revised' dist/assets
grep -Rq 'Black Crown Revised v2.1' dist/assets
grep -Rq 'Machine Hip Abduction' dist/assets
# User-visible save confirmation must survive minification; local variable names do not.
grep -Rq 'Set saved locally' dist/assets
grep -Rq 'Using .* for this workout only\|for this workout only' dist/assets
grep -Rq 'Confirm equipment availability before applying this substitute' dist/assets
grep -Rq 'Completed substitute work cannot be relabeled' dist/assets
grep -Fq "tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })" dist/ui/workout-flow-v1.js
! grep -Fq "activeTab.scrollIntoView" dist/ui/workout-flow-v1.js
! grep -Rq 'Black Crown Revised v2.0\.' dist/assets
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

echo "LetMeFly production build with Black Crown v2.1 + Crownforge v2.2 + Issue #50 workout fidelity + Issue #54 governed workout substitutions + live Review persistence refresh + vertical-scroll isolation: PASS"
