#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?reconstructed app root required}"
TARGET="$TARGET" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['TARGET'])/'src/main.ts'
s=p.read_text()
assert 'LetMeFlyWorkoutRecap' not in s, 'Workout recap bridge already installed'
start=s.index('async function completeSelectedWorkout(): Promise<void> {')
end=s.index('\nasync function ',start+20)
block=s[start:end]
needle='  await completeWorkout(state.athlete.id, state.workout.session.id)'
assert block.count(needle)==1
block=block.replace(needle,'  const recapSessionId = state.workout.session.id\n'+needle)
assert block.count('  render()')==1
block=block.replace('  render()','  render()\n  window.dispatchEvent(new CustomEvent(\'lmf:workout-completed\', { detail: { sessionId: recapSessionId } }))')
s=s[:start]+block+s[end:]
# The immutable saved session ID follows the native history row, including after
# reload or automatic progression. Delegated presentation handles the read.
needle='<em>${esc(String(w.status ?? \'\'))}</em></div>'
assert s.count(needle)==1
s=s.replace(needle,'<em>${esc(String(w.status ?? \'\'))}</em><button type="button" class="btn ghost small" data-workout-recap="${esc(w.id)}">VIEW RECAP</button></div>')
s+='''
// Recap presentation may inspect selection or invoke the existing visible action.
// It never writes performance, finishes a different session or advances a plan.
;(window as unknown as Record<string, unknown>).LetMeFlyWorkoutRecap = Object.freeze({
  version: 1,
  context() {
    const instance = state.programInstance
    const pending = (instance?.progression_state as Record<string, unknown> | undefined)?.pendingWorkoutCompletion
    const program = instance?.program_key as PublicProgramKey | undefined
    const week = Number(instance?.current_week)
    const day = Number(String(instance?.current_day_key ?? '').replace('day-', ''))
    const next = instance?.status === 'active' && !pending && program ? getProgramDay(program, week, day) : null
    return { athleteId: state.athlete?.id ?? null, sessionId: state.workout?.session.id ?? null,
      cloudLabel: document.querySelector('#sync-pill')?.textContent?.trim() ?? 'Status unavailable',
      next: next ? `${program} · Week ${week} · Day ${day} · ${next.title}` : null }
  },
  finish(sessionId: string) {
    if (state.workout?.session.id !== sessionId || state.workout.session.status !== 'in_progress') return
    document.querySelector<HTMLButtonElement>('[data-action="complete-workout"]')?.click()
  },
  reviewSet(setId: string) {
    if (!state.workout?.exercises.some(e => e.sets.some(s => s.id === setId))) return
    const row = document.querySelector<HTMLElement>(`.set-row[data-set-id="${CSS.escape(setId)}"]`)
    const panel = row?.closest<HTMLElement>('.swipe-page')
    const index = panel ? Array.from(document.querySelectorAll('.swipe-page')).indexOf(panel) : -1
    if (index >= 0) document.querySelector<HTMLButtonElement>(`[data-session-index="${index}"]`)?.click()
    const card = row?.closest('.exercise-card')
    card?.querySelector<HTMLButtonElement>('.lmf-compact-summary')?.click()
    const setIndex = card && row ? Array.from(card.querySelectorAll('.set-row[data-set-id]')).indexOf(row) : -1
    if (setIndex >= 0) card?.querySelectorAll<HTMLButtonElement>('.lmf-set-tab')[setIndex]?.click()
    row?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
  },
})
'''
p.write_text(s)
PY
