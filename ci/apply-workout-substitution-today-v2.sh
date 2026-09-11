#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
MAIN="$TARGET/src/main.ts"
SERVICE="$TARGET/src/services/workout-service.ts"
ATHLETE="$TARGET/src/services/athlete-service.ts"

for f in "$MAIN" "$SERVICE" "$ATHLETE"; do
  test -s "$f" || { echo "Missing Issue #54 v2 target: $f" >&2; exit 1; }
done

MAIN="$MAIN" SERVICE="$SERVICE" ATHLETE="$ATHLETE" python3 - <<'PY'
from pathlib import Path
import os
import re

main_path = Path(os.environ['MAIN'])
service_path = Path(os.environ['SERVICE'])
athlete_path = Path(os.environ['ATHLETE'])
main = main_path.read_text()
service = service_path.read_text()
athlete = athlete_path.read_text()


def ensure_named_import(text: str, module: str, names):
    pattern = re.compile(rf"import\s*\{{(?P<body>.*?)\}}\s*from\s*['\"]{re.escape(module)}['\"]", re.S)
    match = pattern.search(text)
    if match:
        whole = match.group(0)
        body = match.group('body')
        for name in names:
            if re.search(rf'\b{re.escape(name.replace("type ", ""))}\b', body):
                continue
            body = body.rstrip()
            if body and not body.rstrip().endswith(','):
                body += ','
            body += f"\n  {name},"
        replacement = whole[:whole.find('{') + 1] + body + '\n' + whole[whole.rfind('}'):]
        return text[:match.start()] + replacement + text[match.end():]
    rendered = ', '.join(names)
    return f"import {{ {rendered} }} from '{module}'\n" + text


# ---------- workout service: provenance, reasons, safe undo, prior performance ----------
if 'loadStrategy?: string | null' not in service:
    service = service.replace(
        "  manualLoadUnit?: 'lb' | 'kg' | null\n}",
        "  manualLoadUnit?: 'lb' | 'kg' | null\n  loadStrategy?: string | null\n  reason?: string | null\n  reasonDetail?: string | null\n}",
        1,
    )

service = service.replace(
    "    throw new Error('Reopen completed sets before changing this exercise so history stays accurate')",
    "    throw new Error('Completed substitute work is locked to the exercise actually performed. Keep this substitute for today; the next programmed occurrence resets automatically.')",
)
service = service.replace(
    "    throw new Error('Reopen completed substitute sets before reverting so history stays accurate')",
    "    throw new Error('Completed substitute work cannot be relabeled. Keep this substitute for today; the next programmed occurrence resets automatically.')",
)

if 'loadStrategy: input.loadStrategy ?? null' not in service:
    service = service.replace(
        "          loadFactor: input.loadFactor ?? null,\n          appliedAt: now,",
        "          loadFactor: input.loadFactor ?? null,\n          loadStrategy: input.loadStrategy ?? null,\n          reason: input.reason ?? null,\n          reasonDetail: input.reasonDetail ?? null,\n          appliedAt: now,",
        1,
    )
if 'substitutionReason: input.reason ?? null' not in service:
    service = service.replace(
        "          substitutionLoadFactor: input.loadFactor ?? null,\n        },",
        "          substitutionLoadFactor: input.loadFactor ?? null,\n          substitutionLoadStrategy: input.loadStrategy ?? null,\n          substitutionReason: input.reason ?? null,\n          substitutionReasonDetail: input.reasonDetail ?? null,\n        },",
        1,
    )
if 'delete perf.substitutionReason' not in service:
    service = service.replace(
        "    delete perf.substitutionLoadFactor\n",
        "    delete perf.substitutionLoadFactor\n    delete perf.substitutionLoadStrategy\n    delete perf.substitutionReason\n    delete perf.substitutionReasonDetail\n",
        1,
    )

history_block = r'''
export interface PreviousExercisePerformance {
  sessionId: string
  workoutName: string
  completedAt: string | null
  exerciseName: string
  sets: Array<{
    setNumber: number
    reps: number | null
    loadValue: number | null
    loadUnit: 'lb' | 'kg' | null
    rpe: number | null
    rir: number | null
    metricKind: string | null
    metricValue: number | null
    metricUnit: string | null
  }>
}

export async function previousExercisePerformance(
  athleteId: string,
  exerciseKey: string,
  excludeSessionId?: string | null,
): Promise<PreviousExercisePerformance | null> {
  const sessions = await getAllFromIndex<LocalDomainRecord>('workoutSessions', 'by-athlete', athleteId)
  const candidates = sessions
    .filter((row) => !row.deleted_at && row.status === 'completed' && row.id !== excludeSessionId)
    .sort((a, b) => Date.parse(String(b.completed_at ?? b.started_at ?? b.created_at ?? 0)) - Date.parse(String(a.completed_at ?? a.started_at ?? a.created_at ?? 0)))

  for (const session of candidates) {
    const exercises = await getAllFromIndex<LocalDomainRecord>('workoutExercises', 'by-session', session.id)
    const performed = exercises
      .filter((row) => !row.deleted_at && String(row.exercise_key) === exerciseKey)
      .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))[0]
    if (!performed) continue
    const rows = await getAllFromIndex<LocalDomainRecord>('workoutSets', 'by-exercise', performed.id)
    const completed = rows
      .filter((row) => !row.deleted_at && Boolean(row.completed))
      .sort((a, b) => Number(a.set_number ?? 0) - Number(b.set_number ?? 0))
    if (!completed.length) continue
    return {
      sessionId: String(session.id),
      workoutName: String(session.workout_name ?? 'Workout'),
      completedAt: session.completed_at ? String(session.completed_at) : null,
      exerciseName: String(performed.exercise_name_snapshot ?? exerciseKey),
      sets: completed.map((set) => {
        const perf = (set.performance_data ?? {}) as Record<string, any>
        return {
          setNumber: Number(set.set_number ?? 0),
          reps: typeof set.reps === 'number' ? set.reps : null,
          loadValue: typeof set.load_value === 'number' ? set.load_value : null,
          loadUnit: set.load_unit === 'kg' ? 'kg' : set.load_unit === 'lb' ? 'lb' : null,
          rpe: typeof set.rpe === 'number' ? set.rpe : null,
          rir: typeof set.rir === 'number' ? set.rir : null,
          metricKind: perf.actualMetricKind ? String(perf.actualMetricKind) : null,
          metricValue: typeof perf.actualMetricValue === 'number' ? perf.actualMetricValue : null,
          metricUnit: perf.actualMetricUnit ? String(perf.actualMetricUnit) : null,
        }
      }),
    }
  }
  return null
}
'''.strip()

if 'export async function previousExercisePerformance(' not in service:
    marker = 'export async function completeWorkout('
    idx = service.find(marker)
    if idx < 0:
        raise SystemExit('Issue #54 v2 previous-performance insertion point missing')
    service = service[:idx] + history_block + '\n\n' + service[idx:]

# ---------- athlete profile: equipment enrichment through the normal outbox path ----------
athlete = ensure_named_import(athlete, '../db/local-db', ['getById', 'getOrCreateDeviceState', 'type LocalDomainRecord'])
athlete = ensure_named_import(athlete, '../db/local-mutations', ['putEntityWithOutbox'])

equipment_profile_block = r'''
export type SubstitutionEquipmentAvailability = 'available' | 'unavailable'

export async function updateSubstitutionEquipmentProfile(
  athleteId: string,
  exerciseKey: string,
  equipment: string[],
  availability: SubstitutionEquipmentAvailability,
): Promise<LocalDomainRecord> {
  const existing = await getById<LocalDomainRecord>('athletes', athleteId)
  if (!existing || existing.deleted_at) throw new Error('Athlete profile not found')
  const now = new Date().toISOString()
  const current = existing.profile_context_v2 && typeof existing.profile_context_v2 === 'object'
    ? { ...(existing.profile_context_v2 as Record<string, any>) }
    : {}
  const access = current.equipmentAccess && typeof current.equipmentAccess === 'object'
    ? { ...(current.equipmentAccess as Record<string, any>) }
    : {}
  access[exerciseKey] = { availability, equipment: [...equipment], updatedAt: now }

  let equipmentText = String(current.equipment ?? existing.equipment ?? '').trim()
  if (availability === 'available') {
    const normalized = equipmentText.toLowerCase()
    const additions = equipment.filter((item) => item && !normalized.includes(String(item).toLowerCase()))
    if (additions.length) equipmentText = [equipmentText, ...additions].filter(Boolean).join(', ')
  }

  const nextContext = {
    ...current,
    equipment: equipmentText,
    equipmentAccess: access,
    updatedAt: now,
    version: Math.max(2, Number(current.version ?? 2)),
  }
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  return putEntityWithOutbox(
    'athletes',
    { ...existing, profile_context_v2: nextContext },
    { athleteId, deviceId: device.deviceId },
  )
}
'''.strip()

if 'export async function updateSubstitutionEquipmentProfile(' not in athlete:
    marker_match = re.search(r'export\s+async\s+function\s+getCurrentProgramInstance\s*\(', athlete)
    idx = marker_match.start() if marker_match else len(athlete)
    athlete = athlete[:idx] + equipment_profile_block + '\n\n' + athlete[idx:]

# ---------- main: structured load strategy, equipment gate, history, reason ----------
main = ensure_named_import(main, './services/workout-service', ['previousExercisePerformance'])
main = ensure_named_import(main, './services/athlete-service', ['updateSubstitutionEquipmentProfile'])

load_start = main.find('function workoutSubstitutionLoadPlan(')
load_end_marker = '\n\nfunction workoutSubstitutionExercise('
load_end = main.find(load_end_marker, load_start)
if load_start < 0 or load_end < 0:
    raise SystemExit('Issue #54 v2 structured load-plan function boundary missing')
structured_load = r'''function workoutSubstitutionLoadPlan(rule: Record<string, any>): { mode: 'same' | 'factor' | 'manual' | 'none'; strategy: string; factor: number | null; explanation: string } {
  const transfer = rule?.loadTransfer && typeof rule.loadTransfer === 'object' ? rule.loadTransfer as Record<string, any> : {}
  const strategy = String(transfer.strategy ?? 'rpe-guided')
  const explanation = String(transfer.rationale ?? rule?.loadingAdjustment ?? 'Use the programmed effort target and choose an appropriate starting load.')
  if (strategy === 'same-load') return { mode: 'same', strategy, factor: 1, explanation }
  if (strategy === 'percentage-adjustment') {
    const factor = typeof transfer.factor === 'number' && Number.isFinite(transfer.factor) && transfer.factor > 0 ? Number(transfer.factor) : null
    return factor == null
      ? { mode: 'manual', strategy: 'rpe-guided', factor: null, explanation: 'The conversion rule is incomplete; choose an appropriate starting load.' }
      : { mode: 'factor', strategy, factor, explanation }
  }
  if (strategy === 'no-load-transfer') return { mode: 'none', strategy, factor: null, explanation }
  if (strategy === 'rep-guided') return { mode: 'manual', strategy, factor: null, explanation }
  return { mode: 'manual', strategy: 'rpe-guided', factor: null, explanation }
}'''
main = main[:load_start] + structured_load + main[load_end:]
main = main.replace(
    "  const loadPlan = workoutSubstitutionLoadPlan(String(rule.loadingAdjustment ?? ''))",
    "  const loadPlan = workoutSubstitutionLoadPlan(rule as Record<string, any>)",
    1,
)

helper_marker = 'function workoutSubstitutionExercise(workoutExerciseId: string) {'
helper_idx = main.find(helper_marker)
if helper_idx < 0:
    raise SystemExit('Issue #54 v2 workout exercise helper missing')
helper_end = main.find('\n}\n\nfunction workoutSubstitutionPreview', helper_idx)
if helper_end < 0:
    raise SystemExit('Issue #54 v2 workout exercise helper boundary missing')
helper_end += 2

equipment_helpers = r'''

const workoutSubstitutionTemporaryEquipment = new Map<string, 'available' | 'unavailable'>()

function workoutSubstitutionEquipmentStatus(alternativeExerciseKey: string) {
  const intelligence = (window as any).LetMeFlyExerciseIntelligence
  const alternative = intelligence?.getExercise?.(alternativeExerciseKey)
  const equipment = Array.isArray(alternative?.equipment)
    ? alternative.equipment.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
    : []
  if (!equipment.length) return { status: 'available', equipment, source: 'none-required' }

  const temporary = workoutSubstitutionTemporaryEquipment.get(alternativeExerciseKey)
  if (temporary) return { status: temporary, equipment, source: 'today-only' }

  const athlete = state.athlete as any
  const profile = athlete?.profile_context_v2 && typeof athlete.profile_context_v2 === 'object' ? athlete.profile_context_v2 as Record<string, any> : {}
  const persisted = profile.equipmentAccess && typeof profile.equipmentAccess === 'object'
    ? (profile.equipmentAccess as Record<string, any>)[alternativeExerciseKey]
    : null
  if (persisted?.availability === 'available' || persisted?.availability === 'unavailable') {
    return { status: persisted.availability, equipment, source: 'profile' }
  }

  const raw = String(profile.equipment ?? athlete?.equipment ?? '')
  const lower = raw.toLowerCase()
  const simplify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const haystack = simplify(raw)
  const explicitlyUnavailable = equipment.some((item: string) => {
    const escaped = item.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:no|without|unavailable|do not have|don't have)\\s+(?:a\\s+|an\\s+|the\\s+)?${escaped}`).test(lower)
  })
  if (explicitlyUnavailable) return { status: 'unavailable', equipment, source: 'profile-text' }
  const knownAvailable = equipment.some((item: string) => {
    const token = simplify(item)
    return token.length >= 3 && haystack.includes(token)
  })
  if (knownAvailable) return { status: 'available', equipment, source: 'profile-text' }
  return { status: 'unknown', equipment, source: 'unknown' }
}
'''
if 'workoutSubstitutionTemporaryEquipment' not in main:
    main = main[:helper_end] + equipment_helpers + main[helper_end:]

# Include equipment status in every governed preview.
if 'equipment: workoutSubstitutionEquipmentStatus(alternativeExerciseKey)' not in main:
    main = main.replace(
        "    suggestedLoad,\n  }",
        "    suggestedLoad,\n    equipment: workoutSubstitutionEquipmentStatus(alternativeExerciseKey),\n  }",
        1,
    )

# Enforce equipment availability at the mutation bridge, not only in presentation.
main = main.replace(
    "    if (!preview.eligible || !preview.rule || !preview.loadPlan) throw new Error(String(preview.reason ?? 'Substitution is not eligible'))\n    const rule = preview.rule as Record<string, any>",
    "    if (!preview.eligible || !preview.rule || !preview.loadPlan) throw new Error(String(preview.reason ?? 'Substitution is not eligible'))\n    if (preview.equipment?.status === 'unknown') throw new Error('Confirm equipment availability before applying this substitute.')\n    if (preview.equipment?.status === 'unavailable') throw new Error('This substitute is marked unavailable with the current equipment setup.')\n    const rule = preview.rule as Record<string, any>",
    1,
)

# Expand bridge apply payload and persisted coaching context.
main = main.replace(
    "  async apply(input: { workoutExerciseId: string; alternativeExerciseKey: string; manualLoadValue?: number | null; manualLoadUnit?: 'lb' | 'kg' | null }) {",
    "  async apply(input: { workoutExerciseId: string; alternativeExerciseKey: string; manualLoadValue?: number | null; manualLoadUnit?: 'lb' | 'kg' | null; reason?: string | null; reasonDetail?: string | null }) {",
    1,
)
if 'loadStrategy: preview.loadPlan.strategy' not in main:
    main = main.replace(
        "      loadFactor: preview.loadPlan.factor,\n      manualLoadValue:",
        "      loadFactor: preview.loadPlan.factor,\n      loadStrategy: preview.loadPlan.strategy,\n      reason: input.reason ?? null,\n      reasonDetail: input.reasonDetail ?? null,\n      manualLoadValue:",
        1,
    )

# Add previous-performance + equipment/profile APIs to the narrow bridge.
bridge_insert = r'''  async previousPerformance(workoutExerciseId: string, alternativeExerciseKey: string) {
    if (!state.athlete || !state.workout) return null
    const item = workoutSubstitutionExercise(workoutExerciseId)
    if (!item) return null
    const preview = workoutSubstitutionPreview(workoutExerciseId, alternativeExerciseKey)
    if (!preview.eligible && String(item.record.exercise_key) !== alternativeExerciseKey) return null
    return previousExercisePerformance(state.athlete.id, alternativeExerciseKey, String(state.workout.session.id))
  },
  equipment(alternativeExerciseKey: string) {
    return workoutSubstitutionEquipmentStatus(alternativeExerciseKey)
  },
  async setEquipmentAvailability(input: { alternativeExerciseKey: string; availability: 'available' | 'unavailable'; persist?: boolean }) {
    if (!state.athlete) throw new Error('No athlete profile is loaded')
    const status = workoutSubstitutionEquipmentStatus(input.alternativeExerciseKey)
    const equipment = status.equipment ?? []
    if (input.persist) {
      state.athlete = await updateSubstitutionEquipmentProfile(state.athlete.id, input.alternativeExerciseKey, equipment, input.availability)
      state.cloud.syncSoon()
      window.dispatchEvent(new CustomEvent('lmf:profile-v2-updated', { detail: { athleteId: state.athlete.id, source: 'substitution-equipment' } }))
    } else {
      workoutSubstitutionTemporaryEquipment.set(input.alternativeExerciseKey, input.availability)
    }
    return workoutSubstitutionEquipmentStatus(input.alternativeExerciseKey)
  },
'''
if 'async previousPerformance(workoutExerciseId:' not in main:
    needle = "  async apply(input: { workoutExerciseId: string;"
    idx = main.find(needle, main.find('LetMeFlyWorkoutSubstitutionBridge'))
    if idx < 0:
        raise SystemExit('Issue #54 v2 bridge API insertion point missing')
    main = main[:idx] + bridge_insert + main[idx:]

# Card should communicate program slot vs performed movement and make completed
# substitute work immutable rather than telling the athlete to reopen/relabel it.
old_notice = "  const substitutionNotice = substituted ? `<div class=\"lmf-substitution-active\"><strong>TODAY'S SUBSTITUTE</strong><span>Programmed: ${esc(prescribedName)}</span>${substitutionMeta.loadingAdjustment ? `<small>Load guidance: ${esc(String(substitutionMeta.loadingAdjustment))}</small>` : ''}</div>` : ''"
new_notice = "  const hasCompletedSubstituteSets = substituted && sets.some((set) => Boolean(set.completed))\n  const substitutionReason = String(substitutionMeta.reason ?? '').trim()\n  const substitutionNotice = substituted ? `<div class=\"lmf-substitution-active\"><strong>PERFORMING TODAY: ${esc(name)}</strong><span>PROGRAM SLOT: ${esc(prescribedName)}</span>${substitutionReason ? `<small>Reason: ${esc(substitutionReason)}</small>` : ''}${substitutionMeta.loadingAdjustment ? `<small>Load guidance: ${esc(String(substitutionMeta.loadingAdjustment))}</small>` : ''}${hasCompletedSubstituteSets ? `<small class=\"lmf-substitution-lock\">Logged substitute work is locked to the movement actually performed. The next programmed occurrence resets automatically.</small>` : ''}</div>` : ''"
if old_notice in main:
    main = main.replace(old_notice, new_notice, 1)
elif 'hasCompletedSubstituteSets' not in main:
    raise SystemExit('Issue #54 v2 workout substitution card notice patch point missing')

old_controls = "data-substitute=\"${esc(prescribedKey)}\" data-name=\"${esc(prescribedName)}\" data-workout-exercise-id=\"${esc(record.id)}\">${substituted ? 'CHANGE SUBSTITUTE' : 'SUBSTITUTE'}${alternatives.length ? ` (${alternatives.length})` : ''}</button>${substituted ? `<button class=\"btn small ghost\" data-revert-substitution=\"${esc(record.id)}\">UNDO SUBSTITUTE</button>` : ''}"
new_controls = "data-substitute=\"${esc(prescribedKey)}\" data-name=\"${esc(prescribedName)}\" data-workout-exercise-id=\"${esc(record.id)}\" ${hasCompletedSubstituteSets ? 'disabled aria-disabled=\"true\"' : ''}>${hasCompletedSubstituteSets ? 'SUBSTITUTE LOCKED' : substituted ? 'CHANGE SUBSTITUTE' : 'SUBSTITUTE'}${!hasCompletedSubstituteSets && alternatives.length ? ` (${alternatives.length})` : ''}</button>${substituted && !hasCompletedSubstituteSets ? `<button class=\"btn small ghost\" data-revert-substitution=\"${esc(record.id)}\">UNDO SUBSTITUTE</button>` : ''}"
if old_controls in main:
    main = main.replace(old_controls, new_controls, 1)
elif 'SUBSTITUTE LOCKED' not in main:
    raise SystemExit('Issue #54 v2 workout substitution controls patch point missing')

main_path.write_text(main)
service_path.write_text(service)
athlete_path.write_text(athlete)
PY

# Exact feature guards.
grep -Fq "loadStrategy?: string | null" "$SERVICE"
grep -Fq "substitutionReason: input.reason ?? null" "$SERVICE"
grep -Fq "export async function previousExercisePerformance" "$SERVICE"
grep -Fq "Completed substitute work cannot be relabeled" "$SERVICE"
grep -Fq "export async function updateSubstitutionEquipmentProfile" "$ATHLETE"
grep -Fq "equipmentAccess" "$ATHLETE"
grep -Fq "workoutSubstitutionTemporaryEquipment" "$MAIN"
grep -Fq "Confirm equipment availability before applying this substitute" "$MAIN"
grep -Fq "async previousPerformance(workoutExerciseId" "$MAIN"
grep -Fq "loadStrategy: preview.loadPlan.strategy" "$MAIN"
grep -Fq "SUBSTITUTE LOCKED" "$MAIN"
! grep -Fq "function workoutSubstitutionLoadPlan(textValue" "$MAIN"

echo "Issue #54 substitution coaching/profile completion patch: PASS"
