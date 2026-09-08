import { getAllFromIndex, type LocalDomainRecord } from '../db/local-db'
import { getCrownforgeDay, type ProgramDay, type ProgramExercise } from '../data/programs'
import type {
  CompletionRecord,
  PrescriptionItem,
  WorkPriority,
  WorkRole,
  WorkoutOutcome,
  WorkoutPrescription,
} from '../progression-engine/types.js'

export type ShadowReadinessColor = 'green' | 'yellow' | 'red' | 'unknown'

export interface ShadowWorkoutBundle {
  session: LocalDomainRecord
  exercises: Array<{
    record: LocalDomainRecord
    sets: LocalDomainRecord[]
  }>
}

export interface ShadowMappingResult {
  prescription: WorkoutPrescription
  outcome: WorkoutOutcome
  readiness: ShadowReadinessColor
  warnings: string[]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dayNumberFromSession(session: LocalDomainRecord): number | null {
  const match = /^day-(\d+)$/.exec(asString(session.day_key))
  return match ? Number(match[1]) : null
}

function readinessColorFromRecord(record: LocalDomainRecord | null): ShadowReadinessColor {
  if (!record) return 'unknown'
  const sleepQuality = asNumber(record.sleep_quality)
  const soreness = asNumber(record.soreness)
  const stress = asNumber(record.stress)
  const energy = asNumber(record.energy)
  if ([sleepQuality, soreness, stress, energy].some((value) => value === null)) return 'unknown'
  const avg = (sleepQuality! + (6 - soreness!) + (6 - stress!) + energy!) / 4
  if (avg >= 4) return 'green'
  if (avg >= 2.75) return 'yellow'
  return 'red'
}

async function readinessForSession(session: LocalDomainRecord): Promise<LocalDomainRecord | null> {
  const athleteId = asString(session.athlete_id)
  const cutoff = asString(session.completed_at) || asString(session.started_at) || new Date().toISOString()
  const rows = await getAllFromIndex<LocalDomainRecord>(
    'readinessEntries',
    'by-athlete-time',
    IDBKeyRange.bound([athleteId, ''], [athleteId, cutoff]),
  )
  return rows
    .filter((row) => !row.deleted_at)
    .sort((a, b) => Date.parse(asString(b.recorded_at)) - Date.parse(asString(a.recorded_at)))[0] ?? null
}

function isWarmupSection(sectionId: string, canonicalDay: ProgramDay | null): boolean {
  const source = canonicalDay?.sections.find((section) => section.id === sectionId)
  return sectionId.toLowerCase().includes('warmup') || /warm[- ]?up|primer|olympic prep/i.test(source?.title ?? '')
}

function sectionGroupType(sectionId: string, canonicalDay: ProgramDay | null): PrescriptionItem['groupType'] | undefined {
  const source = canonicalDay?.sections.find((section) => section.id === sectionId)
  const title = source?.title ?? ''
  if (/major.*conditioning.*circuit/i.test(title)) return 'MAJOR_CONDITIONING_CIRCUIT'
  if (/tri[- ]?set/i.test(title)) return 'TRISET'
  if (/superset/i.test(title)) return 'SUPERSET'
  if (/circuit|rounds?/i.test(title)) return 'CIRCUIT'
  return undefined
}

function looksIsolation(name: string): boolean {
  return /(curl|extension|lateral raise|rear delt|fly|flye|pushdown|calf raise|tibialis raise|face pull|external rotation)/i.test(name)
}

function roleForExercise(exercise: LocalDomainRecord): WorkRole {
  const name = asString(exercise.exercise_name_snapshot)
  const snapshot = (exercise.prescription_snapshot ?? {}) as Record<string, unknown>
  const category = asString(snapshot.category)

  if (/(carry|farmer|suitcase|rack walk|waiter walk)/i.test(name) || category === 'carry') return 'CARRY'
  if (/(sled|prowler)/i.test(name) || category === 'sled') return 'SLED'
  if (/(mobility|rockback|ankle rock|t-spine|90\/90|breathing|stretch)/i.test(name)) return 'RECOVERY_MOBILITY'
  if (looksIsolation(name)) return 'ISOLATION'
  if (category === 'primary') return 'PRIMARY_STRENGTH'
  if (category === 'power') return 'OLYMPIC_POWER'
  if (category === 'core') return 'CORE_STABILITY'
  if (category === 'recovery') return 'RECOVERY_MOBILITY'
  if (category === 'secondary') return 'SECONDARY_COMPOUND'
  if (category === 'kettlebell') {
    if (/swing|clean|snatch/i.test(name)) return 'OLYMPIC_POWER'
    if (/squat|rdl|deadlift|row|press/i.test(name)) return 'SECONDARY_COMPOUND'
    return 'ASSISTANCE'
  }
  return 'ASSISTANCE'
}

function priorityFromSnapshot(exercise: LocalDomainRecord): WorkPriority {
  const snapshot = (exercise.prescription_snapshot ?? {}) as Record<string, unknown>
  const priority = asString(snapshot.priority).toLowerCase()
  if (priority === 'optional') return 'OPTIONAL'
  if (priority === 'conditional') return 'CONDITIONAL'
  return 'MANDATORY'
}

function completedSetCount(sets: LocalDomainRecord[]): number {
  return sets.filter((set) => set.completed === true && !set.deleted_at).length
}

function resolvedPriority(
  sourcePriority: WorkPriority,
  readiness: ShadowReadinessColor,
  completedUnits: number,
): { priority: WorkPriority; conditionalActive?: boolean } {
  if (sourcePriority === 'MANDATORY') return { priority: 'MANDATORY' }

  if (readiness === 'red') return { priority: 'CONDITIONAL', conditionalActive: false }

  if (readiness === 'yellow') {
    if (sourcePriority === 'OPTIONAL') return { priority: 'CONDITIONAL', conditionalActive: false }
    return { priority: 'CONDITIONAL', conditionalActive: completedUnits > 0 }
  }

  if (readiness === 'unknown' && sourcePriority === 'CONDITIONAL') {
    return { priority: 'CONDITIONAL', conditionalActive: completedUnits > 0 }
  }

  if (sourcePriority === 'CONDITIONAL') return { priority: 'CONDITIONAL', conditionalActive: true }
  return { priority: sourcePriority }
}

function canonicalExercise(
  canonicalDay: ProgramDay | null,
  sectionId: string,
  exerciseKey: string,
): ProgramExercise | null {
  return canonicalDay?.sections
    .find((section) => section.id === sectionId)
    ?.exercises.find((exercise) => exercise.id === exerciseKey) ?? null
}

function sourceExerciseId(exercise: LocalDomainRecord): string {
  return asString(exercise.substituted_from_exercise_key)
    || asString(exercise.exercise_key)
    || exercise.id
}

function mapWarmupBlock(
  sectionId: string,
  rows: ShadowWorkoutBundle['exercises'],
  readiness: ShadowReadinessColor,
  canonicalDay: ProgramDay | null,
): { item: PrescriptionItem; completion: CompletionRecord } {
  let completedDrills = 0
  for (const row of rows) {
    const total = Math.max(1, row.sets.length)
    completedDrills += Math.min(1, completedSetCount(row.sets) / total)
  }
  const prescribedUnits = Math.max(1, rows.length)
  const groupType = sectionGroupType(sectionId, canonicalDay)
  return {
    item: {
      id: `warmup:${sectionId}`,
      role: 'WARMUP_BLOCK',
      priority: 'MANDATORY',
      prescribedUnits,
      ...(groupType && readiness !== 'red' ? { groupId: sectionId, groupType } : {}),
    },
    completion: {
      prescriptionItemId: `warmup:${sectionId}`,
      completedUnits: completedDrills,
    },
  }
}

export function mapWorkoutBundleToProgressionWithReadiness(
  bundle: ShadowWorkoutBundle,
  readiness: ShadowReadinessColor,
): ShadowMappingResult {
  const session = bundle.session
  const athleteId = asString(session.athlete_id)
  const programId = asString(session.program_key)
  const programVersion = asString(session.program_version)
  const programRunId = asString(session.program_instance_id)
  const week = Number(session.week_number)
  const day = dayNumberFromSession(session)
  const warnings: string[] = []

  if (!athleteId) throw new Error('Shadow progression mapping requires athlete_id')
  if (!programRunId) throw new Error('Shadow progression mapping requires program_instance_id as programRunId')
  if (!Number.isInteger(week) || week < 1) throw new Error('Shadow progression mapping requires a valid week_number')
  if (!day) throw new Error('Shadow progression mapping requires a valid day_key')

  const canonicalDay = programId === 'crownforge' ? getCrownforgeDay(week, day) : null
  if (!canonicalDay) warnings.push(`No canonical ${programId} day loaded for week ${week} day ${day}; group metadata is limited.`)
  if (readiness === 'unknown') warnings.push('No usable readiness entry was found at/before workout completion; conditional work is resolved conservatively from actual completion.')

  const items: PrescriptionItem[] = []
  const completion: CompletionRecord[] = []
  const bySection = new Map<string, ShadowWorkoutBundle['exercises']>()
  for (const row of bundle.exercises) {
    const sectionId = asString(row.record.group_key) || 'ungrouped'
    const list = bySection.get(sectionId) ?? []
    list.push(row)
    bySection.set(sectionId, list)
  }

  for (const [sectionId, rows] of bySection) {
    if (isWarmupSection(sectionId, canonicalDay)) {
      const warmup = mapWarmupBlock(sectionId, rows, readiness, canonicalDay)
      items.push(warmup.item)
      completion.push(warmup.completion)
      continue
    }

    const groupType = sectionGroupType(sectionId, canonicalDay)
    for (const row of rows) {
      const sourcePriority = priorityFromSnapshot(row.record)
      const done = completedSetCount(row.sets)
      const resolved = resolvedPriority(sourcePriority, readiness, done)
      const exerciseKey = asString(row.record.exercise_key)
      const source = canonicalExercise(canonicalDay, sectionId, exerciseKey)
      const sourceId = sourceExerciseId(row.record)
      const substitutedFrom = asString(row.record.substituted_from_exercise_key)

      const item: PrescriptionItem = {
        id: row.record.id,
        role: roleForExercise(row.record),
        priority: resolved.priority,
        prescribedUnits: Math.max(1, row.sets.length || source?.sets.length || 1),
        sourceExerciseId: sourceId,
        ...(resolved.conditionalActive !== undefined ? { conditionalActive: resolved.conditionalActive } : {}),
        ...(substitutedFrom ? { approvedSubstitutionFor: substitutedFrom } : {}),
        ...(groupType && readiness !== 'red' ? { groupId: sectionId, groupType } : {}),
      }
      items.push(item)
      completion.push({
        prescriptionItemId: item.id,
        completedUnits: done,
      })
    }
  }

  const completedAt = asString(session.completed_at) || new Date().toISOString()
  const prescription: WorkoutPrescription = {
    workoutId: session.id,
    athleteId,
    programId,
    programVersion,
    programRunId,
    week,
    day,
    items,
  }
  const outcome: WorkoutOutcome = {
    workoutId: session.id,
    athleteId,
    completion,
    completedAt,
    ...(readiness === 'red' ? { allCoreRequirementsComplete: false } : {}),
  }

  return { prescription, outcome, readiness, warnings }
}

export async function mapWorkoutBundleToProgression(bundle: ShadowWorkoutBundle): Promise<ShadowMappingResult> {
  const readinessRecord = await readinessForSession(bundle.session)
  return mapWorkoutBundleToProgressionWithReadiness(
    bundle,
    readinessColorFromRecord(readinessRecord),
  )
}

export function scheduledEventTypeForBundle(bundle: ShadowWorkoutBundle): 'WORKOUT' | 'REST' | 'RECOVERY' | 'DELOAD' {
  const session = bundle.session
  const week = Number(session.week_number)
  const day = dayNumberFromSession(session)
  const canonicalDay = asString(session.program_key) === 'crownforge' && day
    ? getCrownforgeDay(week, day)
    : null
  if (canonicalDay?.restDay) return 'REST'
  if (/recovery/i.test(canonicalDay?.title ?? asString(session.workout_name))) return 'RECOVERY'
  if (/deload/i.test(asString(session.phase_key)) || /deload/i.test(canonicalDay?.role ?? '')) return 'DELOAD'
  return 'WORKOUT'
}
