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

# Recording-driven workout persistence fix. The native IndexedDB write already
# succeeds; refresh the visible Session Review from the authoritative reloaded
# workout bundle without rerendering/resetting Workout Mode position.
bash "$ROOT_DIR/ci/apply-workout-review-live-count-v1.sh" "$TARGET"

# Assert the source-level persistence/count boundary before minification. Vite is
# allowed to rename local identifiers such as refreshedStats in the final bundle.
grep -Fq "const refreshedStats = state.workout ? completionStats(state.workout) : null" "$TARGET/src/main.ts"
grep -Fq "Set saved locally\${refreshedStats ? \` • \${refreshedStats.done}/\${refreshedStats.total}\` : ''}" "$TARGET/src/main.ts"

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

test -f dist/index.html
test -f dist/service-worker.js
grep -Rq 'Black Crown Revised' dist/assets
grep -Rq 'Black Crown Revised v2.1' dist/assets
grep -Rq 'Machine Hip Abduction' dist/assets
# User-visible save confirmation must survive minification; local variable names do not.
grep -Rq 'Set saved locally' dist/assets
! grep -Rq 'Black Crown Revised v2.0\.' dist/assets
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

echo "LetMeFly production build with Black Crown v2.1 + Crownforge v2.2 + live workout Review persistence refresh: PASS"