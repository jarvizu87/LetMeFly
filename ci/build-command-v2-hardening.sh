#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

READINESS_PATCH="overlays/ui-command-v2/batch-k/workout-readiness.patch"

# Reconstruct and validate the full locked Command V2 release first.
bash ci/build-command-v2-polish2.sh

test -s "$READINESS_PATCH"

cd .build-src/letmefly_app

# Apply the pre-session hardening only after every prior Command V2 source overlay.
patch --dry-run -p0 < "$ROOT_DIR/$READINESS_PATCH"
patch -p0 < "$ROOT_DIR/$READINESS_PATCH"

# Readiness must be explicit, saved before workout creation, and linked to that session.
grep -Fq "readiness_id: readinessId" src/services/workout-service.ts
grep -Fq "const readiness = await saveReadiness(state.athlete.id, input)" src/main.ts
grep -Fq "readiness.id," src/main.ts
grep -Fq "SAVE READINESS & START WORKOUT" src/main.ts
grep -Fq "Complete readiness before starting" src/main.ts
grep -Fq "UPDATE READINESS" src/main.ts
! grep -Fq "v === 3 ? 'checked' : ''" src/main.ts

# Re-run all protected-boundary audits against the hardened source that will actually ship.
npm run audit:source
npm run audit:crownforge
npm run audit:exercise-library
npm run audit:ui
npm run typecheck
npm run build

test -f dist/index.html
test -f dist/service-worker.js
test -f dist/ui/fenrir.webp
test -f dist/ui/train-lifter.webp
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist
grep -Rq "SAVE READINESS & START WORKOUT" dist/assets
grep -Rq "Complete readiness before starting" dist/assets

echo "LetMeFly Command V2 Monday workout hardening + readiness/session linkage: PASS"
