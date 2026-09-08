#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT_DIR/.build-src/letmefly_app"

# Reconstruct the current hardened production source, then apply the two
# intentional program amendments as governed final program layers:
# Black Crown Revised v2.1 first, then Crownforge v2.2. The ordering lets each
# amendment verify the other program remains protected at its official version.
bash "$ROOT_DIR/ci/build-command-v2-cloudinary.sh"
bash "$ROOT_DIR/ci/apply-black-crown-v2-1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-black-crown-v2-1-ui.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-crownforge-v2-2.sh" "$TARGET"

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
grep -Rq 'Crownforge v2.2' dist/assets
! grep -Rq 'Black Crown Revised v2.0\.' dist/assets
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

echo "LetMeFly production build with Black Crown v2.1 + Crownforge v2.2: PASS"
