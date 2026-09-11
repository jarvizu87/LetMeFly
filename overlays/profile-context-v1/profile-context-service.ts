import { openLetMeFlyDb, requestToPromise, transactionDone, getOrCreateDeviceState, type LocalDomainRecord } from '../db/local-db'
import { prepareLocalMutation, makeOutboxEntry } from '../db/local-mutations'
import { mergeProfilePatch, validateProfilePatch } from '../profile-context/contract.mjs'

export async function saveProfileContext(athleteId: string, input: unknown, expected: unknown): Promise<LocalDomainRecord> {
  const patch = validateProfilePatch(input)
  validateProfilePatch(expected)
  if (typeof athleteId !== 'string' || !athleteId.trim()) throw new Error('Select an athlete before saving Profile.')
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  const tx = db.transaction(['athletes', 'syncOutbox'], 'readwrite')
  const committed = transactionDone(tx)
  void committed.catch(() => undefined)
  try {
    // Same athlete selection and ordering as the native app. Recheck inside the writer.
    const athletes = await requestToPromise<LocalDomainRecord[]>(tx.objectStore('athletes').getAll())
    const current = athletes.find(row => !row.deleted_at)
    if (!current || current.id !== athleteId || (current.athlete_id && current.athlete_id !== athleteId)) throw new Error('The active athlete changed. Reopen Profile before saving.')
    const next = mergeProfilePatch(current, patch, expected, new Date().toISOString())
    if (!next) { await committed; return current }
    const record = prepareLocalMutation({ ...current, profile_context_v2: next }, context, current)
    tx.objectStore('athletes').put(record)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('athletes', record, context, 'upsert'))
    await committed
    return record
  } catch (error) {
    try { tx.abort() } catch (_) { /* Already closed. */ }
    await committed.catch(() => undefined)
    throw error
  } finally { db.close() }
}
