import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Deterministic phone <-> desktop round-trip using the reconstructed production
// IndexedDB/outbox/apply-remote modules and a disposable in-memory cloud. No real
// Supabase credentials, account data, or network requests are used.
const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const require = createRequire(path.join(target, 'package.json'))
const ts = require('typescript')
require('fake-indexeddb/auto')
globalThis.fetch = async () => { throw new Error('Network forbidden in two-device sync regression') }
globalThis.window = { location: { href: 'https://sync-test.invalid/' } }

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename)
}

const db = require(path.join(target, 'src/db/local-db.ts'))
const { putEntityWithOutbox } = require(path.join(target, 'src/db/local-mutations.ts'))
const { loadPushCandidates, acknowledge, applyRemoteChange } = require(path.join(target, 'src/sync/local-sync.ts'))

// Local stores are camelCase; the real Supabase change feed emits public table
// names. Exercise the same boundary the remote adapter and applyRemoteChange use.
const remoteEntityType = Object.freeze({
  athletes: 'athletes',
  programInstances: 'program_instances',
  trainingMaxHistory: 'training_max_history',
  bodyweightEntries: 'bodyweight_entries',
  readinessEntries: 'readiness_entries',
  personalRecords: 'personal_records',
  workoutSessions: 'workout_sessions',
  workoutSets: 'workout_sets',
})
const toRemoteEntity = local => {
  const remote = remoteEntityType[local]
  assert.ok(remote, `Missing local-to-cloud entity mapping for ${local}`)
  return remote
}

const athleteId = crypto.randomUUID()
const cloud = new Map()
let changeSeq = 0

async function clearLocalDevice() {
  const conn = await db.openLetMeFlyDb()
  try {
    const stores = Array.from(conn.objectStoreNames)
    if (!stores.length) return
    const tx = conn.transaction(stores, 'readwrite')
    for (const name of stores) tx.objectStore(name).clear()
    await db.transactionDone(tx)
  } finally { conn.close() }
}

async function pushAll() {
  const candidates = await loadPushCandidates(athleteId)
  assert.ok(candidates.length > 0, 'Expected queued device changes')
  for (const candidate of candidates) {
    const entry = candidate.entry
    const entityType = toRemoteEntity(entry.entityType)
    const key = `${entityType}:${entry.entityId}`
    const previous = cloud.get(key)
    const revision = Number(previous?.revision || 0) + 1
    const row = {
      ...entry.payload,
      revision,
      updated_at: new Date().toISOString(),
      ...(entityType === 'athletes' ? { owner_user_id: 'disposable-owner' } : {}),
    }
    cloud.set(key, row)
    await acknowledge(candidate, {
      status: 'applied',
      server_revision: revision,
      remote_payload: row,
    })
  }
  assert.equal((await db.getAll('syncOutbox')).length, 0)
  return candidates.length
}

async function pullAll() {
  const rows = [...cloud.entries()].sort(([a], [b]) => {
    if (a.startsWith('athletes:')) return -1
    if (b.startsWith('athletes:')) return 1
    return a.localeCompare(b)
  })
  for (const [key, row] of rows) {
    const split = key.indexOf(':')
    const entityType = key.slice(0, split)
    const entityId = key.slice(split + 1)
    changeSeq += 1
    const result = await applyRemoteChange(athleteId, {
      change_seq: changeSeq,
      athlete_id: athleteId,
      entity_type: entityType,
      entity_id: entityId,
      operation: 'upsert',
      entity_revision: row.revision,
      changed_at: row.updated_at,
    }, row)
    assert.equal(result, 'applied', `Fresh device should apply ${entityType}:${entityId}`)
  }
}

const phone = await db.getOrCreateDeviceState('phone-test')
const phoneContext = { athleteId, deviceId: phone.deviceId }
const ids = {
  program: crypto.randomUUID(), tm: crypto.randomUUID(), body: crypto.randomUUID(), readiness: crypto.randomUUID(),
  pr: crypto.randomUUID(), session: crypto.randomUUID(), set: crypto.randomUUID(),
}

await putEntityWithOutbox('athletes', {
  id: athleteId,
  display_name: 'Disposable two-device athlete',
  weight_unit: 'lb',
  profile_context_v2: { primaryGoal: 'Cross-device test', age: '39' },
}, phoneContext)
await putEntityWithOutbox('programInstances', {
  id: ids.program, athlete_id: athleteId, program_key: 'crownforge', current_week: 4, current_day_key: 'day-3',
}, phoneContext)
await putEntityWithOutbox('trainingMaxHistory', {
  id: ids.tm, athlete_id: athleteId, exercise_key: 'bench-press', tm_value: 185, unit: 'lb',
}, phoneContext)
await putEntityWithOutbox('bodyweightEntries', {
  id: ids.body, athlete_id: athleteId, weight: 226.4, unit: 'lb', recorded_at: new Date().toISOString(),
}, phoneContext)
await putEntityWithOutbox('readinessEntries', {
  id: ids.readiness, athlete_id: athleteId, sleep: 4, energy: 4, soreness: 3, stress: 3, recorded_at: new Date().toISOString(),
}, phoneContext)
await putEntityWithOutbox('personalRecords', {
  id: ids.pr, athlete_id: athleteId, exercise_key: 'bench-press', record_type: 'weight', value: 205, unit: 'lb',
}, phoneContext)
await putEntityWithOutbox('workoutSessions', {
  id: ids.session, athlete_id: athleteId, program_key: 'crownforge', week_number: 4, day_key: 'day-3', status: 'completed',
}, phoneContext)
await putEntityWithOutbox('workoutSets', {
  id: ids.set, athlete_id: athleteId, session_id: ids.session, exercise_key: 'bench-press', set_number: 1,
  reps_completed: 5, load_value: 135, load_unit: 'lb', completed: true,
  performance_data: { rpe: 7, source: 'phone' },
}, phoneContext)

const uploaded = await pushAll()
assert.ok(uploaded >= 8)
console.log(`PASS phone queues and acknowledges ${uploaded} private athlete/program/history records`)

await clearLocalDevice()
await pullAll()
assert.equal((await db.getAll('athletes'))[0].profile_context_v2.primaryGoal, 'Cross-device test')
assert.equal((await db.getAll('programInstances'))[0].current_week, 4)
assert.equal((await db.getAll('trainingMaxHistory'))[0].tm_value, 185)
assert.equal((await db.getAll('bodyweightEntries'))[0].weight, 226.4)
assert.equal((await db.getAll('readinessEntries'))[0].energy, 4)
assert.equal((await db.getAll('personalRecords'))[0].value, 205)
assert.equal((await db.getAll('workoutSessions'))[0].status, 'completed')
assert.equal((await db.getAll('workoutSets'))[0].performance_data.source, 'phone')
assert.equal((await db.getAll('syncOutbox')).length, 0)
console.log('PASS fresh desktop pull restores profile, program position, TM, bodyweight, readiness, PRs and workout history')

const desktop = await db.getOrCreateDeviceState('desktop-test')
const desktopContext = { athleteId, deviceId: desktop.deviceId }
const bodyOnDesktop = (await db.getAll('bodyweightEntries'))[0]
await putEntityWithOutbox('bodyweightEntries', { ...bodyOnDesktop, weight: 224.8 }, desktopContext)
await pushAll()
assert.equal([...cloud.values()].find(row => row.id === ids.body)?.weight, 224.8)
console.log('PASS desktop edit advances the shared cloud revision without rewriting unrelated athlete data')

await clearLocalDevice()
await pullAll()
assert.equal((await db.getAll('bodyweightEntries'))[0].weight, 224.8)
assert.equal((await db.getAll('workoutSets'))[0].performance_data.source, 'phone')
console.log('PASS returning phone receives the desktop update while preserving workout history')

const returningPhone = await db.getOrCreateDeviceState('phone-return-test')
const returningContext = { athleteId, deviceId: returningPhone.deviceId }
const localBody = (await db.getAll('bodyweightEntries'))[0]
await putEntityWithOutbox('bodyweightEntries', { ...localBody, weight: 223.9 }, returningContext)
const pending = await loadPushCandidates(athleteId)
const bodyCandidate = pending.find(item => item.entry.entityId === ids.body)
assert.ok(bodyCandidate, 'Expected offline phone bodyweight change')
const remoteType = toRemoteEntity(bodyCandidate.entry.entityType)
const cloudKey = `${remoteType}:${ids.body}`
const remoteBefore = cloud.get(cloudKey)
assert.ok(remoteBefore, 'Expected bodyweight row in disposable cloud')
const competing = { ...remoteBefore, weight: 225.1, revision: Number(remoteBefore.revision) + 1, updated_at: new Date().toISOString() }
cloud.set(cloudKey, competing)
changeSeq += 1
const conflict = await applyRemoteChange(athleteId, {
  change_seq: changeSeq,
  athlete_id: athleteId,
  entity_type: remoteType,
  entity_id: ids.body,
  operation: 'upsert',
  entity_revision: competing.revision,
  changed_at: competing.updated_at,
}, competing)
assert.equal(conflict, 'conflict')
assert.equal((await db.getAll('bodyweightEntries'))[0].weight, 223.9)
assert.ok((await db.getAll('syncOutbox')).some(row => row.entityId === ids.body && row.status === 'conflict'))
console.log('PASS simultaneous phone/desktop edits stop at a visible conflict; local offline work is preserved instead of silently overwritten')

console.log('LetMeFly two-device account sync audit: PASS')
