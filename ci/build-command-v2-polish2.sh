#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATCH="overlays/ui-command-v2/batch-f/release-polish.patch"
CSS="overlays/ui-command-v2/batch-f/release-polish.css"
CLEAN_CSS="overlays/ui-command-v2/batch-g/clean-assets.css"
EXPECTED_PATCH_SHA="a032822402c18a2860516a27fda7fc00160678b8a67a36b9d84b91c74398067e"
EXPECTED_CSS_SHA="a54b68b994a19fcc7049081d7fe7927f354eb20464d0f33740f2dcd08a50b657"
EXPECTED_CLEAN_CSS_SHA="582bcc46f36d96089441c835ae57d76a47ddb4dfd45954993763c1d1af1acc96"

FENRIR_SHA="89c81acc45311a59859b413bb2fbf8327099a1aa119b29cd6c6287eab9533295"
LIFTER_SHA="023c89110d4359df81341604c483a124b2f5f3c2104d4c9e01110b6ff2838791"
FOUNDATION_SHA="da683a4cb04804856b5b35151b0f1e3cb10e9056d4e58f25207eb8e78ea6b013"
VOLUME_SHA="b3a78e34d8b5364be0bea1c0fa7d9c86a9c9868dfbcc3ed1cf47fb573d1faa1d"

# First reconstruct and validate the already-proven Command V2 release.
bash ci/build-command-v2.sh

# Then apply the small release-polish delta to that exact audited source.
echo "$EXPECTED_PATCH_SHA  $PATCH" | sha256sum -c -
echo "$EXPECTED_CSS_SHA  $CSS" | sha256sum -c -
echo "$EXPECTED_CLEAN_CSS_SHA  $CLEAN_CSS" | sha256sum -c -
test "$(wc -c < "$PATCH")" = "5321"
test "$(wc -c < "$CSS")" = "4616"
test "$(wc -c < "$CLEAN_CSS")" = "378"

cd .build-src/letmefly_app
patch --dry-run -p0 < "$ROOT_DIR/$PATCH"
patch -p0 < "$ROOT_DIR/$PATCH"
cat "$ROOT_DIR/$CSS" >> src/command-v2.css
cat "$ROOT_DIR/$CLEAN_CSS" >> src/command-v2.css

# Rebuild clean standalone cinematic WebP assets from transport-safe text chunks.
mkdir -p public/ui
cat "$ROOT_DIR"/overlays/ui-command-v2/static-b64/fenrir.part* | base64 -d > public/ui/fenrir.webp
cat "$ROOT_DIR"/overlays/ui-command-v2/static-b64/lifter.part* | base64 -d > public/ui/train-lifter.webp
cat "$ROOT_DIR"/overlays/ui-command-v2/static-b64/foundation.part* | base64 -d > public/ui/phase-foundation.webp
cat "$ROOT_DIR"/overlays/ui-command-v2/static-b64/volume.part* | base64 -d > public/ui/phase-volume.webp

echo "$FENRIR_SHA  public/ui/fenrir.webp" | sha256sum -c -
echo "$LIFTER_SHA  public/ui/train-lifter.webp" | sha256sum -c -
echo "$FOUNDATION_SHA  public/ui/phase-foundation.webp" | sha256sum -c -
echo "$VOLUME_SHA  public/ui/phase-volume.webp" | sha256sum -c -

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
test -f dist/ui/fenrir.webp
test -f dist/ui/train-lifter.webp
test -f dist/ui/phase-foundation.webp
test -f dist/ui/phase-volume.webp
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist
! grep -Fq "35 + ((index * 13)" src/main.ts
grep -Rq "program-governed-details" dist/assets
grep -Rq "No session" dist/assets
grep -Rq "readiness-field" dist/assets
grep -Rq "/ui/fenrir.webp" dist/assets
grep -Rq "/ui/train-lifter.webp" dist/assets
grep -Rq "/ui/phase-foundation.webp" dist/assets
grep -Rq "/ui/phase-volume.webp" dist/assets

echo "$FENRIR_SHA  dist/ui/fenrir.webp" | sha256sum -c -
echo "$LIFTER_SHA  dist/ui/train-lifter.webp" | sha256sum -c -
echo "$FOUNDATION_SHA  dist/ui/phase-foundation.webp" | sha256sum -c -
echo "$VOLUME_SHA  dist/ui/phase-volume.webp" | sha256sum -c -

echo "LetMeFly Command V2 Galaxy release polish + clean cinematic assets: PASS"
