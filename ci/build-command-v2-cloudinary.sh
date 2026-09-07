#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CLOUDINARY_JS="overlays/ui-command-v2/batch-n/exercise-art-cloudinary.js"
CLOUDINARY_CSS="overlays/ui-command-v2/batch-n/exercise-art-cloudinary.css"

# First reconstruct and validate the exact hardened Command V2 production source.
bash ci/build-command-v2-hardening.sh

test -s "$CLOUDINARY_JS"
test -s "$CLOUDINARY_CSS"
node --check "$CLOUDINARY_JS"

grep -Fq "lmf.exerciseArtOverrides.v1" "$CLOUDINARY_JS"
grep -Fq "exercise_thumbnail_overrides" "$CLOUDINARY_JS"
grep -Fq "cloudinary_public_id" "$CLOUDINARY_JS"
grep -Fq "__LMF_SUPABASE_URL__" "$CLOUDINARY_JS"
grep -Fq "__LMF_SUPABASE_PUBLISHABLE_KEY__" "$CLOUDINARY_JS"
! grep -Fq "letmefly/app/exercises/mine/" "$CLOUDINARY_JS"
! grep -Fq "letmefly/app/exercises/others/" "$CLOUDINARY_JS"
grep -Fq "c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best" "$CLOUDINARY_JS"
grep -Fq "var(--exercise-art,var(--v2-lifter))" "$CLOUDINARY_CSS"
grep -Fq "background-size:cover!important" "$CLOUDINARY_CSS"
grep -Fq "filter:none!important" "$CLOUDINARY_CSS"

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required for the private exercise-art resolver}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?VITE_SUPABASE_PUBLISHABLE_KEY is required for the private exercise-art resolver}"

cd .build-src/letmefly_app

# Append the final artwork presentation override after all existing Command V2 layers.
cat "$ROOT_DIR/$CLOUDINARY_CSS" >> src/command-v2.css

# Render the runtime resolver with browser-safe Supabase public configuration.
mkdir -p public/ui
CLOUDINARY_TEMPLATE="$ROOT_DIR/$CLOUDINARY_JS" python - <<'PY'
import json
import os
from pathlib import Path

source = Path(os.environ['CLOUDINARY_TEMPLATE']).read_text()
url = os.environ['VITE_SUPABASE_URL']
key = os.environ['VITE_SUPABASE_PUBLISHABLE_KEY']
source = source.replace("'__LMF_SUPABASE_URL__'", json.dumps(url))
source = source.replace("'__LMF_SUPABASE_PUBLISHABLE_KEY__'", json.dumps(key))
if '__LMF_SUPABASE_' in source:
    raise SystemExit('exercise-art resolver still contains unresolved Supabase placeholders')
Path('public/ui/exercise-art-cloudinary.js').write_text(source)
PY
node --check public/ui/exercise-art-cloudinary.js

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
grep -Fq "/ui/exercise-art-cloudinary.js" dist/index.html
grep -Fq "lmf.exerciseArtOverrides.v1" dist/ui/exercise-art-cloudinary.js
grep -Fq "exercise_thumbnail_overrides" dist/ui/exercise-art-cloudinary.js
grep -Fq "cloudinary_public_id" dist/ui/exercise-art-cloudinary.js
! grep -Fq "__LMF_SUPABASE_" dist/ui/exercise-art-cloudinary.js
! grep -Fq "letmefly/app/exercises/mine/" dist/ui/exercise-art-cloudinary.js
! grep -Fq "letmefly/app/exercises/others/" dist/ui/exercise-art-cloudinary.js
grep -Fq "c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best" dist/ui/exercise-art-cloudinary.js
grep -Rq "var(--exercise-art,var(--v2-lifter))" dist/assets
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

echo "LetMeFly private exercise-art override + no-stretch Cloudinary pipeline: PASS"
