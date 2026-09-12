#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?reconstructed app root required}"
MAIN="$TARGET/src/main.ts"

test -s "$MAIN" || { echo "Missing recap completion target: $MAIN" >&2; exit 1; }

MAIN="$MAIN" python3 - <<'PY'
from pathlib import Path
import os

main_path = Path(os.environ['MAIN'])
main = main_path.read_text()

old_bridge = '''  finish(sessionId: string) {
    if (state.workout?.session.id !== sessionId || state.workout.session.status !== 'in_progress') return
    document.querySelector<HTMLButtonElement>('[data-action="complete-workout"]')?.click()
  },'''
new_bridge = '''  async finish(sessionId: string) {
    if (state.workout?.session.id !== sessionId || state.workout.session.status !== 'in_progress') return
    await completeSelectedWorkout()
  },'''
if main.count(old_bridge) != 1:
    raise SystemExit(f'Expected one recap finish bridge boundary, found {main.count(old_bridge)}')
main = main.replace(old_bridge, new_bridge, 1)
main_path.write_text(main)
PY

grep -Fq 'async finish(sessionId: string)' "$MAIN"
grep -Fq 'await completeSelectedWorkout()' "$MAIN"
! grep -Fq "[data-action=\"complete-workout\"]')?.click()" "$MAIN"

echo "LetMeFly recap bridge now awaits governed completion inside reconstructed source: PASS"
