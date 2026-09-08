import {
  getAll,
  getAllFromIndex,
  getOrCreateDeviceState,
  newId,
  openLetMeFlyDb,
  transactionDone,
  type LocalDomainRecord,
} from '../db/local-db'
import { putEntityWithOutbox, prepareLocalMutation, makeOutboxEntry, type LocalMutationContext } from '../db/local-mutations'

export interface AthleteProfileInput {
  displayName: string
  weightUnit: 'lb' | 'kg'
}

export async function getActiveAthlete(): Promise<LocalDomainRecord | null> {
  const rows = await getAll<LocalDomainRecord>('athletes')
  return rows.find((row) => !row.deleted_at) ?? null
}

export async function createLocalAthlete(input: AthleteProfileInput): Promise<LocalDomainRecord> {
  const existing = await getActiveAthlete()
  if (existing) return existing

  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  const athleteId = newId()
  const context: LocalMutationContext = { athleteId, deviceId: device.deviceId }

  const athlete = prepareLocalMutation(
    {
      id: athleteId,
      display_name: input.displayName.trim() || 'Athlete',
      profile_notes: null,
    },
    context,
  )
  const preferences = prepareLocalMutation(
    {
      id: newId(),
      athlete_id: athleteId,
      weight_unit: input.weightUnit,
      distance_unit: 'mi',
      theme: 'dark',
      default_rest_seconds: 120,
      preferences: {},
    },
    context,
  )
  const program = prepareLocalMutation(
    {
      id: newId(),
      athlete_id: athleteId,
      program_key: 'crownforge',
      program_name: 'Crownforge Revised — Integrated',
      program_version: 'v2.1',
      program_definition_hash: null,
      program_snapshot: {
        sourceEngine: 'v1.7.20',
        sourceCoverage: 'reconstructed-opening-week',
      },
      status: 'active',
      started_on: '2026-09-07',
      current_phase_key: 'build',
      current_week: 1,
      current_day_key: 'day-1',
      progression_state: {},
    },
    context,
  )

  // Onboarding is one local transaction: profile, preferences, program enrollment,
  // and all three outbox operations either commit together or not at all.
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(
      ['athletes', 'athletePreferences', 'programInstances', 'syncOutbox'],
      'readwrite',
    )
    tx.objectStore('athletes').add(athlete)
    tx.objectStore('athletePreferences').add(preferences)
    tx.objectStore('programInstances').add(program)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('athletes', athlete, context, 'upsert'))
    tx.objectStore('syncOutbox').add(makeOutboxEntry('athletePreferences', preferences, context, 'upsert'))
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', program, context, 'upsert'))
    await transactionDone(tx)
  } finally {
    db.close()
  }

  return athlete
}

export async function updateAthleteName(athleteId: string, displayName: string): Promise<void> {
  const athlete = await getActiveAthlete()
  if (!athlete || athlete.id !== athleteId) throw new Error('Athlete not found')
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  await putEntityWithOutbox('athletes', { ...athlete, display_name: displayName.trim() }, {
    athleteId,
    deviceId: device.deviceId,
  })
}

export async function getCurrentProgramInstance(athleteId: string): Promise<LocalDomainRecord | null> {
  const rows = await getAllFromIndex<LocalDomainRecord>('programInstances', 'by-athlete-status', [athleteId, 'active'])
  return rows.find((row) => !row.deleted_at) ?? null
}

export async function getLatestTrainingMaxes(athleteId: string): Promise<Record<string, LocalDomainRecord>> {
  const rows = await getAllFromIndex<LocalDomainRecord>('trainingMaxHistory', 'by-athlete', athleteId)
  const active = rows.filter((row) => !row.deleted_at)
  active.sort((a, b) => Date.parse(String(b.effective_at ?? b.created_at)) - Date.parse(String(a.effective_at ?? a.created_at)))
  const result: Record<string, LocalDomainRecord> = {}
  for (const row of active) {
    const key = String(row.exercise_key ?? '')
    if (key && !result[key]) result[key] = row
  }
  return result
}

export async function setTrainingMax(
  athleteId: string,
  exerciseKey: string,
  value: number,
  unit: 'lb' | 'kg',
): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Training max must be positive')
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  await putEntityWithOutbox(
    'trainingMaxHistory',
    {
      athlete_id: athleteId,
      exercise_key: exerciseKey,
      tm_value: value,
      tm_unit: unit,
      effective_at: new Date().toISOString(),
      source: 'manual',
      notes: null,
    },
    { athleteId, deviceId: device.deviceId },
  )
}
