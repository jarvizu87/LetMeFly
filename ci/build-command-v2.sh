#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARCHIVE="source/LETMEFLY_REBUILT_SOURCE_V5_4_UI_COMMAND_B4.zip"
EXPECTED_ARCHIVE_SHA="514c538a9442d5c12c534a914f79c7f1988f2a416077b72bc5e9fafbd4ef89d4"
EXPECTED_PATCH_SHA="264f3e3b89129bc843846c097c34b726d14021a3811220a88d0c3a3ee2d1258b"
EXPECTED_CSS_SHA="219ec0496bc66c003a36e8fdf86ff9296dcf58afe4568cc38f6e5fcbce3990db"
EXPECTED_ASSET_CSS_SHA="459c32d9a367a0bf01e9ca322667fc3e167cf134f707da368abce5459ee8a17b"

PATCH_FILE="$(mktemp)"
CSS_FILE="$(mktemp)"
ASSET_CSS_FILE="$(mktemp)"
trap 'rm -f "$PATCH_FILE" "$CSS_FILE" "$ASSET_CSS_FILE"' EXIT

# Reconstruct the immutable audited V5.4 base.
test -f "$ARCHIVE"
test "$(stat -c%s "$ARCHIVE")" = "154947"
echo "$EXPECTED_ARCHIVE_SHA  $ARCHIVE" | sha256sum -c -
unzip -tq "$ARCHIVE"
rm -rf .build-src
mkdir -p .build-src
unzip -q "$ARCHIVE" -d .build-src
test -f .build-src/letmefly_app/package.json
(
  cd .build-src/letmefly_app
  sha256sum -c MANIFEST.sha256
)

# Reconstruct Command V2 presentation from transport-safe text chunks.
cat overlays/ui-command-v2/command-v2.patch.* > "$PATCH_FILE"
cat overlays/ui-command-v2/command-v2.css.* > "$CSS_FILE"
cat overlays/ui-command-v2/assets6/command-v2-assets.css.* > "$ASSET_CSS_FILE"
echo "$EXPECTED_PATCH_SHA  $PATCH_FILE" | sha256sum -c -
echo "$EXPECTED_CSS_SHA  $CSS_FILE" | sha256sum -c -
echo "$EXPECTED_ASSET_CSS_SHA  $ASSET_CSS_FILE" | sha256sum -c -

test "$(wc -c < "$ASSET_CSS_FILE")" = "53990"

cd .build-src/letmefly_app
patch --dry-run -p0 < "$PATCH_FILE"
patch -p0 < "$PATCH_FILE"
cp "$CSS_FILE" src/command-v2.css
cat "$ASSET_CSS_FILE" >> src/command-v2.css

# Full governed-source and UI release gates.
npm install --no-audit --no-fund
npm run audit:source
npm run audit:crownforge
npm run audit:exercise-library
npm run audit:ui
npm run typecheck
npm run build

# Production artifact checks.
test -f dist/index.html
test -f dist/manifest.webmanifest
test -f dist/service-worker.js
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

grep -Fq "letmefly-shell-v5-4-command-v2-1" dist/service-worker.js
grep -Rq "data:image/webp;base64" dist/assets

echo "LetMeFly Command V2 build: PASS"
