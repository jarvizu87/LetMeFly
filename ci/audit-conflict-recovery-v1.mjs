import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const require = createRequire(path.join(target, 'package.json'))
const ts = require('typescript')
require('fake-indexeddb/auto')
globalThis.fetch = async () => { throw new Error('Network forbidden in conflict regression') }
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename)
const db = require(path.join(target, 'src/db/local-db.ts'))
const { equivalentWorkoutSets, resolveConvergedSetConflicts } = require(path.join(target, 'src/sync/conflict-recovery.ts'))
const { LetMeFlySyncEngine } = require(path.join(target, 'src/sync/sync-engine.ts'))
const { applyRemoteChange } = require(path.join(target, 'src/sync/local-sync.ts'))
const { putEntityWithOutbox } = require(path.join(target, 'src/db/local-mutations.ts'))
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
async function seed(stores) {
  const conn = await db.openLetMeFlyDb()
  try {
    const tx = conn.transaction(Object.keys(stores), 'readwrite')
    for (const [name, rows] of Object.entries(stores)) for (const row of rows) tx.objectStore(name).put(row)
    await db.transactionDone(tx)
  } finally { conn.close() }
}

// Optional private fixture stays outside the repository and is never printed.
if (process.argv[3]) {
  const backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  assert.equal(createHash('sha256').update(canonical(backup.payload)).digest('hex'), backup.integrity.payloadSha256)
  const stores = { ...backup.payload.domain, ...backup.payload.localRecovery }
  for (const [name, rows] of Object.entries(stores)) assert.equal(rows.length, backup.integrity.storeCounts[name])
  await seed(stores)
  const before = canonical(backup.payload.domain)
  const pending = canonical(await db.getAll('syncOutbox'))
  const result = await resolveConvergedSetConflicts(backup.athleteId)
  const after = {}
  for (const name of Object.keys(backup.payload.domain)) after[name] = await db.getAll(name)
  assert.equal(canonical(after), before, 'Recovery must leave every domain record byte-for-byte unchanged')
  assert.equal(canonical(await db.getAll('syncOutbox')), pending)
  assert.equal(result, 10)
  assert.equal((await db.getAll('syncConflicts')).filter(c => c.resolvedAt == null).length, 0)
  assert.equal(await resolveConvergedSetConflicts(backup.athleteId), 0)
  console.log('PASS private backup integrity and all 10 stale conflicts repaired; every domain record and outbox unchanged; repeat is idempotent')
  if (process.argv[4]) {
    const cloud = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))
    for (const { record } of cloud) {
      const local = backup.payload.domain.workoutSets.find(s => s.id === record.id)
      assert.ok(equivalentWorkoutSets(local, record))
      assert.equal(local.revision, record.revision)
    }
    assert.equal(cloud.length, 10)
    console.log('PASS all 10 current local set records match the read-only live cloud snapshot')
  }
} else {
  const athleteId = crypto.randomUUID()
  const local = { id: crypto.randomUUID(), athlete_id: athleteId, revision: 0, created_at: '2026-01-02T03:04:05.860Z', updated_at: '2026-01-02T03:04:05.860Z', deleted_at: null, completed_at: null, completed: false, reps: 12, load_value: 35, performance_data: { programmedReps: 12, duration: null, nested: { empty: null, values: [null, 1] } }, _local: { localVersion: 1, baseRevision: 0, dirty: true, createdOffline: true, lastModifiedByDeviceId: 'test' } }
  const remote = { ...local, revision: 1, created_at: '2026-01-02T03:04:05.86+00:00', updated_at: '2026-02-01T01:00:00+00:00', performance_data: { programmedReps: 12, nested: { values: [null, 1] } } }
  delete remote._local
  assert.ok(equivalentWorkoutSets(local, remote))
  for (const delta of [{ reps: 13 }, { load_value: 40 }, { completed: true }, { notes: 'new note' }, { deleted_at: '2026-01-03T00:00:00Z' }, { created_at: '2026-01-02T03:04:05.860001Z' }, { performance_data: { programmedReps: 12, nested: { values: [1] } } }]) assert.equal(equivalentWorkoutSets(local, { ...remote, ...delta }), false)
  const current = { ...remote, revision: 2, completed: true, load_value: 40, _local: { ...local._local, baseRevision: 2, dirty: false } }
  const conflict = { conflictId: crypto.randomUUID(), athleteId, entityType: 'workoutSets', entityId: local.id, policy: 'workout-performance', localPayload: local, remotePayload: remote, baseRevision: 0, remoteRevision: 1, sourceChangeSeq: null, detectedAt: '2026-02-01T01:00:00Z', resolvedAt: null, resolution: null }
  await seed({ workoutSets: [current], syncConflicts: [conflict] })
  assert.equal(await resolveConvergedSetConflicts(crypto.randomUUID()), 0)
  await seed({ workoutSets: [{ ...current, _local: { ...current._local, dirty: true } }] })
  assert.equal(await resolveConvergedSetConflicts(athleteId), 0)
  await seed({ workoutSets: [{ ...current, revision: 0, _local: { ...current._local, baseRevision: 0 } }] })
  assert.equal(await resolveConvergedSetConflicts(athleteId), 0)
  await seed({ workoutSets: [current], syncConflicts: [{ ...conflict, remotePayload: { ...remote, reps: 13 } }] })
  assert.equal(await resolveConvergedSetConflicts(athleteId), 0)
  await seed({ syncConflicts: [conflict] })
  const outbox = { operationId: crypto.randomUUID(), athleteId, entityType: 'workoutSets', entityId: local.id, status: 'conflict' }
  await seed({ syncOutbox: [outbox] })
  assert.equal(await resolveConvergedSetConflicts(athleteId), 0)
  const conn = await db.openLetMeFlyDb(); const tx = conn.transaction('syncOutbox', 'readwrite'); tx.objectStore('syncOutbox').delete(outbox.operationId); await db.transactionDone(tx); conn.close()
  assert.equal(await resolveConvergedSetConflicts(athleteId), 1)
  assert.deepEqual((await db.getAll('workoutSets'))[0], current)
  assert.equal(await resolveConvergedSetConflicts(athleteId), 0)
  console.log('PASS duplicate normalization, meaningful differences, dirty/outbox/revision/athlete guards, preserved newer completed set, retained audit and idempotence')

  const deviceId = crypto.randomUUID()
  const testId = crypto.randomUUID()
  await putEntityWithOutbox('workoutSets', { ...local, id: testId }, { athleteId, deviceId })
  let editDuringRequest = false
  const fake = { verifyAuthenticated: async () => true, pullChanges: async () => [], fetchEntity: async () => null,
    applyOperation: async req => {
      const payload = { ...req.payload, revision: 1, created_at: '2026-01-02T03:04:05.86+00:00', performance_data: remote.performance_data }
      if (editDuringRequest) await putEntityWithOutbox('workoutSets', { id: req.entityId, reps: 20 }, { athleteId, deviceId })
      return { status: 'conflict', server_revision: 1, remote_payload: payload }
    } }
  await new LetMeFlySyncEngine(fake, athleteId, deviceId).syncNow()
  assert.equal((await db.getAll('syncOutbox')).length, 0)
  assert.equal((await db.getAll('syncConflicts')).filter(c => !c.resolvedAt).length, 0)
  const racingId = crypto.randomUUID()
  await putEntityWithOutbox('workoutSets', { ...local, id: racingId }, { athleteId, deviceId })
  editDuringRequest = true
  await new LetMeFlySyncEngine(fake, athleteId, deviceId).syncNow()
  const racing = (await db.getAll('workoutSets')).find(s => s.id === racingId)
  assert.equal(racing.reps, 20); assert.equal(racing._local.dirty, true)
  assert.equal((await db.getAll('syncOutbox')).length, 1)
  console.log('PASS duplicate push acknowledged and concurrent local edits remain pending')

  const pullId = crypto.randomUUID()
  await putEntityWithOutbox('workoutSets', { ...local, id: pullId }, { athleteId, deviceId })
  const change = { athlete_id: athleteId, entity_type: 'workout_sets', entity_id: pullId, entity_revision: 1, change_seq: 1 }
  assert.equal(await applyRemoteChange(athleteId, change, { ...remote, id: pullId }), 'converged')
  assert.equal((await db.getAll('syncOutbox')).filter(op => op.entityId === pullId).length, 0)
  const differentId = crypto.randomUUID()
  await putEntityWithOutbox('workoutSets', { ...local, id: differentId }, { athleteId, deviceId })
  assert.equal(await applyRemoteChange(athleteId, { ...change, entity_id: differentId, change_seq: 2 }, { ...remote, id: differentId, reps: 13 }), 'conflict')
  assert.equal((await db.getAll('workoutSets')).find(s => s.id === differentId).reps, 12)
  assert.equal(await resolveConvergedSetConflicts(athleteId), 0)
  assert.equal((await db.getAll('syncConflicts')).filter(c => !c.resolvedAt).length, 1)
  console.log('PASS equal pull converges; different reps stay unresolved and local performance is preserved')
}
