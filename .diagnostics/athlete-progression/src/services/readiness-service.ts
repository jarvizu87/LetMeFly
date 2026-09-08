import { getAllFromIndex, getOrCreateDeviceState, type LocalDomainRecord } from '../db/local-db'
import { putEntityWithOutbox } from '../db/local-mutations'

export interface ReadinessInput {
  sleepQuality: number
  soreness: number
  stress: number
  energy: number
  sleepHours?: number | null
  notes?: string | null
}

export async function saveReadiness(athleteId: string, input: ReadinessInput): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  return putEntityWithOutbox(
    'readinessEntries',
    {
      athlete_id: athleteId,
      recorded_at: new Date().toISOString(),
      sleep_hours: input.sleepHours ?? null,
      sleep_quality: input.sleepQuality,
      soreness: input.soreness,
      stress: input.stress,
      energy: input.energy,
      notes: input.notes ?? null,
    },
    { athleteId, deviceId: device.deviceId },
  )
}

export async function latestReadiness(athleteId: string): Promise<LocalDomainRecord | null> {
  const rows = await getAllFromIndex<LocalDomainRecord>('readinessEntries', 'by-athlete-time', IDBKeyRange.bound([athleteId, ''], [athleteId, '\uffff']))
  return rows.filter((r) => !r.deleted_at).sort((a, b) => Date.parse(String(b.recorded_at)) - Date.parse(String(a.recorded_at)))[0] ?? null
}

export function readinessColor(input: ReadinessInput): 'green' | 'yellow' | 'red' {
  const avg = (input.sleepQuality + (6 - input.soreness) + (6 - input.stress) + input.energy) / 4
  if (avg >= 4) return 'green'
  if (avg >= 2.75) return 'yellow'
  return 'red'
}
