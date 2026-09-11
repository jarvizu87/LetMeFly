import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Real profile writer, outbox, acknowledgement and remote-pull modules against
// disposable IndexedDB. PostgreSQL projection/trigger coverage is separately in
// database/test-profile-context-cloud.sql; no credentials or live rows used here.
const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const require = createRequire(path.join(target, 'package.json'))
const ts = require('typescript')
require('fake-indexeddb/auto')
globalThis.fetch = async () => { throw new Error('Network forbidden in profile regression') }
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename)
const db = require(path.join(target, 'src/db/local-db.ts'))
const { saveProfileContext } = require(path.join(target, 'src/services/profile-context-service.ts'))
const { applyRemoteChange, acknowledge, loadPushCandidates } = require(path.join(target, 'src/sync/local-sync.ts'))
const athleteId = crypto.randomUUID(), now = new Date().toISOString()
const baseline = { id: athleteId, display_name: 'Disposable profile regression', profile_context_v2: null, revision: 1,
  created_at: now, updated_at: now, deleted_at: null, _local: { baseRevision: 1, localVersion: 1, dirty: false, createdOffline: false, lastModifiedByDeviceId: 'test' } }
const conn = await db.openLetMeFlyDb()
const tx = conn.transaction(['athletes', 'trainingMaxHistory', 'programInstances'], 'readwrite')
tx.objectStore('athletes').put(baseline)
const tm = { id: crypto.randomUUID(), athlete_id: athleteId, exercise_key: 'test-lift', tm_value: 123 }
const program = { id: crypto.randomUUID(), athlete_id: athleteId, current_week: 7, current_day_key: 'day-3' }
tx.objectStore('trainingMaxHistory').put(tm); tx.objectStore('programInstances').put(program)
await db.transactionDone(tx); conn.close()

const context = { age: '39', height: '5 ft 6 in', primaryGoal: 'A literal <test> goal' }
await saveProfileContext(athleteId, context, { age: '', height: '', primaryGoal: '' })
const [candidate] = await loadPushCandidates(athleteId)
assert.equal(candidate.entry.entityType, 'athletes')
assert.deepEqual(Object.fromEntries(Object.keys(context).map(key => [key, candidate.entry.payload.profile_context_v2[key]])), context)
assert.equal(candidate.entry.payload._local, undefined)
const cloud = { ...candidate.entry.payload, revision: 2, updated_at: now }
await acknowledge(candidate, { status: 'applied', server_revision: 2, remote_payload: cloud })
assert.equal((await db.getAll('syncOutbox')).length, 0)
assert.deepEqual((await db.getAll('athletes'))[0].profile_context_v2, cloud.profile_context_v2)

const change = (revision, seq) => ({ change_seq: seq, athlete_id: athleteId, entity_type: 'athletes', entity_id: athleteId, operation: 'upsert', entity_revision: revision, changed_at: now })
// A clean fresh device receives the whole context from the cloud feed.
const clear = await db.openLetMeFlyDb(), clearTx = clear.transaction('athletes', 'readwrite')
clearTx.objectStore('athletes').delete(athleteId); await db.transactionDone(clearTx); clear.close()
assert.equal(await applyRemoteChange(athleteId, change(2, 1), cloud), 'applied')
assert.deepEqual((await db.getAll('athletes'))[0].profile_context_v2, cloud.profile_context_v2)

// Migration / old feed row has NULL; local pre-migration details must survive.
assert.equal(await applyRemoteChange(athleteId, change(3, 2), { ...cloud, profile_context_v2: null, revision: 3 }), 'applied')
assert.deepEqual((await db.getAll('athletes'))[0].profile_context_v2, cloud.profile_context_v2)
// Explicit clears remain authoritative, while stale remote revisions cannot win.
assert.equal(await applyRemoteChange(athleteId, change(4, 3), { ...cloud, profile_context_v2: { age: '', height: '5 ft 6 in' }, revision: 4 }), 'applied')
assert.equal((await db.getAll('athletes'))[0].profile_context_v2.age, '')
assert.equal(await applyRemoteChange(athleteId, change(3, 4), { ...cloud, revision: 3 }), 'ignored')

await saveProfileContext(athleteId, { age: '40' }, { age: '' })
assert.equal(await applyRemoteChange(athleteId, change(5, 5), { ...cloud, profile_context_v2: { age: '41' }, revision: 5 }), 'conflict')
assert.equal((await db.getAll('athletes'))[0].profile_context_v2.age, '40')
assert.equal((await db.getAll('syncOutbox'))[0].status, 'conflict')
assert.deepEqual(await db.getAll('trainingMaxHistory'), [tm])
assert.deepEqual(await db.getAll('programInstances'), [program])
console.log('PASS profile save → outbox → cloud acknowledgement → fresh-device pull; null migration compatibility, explicit clears, stale revision and dirty conflict safeguards; training maxes/program preserved')
