import { openLetMeFlyDb, requestToPromise, transactionDone, type LocalDomainRecord, type SyncOutboxEntry } from '../db/local-db'
import type { Stage6ConflictRecord } from './sync-types'

// PostgreSQL jsonb_strip_nulls removes object null properties recursively,
// but retains null array elements. Restrict this equivalence to set JSON.
function stripObjectNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripObjectNulls)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, stripObjectNulls(v)]))
  }
  return value
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizedSet(record: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...record }
  for (const key of ['_local', 'revision', 'updated_at']) delete copy[key]
  // Normalize only equivalent UTC representations, preserving sub-ms precision.
  for (const key of ['created_at', 'completed_at', 'deleted_at']) {
    const value = copy[key]
    if (typeof value !== 'string') continue
    copy[key] = value.replace(/(?:Z|\+00:00)$/, 'Z').replace(/\.(\d+)(?=Z$)/, (_, fraction: string) => {
      const trimmed = fraction.replace(/0+$/, '')
      return trimmed ? `.${trimmed}` : ''
    })
  }
  if ('performance_data' in copy) copy.performance_data = stripObjectNulls(copy.performance_data)
  return copy
}

export function equivalentWorkoutSets(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  // Missing identity is never evidence of a harmless duplicate.
  if (!a.id || !a.athlete_id || a.id !== b.id || a.athlete_id !== b.athlete_id) return false
  return stable(normalizedSet(a)) === stable(normalizedSet(b))
}

// Repair bookkeeping only. Never rewrite a workout, remove an outbox item, or
// pick a winner between different performance values. Keep snapshots for audit.
export async function resolveConvergedSetConflicts(athleteId: string): Promise<number> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['syncConflicts', 'syncOutbox', 'workoutSets'], 'readwrite')
    const conflicts = tx.objectStore('syncConflicts')
    const entries = await requestToPromise<Stage6ConflictRecord[]>(conflicts.getAll())
    const outbox = await requestToPromise<SyncOutboxEntry[]>(tx.objectStore('syncOutbox').getAll())
    let resolved = 0
    for (const conflict of entries) {
      if (conflict.athleteId !== athleteId || conflict.resolvedAt != null || conflict.entityType !== 'workoutSets') continue
      const remote = conflict.remotePayload
      const revision = conflict.remoteRevision
      if (!remote || !Number.isSafeInteger(revision) || Number(revision) <= 0 || remote.revision !== revision) continue
      if (conflict.localPayload.id !== conflict.entityId || conflict.localPayload.athlete_id !== athleteId) continue
      if (!equivalentWorkoutSets(conflict.localPayload, remote)) continue
      if (outbox.some(op => op.entityType === 'workoutSets' && op.entityId === conflict.entityId)) continue
      const current = await requestToPromise<LocalDomainRecord | undefined>(tx.objectStore('workoutSets').get(conflict.entityId))
      if (!current || current.athlete_id !== athleteId || !current._local || current._local.dirty) continue
      if (current.revision < Number(revision) || current._local.baseRevision !== current.revision) continue
      // The equal snapshots prove this was a duplicate; a newer acknowledged
      // record may contain later completed sets, and must remain untouched.
      conflicts.put({ ...conflict, resolvedAt: new Date().toISOString(), resolution: 'merged' } satisfies Stage6ConflictRecord)
      resolved += 1
    }
    await transactionDone(tx)
    return resolved
  } finally {
    db.close()
  }
}
