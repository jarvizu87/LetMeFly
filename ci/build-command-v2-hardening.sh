#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

READINESS_PATCH="overlays/ui-command-v2/batch-k/workout-readiness.patch"
ART_HOOKS_PATCH="overlays/ui-command-v2/batch-l/exercise-art-hooks.patch"
ART_CSS="overlays/ui-command-v2/batch-l/exercise-art.css"
ART_SOURCE_DIR="overlays/exercise-art"

# Reconstruct and validate the full locked Command V2 release first.
bash ci/build-command-v2-polish2.sh

test -s "$READINESS_PATCH"
test -s "$ART_HOOKS_PATCH"
test -s "$ART_CSS"
test -f "$ART_SOURCE_DIR/README.md"

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

# Add stable artwork hooks to Train preview/logged cards and the Exercise Library.
patch --dry-run -p0 < "$ROOT_DIR/$ART_HOOKS_PATCH"
patch -p0 < "$ROOT_DIR/$ART_HOOKS_PATCH"
cat "$ROOT_DIR/$ART_CSS" >> src/command-v2.css

grep -Fq "data-exercise-art=\"\${esc(slug(exercise.name))}\"" src/main.ts
grep -Fq "data-exercise-art=\"\${esc(slug(name))}\"" src/main.ts
grep -Fq "var(--exercise-art,var(--v2-mountain))" src/command-v2.css

# Only artwork files that physically exist are copied and activated. Missing files keep fallback art.
mkdir -p public/ui/exercises
GENERATED_ART_CSS="$(mktemp)"
: > "$GENERATED_ART_CSS"
declare -A ART_SLUGS=()
ART_COUNT=0
shopt -s nullglob
ART_FILES=(
  "$ROOT_DIR/$ART_SOURCE_DIR"/*.webp
  "$ROOT_DIR/$ART_SOURCE_DIR"/*.png
  "$ROOT_DIR/$ART_SOURCE_DIR"/*.jpg
  "$ROOT_DIR/$ART_SOURCE_DIR"/*.jpeg
)
for art_file in "${ART_FILES[@]}"; do
  art_name="$(basename "$art_file")"
  art_slug="${art_name%.*}"
  if [[ ! "$art_slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "Invalid exercise-art filename slug: $art_name" >&2
    exit 1
  fi
  if [[ -n "${ART_SLUGS[$art_slug]:-}" ]]; then
    echo "Duplicate exercise-art slug: $art_slug" >&2
    exit 1
  fi
  ART_SLUGS[$art_slug]=1
  cp "$art_file" "public/ui/exercises/$art_name"
  printf '[data-exercise-art="%s"]{--exercise-art:url("/ui/exercises/%s")}\n' "$art_slug" "$art_name" >> "$GENERATED_ART_CSS"
  ART_COUNT=$((ART_COUNT + 1))
done
cat "$GENERATED_ART_CSS" >> src/command-v2.css
rm -f "$GENERATED_ART_CSS"
echo "Exercise artwork assets activated: $ART_COUNT"

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
grep -Rq "data-exercise-art" dist/assets
grep -Rq "var(--exercise-art" dist/assets

for art_file in "${ART_FILES[@]}"; do
  art_name="$(basename "$art_file")"
  test -f "dist/ui/exercises/$art_name"
done

echo "LetMeFly Command V2 Monday hardening + readiness/session linkage + partial exercise-art pipeline: PASS"
