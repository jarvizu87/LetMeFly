#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CLOUDINARY_JS="overlays/ui-command-v2/batch-n/exercise-art-cloudinary.js"
CLOUDINARY_CSS="overlays/ui-command-v2/batch-n/exercise-art-cloudinary.css"
READINESS_COMFORT_CSS="overlays/ui-command-v2/batch-o/readiness-mobile-comfort.css"
ART_IMPORT_HTML="overlays/ui-command-v2/batch-q/exercise-art-import.html"
ART_IMPORT_MODULE="overlays/ui-command-v2/batch-q/exercise-art-import.mjs"

# First reconstruct and validate the exact hardened Command V2 production source.
bash ci/build-command-v2-hardening.sh

# Preserve saved readiness values when the active workout re-renders or reloads.
bash ci/apply-readiness-persistence-fix.sh "$ROOT_DIR/.build-src/letmefly_app"

# Improve real-world phone logging ergonomics, exercise-video reliability,
# automatic approved exercise art, locked Workout Flow v1, and Pyramid Flow v1.
bash ci/apply-mobile-workout-video-fix.sh "$ROOT_DIR/.build-src/letmefly_app"

# Keep set-tab centering inside its horizontal strip. Element.scrollIntoView can
# also move the page vertically during set selection/auto-advance, which makes a
# phone workout appear to jump or reset its scroll position.
bash ci/apply-workout-flow-scroll-safety-v1.sh "$ROOT_DIR/.build-src/letmefly_app"

grep -Fq "tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })" "$ROOT_DIR/.build-src/letmefly_app/public/ui/workout-flow-v1.js"
! grep -Fq "activeTab.scrollIntoView" "$ROOT_DIR/.build-src/letmefly_app/public/ui/workout-flow-v1.js"

test -s "$CLOUDINARY_JS"
test -s "$CLOUDINARY_CSS"
test -s "$READINESS_COMFORT_CSS"
test -s "$ART_IMPORT_HTML"
test -s "$ART_IMPORT_MODULE"
node --check "$ART_IMPORT_MODULE"
node --check "$CLOUDINARY_JS"

grep -Fq "LetMeFlyExerciseArt" "$CLOUDINARY_JS"
grep -Fq "readAsset" "$CLOUDINARY_JS"
grep -Fq "privateExerciseArtMap" "overlays/ui-command-v2/batch-n/exercise-art-contract.mjs"
! grep -Fq "letmefly/private/jp" "$CLOUDINARY_JS"
! grep -Fq "localStorage.setItem" "$CLOUDINARY_JS"
! grep -Fq "letmefly/app/exercises/mine/" "$CLOUDINARY_JS"
! grep -Fq "letmefly/app/exercises/others/" "$CLOUDINARY_JS"
! grep -Fq "res.cloudinary.com" "$CLOUDINARY_JS"
grep -Fq "letmefly-private-exercise-art-map" "$ART_IMPORT_MODULE"
grep -Fq "privateExerciseArtMap" "$ART_IMPORT_MODULE"
grep -Fq "var(--exercise-art,var(--v2-mountain))" "$CLOUDINARY_CSS"
grep -Fq "background-size:cover!important" "$CLOUDINARY_CSS"
grep -Fq "filter:none!important" "$CLOUDINARY_CSS"
grep -Fq "grid-template-columns: repeat(5, minmax(0, 1fr))" "$READINESS_COMFORT_CSS"
grep -Fq "min-height: 58px" "$READINESS_COMFORT_CSS"
grep -Fq "font-size: 20px" "$READINESS_COMFORT_CSS"

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required for the private exercise-art resolver}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?VITE_SUPABASE_PUBLISHABLE_KEY is required for the private exercise-art resolver}"

cd .build-src/letmefly_app

# Append final presentation overrides after all existing Command V2 layers.
cat "$ROOT_DIR/$CLOUDINARY_CSS" >> src/command-v2.css
cat "$ROOT_DIR/$READINESS_COMFORT_CSS" >> src/command-v2.css

# The native bridge owns authenticated reads; presentation contains no tokens or mapping.
mkdir -p public/ui
cp "$ROOT_DIR/$ART_IMPORT_HTML" public/exercise-art-import.html
cp "$ROOT_DIR/$ART_IMPORT_MODULE" public/ui/exercise-art-import.mjs
cp "$ROOT_DIR/overlays/ui-command-v2/batch-n/exercise-art-contract.mjs" public/ui/exercise-art-contract.mjs
cp "$ROOT_DIR/$CLOUDINARY_JS" public/ui/exercise-art-cloudinary.js
node --check public/ui/exercise-art-cloudinary.js

grep -Fq "privateExerciseArtMap" public/ui/exercise-art-contract.mjs
grep -Fq "privateExerciseArtMap" public/ui/exercise-art-import.mjs
grep -Fq "tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })" public/ui/workout-flow-v1.js
! grep -Fq "activeTab.scrollIntoView" public/ui/workout-flow-v1.js

python - <<'PY'
from pathlib import Path
p = Path('index.html')
text = p.read_text()
marker = '<script defer src="/ui/exercise-art-cloudinary.js"></script>'
if marker not in text:
    if '</body>' not in text:
        raise SystemExit('index.html is missing </body>')
    text = text.replace('</body>', f'  {marker}\n</body>', 1)
p.write_text(text)
PY

grep -Fq "/ui/exercise-art-cloudinary.js" index.html
grep -Fq "/ui/exercise-art-auto.js" index.html
grep -Fq "/ui/workout-flow-v1.js" index.html
grep -Fq "/ui/pyramid-flow-v1.js" index.html

# Re-run all release boundaries against the exact private-override-enabled source that will ship.
npm run audit:source
npm run audit:crownforge
npm run audit:exercise-library
npm run audit:ui
npm run typecheck
npm run build

test -f dist/index.html
test -f dist/service-worker.js
test -f dist/ui/train-lifter.webp
test -f dist/ui/exercise-art-cloudinary.js
test -f dist/ui/exercise-art-auto.js
test -f dist/ui/workout-flow-v1.js
test -f dist/ui/pyramid-flow-v1.js
test -f dist/exercise-art-import.html
grep -Fq "/ui/exercise-art-cloudinary.js" dist/index.html
grep -Fq "/ui/exercise-art-auto.js" dist/index.html
grep -Fq "/ui/workout-flow-v1.js" dist/index.html
grep -Fq "/ui/pyramid-flow-v1.js" dist/index.html
grep -Fq "LetMeFlyExerciseArt" dist/ui/exercise-art-cloudinary.js
grep -Fq "readAsset" dist/ui/exercise-art-cloudinary.js
grep -Fq "privateExerciseArtMap" dist/ui/exercise-art-contract.mjs
grep -Fq "privateExerciseArtMap" dist/ui/exercise-art-import.mjs
grep -Fq 'jp-${slug}-v2' dist/ui/exercise-art-auto.js
grep -Fq "lmf-set-tabs" dist/ui/workout-flow-v1.js
grep -Fq "lmf-compact-summary" dist/ui/workout-flow-v1.js
grep -Fq "Between Rounds" dist/ui/workout-flow-v1.js
grep -Fq "tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })" dist/ui/workout-flow-v1.js
! grep -Fq "activeTab.scrollIntoView" dist/ui/workout-flow-v1.js
grep -Fq "PYRAMID PLAN" dist/ui/pyramid-flow-v1.js
grep -Fq "lmf-pyramid-plan-row" dist/ui/pyramid-flow-v1.js
! grep -Fq "localStorage.setItem" dist/ui/exercise-art-cloudinary.js
! grep -Fq "__LMF_SUPABASE_" dist/ui/exercise-art-cloudinary.js
! grep -Fq "letmefly/app/exercises/mine/" dist/ui/exercise-art-cloudinary.js
! grep -Fq "letmefly/app/exercises/others/" dist/ui/exercise-art-cloudinary.js
! grep -Fq "res.cloudinary.com" dist/ui/exercise-art-cloudinary.js

# Verify the user-visible mobile/video/art/workout-flow changes in the minified
# production bundle without depending on the minifier's exact whitespace.
python - <<'PY'
from pathlib import Path

asset_text = '\n'.join(
    p.read_text(errors='ignore')
    for p in Path('dist/assets').rglob('*')
    if p.is_file()
)
compact = ''.join(asset_text.split())
checks = {
    'neutral exercise-art fallback': 'var(--exercise-art,var(--v2-mountain))' in compact,
    'five-column readiness cells': 'grid-template-columns:repeat(5,minmax(0,1fr))' in compact,
    'readiness cell height': 'min-height:58px' in compact,
    'legacy mobile set top-row grid retained': 'set set check' in asset_text,
    'legacy mobile set input grid retained': 'reps load rpe' in asset_text,
    'mobile target hidden': '.set-target-cell{display:none!important}' in compact,
    'mobile set equal input height': 'height:62px!important' in compact,
    'mobile set input text size': 'font-size:17px' in compact,
    'Workout Flow single active set': '.set-row.lmf-set-active' in compact,
    'Workout Flow square image': '.lmf-exercise-media' in compact and 'aspect-ratio:1' in compact and 'background-size:contain' in compact,
    'Workout Flow set tabs': '.lmf-set-tabs' in compact,
    'Workout Flow 10+ set horizontal scroll': 'scroll-snap-type:xproximity' in compact,
    'Workout Flow compact previews': '.lmf-compact-summary' in compact,
    'Workout Flow connected rail': '.lmf-flow-node' in compact,
    'Workout Flow rest card': '.lmf-round-rest' in compact,
    'Pyramid plan': '.lmf-pyramid-plan' in compact,
    'Pyramid long-plan scroll': '.lmf-pyramid-plan.is-long' in compact and 'max-height:330px' in compact,
    'Pyramid set tabs stay touchable': '.lmf-pyramid-card.lmf-set-tab' in compact or 'flex:0 054px!important' in compact,
    'working Front Squat demo': 'youtube.com/watch?v=-fNfycATWUo' in asset_text,
    'dead Front Squat Vimeo removed': 'vimeo.com/152122947' not in asset_text,
}
failed = [label for label, ok in checks.items() if not ok]
for label, ok in checks.items():
    print(f'production marker {label}: {"PASS" if ok else "FAIL"}')
if failed:
    raise SystemExit('production marker failures: ' + ', '.join(failed))
PY

# The source-level hotfix scripts already verify hydration and mobile/video patch points.
# Minification is allowed to rename function identifiers in dist.
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

echo "LetMeFly private exercise-art + readiness + mobile workout/video + Workout Flow v1 + Pyramid Flow v1 + vertical-scroll isolation pipeline: PASS"
