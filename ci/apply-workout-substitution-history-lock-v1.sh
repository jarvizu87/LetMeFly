#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
MAIN="$TARGET/src/main.ts"
SERVICE="$TARGET/src/services/workout-service.ts"
test -s "$MAIN"
test -s "$SERVICE"

MAIN="$MAIN" SERVICE="$SERVICE" python3 - <<'PY'
from pathlib import Path
import os

main_path = Path(os.environ['MAIN'])
service_path = Path(os.environ['SERVICE'])
main = main_path.read_text()
service = service_path.read_text()

# A completed flag can be reopened for correction, so it is not enough to prove
# whether substitute performance ever happened. Stamp the first native logSet
# write and retain that provenance even if the set is later reopened.
if 'substitutionPerformanceLoggedAt' not in service:
    start = service.find('export async function logSet(')
    end = service.find('\nexport async function ', start + 10)
    if start < 0 or end < 0:
        raise SystemExit('Issue #54 logSet history-lock function boundary missing')
    block = service[start:end]
    needle = "  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')"
    if needle not in block:
        raise SystemExit('Issue #54 logSet device marker missing')
    stamp = """  const completedAt = new Date().toISOString()\n  const substitutionPerformance = (existing.performance_data ?? {}) as Record<string, any>\n  if (substitutionPerformance.substitutionPerformedExerciseKey) {\n    existing.performance_data = { ...substitutionPerformance, substitutionPerformanceLoggedAt: completedAt }\n  }\n  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')"""
    block = block.replace(needle, stamp, 1)
    block = block.replace('completed_at: new Date().toISOString(),', 'completed_at: completedAt,', 1)
    service = service[:start] + block + service[end:]

# Both change-substitute and revert must fail closed after substitute work was
# logged, even if the athlete later reopens that set for correction.
old_guard = "activeSets.some((set) => Boolean(set.completed))"
new_guard = "activeSets.some((set) => Boolean(set.completed) || Boolean(((set.performance_data ?? {}) as Record<string, any>).substitutionPerformanceLoggedAt))"
if old_guard in service:
    service = service.replace(old_guard, new_guard)
if service.count('substitutionPerformanceLoggedAt') < 3:
    raise SystemExit('Issue #54 history-lock service guards were not installed')

# The card follows the same immutable-history rule on reload/render.
old_main = "const hasCompletedSubstituteSets = substituted && sets.some((set) => Boolean(set.completed))"
new_main = "const hasCompletedSubstituteSets = substituted && sets.some((set) => Boolean(set.completed) || Boolean(((set.performance_data ?? {}) as Record<string, any>).substitutionPerformanceLoggedAt))"
if old_main in main:
    main = main.replace(old_main, new_main, 1)
elif 'substitutionPerformanceLoggedAt' not in main:
    raise SystemExit('Issue #54 history-lock card guard missing')

# Preview/mutation affordances must fail closed from the refreshed in-memory
# bundle as well, even when a previously logged set has been reopened.
old_preview = "  if (item.sets.some((set) => Boolean(set.completed))) return { eligible: false, reason: 'Reopen completed sets before changing this exercise.' }"
new_preview = "  if (item.sets.some((set) => Boolean(set.completed) || Boolean(((set.performance_data ?? {}) as Record<string, any>).substitutionPerformanceLoggedAt))) return { eligible: false, reason: 'Completed substitute work is locked to the exercise actually performed.' }"
if old_preview in main:
    main = main.replace(old_preview, new_preview, 1)
elif 'Completed substitute work is locked to the exercise actually performed.' not in main:
    raise SystemExit('Issue #54 history-lock preview guard missing')

# Native set logging intentionally refreshes the authoritative workout bundle
# without rerendering the whole Workout Mode screen. Keep the substitution card
# synchronized in place so logging the first substitute set immediately disables
# Change Substitute/Undo without resetting workout position or scroll.
if 'function workoutSubstitutionRefreshLiveLocks()' not in main:
    marker = 'function workoutSubstitutionPreview(workoutExerciseId: string, alternativeExerciseKey: string) {'
    idx = main.find(marker)
    if idx < 0:
        raise SystemExit('Issue #54 live-lock helper insertion point missing')
    helper = r'''function workoutSubstitutionRefreshLiveLocks(): void {
  const workout = state.workout
  if (!workout) return
  for (const item of workout.exercises) {
    const record = item.record
    if (!record.substituted_from_exercise_key) continue
    const locked = item.sets.some((set) =>
      Boolean(set.completed)
      || Boolean(((set.performance_data ?? {}) as Record<string, any>).substitutionPerformanceLoggedAt)
    )
    if (!locked) continue
    const card = [...document.querySelectorAll<HTMLElement>('.exercise-card.active-exercise')]
      .find((node) => String(node.dataset.exerciseId ?? '') === String(record.id))
    if (!card) continue
    const substitute = card.querySelector<HTMLButtonElement>('[data-substitute]')
    if (substitute) {
      substitute.disabled = true
      substitute.setAttribute('aria-disabled', 'true')
      substitute.textContent = 'SUBSTITUTE LOCKED'
    }
    card.querySelector<HTMLElement>('[data-revert-substitution]')?.remove()
    const notice = card.querySelector<HTMLElement>('.lmf-substitution-active')
    if (notice && !notice.querySelector('.lmf-substitution-lock')) {
      const lock = document.createElement('small')
      lock.className = 'lmf-substitution-lock'
      lock.textContent = 'Logged substitute work is locked to the movement actually performed. The next programmed occurrence resets automatically.'
      notice.appendChild(lock)
    }
  }
}

function workoutSubstitutionRefreshPresentationIntegrations(): void {
  const refreshBarLoader = () => (window as any).LetMeFlyBarLoader?.refresh?.()
  refreshBarLoader()
  window.requestAnimationFrame(() => refreshBarLoader())
  window.setTimeout(refreshBarLoader, 120)
}

'''
    main = main[:idx] + helper + main[idx:]

if 'function workoutSubstitutionRefreshPresentationIntegrations()' not in main:
    marker = 'function workoutSubstitutionPreview(workoutExerciseId: string, alternativeExerciseKey: string) {'
    idx = main.find(marker)
    if idx < 0:
        raise SystemExit('Issue #54 presentation refresh helper insertion point missing')
    helper = r'''function workoutSubstitutionRefreshPresentationIntegrations(): void {
  const refreshBarLoader = () => (window as any).LetMeFlyBarLoader?.refresh?.()
  refreshBarLoader()
  window.requestAnimationFrame(() => refreshBarLoader())
  window.setTimeout(refreshBarLoader, 120)
}

'''
    main = main[:idx] + helper + main[idx:]

# A workout-only substitution replaces the displayed exercise identity in-place.
# Explicitly hand that new card to presentation utilities after render instead of
# relying solely on MutationObserver timing. This keeps Bar Loader bound to the
# movement actually being performed and also cleans stale controls on Undo.
apply_boundary = """    showToast(`Using ${alternativeName} for this workout only`)
    render()
    return { ok: true, workoutExerciseId: input.workoutExerciseId, alternativeExerciseName: alternativeName }"""
apply_refresh = """    showToast(`Using ${alternativeName} for this workout only`)
    render()
    workoutSubstitutionRefreshPresentationIntegrations()
    return { ok: true, workoutExerciseId: input.workoutExerciseId, alternativeExerciseName: alternativeName }"""
if apply_boundary in main:
    main = main.replace(apply_boundary, apply_refresh, 1)
elif main.count('workoutSubstitutionRefreshPresentationIntegrations()') < 2:
    raise SystemExit('Issue #54 apply presentation refresh boundary missing')

revert_boundary = """    showToast('Restored the programmed exercise for this workout')
    render()
    return { ok: true, workoutExerciseId }"""
revert_refresh = """    showToast('Restored the programmed exercise for this workout')
    render()
    workoutSubstitutionRefreshPresentationIntegrations()
    return { ok: true, workoutExerciseId }"""
if revert_boundary in main:
    main = main.replace(revert_boundary, revert_refresh, 1)
elif main.count('workoutSubstitutionRefreshPresentationIntegrations()') < 3:
    raise SystemExit('Issue #54 revert presentation refresh boundary missing')

if '  refreshLocks() {' not in main:
    needle = '  async apply(input: { workoutExerciseId: string;'
    idx = main.find(needle, main.find('LetMeFlyWorkoutSubstitutionBridge'))
    if idx < 0:
        raise SystemExit('Issue #54 live-lock bridge insertion point missing')
    bridge_method = "  refreshLocks() {\n    workoutSubstitutionRefreshLiveLocks()\n  },\n"
    main = main[:idx] + bridge_method + main[idx:]

main_path.write_text(main)
service_path.write_text(service)
PY

grep -Fq 'substitutionPerformanceLoggedAt: completedAt' "$SERVICE"
grep -Fq 'substitutionPerformanceLoggedAt' "$MAIN"
grep -Fq 'Completed substitute work cannot be relabeled' "$SERVICE"
grep -Fq 'function workoutSubstitutionRefreshLiveLocks()' "$MAIN"
grep -Fq 'function workoutSubstitutionRefreshPresentationIntegrations()' "$MAIN"
grep -Fq 'LetMeFlyBarLoader?.refresh?.()' "$MAIN"
[[ "$(grep -Fc 'workoutSubstitutionRefreshPresentationIntegrations()' "$MAIN")" -ge 3 ]]
grep -Fq 'refreshLocks()' "$MAIN"
grep -Fq 'Completed substitute work is locked to the exercise actually performed.' "$MAIN"

echo "Issue #54 logged substitute history lock + performed-exercise presentation refresh: PASS"
