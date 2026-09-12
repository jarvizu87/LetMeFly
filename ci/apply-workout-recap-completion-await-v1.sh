#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?reconstructed app root required}"
MAIN="$TARGET/src/main.ts"
RECAP="$TARGET/public/ui/workout-recap-ui.mjs"

for file in "$MAIN" "$RECAP"; do
  test -s "$file" || { echo "Missing recap completion target: $file" >&2; exit 1; }
done

MAIN="$MAIN" RECAP="$RECAP" python3 - <<'PY'
from pathlib import Path
import os

main_path = Path(os.environ['MAIN'])
recap_path = Path(os.environ['RECAP'])
main = main_path.read_text()
recap = recap_path.read_text()

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

old_listener = """    dialog.addEventListener('click',e=>{
      const button=e.target.closest('button,a')
      if (button?.hasAttribute('data-recap-history')) pendingHistorySession=sessionId
      if (button?.matches('[data-recap-close],[data-recap-history]')) close()
      if (button?.hasAttribute('data-recap-correct')) { const set=button.dataset.recapCorrect;close();bridge()?.reviewSet(set) }
      if (button?.hasAttribute('data-recap-finish')) {close();bridge()?.finish(sessionId)}
    })"""
new_listener = """    dialog.addEventListener('click',async e=>{
      const button=e.target.closest('button,a')
      if (button?.hasAttribute('data-recap-history')) pendingHistorySession=sessionId
      if (button?.matches('[data-recap-close],[data-recap-history]')) close()
      if (button?.hasAttribute('data-recap-correct')) { const set=button.dataset.recapCorrect;close();bridge()?.reviewSet(set) }
      if (button?.hasAttribute('data-recap-finish')) {
        const finishingDialog=dialog
        button.disabled=true
        try { await bridge()?.finish(sessionId) }
        finally {
          if (dialog===finishingDialog) close()
          if (button.isConnected) button.disabled=false
        }
      }
    })"""
if recap.count(old_listener) != 1:
    raise SystemExit(f'Expected one recap finish listener boundary, found {recap.count(old_listener)}')
recap = recap.replace(old_listener, new_listener, 1)

main_path.write_text(main)
recap_path.write_text(recap)
PY

grep -Fq 'async finish(sessionId: string)' "$MAIN"
grep -Fq 'await completeSelectedWorkout()' "$MAIN"
! grep -Fq "[data-action=\"complete-workout\"]')?.click()" "$MAIN"
grep -Fq "dialog.addEventListener('click',async e=>" "$RECAP"
grep -Fq 'try { await bridge()?.finish(sessionId) }' "$RECAP"
grep -Fq 'if (dialog===finishingDialog) close()' "$RECAP"

echo "LetMeFly workout recap awaits governed completion before teardown: PASS"
