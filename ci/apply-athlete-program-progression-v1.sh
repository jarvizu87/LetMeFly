#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"

if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" || ! -f "$TARGET_DIR/src/services/workout-service.ts" ]]; then
  echo "Usage: $0 <letmefly_app_source_dir>" >&2
  exit 1
fi

hash_tree() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    printf 'missing'
    return
  fi
  find "$dir" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}

CF_BEFORE="$(hash_tree "$TARGET_DIR/src/programs/crownforge")"
CM_BEFORE="$(hash_tree "$TARGET_DIR/src/programs/crown-maintenance")"
BC_BEFORE="$(hash_tree "$TARGET_DIR/src/programs/black-crown")"

cat > "$TARGET_DIR/src/services/program-progression-service.ts" <<'TS'
import {
  getAllFromIndex,
  getOrCreateDeviceState,
  newId,
  openLetMeFlyDb,
  requestToPromise,
  transactionDone,
  type LocalDomainRecord,
} from '../db/local-db'
import { makeOutboxEntry, prepareLocalMutation } from '../db/local-mutations'
import {
  BLACK_CROWN,
  CROWNFORGE,
  CROWN_MAINTENANCE,
  type PublicProgramKey,
  type PublicProgramDefinition,
} from '../data/programs'
import { getCurrentProgramInstance, getLatestTrainingMaxes } from './athlete-service'

export type EntryColor = 'green' | 'yellow' | 'red'
export type BlackCrownEntryLiftKey = 'front-squat' | 'back-squat' | 'bench-press' | 'deadlift'

export interface BlackCrownEntryLiftInput {
  verified1RmLb: number
  readiness: EntryColor
}

export interface BlackCrownEntryAssessment {
  lifts: Record<BlackCrownEntryLiftKey, BlackCrownEntryLiftInput>
  optionalOHP?: BlackCrownEntryLiftInput | null
}

export interface ProgramPosition {
  program: PublicProgramKey
  week: number
  day: number
}

export interface ProgressionResult {
  action: 'advanced' | 'maintenance-started' | 'entry-gate' | 'black-crown-started' | 'blocked' | 'program-complete' | 'repositioned'
  instance: LocalDomainRecord | null
  message: string
  approvedTms?: Record<string, number>
}

const PROGRAMS: Record<PublicProgramKey, PublicProgramDefinition> = {
  crownforge: CROWNFORGE,
  'crown-maintenance': CROWN_MAINTENANCE,
  'black-crown': BLACK_CROWN,
}

export function roundNearest5(value: number): number {
  return Math.round(value / 5) * 5
}

export function roundUp5(value: number): number {
  return Math.ceil(value / 5) * 5
}

export function roundDown5(value: number): number {
  return Math.floor(value / 5) * 5
}

function positive(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number`)
  return parsed
}

function entryFactor(color: EntryColor): number | null {
  if (color === 'green') return 0.9
  if (color === 'yellow') return 0.875
  return null
}

function dayNumber(instance: LocalDomainRecord): number {
  const match = String(instance.current_day_key ?? 'day-1').match(/(\d+)/)
  return match ? Number(match[1]) : 1
}

export function positionFromProgramInstance(instance: LocalDomainRecord | null): ProgramPosition | null {
  if (!instance) return null
  const program = String(instance.program_key) as PublicProgramKey
  if (!(program in PROGRAMS)) return null
  return {
    program,
    week: Number(instance.current_week ?? 1),
    day: dayNumber(instance),
  }
}

export function isCurrentProgramPosition(
  instance: LocalDomainRecord | null,
  program: PublicProgramKey,
  week: number,
  day: number,
): boolean {
  const current = positionFromProgramInstance(instance)
  return Boolean(current && current.program === program && current.week === week && current.day === day)
}

function phaseFor(program: PublicProgramKey, week: number): string {
  if (program === 'black-crown') return `block-${Math.ceil(week / 6)}`
  if (program === 'crown-maintenance') return 'maintenance'
  return week <= 12 ? 'build' : 'testing'
}

function definitionFor(program: PublicProgramKey): PublicProgramDefinition {
  return PROGRAMS[program]
}

function validatePosition(program: PublicProgramKey, week: number, day: number): void {
  const definition = definitionFor(program)
  const sourceWeek = definition.weekData.find((item) => item.week === week)
  if (!sourceWeek || !sourceWeek.days.some((item) => item.day === day)) {
    throw new Error(`No governed ${program} position exists at Week ${week} Day ${day}`)
  }
}

function nextPosition(program: PublicProgramKey, week: number, day: number): ProgramPosition | null {
  const definition = definitionFor(program)
  const weekIndex = definition.weekData.findIndex((item) => item.week === week)
  if (weekIndex < 0) return null
  const currentWeek = definition.weekData[weekIndex]
  const dayIndex = currentWeek.days.findIndex((item) => item.day === day)
  if (dayIndex < 0) return null
  const nextDay = currentWeek.days[dayIndex + 1]
  if (nextDay) return { program, week, day: nextDay.day }
  const nextWeek = definition.weekData[weekIndex + 1]
  if (nextWeek?.days[0]) return { program, week: nextWeek.week, day: nextWeek.days[0].day }
  return null
}

function eventInput(
  athleteId: string,
  programInstanceId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: newId(),
    athlete_id: athleteId,
    program_instance_id: programInstanceId,
    event_type: eventType,
    effective_at: new Date().toISOString(),
    event_payload: payload,
    notes: null,
  }
}

async function updatePositionWithEvent(
  athleteId: string,
  instance: LocalDomainRecord,
  next: ProgramPosition,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id))
    if (!current || current.athlete_id !== athleteId || current.status !== 'active') {
      tx.abort()
      throw new Error('Active program instance changed before progression could be saved')
    }
    const updated = prepareLocalMutation({
      ...current,
      current_week: next.week,
      current_day_key: `day-${next.day}`,
      current_phase_key: phaseFor(next.program, next.week),
    }, context, current)
    store.put(updated)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', updated, context, 'upsert'))

    const event = prepareLocalMutation(eventInput(athleteId, current.id, eventType, payload), context)
    tx.objectStore('programEvents').put(event)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', event, context, 'upsert'))
    await transactionDone(tx)
    return updated
  } finally {
    db.close()
  }
}

async function transitionToMaintenance(
  athleteId: string,
  instance: LocalDomainRecord,
): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id))
    if (!current || current.athlete_id !== athleteId || current.status !== 'active' || current.program_key !== 'crownforge') {
      tx.abort()
      throw new Error('Crownforge is no longer the active athlete program')
    }

    const completed = prepareLocalMutation({ ...current, status: 'completed', completed_on: new Date().toISOString().slice(0, 10) }, context, current)
    store.put(completed)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', completed, context, 'upsert'))

    const maintenanceId = newId()
    const maintenance = prepareLocalMutation({
      id: maintenanceId,
      athlete_id: athleteId,
      program_key: 'crown-maintenance',
      program_name: CROWN_MAINTENANCE.name,
      program_version: CROWN_MAINTENANCE.version,
      program_definition_hash: null,
      program_snapshot: { sourceEngine: CROWN_MAINTENANCE.sourceEngine ?? null, handoffFrom: 'crownforge' },
      status: 'active',
      started_on: new Date().toISOString().slice(0, 10),
      current_phase_key: 'maintenance',
      current_week: 1,
      current_day_key: `day-${CROWN_MAINTENANCE.weekData[0]?.days[0]?.day ?? 1}`,
      progression_state: { handoffFrom: current.id, blackCrownEntryStatus: 'not-ready' },
    }, context)
    store.put(maintenance)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', maintenance, context, 'upsert'))

    const event = prepareLocalMutation(eventInput(athleteId, current.id, 'crownforge-complete-maintenance-start', {
      from_program_instance_id: current.id,
      to_program_instance_id: maintenance.id,
    }), context)
    tx.objectStore('programEvents').put(event)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', event, context, 'upsert'))
    await transactionDone(tx)
    return maintenance
  } finally {
    db.close()
  }
}

async function openBlackCrownEntryGate(
  athleteId: string,
  instance: LocalDomainRecord,
): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id))
    if (!current || current.athlete_id !== athleteId || current.status !== 'active' || current.program_key !== 'crown-maintenance') {
      tx.abort()
      throw new Error('Crown Maintenance is no longer the active athlete program')
    }
    const previous = (current.progression_state ?? {}) as Record<string, unknown>
    const updated = prepareLocalMutation({
      ...current,
      current_phase_key: 'black-crown-entry',
      progression_state: {
        ...previous,
        handoffReady: true,
        blackCrownEntryStatus: 'pending',
        handoffReadyAt: new Date().toISOString(),
      },
    }, context, current)
    store.put(updated)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', updated, context, 'upsert'))
    const event = prepareLocalMutation(eventInput(athleteId, current.id, 'black-crown-entry-gate-opened', {
      source: 'crown-maintenance-complete',
    }), context)
    tx.objectStore('programEvents').put(event)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', event, context, 'upsert'))
    await transactionDone(tx)
    return updated
  } finally {
    db.close()
  }
}

export async function advanceProgramAfterWorkout(
  athleteId: string,
  program: PublicProgramKey,
  week: number,
  day: number,
): Promise<ProgressionResult> {
  const instance = await getCurrentProgramInstance(athleteId)
  if (!instance || !isCurrentProgramPosition(instance, program, week, day)) {
    throw new Error('Workout is not the athlete’s active governed program position; progression was not changed')
  }

  const next = nextPosition(program, week, day)
  if (next) {
    const updated = await updatePositionWithEvent(athleteId, instance, next, 'program-position-advanced', {
      from: { program, week, day },
      to: next,
    })
    return { action: 'advanced', instance: updated, message: `${definitionFor(program).name} advanced to Week ${next.week} Day ${next.day}.` }
  }

  if (program === 'crownforge') {
    const maintenance = await transitionToMaintenance(athleteId, instance)
    return { action: 'maintenance-started', instance: maintenance, message: 'Crownforge complete. Crown Maintenance Week 1 Day 1 is now active.' }
  }

  if (program === 'crown-maintenance') {
    const gated = await openBlackCrownEntryGate(athleteId, instance)
    return { action: 'entry-gate', instance: gated, message: 'Crown Maintenance complete. Black Crown entry gate is ready for verified maxes and lift-by-lift readiness.' }
  }

  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id))
    if (!current || current.status !== 'active') {
      tx.abort()
      throw new Error('Black Crown program instance changed before completion could be saved')
    }
    const completed = prepareLocalMutation({ ...current, status: 'completed', current_phase_key: 'complete', completed_on: new Date().toISOString().slice(0, 10) }, context, current)
    store.put(completed)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', completed, context, 'upsert'))
    const event = prepareLocalMutation(eventInput(athleteId, current.id, 'black-crown-program-complete', { week, day }), context)
    tx.objectStore('programEvents').put(event)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', event, context, 'upsert'))
    await transactionDone(tx)
  } finally {
    db.close()
  }
  return { action: 'program-complete', instance: null, message: 'Black Crown Week 54 is complete. No next program was invented.' }
}

export async function setIntentionalProgramPosition(
  athleteId: string,
  program: PublicProgramKey,
  week: number,
  day: number,
  reason = 'athlete-intentional-reposition',
): Promise<ProgressionResult> {
  validatePosition(program, week, day)
  const instance = await getCurrentProgramInstance(athleteId)
  if (!instance) throw new Error('No active athlete program exists')
  const current = positionFromProgramInstance(instance)
  if (!current || current.program !== program) {
    throw new Error('Cross-program repositioning is blocked. Complete the governed handoff instead.')
  }
  const updated = await updatePositionWithEvent(athleteId, instance, { program, week, day }, 'program-position-repositioned', {
    from: current,
    to: { program, week, day },
    reason,
  })
  return { action: 'repositioned', instance: updated, message: `${definitionFor(program).name} current position set to Week ${week} Day ${day}.` }
}

async function markEntryBlocked(
  athleteId: string,
  instance: LocalDomainRecord,
  assessment: BlackCrownEntryAssessment,
  reason: string,
): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id))
    if (!current || current.status !== 'active') {
      tx.abort()
      throw new Error('Black Crown entry gate changed before the decision could be saved')
    }
    const previous = (current.progression_state ?? {}) as Record<string, unknown>
    const updated = prepareLocalMutation({
      ...current,
      progression_state: {
        ...previous,
        handoffReady: true,
        blackCrownEntryStatus: 'blocked',
        lastEntryAssessmentAt: new Date().toISOString(),
        lastEntryBlockReason: reason,
      },
    }, context, current)
    store.put(updated)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', updated, context, 'upsert'))
    const event = prepareLocalMutation(eventInput(athleteId, current.id, 'black-crown-entry-blocked', { assessment, reason }), context)
    tx.objectStore('programEvents').put(event)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', event, context, 'upsert'))
    await transactionDone(tx)
    return updated
  } finally {
    db.close()
  }
}

function tmToLb(row: LocalDomainRecord): number {
  const value = positive(row.tm_value, 'OHP training max')
  return String(row.tm_unit ?? 'lb') === 'kg' ? value * 2.2046226218 : value
}

export async function activateBlackCrownFromEntry(
  athleteId: string,
  assessment: BlackCrownEntryAssessment,
): Promise<ProgressionResult> {
  const instance = await getCurrentProgramInstance(athleteId)
  if (!instance || instance.program_key !== 'crown-maintenance' || instance.status !== 'active') {
    throw new Error('Black Crown entry requires the active Crown Maintenance handoff')
  }
  const progression = (instance.progression_state ?? {}) as Record<string, unknown>
  if (instance.current_phase_key !== 'black-crown-entry' && progression.handoffReady !== true) {
    throw new Error('Complete Crown Maintenance before activating Black Crown')
  }

  const requiredKeys: BlackCrownEntryLiftKey[] = ['front-squat', 'back-squat', 'bench-press', 'deadlift']
  const normalized = {} as Record<BlackCrownEntryLiftKey, BlackCrownEntryLiftInput>
  for (const key of requiredKeys) {
    const input = assessment.lifts[key]
    if (!input) throw new Error(`Missing ${key} Black Crown entry result`)
    normalized[key] = { verified1RmLb: positive(input.verified1RmLb, `${key} verified 1RM`), readiness: input.readiness }
  }

  const redMain = requiredKeys.filter((key) => normalized[key].readiness === 'red')
  if (redMain.length) {
    const reason = `Red entry status delays activation for: ${redMain.join(', ')}`
    const blocked = await markEntryBlocked(athleteId, instance, { ...assessment, lifts: normalized }, reason)
    return { action: 'blocked', instance: blocked, message: reason }
  }

  const approved: Record<string, number> = {}
  for (const key of requiredKeys) {
    const factor = entryFactor(normalized[key].readiness)
    if (!factor) throw new Error(`${key} has no valid entry factor`)
    approved[key] = roundNearest5(normalized[key].verified1RmLb * factor)
  }
  approved['box-squat'] = roundDown5(approved['back-squat'] * 0.9)

  const latestTms = await getLatestTrainingMaxes(athleteId)
  let ohpSource: 'tested' | 'carry'
  if (assessment.optionalOHP) {
    const ohp = {
      verified1RmLb: positive(assessment.optionalOHP.verified1RmLb, 'OHP verified 1RM'),
      readiness: assessment.optionalOHP.readiness,
    }
    if (ohp.readiness === 'red') {
      const carried = latestTms['overhead-press']
      if (!carried) {
        const reason = 'OHP entry is Red and no current OHP working reference exists to carry.'
        const blocked = await markEntryBlocked(athleteId, instance, assessment, reason)
        return { action: 'blocked', instance: blocked, message: reason }
      }
      approved['overhead-press'] = roundNearest5(tmToLb(carried))
      ohpSource = 'carry'
    } else {
      approved['overhead-press'] = roundNearest5(ohp.verified1RmLb * (entryFactor(ohp.readiness) ?? 0))
      ohpSource = 'tested'
    }
  } else {
    const carried = latestTms['overhead-press']
    if (!carried) {
      const reason = 'Black Crown needs an OHP working reference. Enter an optional verified OHP result or save a current OHP TM to carry.'
      const blocked = await markEntryBlocked(athleteId, instance, assessment, reason)
      return { action: 'blocked', instance: blocked, message: reason }
    }
    approved['overhead-press'] = roundNearest5(tmToLb(carried))
    ohpSource = 'carry'
  }

  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'trainingMaxHistory', 'syncOutbox'], 'readwrite')
    const programStore = tx.objectStore('programInstances')
    const current = await requestToPromise<LocalDomainRecord | undefined>(programStore.get(instance.id))
    if (!current || current.status !== 'active' || current.program_key !== 'crown-maintenance') {
      tx.abort()
      throw new Error('Crown Maintenance handoff changed before Black Crown activation')
    }

    const completedState = {
      ...((current.progression_state ?? {}) as Record<string, unknown>),
      handoffReady: true,
      blackCrownEntryStatus: 'activated',
      activatedAt: new Date().toISOString(),
      approvedEntryTmsLb: approved,
    }
    const completedMaintenance = prepareLocalMutation({
      ...current,
      status: 'completed',
      completed_on: new Date().toISOString().slice(0, 10),
      progression_state: completedState,
    }, context, current)
    programStore.put(completedMaintenance)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', completedMaintenance, context, 'upsert'))

    for (const [exerciseKey, value] of Object.entries(approved)) {
      const tm = prepareLocalMutation({
        id: newId(),
        athlete_id: athleteId,
        exercise_key: exerciseKey,
        tm_value: value,
        tm_unit: 'lb',
        effective_at: new Date().toISOString(),
        source: exerciseKey === 'overhead-press' ? `black-crown-entry-${ohpSource}` : 'black-crown-entry',
        notes: exerciseKey === 'box-squat' ? '90% of approved Back Squat TM, rounded down to 5 lb.' : null,
      }, context)
      tx.objectStore('trainingMaxHistory').put(tm)
      tx.objectStore('syncOutbox').add(makeOutboxEntry('trainingMaxHistory', tm, context, 'upsert'))
    }

    const blackCrownId = newId()
    const blackCrown = prepareLocalMutation({
      id: blackCrownId,
      athlete_id: athleteId,
      program_key: 'black-crown',
      program_name: BLACK_CROWN.name,
      program_version: BLACK_CROWN.version,
      program_definition_hash: null,
      program_snapshot: { sourceEngine: BLACK_CROWN.sourceEngine ?? null, handoffFrom: 'crown-maintenance', entryRule: '90-green-87.5-yellow-red-delay' },
      status: 'active',
      started_on: new Date().toISOString().slice(0, 10),
      current_phase_key: 'block-1',
      current_week: 1,
      current_day_key: `day-${BLACK_CROWN.weekData[0]?.days[0]?.day ?? 1}`,
      progression_state: {
        handoffFrom: current.id,
        entryApprovedAt: new Date().toISOString(),
        approvedEntryTmsLb: approved,
      },
    }, context)
    programStore.put(blackCrown)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', blackCrown, context, 'upsert'))

    const event = prepareLocalMutation(eventInput(athleteId, current.id, 'black-crown-entry-activated', {
      assessment: { ...assessment, lifts: normalized },
      approved_tms_lb: approved,
      ohp_source: ohpSource,
      to_program_instance_id: blackCrown.id,
    }), context)
    tx.objectStore('programEvents').put(event)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', event, context, 'upsert'))
    await transactionDone(tx)
    return { action: 'black-crown-started', instance: blackCrown, approvedTms: approved, message: 'Black Crown Week 1 Day 1 activated with approved Block I training maxes.' }
  } finally {
    db.close()
  }
}

export async function getProgramEvents(athleteId: string): Promise<LocalDomainRecord[]> {
  const rows = await getAllFromIndex<LocalDomainRecord>('programEvents', 'by-athlete', athleteId)
  return rows.filter((row) => !row.deleted_at).sort((a, b) => String(b.effective_at ?? '').localeCompare(String(a.effective_at ?? '')))
}
TS

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

root = Path(os.environ['TARGET_DIR'])

# Athlete onboarding keeps the default Crownforge enrollment private and current-date based.
p = root / 'src/services/athlete-service.ts'
text = p.read_text()
text = text.replace("      started_on: '2026-09-07',", "      started_on: new Date().toISOString().slice(0, 10),")
text = text.replace("        sourceCoverage: 'reconstructed-opening-week',", "        sourceCoverage: 'governed-crownforge-v2.1',")
p.write_text(text)

# Resolve Black Crown percentage work from the athlete's private active TM history when a stable TM ref exists.
p = root / 'src/services/workout-service.ts'
text = p.read_text()
import_marker = "import { putEntityWithOutbox, prepareLocalMutation, makeOutboxEntry } from '../db/local-mutations'\n"
addition = import_marker + "import { getLatestTrainingMaxes } from './athlete-service'\n"
if "getLatestTrainingMaxes" not in text:
    if import_marker not in text:
        raise SystemExit('workout-service import marker missing')
    text = text.replace(import_marker, addition, 1)

old = "  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')\n  const context = { athleteId, deviceId: device.deviceId }\n  const sessionId = newId()"
new = "  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')\n  const context = { athleteId, deviceId: device.deviceId }\n  const trainingMaxes = programKey === 'black-crown' ? await getLatestTrainingMaxes(athleteId) : {}\n  const sessionId = newId()"
if old in text:
    text = text.replace(old, new, 1)
elif "const trainingMaxes = programKey === 'black-crown'" not in text:
    raise SystemExit('workout-service start marker missing')

old_call = "                exercise.sets[i],\n              ),"
new_call = "                exercise.sets[i],\n                trainingMaxes,\n              ),"
if old_call in text:
    text = text.replace(old_call, new_call, 1)
elif "exercise.sets[i],\n                trainingMaxes," not in text:
    raise SystemExit('workout set call marker missing')

old_sig = "  setNumber: number,\n  programmed: ProgramSet,\n) {\n  return {"
new_sig = "  setNumber: number,\n  programmed: ProgramSet,\n  trainingMaxes: Record<string, LocalDomainRecord>,\n) {\n  const resolved = resolvePrivateProgrammedLoad(programmed, trainingMaxes)\n  return {"
if old_sig in text:
    text = text.replace(old_sig, new_sig, 1)
elif "const resolved = resolvePrivateProgrammedLoad" not in text:
    raise SystemExit('setRecordFromProgram signature marker missing')

text = text.replace("    load_value: programmed.loadValue ?? null,\n    load_unit: programmed.loadUnit ?? null,", "    load_value: programmed.loadValue ?? resolved.value,\n    load_unit: programmed.loadUnit ?? resolved.unit,")
perf_marker = "      rounding: programmed.rounding ?? null,\n"
perf_add = perf_marker + "      resolvedTrainingMaxKey: resolved.tmKey,\n      resolvedTrainingMaxValue: resolved.tmValue,\n      resolvedTrainingMaxUnit: resolved.tmUnit,\n      resolvedLoadValue: resolved.value,\n"
if "resolvedTrainingMaxKey" not in text:
    if perf_marker not in text:
        raise SystemExit('performance data marker missing')
    text = text.replace(perf_marker, perf_add, 1)

helper_marker = "function setRecordFromProgram(\n"
helper = r'''function resolvePrivateProgrammedLoad(
  programmed: ProgramSet,
  trainingMaxes: Record<string, LocalDomainRecord>,
): { value: number | null; unit: 'lb' | 'kg' | null; tmKey: string | null; tmValue: number | null; tmUnit: string | null } {
  if (programmed.loadValue != null) {
    return { value: programmed.loadValue, unit: programmed.loadUnit ?? null, tmKey: null, tmValue: null, tmUnit: null }
  }
  if (typeof programmed.percentage !== 'number' || !programmed.loadReference?.startsWith('black-crown:tm:')) {
    return { value: null, unit: null, tmKey: null, tmValue: null, tmUnit: null }
  }
  const sourceKey = programmed.loadReference.slice('black-crown:tm:'.length)
  const aliases: Record<string, string> = {
    'front-squat': 'front-squat',
    'back-squat': 'back-squat',
    'bench-press': 'bench-press',
    'deadlift': 'deadlift',
    'overhead-press': 'overhead-press',
    'power-clean': 'clean',
    'box-squat': 'box-squat',
  }
  const tmKey = aliases[sourceKey] ?? sourceKey
  const row = trainingMaxes[tmKey]
  if (!row) return { value: null, unit: null, tmKey, tmValue: null, tmUnit: null }
  const tmValue = Number(row.tm_value)
  const tmUnit = String(row.tm_unit ?? 'lb')
  if (!Number.isFinite(tmValue) || tmValue <= 0) return { value: null, unit: null, tmKey, tmValue: null, tmUnit }
  const fraction = programmed.percentage > 1 ? programmed.percentage / 100 : programmed.percentage
  const raw = tmValue * fraction
  const value = programmed.rounding === 'down-5' ? Math.floor(raw / 5) * 5 : programmed.rounding === 'nearest-5' ? Math.round(raw / 5) * 5 : Math.ceil(raw / 5) * 5
  return { value, unit: tmUnit === 'kg' ? 'kg' : 'lb', tmKey, tmValue, tmUnit }
}

'''
if "function resolvePrivateProgrammedLoad" not in text:
    if helper_marker not in text:
        raise SystemExit('workout helper insertion marker missing')
    text = text.replace(helper_marker, helper + helper_marker, 1)
p.write_text(text)

# Make runtime selection hydrate from private programInstances and gate workout execution to the active position.
p = root / 'src/main.ts'
text = p.read_text()
athlete_import = "import { getActiveAthlete, createLocalAthlete, getCurrentProgramInstance, getLatestTrainingMaxes, setTrainingMax, updateAthleteName } from './services/athlete-service'\n"
progress_import = athlete_import + "import { activateBlackCrownFromEntry, advanceProgramAfterWorkout, isCurrentProgramPosition, positionFromProgramInstance, setIntentionalProgramPosition, type BlackCrownEntryAssessment, type EntryColor } from './services/program-progression-service'\n"
if "program-progression-service" not in text:
    if athlete_import not in text:
        raise SystemExit('main athlete import marker missing')
    text = text.replace(athlete_import, progress_import, 1)

refresh_marker = "async function refreshWorkout(): Promise<void> {\n"
hydrate = r'''function hydrateSelectedPositionFromProgramInstance(): void {
  const position = positionFromProgramInstance(state.programInstance)
  if (!position) return
  state.selectedProgram = position.program
  state.selectedWeek = position.week
  state.selectedDay = position.day
}

'''
if "function hydrateSelectedPositionFromProgramInstance" not in text:
    if refresh_marker not in text:
        raise SystemExit('main refresh marker missing')
    text = text.replace(refresh_marker, hydrate + refresh_marker, 1)

text = text.replace("      state.programInstance = await getCurrentProgramInstance(state.athlete.id)\n      await refreshWorkout()", "      state.programInstance = await getCurrentProgramInstance(state.athlete.id)\n      hydrateSelectedPositionFromProgramInstance()\n      await refreshWorkout()", 1)

old_home = "  const today = getCalendarDay(new Date())\n  const homeProgram: PublicProgramKey = today?.program ?? state.selectedProgram\n  const homeProgramName = homeProgram === 'crown-maintenance' ? 'Crown Maintenance' : homeProgram === 'black-crown' ? 'Black Crown' : 'Crownforge'\n  const day = getProgramDay(homeProgram, today?.week ?? state.selectedWeek, today?.day ?? state.selectedDay)\n  const title = day?.title ?? (homeProgram === 'crown-maintenance' ? 'CROWN MAINTENANCE' : homeProgram === 'black-crown' ? 'BLACK CROWN' : 'CROWNFORGE')\n  const sub = day ? `${homeProgramName} • Week ${today?.week ?? state.selectedWeek} • Day ${today?.day ?? state.selectedDay}` : 'Your current training block'"
new_home = "  const homeProgram: PublicProgramKey = state.selectedProgram\n  const homeProgramName = homeProgram === 'crown-maintenance' ? 'Crown Maintenance' : homeProgram === 'black-crown' ? 'Black Crown' : 'Crownforge'\n  const day = getProgramDay(homeProgram, state.selectedWeek, state.selectedDay)\n  const title = day?.title ?? (homeProgram === 'crown-maintenance' ? 'CROWN MAINTENANCE' : homeProgram === 'black-crown' ? 'BLACK CROWN' : 'CROWNFORGE')\n  const sub = day ? `${homeProgramName} • Week ${state.selectedWeek} • Day ${state.selectedDay}` : 'Your current training block'"
if old_home in text:
    text = text.replace(old_home, new_home, 1)
elif "const homeProgram: PublicProgramKey = state.selectedProgram" not in text:
    raise SystemExit('home current-position marker missing')
text = text.replace("Math.ceil((today?.week ?? state.selectedWeek) / 6)", "Math.ceil(state.selectedWeek / 6)")

train_marker = "  const totalPages = day.sections.length + 2\n  return `"
train_add = "  const totalPages = day.sections.length + 2\n  const currentPosition = isCurrentProgramPosition(state.programInstance, state.selectedProgram, state.selectedWeek, state.selectedDay)\n  const currentProgram = positionFromProgramInstance(state.programInstance)?.program\n  const positionControl = currentPosition ? '' : currentProgram === state.selectedProgram ? `<div class=\"callout warning\"><strong>Preview position.</strong> This is not your current athlete position. <button class=\"btn small purple\" data-action=\"make-current-position\">MAKE CURRENT POSITION</button></div>` : `<div class=\"callout warning\"><strong>Preview only.</strong> Cross-program starts are locked behind the governed program handoff.</div>`\n  return `"
if train_marker in text:
    text = text.replace(train_marker, train_add, 1)
elif "const positionControl = currentPosition" not in text:
    raise SystemExit('train position marker missing')
text = text.replace("      <div class=\"train-rule\"><strong>Readiness rule</strong>", "      ${positionControl}\n      <div class=\"train-rule\"><strong>Readiness rule</strong>", 1)
text = text.replace("<p class=\"muted\">This controls allowed auto-regulation. It does not rewrite Crownforge.</p>", "<p class=\"muted\">This controls allowed auto-regulation. It does not rewrite the selected governed program.</p>", 1)

# Insert entry gate card into the Program page immediately before governed Black Crown week detail.
program_gate_anchor = "    <div class=\"program-current-week-label\"><div><div class=\"page-kicker\">Governed Black Crown detail</div>"
if "${blackCrownEntryGateCard()}" not in text:
    if program_gate_anchor not in text:
        raise SystemExit('Black Crown program gate insertion marker missing')
    text = text.replace(program_gate_anchor, "    ${blackCrownEntryGateCard()}\n" + program_gate_anchor, 1)

# Train event binds an explicit intentional same-program reposition action.
bind_marker = "  document.querySelector('[data-action=\"complete-workout\"]')?.addEventListener('click', completeSelectedWorkout)\n"
if "make-current-position" not in text[text.find('function bindTrainEvents'):text.find('function bindSwipeNavigation')]:
    if bind_marker not in text:
        raise SystemExit('bind train marker missing')
    text = text.replace(bind_marker, bind_marker + "  document.querySelector('[data-action=\"make-current-position\"]')?.addEventListener('click', makeSelectedPositionCurrent)\n", 1)

# Program page owns Black Crown entry activation.
program_bind_end = "  document.querySelectorAll<HTMLButtonElement>('[data-jump-black-crown-week]').forEach((button) => button.addEventListener('click', () => {\n"
# Add listener just before bindProgramEvents closing boundary using a stable tail.
tail = "    document.querySelectorAll<HTMLButtonElement>('[data-jump-black-crown-week]').forEach((item) => item.classList.toggle('active', item === button))\n  }))\n}\nfunction bindProgressEvents(): void {"
if "activate-black-crown" not in text[text.find('function bindProgramEvents'):text.find('function bindProgressEvents')]:
    if tail not in text:
        raise SystemExit('bindProgramEvents tail marker missing')
    text = text.replace(tail, "    document.querySelectorAll<HTMLButtonElement>('[data-jump-black-crown-week]').forEach((item) => item.classList.toggle('active', item === button))\n  }))\n  document.querySelector('[data-action=\"activate-black-crown\"]')?.addEventListener('click', activateBlackCrownFromGate)\n}\nfunction bindProgressEvents(): void {", 1)

# Onboarding, migration, and restore rehydrate the private current program position.
text = text.replace("  state.programInstance = await getCurrentProgramInstance(state.athlete.id)\n  render()\n  if (state.cloud.configured)", "  state.programInstance = await getCurrentProgramInstance(state.athlete.id)\n  hydrateSelectedPositionFromProgramInstance()\n  await refreshWorkout()\n  render()\n  if (state.cloud.configured)", 1)
text = text.replace("  if (state.athlete) state.programInstance = await getCurrentProgramInstance(state.athlete.id)\n  state.legacy = null", "  if (state.athlete) state.programInstance = await getCurrentProgramInstance(state.athlete.id)\n  hydrateSelectedPositionFromProgramInstance()\n  state.legacy = null", 1)
text = text.replace("  state.programInstance = state.athlete ? await getCurrentProgramInstance(state.athlete.id) : null\n  await refreshWorkout()", "  state.programInstance = state.athlete ? await getCurrentProgramInstance(state.athlete.id) : null\n  hydrateSelectedPositionFromProgramInstance()\n  await refreshWorkout()", 1)

# Gate workout start to the active athlete position.
start_marker = "  const day = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)\n  if (!day) return\n  const input = readinessInputFromForm()"
start_new = "  const day = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)\n  if (!day) return\n  if (!isCurrentProgramPosition(state.programInstance, state.selectedProgram, state.selectedWeek, state.selectedDay)) return showToast('Preview only — make this your current position before starting')\n  const input = readinessInputFromForm()"
if start_marker in text:
    text = text.replace(start_marker, start_new, 1)
elif "Preview only — make this your current position before starting" not in text:
    raise SystemExit('start workout gate marker missing')

# Completing a workout advances the private program instance, then rehydrates runtime selection.
old_complete = "  await completeWorkout(state.athlete.id, state.workout.session.id)\n  await refreshWorkout()\n  state.cloud.syncSoon()\n  showToast('Workout completed locally')\n  render()"
new_complete = "  const completedProgram = state.selectedProgram\n  const completedWeek = state.selectedWeek\n  const completedDay = state.selectedDay\n  await completeWorkout(state.athlete.id, state.workout.session.id)\n  const progression = await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)\n  state.programInstance = progression.instance\n  hydrateSelectedPositionFromProgramInstance()\n  await refreshWorkout()\n  state.cloud.syncSoon()\n  showToast(progression.message)\n  render()"
if old_complete in text:
    text = text.replace(old_complete, new_complete, 1)
elif "advanceProgramAfterWorkout" not in text[text.find('async function completeSelectedWorkout'):]:
    raise SystemExit('complete workout progression marker missing')

# Insert runtime helper functions before readiness form parsing.
helper_anchor = "function readinessInputFromForm():"
helpers = r'''function blackCrownEntryGateCard(): string {
  const position = positionFromProgramInstance(state.programInstance)
  const progression = (state.programInstance?.progression_state ?? {}) as Record<string, unknown>
  const ready = position?.program === 'crown-maintenance' && (state.programInstance?.current_phase_key === 'black-crown-entry' || progression.handoffReady === true)
  if (!ready) return ''
  const blocked = progression.blackCrownEntryStatus === 'blocked'
  const lift = (key: string, label: string) => `<div class="field"><label>${label} verified 1RM (lb)</label><input class="input bc-entry-max" data-bc-entry-lift="${key}" inputmode="decimal" type="number" min="1" step="5" placeholder="Verified 1RM"><select class="input" data-bc-entry-color="${key}"><option value="green">GREEN — 90%</option><option value="yellow">YELLOW — 87.5%</option><option value="red">RED — delay this lift</option></select></div>`
  return `<section class="card black-crown-entry-gate"><div class="card-head"><div><div class="page-kicker">Private athlete handoff</div><h2>BLACK CROWN ENTRY GATE</h2></div><span class="badge ${blocked ? 'optional' : 'mandatory'}">${blocked ? 'BLOCKED / REVIEW' : 'READY'}</span></div><p class="muted">Enter verified Crownforge results only. Green uses 90% lift-by-lift, Yellow 87.5% for that lift only, and Red delays Black Crown activation. Selected TMs round to the nearest 5 lb.</p><div class="profile-grid">${lift('front-squat','Front Squat')}${lift('back-squat','Back Squat')}${lift('bench-press','Bench Press')}${lift('deadlift','Deadlift')}<div class="field"><label>Optional OHP verified 1RM (lb)</label><input class="input" id="bc-entry-ohp" inputmode="decimal" type="number" min="1" step="5" placeholder="Blank = carry current OHP TM"><select class="input" id="bc-entry-ohp-color"><option value="green">GREEN — 90%</option><option value="yellow">YELLOW — 87.5%</option><option value="red">RED — carry current OHP ref if available</option></select></div></div><div class="callout">Box Squat is derived privately from 90% of the approved Back Squat TM and rounded down to 5 lb. Black Crown percentage work then rounds up to 5 lb. Clean/power work uses a saved Clean TM when available; no load is fabricated when it is missing.</div><button class="btn primary hero-start" data-action="activate-black-crown" style="margin-top:12px">CALCULATE & ACTIVATE BLACK CROWN</button></section>`
}

function readEntryColor(selector: string): EntryColor {
  const value = document.querySelector<HTMLSelectElement>(selector)?.value
  return value === 'red' ? 'red' : value === 'yellow' ? 'yellow' : 'green'
}

async function activateBlackCrownFromGate(): Promise<void> {
  if (!state.athlete) return
  const keys = ['front-squat','back-squat','bench-press','deadlift'] as const
  const lifts = {} as BlackCrownEntryAssessment['lifts']
  for (const key of keys) {
    const input = document.querySelector<HTMLInputElement>(`[data-bc-entry-lift="${key}"]`)
    const verified1RmLb = Number(input?.value ?? '')
    if (!Number.isFinite(verified1RmLb) || verified1RmLb <= 0) return showToast(`Enter a verified 1RM for ${key.replace(/-/g, ' ')}`)
    lifts[key] = { verified1RmLb, readiness: readEntryColor(`[data-bc-entry-color="${key}"]`) }
  }
  const ohpValue = Number(document.querySelector<HTMLInputElement>('#bc-entry-ohp')?.value ?? '')
  const assessment: BlackCrownEntryAssessment = {
    lifts,
    optionalOHP: Number.isFinite(ohpValue) && ohpValue > 0 ? { verified1RmLb: ohpValue, readiness: readEntryColor('#bc-entry-ohp-color') } : null,
  }
  const result = await activateBlackCrownFromEntry(state.athlete.id, assessment)
  state.programInstance = result.instance
  hydrateSelectedPositionFromProgramInstance()
  await refreshWorkout()
  state.cloud.syncSoon()
  showToast(result.message)
  render()
}

async function makeSelectedPositionCurrent(): Promise<void> {
  if (!state.athlete) return
  const current = positionFromProgramInstance(state.programInstance)
  if (!current || current.program !== state.selectedProgram) return showToast('Cross-program repositioning is locked behind the governed handoff')
  if (!confirm(`Make ${selectedProgramName()} Week ${state.selectedWeek} Day ${state.selectedDay} your current athlete position? This is intentional navigation and will be recorded.`)) return
  const result = await setIntentionalProgramPosition(state.athlete.id, state.selectedProgram, state.selectedWeek, state.selectedDay)
  state.programInstance = result.instance
  hydrateSelectedPositionFromProgramInstance()
  await refreshWorkout()
  state.cloud.syncSoon()
  showToast(result.message)
  render()
}

'''
if "function blackCrownEntryGateCard" not in text:
    if helper_anchor not in text:
        raise SystemExit('entry gate helper insertion marker missing')
    text = text.replace(helper_anchor, helpers + helper_anchor, 1)

p.write_text(text)
PY

CF_AFTER="$(hash_tree "$TARGET_DIR/src/programs/crownforge")"
CM_AFTER="$(hash_tree "$TARGET_DIR/src/programs/crown-maintenance")"
BC_AFTER="$(hash_tree "$TARGET_DIR/src/programs/black-crown")"
[[ "$CF_BEFORE" == "$CF_AFTER" ]] || { echo 'Crownforge package changed during athlete progression apply' >&2; exit 1; }
[[ "$CM_BEFORE" == "$CM_AFTER" ]] || { echo 'Crown Maintenance package changed during athlete progression apply' >&2; exit 1; }
[[ "$BC_BEFORE" == "$BC_AFTER" ]] || { echo 'Black Crown package changed during athlete progression apply' >&2; exit 1; }

grep -Fq "Normal" /dev/null 2>/dev/null || true
grep -Fq "blackCrownEntryStatus: 'pending'" "$TARGET_DIR/src/services/program-progression-service.ts"
grep -Fq "if (color === 'green') return 0.9" "$TARGET_DIR/src/services/program-progression-service.ts"
grep -Fq "if (color === 'yellow') return 0.875" "$TARGET_DIR/src/services/program-progression-service.ts"
grep -Fq "Red entry status delays activation" "$TARGET_DIR/src/services/program-progression-service.ts"
grep -Fq "approved['box-squat'] = roundDown5(approved['back-squat'] * 0.9)" "$TARGET_DIR/src/services/program-progression-service.ts"
grep -Fq "Cross-program repositioning is blocked" "$TARGET_DIR/src/services/program-progression-service.ts"
grep -Fq "No next program was invented" "$TARGET_DIR/src/services/program-progression-service.ts"
grep -Fq "resolvePrivateProgrammedLoad" "$TARGET_DIR/src/services/workout-service.ts"
grep -Fq "'power-clean': 'clean'" "$TARGET_DIR/src/services/workout-service.ts"
grep -Fq "Preview only — make this your current position before starting" "$TARGET_DIR/src/main.ts"
grep -Fq "BLACK CROWN ENTRY GATE" "$TARGET_DIR/src/main.ts"
grep -Fq "hydrateSelectedPositionFromProgramInstance" "$TARGET_DIR/src/main.ts"
grep -Fq "advanceProgramAfterWorkout" "$TARGET_DIR/src/main.ts"

echo "LetMeFly private athlete program progression + Black Crown handoff v1: PASS"
