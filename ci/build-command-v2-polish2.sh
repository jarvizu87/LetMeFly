#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATCH="overlays/ui-command-v2/batch-f/release-polish.patch"
CSS="overlays/ui-command-v2/batch-f/release-polish.css"
EXPECTED_PATCH_SHA="a032822402c18a2860516a27fda7fc00160678b8a67a36b9d84b91c74398067e"
EXPECTED_CSS_SHA="a54b68b994a19fcc7049081d7fe7927f354eb20464d0f33740f2dcd08a50b657"

# First reconstruct and validate the already-proven Command V2 release.
bash ci/build-command-v2.sh

# Then apply the small release-polish delta to that exact audited source.
echo "$EXPECTED_PATCH_SHA  $PATCH" | sha256sum -c -
echo "$EXPECTED_CSS_SHA  $CSS" | sha256sum -c -
test "$(wc -c < "$PATCH")" = "5321"
test "$(wc -c < "$CSS")" = "4616"

cd .build-src/letmefly_app
patch --dry-run -p0 < "$ROOT_DIR/$PATCH"
patch -p0 < "$ROOT_DIR/$PATCH"
cat "$ROOT_DIR/$CSS" >> src/command-v2.css

# Re-run every source/program/UI gate against the polished source.
npm run audit:source
npm run audit:crownforge
npm run audit:exercise-library
npm run audit:ui
npm run typecheck
npm run build

# Release-polish assertions.
test -f dist/index.html
test -f dist/service-worker.js
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist
! grep -Fq "35 + ((index * 13)" src/main.ts
grep -Rq "program-governed-details" dist/assets
grep -Rq "No session" dist/assets
grep -Rq "readiness-field" dist/assets

echo "LetMeFly Command V2 Galaxy release polish: PASS"
