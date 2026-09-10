import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Exercise the reconstructed production modules with disposable, in-memory
// IndexedDB and an explicitly fake cloud. No real credentials or API requests.
const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const require = createRequire(path.join(target, 'package.json'))
const ts = require('typescript')
require('fake-indexeddb/auto')
globalThis.fetch = async () => { throw new Error('Network forbidden in sync regression') }
globalThis.window = { location: { href: 'https://sync-test.invalid/' } }

const fakeClient = { from: () => { throw new Error('Unexpected cloud query') } }
const clientPath = path.join(target, 'src/auth/supabase-client.ts')
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { supabase: fakeClient } }
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename)
}

const db = require(path.join(target, 'src/db/local-db.ts'))
const { putEntityWithOutbox } = require(path.join(target, 'src/db/local-mutations.ts'))
const { CloudBootstrapService } = require(path.join(target, 'src/auth/bootstrap-service.ts'))
const { PrivateVaultController } = require(path.join(target, 'src/auth/private-vault-controller.ts'))
const { toPrivateVaultViewModel } = require(path.join(target, 'src/auth/private-vault-view-model.ts'))
const neverRemote = new Proxy({}, { get: () => async () => { throw new Error('Unexpected remote call') } })
const bootstrap = new CloudBootstrapService(neverRemote)

async function deadline(promise) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Sync operation timed out')), 5000)
    })])
  } finally { clearTimeout(timer) }
}

const athleteId = crypto.randomUUID()
const device = await db.getOrCreateDeviceState('sync-test')
await putEntityWithOutbox('athletes', { id: athleteId, display_name: 'Disposable sync test athlete' }, { athleteId, deviceId: device.deviceId })

if (process.argv.includes('--reproduce')) {
  await assert.rejects(deadline(bootstrap.ensureAllDirtyDomainRecordsQueued(athleteId)), (error) => {
    console.log(`REPRODUCED first-sync failure: ${error.name}: ${error.message}`)
    return error.name === 'InvalidStateError' || error.name === 'TransactionInactiveError'
  })
} else {
  assert.equal(await deadline(bootstrap.ensureAllDirtyDomainRecordsQueued(athleteId)), 0)
  assert.equal((await db.getAll('athletes')).length, 1)
  assert.equal((await db.getAll('syncOutbox')).length, 1)
  console.log('PASS bootstrap queues existing local records without closing its transaction or duplicating operations')

  const user = { id: crypto.randomUUID(), email: 'disposable@sync-test.invalid' }
  const cloudRows = new Map()
  let failWrites = false
  let accepted = 0
  const remote = {
    verifyAuthenticated: async () => true,
    applyOperation: async (request) => {
      if (failWrites) throw new Error('Simulated network interruption')
      const key = `${request.entityType}:${request.entityId}`
      const prior = cloudRows.get(key)
      const { private_extension, ...payload } = request.payload
      const row = { ...payload, revision: (prior?.revision ?? 0) + 1, updated_at: new Date().toISOString() }
      if (request.entityType === 'athletes') row.owner_user_id = user.id
      cloudRows.set(key, row)
      accepted += 1
      return { status: 'applied', server_revision: row.revision, remote_payload: row }
    },
    pullChanges: async () => [],
    fetchEntity: async (type, id) => cloudRows.get(`${type}:${id}`) ?? null,
  }
  fakeClient.from = (table) => {
    assert.equal(table, 'athletes')
    const query = {
      select: () => query,
      is: () => query,
      maybeSingle: async () => ({ data: cloudRows.get(`athletes:${athleteId}`) ?? null, error: null }),
    }
    return query
  }
  const context = { athleteId, deviceId: device.deviceId }
  await putEntityWithOutbox('athletes', { id: athleteId, private_extension: { preserved: true } }, context)
  for (let i = 0; i < 125; i += 1) {
    await putEntityWithOutbox('bodyweightEntries', { id: crypto.randomUUID(), athlete_id: athleteId, weight: 100 + i / 10 }, context)
  }
  const liveBootstrap = new CloudBootstrapService(remote)
  await deadline(liveBootstrap.bootstrapLocalToCloud(user, athleteId, 'sync-test'))
  assert.equal(cloudRows.size, 127)
  assert.equal((await db.getAll('syncOutbox')).length, 0)
  assert.equal((await db.getAll('syncState'))[0].bootstrapStatus, 'complete')
  assert.deepEqual((await db.getAll('athletes'))[0].private_extension, { preserved: true })
  assert.equal((await db.getAll('bodyweightEntries')).length, 125)
  assert.equal((await db.getAll('internalBackups')).length, 1)
  console.log('PASS 127-record first upload drains multiple batches, registers the device, retains a backup and preserves local extension fields')

  const session = { user }
  const auth = {
    onAuthStateChange: () => ({ unsubscribe() {} }),
    completeEmailLinkFromUrl: async () => null,
    getLocalSession: async () => session,
    getTrustedCurrentUser: async () => user,
  }
  await putEntityWithOutbox('bodyweightEntries', { id: crypto.randomUUID(), athlete_id: athleteId, weight: 105 }, context)
  failWrites = true
  const vault = new PrivateVaultController(auth, liveBootstrap, remote, 'sync-test')
  await assert.rejects(deadline(vault.initialize()), /Cloud sync paused/)
  assert.equal(vault.snapshot.mode, 'SYNC_ERROR')
  assert.equal(vault.snapshot.session, session)
  assert.equal(toPrivateVaultViewModel(vault.snapshot).cloudLabel, 'SYNC PAUSED')
  assert.equal((await db.getAll('bodyweightEntries')).length, 126)

  // Make the test retry immediately without disabling backoff in the app.
  const retryDb = await db.openLetMeFlyDb()
  const tx = retryDb.transaction('syncOutbox', 'readwrite')
  const store = tx.objectStore('syncOutbox')
  for (const row of await db.requestToPromise(store.getAll())) store.put({ ...row, nextAttemptAt: '2000-01-01T00:00:00Z' })
  await db.transactionDone(tx)
  retryDb.close()
  failWrites = false
  await deadline(vault.syncNow())
  assert.equal(vault.snapshot.mode, 'SYNC_ENABLED')
  assert.equal((await db.getAll('syncOutbox')).length, 0)
  assert.equal(cloudRows.size, 128)
  assert.equal(accepted, 129)
  assert.equal((await db.getAll('syncState'))[0].bootstrapStatus, 'complete')
  console.log('PASS interrupted upload reports a recoverable error and Sync Now resumes using the existing signed-in session')
}
