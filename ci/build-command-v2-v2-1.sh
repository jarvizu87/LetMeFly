#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT_DIR/.build-src/letmefly_app"

# Reconstruct the current hardened production source exactly as before, then
# apply the intentional Black Crown v2.1 program amendment as a final program
# layer before the production package is rebuilt.
bash "$ROOT_DIR/ci/build-command-v2-cloudinary.sh"
bash "$ROOT_DIR/ci/apply-black-crown-v2-1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-black-crown-v2-1-ui.sh" "$TARGET"

cd "$TARGET"
npm run audit:source
npm run audit:crownforge
npm run audit:exercise-library
npm run audit:ui
npm run typecheck
npm run build

node "$ROOT_DIR/ci/audit-black-crown-runtime.mjs" "$TARGET"
node "$ROOT_DIR/ci/audit-black-crown-v2-1.mjs" "$TARGET"

test -f dist/index.html
test -f dist/service-worker.js
grep -Rq 'Black Crown Revised' dist/assets
grep -Rq 'Black Crown Revised v2.1' dist/assets
grep -Rq 'Machine Hip Abduction' dist/assets
! grep -Rq 'Black Crown Revised v2.0\.' dist/assets
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

echo "LetMeFly production build with Black Crown v2.1: PASS"
