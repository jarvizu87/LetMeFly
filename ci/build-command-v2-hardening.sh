#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

READINESS_PATCH="overlays/ui-command-v2/batch-k/workout-readiness.patch"
ART_HOOKS_PATCH="overlays/ui-command-v2/batch-l/exercise-art-hooks.patch"
ART_CSS="overlays/ui-command-v2/batch-l/exercise-art.css"
ART_SOURCE_DIR="overlays/exercise-art"
STATE_PATCH="overlays/ui-command-v2/batch-m/runtime-states.patch"
STATE_CSS="overlays/ui-command-v2/batch-m/runtime-states.css"

bash ci/build-command-v2-polish2.sh

test -s "$READINESS_PATCH"
test -s "$ART_HOOKS_PATCH"
test -s "$ART_CSS"
test -f "$ART_SOURCE_DIR/README.md"
test -s "$STATE_PATCH"
test -s "$STATE_CSS"

cd .build-src/letmefly_app

READINESS_SERVICE_PATCH="$(mktemp)"
awk '/^--- src\/main.ts/{exit} {print}' "$ROOT_DIR/$READINESS_PATCH" > "$READINESS_SERVICE_PATCH"
test -s "$READINESS_SERVICE_PATCH"
patch --dry-run -p0 < "$READINESS_SERVICE_PATCH"
patch -p0 < "$READINESS_SERVICE_PATCH"
rm -f "$READINESS_SERVICE_PATCH"

bash "$ROOT_DIR/ci/modular-command-v2-readiness.sh" "$ROOT_DIR/.build-src/letmefly_app"

grep -Fq "readiness_id: readinessId" src/services/workout-service.ts
grep -Fq "const readiness = await saveReadiness(state.athlete.id, input)" src/main.ts
grep -Fq "readiness.id" src/main.ts
grep -Fq "SAVE READINESS & START WORKOUT" src/main.ts
grep -Fq "Complete readiness before starting" src/main.ts
grep -Fq "UPDATE READINESS" src/main.ts
! grep -Fq "v === 3 ? 'checked' : ''" src/main.ts

patch --dry-run -p0 < "$ROOT_DIR/$ART_HOOKS_PATCH"
patch -p0 < "$ROOT_DIR/$ART_HOOKS_PATCH"
cat "$ROOT_DIR/$ART_CSS" >> src/command-v2.css

grep -Fq "data-exercise-art=\"\${esc(slug(exercise.name))}\"" src/main.ts
grep -Fq "data-exercise-art=\"\${esc(slug(name))}\"" src/main.ts
grep -Fq "var(--exercise-art,var(--v2-mountain))" src/command-v2.css

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

patch --dry-run -p0 < "$ROOT_DIR/$STATE_PATCH"
patch -p0 < "$ROOT_DIR/$STATE_PATCH"
cat "$ROOT_DIR/$STATE_CSS" >> src/command-v2.css

grep -Fq "Private vault unavailable" src/main.ts
grep -Fq "Progress history unavailable" src/main.ts
grep -Fq "No TM data yet" src/main.ts
grep -Fq "Exercise demo offline" src/main.ts
grep -Fq "navigator.onLine" src/main.ts
grep -Fq "retry-progress" src/main.ts
grep -Fq ".v2-bars i.empty" src/command-v2.css
! grep -Fq "8 + index * 3" src/main.ts

# Command V2 historically typed active selection as dated calendar programs only.
# Black Crown is deliberately undated public source. Widen routing and then add
# governed Black Crown browsing only after all legacy UI overlays have landed.
# Neither adapter changes any exercise prescription in Crownforge or Black Crown.
bash "$ROOT_DIR/ci/apply-black-crown-command-v2-core.sh" "$ROOT_DIR/.build-src/letmefly_app"
bash "$ROOT_DIR/ci/apply-black-crown-command-v2-ui.sh" "$ROOT_DIR/.build-src/letmefly_app"

# Private athlete state owns the active program position, governed handoffs, and
# TM resolution. This adapter is intentionally applied after all public program
# packages/UI adapters and must not mutate any program prescription package.
bash "$ROOT_DIR/ci/apply-athlete-program-progression-v1.sh" "$ROOT_DIR/.build-src/letmefly_app"
node "$ROOT_DIR/ci/audit-athlete-program-progression.mjs" "$ROOT_DIR/.build-src/letmefly_app"

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
grep -Rq "Exercise demo offline" dist/assets
grep -Rq "No TM data yet" dist/assets
grep -Rq "54 governed weeks" dist/assets
grep -Rq "BLACK CROWN WEEKS" dist/assets
grep -Rq "BLACK CROWN ENTRY GATE" dist/assets
grep -Rq "Preview only" dist/assets

for art_file in "${ART_FILES[@]}"; do
  art_name="$(basename "$art_file")"
  test -f "dist/ui/exercises/$art_name"
done

echo "LetMeFly Command V2 hardening + Black Crown v2 governed UI + private athlete progression + truthful runtime states: PASS"
