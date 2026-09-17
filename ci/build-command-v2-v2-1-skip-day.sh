#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT_DIR/.build-src/letmefly_app"

bash "$ROOT_DIR/ci/build-command-v2-v2-1.sh"
bash "$ROOT_DIR/ci/apply-skip-day-v1.sh" "$TARGET"
bash "$ROOT_DIR/ci/apply-unskip-day-v1.sh" "$TARGET"

npm --prefix "$TARGET" run typecheck
npm --prefix "$TARGET" run build

grep -Fq "export async function skipCurrentProgramDay(" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "export async function unskipLastProgramDay(" "$TARGET/src/services/program-progression-service.ts"
grep -Fq 'data-action="skip-current-day"' "$TARGET/src/main.ts"
grep -Fq 'data-action="unskip-last-day"' "$TARGET/src/main.ts"
grep -Rq 'SKIP DAY' "$TARGET/dist/assets"
grep -Rq 'UNDO LAST SKIP' "$TARGET/dist/assets"
grep -Rq 'It will NOT count as a completed workout or change your Training Maxes.' "$TARGET/dist/assets"

echo "LetMeFly production build + governed Skip Day v1 + Unskip Day v1: PASS"
