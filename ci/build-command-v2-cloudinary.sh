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

grep -Fq "letmefly/app/exercises/mine/" "$CLOUDINARY_JS"
grep -Fq "letmefly/app/exercises/others/" "$CLOUDINARY_JS"
grep -Fq "c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best" "$CLOUDINARY_JS"
! grep -Fq "letmefly/app/exercises/canonical/" "$CLOUDINARY_JS"
grep -Fq "var(--exercise-art,var(--v2-lifter))" "$CLOUDINARY_CSS"
grep -Fq "background-size:cover!important" "$CLOUDINARY_CSS"
grep -Fq "filter:none!important" "$CLOUDINARY_CSS"

cd .build-src/letmefly_app

# Append the final artwork presentation override after all existing Command V2 layers.
cat "$ROOT_DIR/$CLOUDINARY_CSS" >> src/command-v2.css

# Ship the runtime resolver as a public static asset and load it after the Vite app.
mkdir -p public/ui
cp "$ROOT_DIR/$CLOUDINARY_JS" public/ui/exercise-art-cloudinary.js
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

# Re-run all release boundaries against the exact Cloudinary-enabled source that will ship.
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
grep -Fq "letmefly/app/exercises/mine/" dist/ui/exercise-art-cloudinary.js
grep -Fq "letmefly/app/exercises/others/" dist/ui/exercise-art-cloudinary.js
grep -Fq "c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best" dist/ui/exercise-art-cloudinary.js
! grep -Fq "letmefly/app/exercises/canonical/" dist/ui/exercise-art-cloudinary.js
grep -Rq "var(--exercise-art,var(--v2-lifter))" dist/assets
! grep -R "service_role\|SUPABASE_SERVICE\|DATABASE_PASSWORD" dist

echo "LetMeFly Cloudinary exercise-art split + no-stretch image pipeline: PASS"
