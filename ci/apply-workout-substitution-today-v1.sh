#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
MAIN="$TARGET/src/main.ts"
SERVICE="$TARGET/src/services/workout-service.ts"

for f in "$MAIN" "$SERVICE"; do
  test -s "$f" || { echo "Missing substitution target: $f" >&2; exit 1; }
done

MAIN="$MAIN" SERVICE="$SERVICE" python3 - <<'PY'
from pathlib import Path
import os
import re

main_path = Path(os.environ['MAIN'])
service_path = Path(os.environ['SERVICE'])
main = main_path.read_text()
service = service_path.read_text()

# New workout instances retain explicit prescribed identity inside their existing
# JSON prescription snapshot. The program package itself remains untouched.
if 'prescribedExerciseKey: exercise.id' not in service:
    old = """            prescription_snapshot: {\n              priority: exercise.priority,"""
    new = """            prescription_snapshot: {\n              prescribedExerciseKey: exercise.id,\n              prescribedExerciseName: exercise.name,\n              priority: exercise.priority,"""
    if old not in service:
        raise SystemExit('workout-service prescription snapshot patch point missing')
    service = service.replace(old, new, 1)

service_block = r'''
export type WorkoutSubstitutionLoadMode = 'same' | 'factor' | 'manual' | 'none'

export interface WorkoutSubstitutionInput {
  alternativeExerciseKey: string
  alternativeExerciseName: string
  ruleId?: string | null
  loadingAdjustment?: string | null
  loadMode: WorkoutSubstitutionLoadMode
  loadFactor?: number | null
  manualLoadValue?: number | null
  manualLoadUnit?: 'lb' | 'kg' | null
}

function substitutionBaseline(performanceData: Record<string, any>, set: LocalDomainRecord): { value: number | null; unit: 'lb' | 'kg' | null } {
  const hasSavedBaseline = Object.prototype.hasOwnProperty.call(performanceData, 'substitutionOriginalLoadValue')
  const value = hasSavedBaseline
    ? (typeof performanceData.substitutionOriginalLoadValue === 'number' ? performanceData.substitutionOriginalLoadValue : null)
    : (typeof set.load_value === 'number' ? set.load_value : null)
  const rawUnit = hasSavedBaseline ? performanceData.substitutionOriginalLoadUnit : set.load_unit
  const unit = rawUnit === 'kg' ? 'kg' : rawUnit === 'lb' ? 'lb' : null
  return { value, unit }
}

function suggestedSubstitutionLoad(value: number | null, mode: WorkoutSubstitutionLoadMode, factor?: number | null, manual?: number | null): number | null {
  if (mode === 'none') return null
  if (mode === 'manual') return typeof manual === 'number' && Number.isFinite(manual) ? manual : null
  if (mode === 'same') return value
  if (mode === 'factor' && typeof value === 'number' && typeof factor === 'number' && Number.isFinite(factor) && factor > 0) {
    return Math.round(value * factor * 2) / 2
  }
  return null
}

export async function substituteWorkoutExercise(
  athleteId: string,
  workoutExerciseId: string,
  input: WorkoutSubstitutionInput,
): Promise<WorkoutBundle> {
  const existing = await getById<LocalDomainRecord>('workoutExercises', workoutExerciseId)
  if (!existing || existing.athlete_id !== athleteId || existing.deleted_at) throw new Error('Workout exercise not found')
  const session = await getById<LocalDomainRecord>('workoutSessions', String(existing.workout_session_id))
  if (!session || session.athlete_id !== athleteId) throw new Error('Workout session not found')
  if (session.status !== 'in_progress') throw new Error('Substitutions can only change an active workout')

  const sets = await getAllFromIndex<LocalDomainRecord>('workoutSets', 'by-exercise', workoutExerciseId)
  const activeSets = sets.filter((set) => !set.deleted_at)
  if (activeSets.some((set) => Boolean(set.completed))) {
    throw new Error('Reopen completed sets before changing this exercise so history stays accurate')
  }

  const snapshot = { ...((existing.prescription_snapshot ?? {}) as Record<string, any>) }
  const prescribedKey = String(existing.substituted_from_exercise_key ?? snapshot.prescribedExerciseKey ?? existing.exercise_key)
  const prescribedName = String(snapshot.prescribedExerciseName ?? existing.exercise_name_snapshot)
  if (!input.alternativeExerciseKey || !input.alternativeExerciseName) throw new Error('Substitute exercise identity is required')
  if (input.alternativeExerciseKey === prescribedKey) throw new Error('Selected movement is already the programmed exercise')

  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  const context = { athleteId, deviceId: device.deviceId }
  const now = new Date().toISOString()

  await putEntityWithOutbox(
    'workoutExercises',
    {
      ...existing,
      exercise_key: input.alternativeExerciseKey,
      exercise_name_snapshot: input.alternativeExerciseName,
      substituted_from_exercise_key: prescribedKey,
      prescription_snapshot: {
        ...snapshot,
        prescribedExerciseKey: prescribedKey,
        prescribedExerciseName: prescribedName,
        substitution: {
          alternativeExerciseKey: input.alternativeExerciseKey,
          alternativeExerciseName: input.alternativeExerciseName,
          ruleId: input.ruleId ?? null,
          loadingAdjustment: input.loadingAdjustment ?? null,
          loadMode: input.loadMode,
          loadFactor: input.loadFactor ?? null,
          appliedAt: now,
        },
      },
    },
    context,
  )

  for (const set of activeSets) {
    const perf = { ...((set.performance_data ?? {}) as Record<string, any>) }
    const baseline = substitutionBaseline(perf, set)
    const nextLoad = suggestedSubstitutionLoad(baseline.value, input.loadMode, input.loadFactor, input.manualLoadValue)
    await putEntityWithOutbox(
      'workoutSets',
      {
        ...set,
        load_value: nextLoad,
        load_unit: nextLoad == null ? null : (input.manualLoadUnit ?? baseline.unit ?? set.load_unit ?? null),
        performance_data: {
          ...perf,
          substitutionOriginalLoadValue: baseline.value,
          substitutionOriginalLoadUnit: baseline.unit,
          substitutionPerformedExerciseKey: input.alternativeExerciseKey,
          substitutionPerformedExerciseName: input.alternativeExerciseName,
          substitutionLoadingAdjustment: input.loadingAdjustment ?? null,
          substitutionLoadMode: input.loadMode,
          substitutionLoadFactor: input.loadFactor ?? null,
        },
      },
      context,
    )
  }

  return loadWorkoutBundle(session)
}

export async function revertWorkoutExerciseSubstitution(
  athleteId: string,
  workoutExerciseId: string,
): Promise<WorkoutBundle> {
  const existing = await getById<LocalDomainRecord>('workoutExercises', workoutExerciseId)
  if (!existing || existing.athlete_id !== athleteId || existing.deleted_at) throw new Error('Workout exercise not found')
  const session = await getById<LocalDomainRecord>('workoutSessions', String(existing.workout_session_id))
  if (!session || session.athlete_id !== athleteId) throw new Error('Workout session not found')
  if (session.status !== 'in_progress') throw new Error('Completed workout history cannot be relabeled')
  if (!existing.substituted_from_exercise_key) return loadWorkoutBundle(session)

  const sets = await getAllFromIndex<LocalDomainRecord>('workoutSets', 'by-exercise', workoutExerciseId)
  const activeSets = sets.filter((set) => !set.deleted_at)
  if (activeSets.some((set) => Boolean(set.completed))) {
    throw new Error('Reopen completed substitute sets before reverting so history stays accurate')
  }

  const snapshot = { ...((existing.prescription_snapshot ?? {}) as Record<string, any>) }
  const prescribedKey = String(existing.substituted_from_exercise_key)
  const prescribedName = String(snapshot.prescribedExerciseName ?? existing.exercise_name_snapshot)
  delete snapshot.substitution
  snapshot.prescribedExerciseKey = prescribedKey
  snapshot.prescribedExerciseName = prescribedName

  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  const context = { athleteId, deviceId: device.deviceId }
  await putEntityWithOutbox(
    'workoutExercises',
    {
      ...existing,
      exercise_key: prescribedKey,
      exercise_name_snapshot: prescribedName,
      substituted_from_exercise_key: null,
      prescription_snapshot: snapshot,
    },
    context,
  )

  for (const set of activeSets) {
    const perf = { ...((set.performance_data ?? {}) as Record<string, any>) }
    const baseline = substitutionBaseline(perf, set)
    delete perf.substitutionOriginalLoadValue
    delete perf.substitutionOriginalLoadUnit
    delete perf.substitutionPerformedExerciseKey
    delete perf.substitutionPerformedExerciseName
    delete perf.substitutionLoadingAdjustment
    delete perf.substitutionLoadMode
    delete perf.substitutionLoadFactor
    await putEntityWithOutbox(
      'workoutSets',
      {
        ...set,
        load_value: baseline.value,
        load_unit: baseline.value == null ? null : baseline.unit,
        performance_data: perf,
      },
      context,
    )
  }

  return loadWorkoutBundle(session)
}
'''.strip()

if 'export async function substituteWorkoutExercise(' not in service:
    marker = 'export async function completeWorkout('
    index = service.find(marker)
    if index < 0:
        raise SystemExit('workout-service substitution insertion point missing')
    service = service[:index] + service_block + '\n\n' + service[index:]

# Add the new service functions to the existing main.ts workout-service import.
import_match = re.search(r"import\s*\{(?P<body>.*?)\}\s*from\s*['\"]\./services/workout-service['\"]", main, re.S)
if not import_match:
    raise SystemExit('main workout-service import not found')
import_text = import_match.group(0)
for name in ('substituteWorkoutExercise', 'revertWorkoutExerciseSubstitution'):
    if re.search(rf'\b{re.escape(name)}\b', import_text):
        continue
    close = import_text.rfind('}')
    if close < 0:
        raise SystemExit('main workout-service import closing brace missing')
    before = import_text[:close].rstrip()
    if not before.endswith(','):
        before += ','
    import_text = before + f"\n  {name},\n" + import_text[close:]
main = main[:import_match.start()] + import_text + main[import_match.end():]

bridge_block = r'''
function workoutSubstitutionLoadPlan(textValue: string): { mode: 'same' | 'factor' | 'manual' | 'none'; factor: number | null; explanation: string } {
  const text = String(textValue ?? '').trim()
  const lower = text.toLowerCase()
  if (/\b(bodyweight|body weight|unloaded|no external load)\b/.test(lower)) {
    return { mode: 'none', factor: null, explanation: text || 'No external load required.' }
  }
  if (/(same|keep|match|retain)[^.!]{0,28}\b(load|weight)\b|\b(load|weight)\b[^.!]{0,28}(same|keep|match|retain)/.test(lower)) {
    return { mode: 'same', factor: 1, explanation: text || 'Keep the current programmed load.' }
  }
  const range = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*[–-]\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/)
  const single = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/)
  const lowPct = range ? Math.min(Number(range[1]), Number(range[2])) : single ? Number(single[1]) : null
  const highPct = range ? Math.max(Number(range[1]), Number(range[2])) : single ? Number(single[1]) : null
  if (highPct != null && /lighter|less|lower|reduce|reduction|decrease/.test(lower)) {
    const factor = Math.max(0.05, 1 - highPct / 100)
    return { mode: 'factor', factor, explanation: text }
  }
  if (lowPct != null && /heavier|more|higher|increase/.test(lower)) {
    const factor = 1 + lowPct / 100
    return { mode: 'factor', factor, explanation: text }
  }
  if (single && /\bof\b[^.!]{0,16}\b(current|programmed|working)\b[^.!]{0,16}\b(load|weight)\b/.test(lower)) {
    return { mode: 'factor', factor: Number(single[1]) / 100, explanation: text }
  }
  return { mode: 'manual', factor: null, explanation: text || 'Choose an appropriate starting load before the first set.' }
}

function workoutSubstitutionExercise(workoutExerciseId: string) {
  return state.workout?.exercises.find((item) => String(item.record.id) === workoutExerciseId) ?? null
}

function workoutSubstitutionPreview(workoutExerciseId: string, alternativeExerciseKey: string) {
  const item = workoutSubstitutionExercise(workoutExerciseId)
  if (!state.athlete || !state.workout || !item) return { eligible: false, reason: 'Active workout exercise not found.' }
  if (state.workout.session.status !== 'in_progress') return { eligible: false, reason: 'Completed workout history is locked.' }
  if (item.sets.some((set) => Boolean(set.completed))) return { eligible: false, reason: 'Reopen completed sets before changing this exercise.' }
  const snapshot = (item.record.prescription_snapshot ?? {}) as Record<string, any>
  const prescribedKey = String(item.record.substituted_from_exercise_key ?? snapshot.prescribedExerciseKey ?? item.record.exercise_key)
  const intelligence = (window as any).LetMeFlyExerciseIntelligence
  const rules = intelligence?.getSubstitutions?.(prescribedKey, { includeBlocked: true }) ?? []
  const rule = rules.find((candidate: Record<string, any>) => String(candidate.alternativeExerciseId ?? '') === alternativeExerciseKey)
  if (!rule) return { eligible: false, reason: 'This movement is not a governed substitute for the programmed exercise.' }
  const promotion = String(rule.promotionStatus ?? '')
  const role = String(rule.rolePreserved ?? '').trim().toLowerCase()
  if (!rule.alternativeInCurrentApp || promotion.startsWith('DO NOT') || role === 'no' || role.startsWith('no ')) {
    return { eligible: false, reason: 'This relationship is protected and cannot be applied as a default substitution.' }
  }
  const loadPlan = workoutSubstitutionLoadPlan(String(rule.loadingAdjustment ?? ''))
  const firstLoaded = item.sets.find((set) => typeof set.load_value === 'number')
  const currentLoad = typeof firstLoaded?.load_value === 'number' ? Number(firstLoaded.load_value) : null
  const currentUnit = firstLoaded?.load_unit === 'kg' ? 'kg' : firstLoaded?.load_unit === 'lb' ? 'lb' : null
  const suggestedLoad = loadPlan.mode === 'factor' && currentLoad != null && loadPlan.factor != null
    ? Math.round(currentLoad * loadPlan.factor * 2) / 2
    : loadPlan.mode === 'same' ? currentLoad : null
  return {
    eligible: true,
    rule,
    prescribedKey,
    prescribedName: String(snapshot.prescribedExerciseName ?? item.record.exercise_name_snapshot),
    performedKey: String(item.record.exercise_key),
    loadPlan,
    currentLoad,
    currentUnit,
    suggestedLoad,
  }
}

;(window as any).LetMeFlyWorkoutSubstitutionBridge = Object.freeze({
  preview(workoutExerciseId: string, alternativeExerciseKey: string) {
    return workoutSubstitutionPreview(workoutExerciseId, alternativeExerciseKey)
  },
  async apply(input: { workoutExerciseId: string; alternativeExerciseKey: string; manualLoadValue?: number | null; manualLoadUnit?: 'lb' | 'kg' | null }) {
    if (!state.athlete || !state.workout) throw new Error('No active workout is loaded')
    const preview = workoutSubstitutionPreview(input.workoutExerciseId, input.alternativeExerciseKey)
    if (!preview.eligible || !preview.rule || !preview.loadPlan) throw new Error(String(preview.reason ?? 'Substitution is not eligible'))
    const rule = preview.rule as Record<string, any>
    const alternative = (window as any).LetMeFlyExerciseIntelligence?.getExercise?.(input.alternativeExerciseKey)
    const alternativeName = String(alternative?.canonicalName ?? rule.alternativeExercise ?? '')
    if (!alternativeName) throw new Error('Substitute exercise name could not be resolved')
    state.workout = await substituteWorkoutExercise(state.athlete.id, input.workoutExerciseId, {
      alternativeExerciseKey: input.alternativeExerciseKey,
      alternativeExerciseName: alternativeName,
      ruleId: String(rule.id ?? '') || null,
      loadingAdjustment: String(rule.loadingAdjustment ?? '') || null,
      loadMode: preview.loadPlan.mode,
      loadFactor: preview.loadPlan.factor,
      manualLoadValue: preview.loadPlan.mode === 'manual' ? (input.manualLoadValue ?? null) : null,
      manualLoadUnit: preview.loadPlan.mode === 'manual' ? (input.manualLoadUnit ?? preview.currentUnit ?? null) : null,
    })
    state.cloud.syncSoon()
    showToast(`Using ${alternativeName} for this workout only`)
    render()
    return { ok: true, workoutExerciseId: input.workoutExerciseId, alternativeExerciseName: alternativeName }
  },
  async revert(workoutExerciseId: string) {
    if (!state.athlete || !state.workout) throw new Error('No active workout is loaded')
    state.workout = await revertWorkoutExerciseSubstitution(state.athlete.id, workoutExerciseId)
    state.cloud.syncSoon()
    showToast('Restored the programmed exercise for this workout')
    render()
    return { ok: true, workoutExerciseId }
  },
})
'''.strip()

if 'LetMeFlyWorkoutSubstitutionBridge' not in main:
    refresh = """async function refreshWorkout(): Promise<void> {\n  if (!state.athlete) return\n  state.workout = await findWorkoutForDay(state.athlete.id, state.selectedProgram, state.selectedWeek, state.selectedDay)\n}"""
    if refresh not in main:
        raise SystemExit('main refreshWorkout bridge insertion point missing')
    main = main.replace(refresh, refresh + '\n\n' + bridge_block, 1)

# Make active workout cards substitution-aware while leaving program source immutable.
start = main.find('function loggedExerciseCard(record: LocalDomainRecord, sets: LocalDomainRecord[]): string {')
end = main.find('\nfunction ', start + 10)
if start < 0 or end < 0:
    raise SystemExit('loggedExerciseCard function could not be isolated')
card = main[start:end]
if 'lmf-substitution-active' not in card:
    card = card.replace(
        "  const name = String(record.exercise_name_snapshot)\n  const library = getPrimaryExerciseMatch(name)",
        "  const name = String(record.exercise_name_snapshot)\n  const prescribedKey = String(record.substituted_from_exercise_key ?? snapshot.prescribedExerciseKey ?? record.exercise_key)\n  const prescribedName = String(snapshot.prescribedExerciseName ?? name)\n  const substituted = Boolean(record.substituted_from_exercise_key)\n  const substitutionMeta = (snapshot.substitution ?? {}) as Record<string, any>\n  const substitutionNotice = substituted ? `<div class=\"lmf-substitution-active\"><strong>TODAY'S SUBSTITUTE</strong><span>Programmed: ${esc(prescribedName)}</span>${substitutionMeta.loadingAdjustment ? `<small>Load guidance: ${esc(String(substitutionMeta.loadingAdjustment))}</small>` : ''}</div>` : ''\n  const library = getPrimaryExerciseMatch(name)",
        1,
    )
    card = card.replace(
        '  const alternatives = getApprovedSubstitutions(name, selectedSubstitutionProgram())',
        '  const alternatives = getApprovedSubstitutions(prescribedName, selectedSubstitutionProgram())',
        1,
    )
    card = card.replace(
        '<div class="set-table">${sets.map((set) => setRow(set)).join(\'\')}</div>',
        '${substitutionNotice}<div class="set-table">${sets.map((set) => setRow(set)).join(\'\')}</div>',
        1,
    )
    card = card.replace(
        'data-substitute="${esc(String(record.exercise_key))}" data-name="${esc(name)}">SUBSTITUTE${alternatives.length ? ` (${alternatives.length})` : \'\'}</button>',
        'data-substitute="${esc(prescribedKey)}" data-name="${esc(prescribedName)}" data-workout-exercise-id="${esc(record.id)}">${substituted ? \'CHANGE SUBSTITUTE\' : \'SUBSTITUTE\'}${alternatives.length ? ` (${alternatives.length})` : \'\'}</button>${substituted ? `<button class="btn small ghost" data-revert-substitution="${esc(record.id)}">UNDO SUBSTITUTE</button>` : \'\'}',
        1,
    )
    if 'data-workout-exercise-id=' not in card or 'UNDO SUBSTITUTE' not in card:
        raise SystemExit('loggedExerciseCard substitution controls patch failed')
    main = main[:start] + card + main[end:]

main_path.write_text(main)
service_path.write_text(service)
PY

# Compile-time guards: this feature may alter active workout records only. It must
# not modify governed program package files or add a direct public-shell DB path.
grep -Fq 'export async function substituteWorkoutExercise' "$SERVICE"
grep -Fq 'export async function revertWorkoutExerciseSubstitution' "$SERVICE"
grep -Fq 'substituted_from_exercise_key: prescribedKey' "$SERVICE"
grep -Fq 'Reopen completed sets before changing this exercise' "$SERVICE"
grep -Fq 'LetMeFlyWorkoutSubstitutionBridge' "$MAIN"
grep -Fq 'TODAY'"'"'S SUBSTITUTE' "$MAIN"
grep -Fq 'UNDO SUBSTITUTE' "$MAIN"

echo "Issue #54 workout-only substitution source patch: PASS"
