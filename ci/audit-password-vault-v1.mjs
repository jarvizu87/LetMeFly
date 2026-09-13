import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Execute the actual reconstructed controller with in-memory local data and a
// fake Auth service. No live credentials, real accounts or network traffic.
const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const require = createRequire(path.join(target, 'package.json'))
const ts = require('typescript')
require('fake-indexeddb/auto')
globalThis.fetch = async () => { throw new Error('Network forbidden in password regression') }
const clientPath = path.join(target, 'src/auth/supabase-client.ts')
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { supabase: {} } }
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename)
}
const { PrivateVaultController } = require(path.join(target, 'src/auth/private-vault-controller.ts'))
const { passwordAccessKey, passwordAccessMarkup } = require(path.join(target, 'src/auth/password-access-ui-v1.ts'))
const user = { id: 'test-existing-owner', email: 'test@example.invalid' }
const session = { user }
const never = async () => { throw new Error('Unexpected data mutation') }
let updates = 0
let signInFails = false
const auth = {
  signInWithPassword: async () => {
    if (signInFails) throw new Error('Invalid credentials')
    return { user, session }
  },
  setAccountPassword: async () => { updates += 1 },
  requestEmailOtp: never,
}
const mismatch = { kind: 'manual-choice-required', localAthleteId: 'local-1', cloudAthleteId: 'cloud-2' }
const bootstrap = {
  decideLink: async verified => { assert.equal(verified.id, user.id); return mismatch },
  bootstrapLocalToCloud: never,
  linkExistingSameAthlete: never,
  hydrateEmptyDevice: never,
}
const vault = new PrivateVaultController(auth, bootstrap, new Proxy({}, { get: () => never }), 'test')
await assert.rejects(vault.setAccountPassword(user.id, 'test-password', 'test-password'), /Sign in/)
assert.equal(updates, 0)
assert.deepEqual(await vault.signInWithPassword(user.email, 'test-password'), mismatch)
assert.equal(vault.snapshot.localAthleteId, 'local-1')
assert.equal(vault.snapshot.cloudAthleteId, 'cloud-2')
assert.match(vault.snapshot.lastError, /Automatic merge is blocked/)
console.log('PASS password sign-in retains native athlete mismatch protection without automatic data changes')

await assert.rejects(vault.setAccountPassword('another-user', 'test-password', 'test-password'), /Sign in/)
await vault.setAccountPassword(user.id, 'test-password', 'test-password')
assert.equal(updates, 1)
assert.equal(vault.snapshot.localAthleteId, 'local-1')
assert.equal(vault.snapshot.cloudAthleteId, 'cloud-2')
signInFails = true
await assert.rejects(vault.signInWithPassword(user.email, 'wrong'), /Invalid credentials/)
assert.equal(vault.snapshot.localAthleteId, 'local-1')
console.log('PASS password setup and failed login preserve the existing vault; wrong-account updates are refused')

const context = { configured: true, userId: null, email: null, signIn: never, setPassword: never }
const signIn = passwordAccessMarkup(context)
assert.match(signIn, /data-password-form="signin"/)
assert.match(signIn, /autocomplete="current-password"/)
assert.doesNotMatch(signIn, /data-password-form="setup"/)
const setup = passwordAccessMarkup({ ...context, userId: user.id, email: '<private>&"@example.invalid' })
assert.match(setup, /data-password-form="setup"/)
assert.equal((setup.match(/autocomplete="new-password"/g) || []).length, 2)
assert.match(setup, /&lt;private&gt;&amp;&quot;/)
assert.doesNotMatch(setup, /<private>/)
assert.equal(passwordAccessMarkup({ ...context, configured: false }), '')
assert.equal(passwordAccessKey(context), 'signed-out')
assert.notEqual(passwordAccessKey({ ...context, userId: user.id }), passwordAccessKey(context))
console.log('PASS setup is authenticated-only, password-manager fields are explicit, and account text is escaped')
