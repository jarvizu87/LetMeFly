#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATCH="overlays/ui-command-v2/batch-f/release-polish.patch"
CSS="overlays/ui-command-v2/batch-f/release-polish.css"
CLEAN_CSS="overlays/ui-command-v2/batch-g/clean-assets.css"
FIDELITY_CSS="overlays/ui-command-v2/batch-h/image-fidelity.css"
FINAL_POLISH_CSS="overlays/ui-command-v2/batch-i/final-galaxy-polish.css"
INTERACTION_QA_CSS="overlays/ui-command-v2/batch-j/interaction-qa.css"
EXPECTED_PATCH_SHA="a032822402c18a2860516a27fda7fc00160678b8a67a36b9d84b91c74398067e"
EXPECTED_CSS_SHA="a54b68b994a19fcc7049081d7fe7927f354eb20464d0f33740f2dcd08a50b657"
EXPECTED_CLEAN_CSS_SHA="40c9f1f7a86d033ea03b2cab0a59ee7b95a26ad54f0ffe34035d6c14c8ee9080"
EXPECTED_FIDELITY_CSS_SHA="dd8a9afde07f5bf8ba08a0f26656c3f433ad0284cbecd288891fb8cdd5cc0e22"
EXPECTED_FINAL_POLISH_CSS_SHA="bbe13082c05c9bec4bbfd8dd628754cacbf9bf5e36a37b5b48d6e8105c0d4145"
EXPECTED_INTERACTION_QA_CSS_SHA="bc98adb1616a225f306d0d7a86824016c4f360000e5b1dd98e3b684d3e3233af"

FENRIR_SHA="89c81acc45311a59859b413bb2fbf8327099a1aa119b29cd6c6287eab9533295"
LIFTER_SHA="023c89110d4359df81341604c483a124b2f5f3c2104d4c9e01110b6ff2838791"
FOUNDATION_SVG_SHA="c4919c30147b84b27ff924303355080e143f845d891e93e41fe9a6e72a7f4c06"
VOLUME_SVG_SHA="f6389f7ef291a61f06f72d660d6ce4930e0dead35308ac5553a7db15761fa087"

bash ci/build-command-v2.sh

echo "$EXPECTED_PATCH_SHA  $PATCH" | sha256sum -c -
echo "$EXPECTED_CSS_SHA  $CSS" | sha256sum -c -
echo "$EXPECTED_CLEAN_CSS_SHA  $CLEAN_CSS" | sha256sum -c -
echo "$EXPECTED_FIDELITY_CSS_SHA  $FIDELITY_CSS" | sha256sum -c -
echo "$EXPECTED_FINAL_POLISH_CSS_SHA  $FINAL_POLISH_CSS" | sha256sum -c -
echo "$EXPECTED_INTERACTION_QA_CSS_SHA  $INTERACTION_QA_CSS" | sha256sum -c -
test "$(wc -c < "$PATCH")" = "5321"
test "$(wc -c < "$CSS")" = "4616"
test "$(wc -c < "$CLEAN_CSS")" = "377"
test "$(wc -c < "$FIDELITY_CSS")" = "3581"
test "$(wc -c < "$FINAL_POLISH_CSS")" = "4166"
test "$(wc -c < "$INTERACTION_QA_CSS")" = "1979"

cd .build-src/letmefly_app
# Batch F's historical patch remains checksum/size verified above. Its Program
# hunk was authored against the old six-week shape, so reproduce the approved
# release-polish intent through the modular adapter instead of regressing source.
bash "$ROOT_DIR/ci/modular-command-v2-release-polish.sh" "$ROOT_DIR/.build-src/letmefly_app"
cat "$ROOT_DIR/$CSS" >> src/command-v2.css
cat "$ROOT_DIR/$CLEAN_CSS" >> src/command-v2.css
cat "$ROOT_DIR/$FIDELITY_CSS" >> src/command-v2.css
cat "$ROOT_DIR/$FINAL_POLISH_CSS" >> src/command-v2.css
cat "$ROOT_DIR/$INTERACTION_QA_CSS" >> src/command-v2.css

# Fidelity layer must be present in the exact source Vite will compile.
grep -Fq "aspect-ratio:1 / 1" src/command-v2.css
grep -Fq "object-fit:cover" src/command-v2.css
grep -Fq "background-size:auto,cover" src/command-v2.css
grep -Fq ".program-hero{" src/command-v2.css
grep -Fq ".profile-hero{" src/command-v2.css
# Final Galaxy hierarchy polish must be present.
grep -Fq ".readiness-panel.workout-panel{" src/command-v2.css
grep -Fq ".progress-page-head h1{" src/command-v2.css
grep -Fq ".command-metrics .hero-score{" src/command-v2.css
# Interaction QA must restore touch targets after all previous visual overlays.
grep -Fq "LetMeFly Command V2 Batch J" src/command-v2.css
grep -Fq "top:max(64px,calc(46px + env(safe-area-inset-top)))!important" src/command-v2.css
grep -Fq "min-height:44px!important" src/command-v2.css
grep -Fq ".library-card .btn.small{" src/command-v2.css

# Rebuild the two clean photographic WebPs and copy native text-free mountain artwork.
mkdir -p public/ui
cat "$ROOT_DIR"/overlays/ui-command-v2/static-b64/fenrir.part* | base64 -d > public/ui/fenrir.webp
cat "$ROOT_DIR"/overlays/ui-command-v2/static-b64/lifter.part* | base64 -d > public/ui/train-lifter.webp
cp "$ROOT_DIR/overlays/ui-command-v2/static/mountain-foundation.svg" public/ui/mountain-foundation.svg
cp "$ROOT_DIR/overlays/ui-command-v2/static/mountain-volume.svg" public/ui/mountain-volume.svg

echo "$FENRIR_SHA  public/ui/fenrir.webp" | sha256sum -c -
echo "$LIFTER_SHA  public/ui/train-lifter.webp" | sha256sum -c -
echo "$FOUNDATION_SVG_SHA  public/ui/mountain-foundation.svg" | sha256sum -c -
echo "$VOLUME_SVG_SHA  public/ui/mountain-volume.svg" | sha256sum -c -

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
test -f dist/ui/mountain-foundation.svg
test -f dist/ui/mountain-volume.svg
! test -f dist/ui/phase-foundation.webp
! test -f dist/ui/phase-volume.webp
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist
! grep -Fq "35 + ((index * 13)" src/main.ts
grep -Rq "program-governed-details" dist/assets
grep -Rq "VIEW GOVERNED CROWNFORGE WEEKS 1–14" dist/assets
grep -Rq "No session" dist/assets
grep -Rq "readiness-field" dist/assets
grep -Rq "scroll-margin-top" dist/assets
grep -Rq "/ui/fenrir.webp" dist/assets
grep -Rq "/ui/train-lifter.webp" dist/assets
grep -Rq "/ui/mountain-foundation.svg" dist/assets
grep -Rq "/ui/mountain-volume.svg" dist/assets

echo "$FENRIR_SHA  dist/ui/fenrir.webp" | sha256sum -c -
echo "$LIFTER_SHA  dist/ui/train-lifter.webp" | sha256sum -c -
echo "$FOUNDATION_SVG_SHA  dist/ui/mountain-foundation.svg" | sha256sum -c -
echo "$VOLUME_SVG_SHA  dist/ui/mountain-volume.svg" | sha256sum -c -

echo "LetMeFly Command V2 Galaxy release polish + image fidelity + final hierarchy + interaction QA: PASS"
