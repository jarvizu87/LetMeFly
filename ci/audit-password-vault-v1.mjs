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
let registrations = 0
let resetRequests = 0
let signInFails = false
const auth = {
  signInWithPassword: async () => {
    if (signInFails) throw new Error('Invalid credentials')
    return { user, session }
  },
  setAccountPassword: async () => { updates += 1 },
  registerWithPassword: async () => { registrations += 1; return { user, session } },
  passwordRegistrationAvailability: async () => ({ available:true,message:'Ready' }),
  requestPasswordReset: async () => { resetRequests += 1 },
  verifyPasswordResetLink: async () => ({user,session,passwordRecovery:true}),
  onAuthStateChange: () => ({unsubscribe(){}}),
  getTrustedCurrentUser:async () => user,
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

await assert.rejects(vault.registerWithPassword(user.email, 'test-password', 'test-password'), /already signed in/)
assert.equal(registrations, 0)
const registerVault = new PrivateVaultController(auth, bootstrap, new Proxy({}, { get: () => never }), 'test')
assert.deepEqual(await registerVault.registerWithPassword(user.email, 'test-password', 'test-password'), mismatch)
assert.equal(registerVault.snapshot.localAthleteId, 'local-1')
assert.equal(registerVault.snapshot.cloudAthleteId, 'cloud-2')
assert.match(registerVault.snapshot.lastError, /Automatic merge is blocked/)
const emptyVault = new PrivateVaultController(auth, {
  ...bootstrap, decideLink:async () => ({kind:'no-local-no-cloud'}),
}, new Proxy({}, { get: () => never }), 'test')
assert.deepEqual(await emptyVault.registerWithPassword(user.email, 'test-password', 'test-password'), {kind:'no-local-no-cloud'})
assert.equal(emptyVault.snapshot.user.id, user.id)
assert.equal(emptyVault.snapshot.localAthleteId, null)
assert.equal(emptyVault.snapshot.cloudAthleteId, null)
console.log('PASS registration retains mismatch protection and lets a new account continue to athlete creation')

await assert.rejects(vault.requestPasswordReset(user.email),/already signed in/)
await assert.rejects(vault.verifyPasswordResetLink('unused-test-link'),/already signed in/)
assert.equal(resetRequests,0)
const resetVault = new PrivateVaultController(auth,bootstrap,new Proxy({}, {get:()=>never}),'test')
const beforeRequest = {...resetVault.snapshot}
await resetVault.requestPasswordReset(user.email)
assert.equal(resetRequests,1)
assert.deepEqual(resetVault.snapshot,beforeRequest)
assert.deepEqual(await resetVault.verifyPasswordResetLink('unused-test-link'),mismatch)
assert.equal(resetVault.snapshot.passwordRecovery,true)
assert.equal(resetVault.snapshot.localAthleteId,'local-1')
assert.equal(resetVault.snapshot.cloudAthleteId,'cloud-2')
await assert.rejects(resetVault.setAccountPassword('wrong-owner','test-password','test-password'),/Sign in/)
await resetVault.setAccountPassword(user.id,'test-password','test-password')
assert.equal(resetVault.snapshot.passwordRecovery,false)
assert.equal(resetVault.snapshot.localAthleteId,'local-1')
console.log('PASS requesting a reset leaves the vault unchanged; a verified link retains athlete boundaries and updates only its authenticated account')

globalThis.window={location:{href:'https://preview.example.invalid/?lmf-password-reset=1&code=test'}}
const callbackBootstrap={...bootstrap,getLocalAthleteSummary:async()=>({athleteId:'local-1'})}
const returnVault=new PrivateVaultController({...auth,completeEmailLinkFromUrl:async()=>({user,session,passwordRecovery:true})},callbackBootstrap,new Proxy({}, {get:()=>never}),'test')
await returnVault.initialize()
assert.equal(returnVault.snapshot.passwordRecovery,true)
assert.equal(returnVault.snapshot.user.id,user.id)
assert.match(returnVault.snapshot.lastError,/Automatic merge is blocked/)
const failedReturn=new PrivateVaultController({...auth,completeEmailLinkFromUrl:async()=>{throw new Error('This reset link has expired or was already used.')}},callbackBootstrap,new Proxy({}, {get:()=>never}),'test')
await assert.rejects(failedReturn.initialize(),/expired/)
assert.equal(failedReturn.snapshot.session,null)
assert.equal(failedReturn.snapshot.localAthleteId,'local-1')
assert.match(failedReturn.snapshot.passwordRecoveryError,/expired/)
delete globalThis.window
console.log('PASS recovery callbacks show the new-password form only for verified sessions and keep local data on an expired link')

const context = { configured: true, userId: null, email: null, signIn: never, setPassword: never }
const signIn = passwordAccessMarkup(context)
assert.match(signIn, /data-password-form="signin"/)
assert.match(signIn, /autocomplete="current-password"/)
assert.doesNotMatch(signIn, /data-password-form="setup"/)
assert.match(signIn, /data-password-view="register"/)
assert.match(signIn, /data-password-view="recovery">Forgot password\?/)
const reset=passwordAccessMarkup(context,'recovery')
assert.match(reset,/SEND RESET EMAIL/)
assert.match(reset,/one-time recovery email/)
assert.doesNotMatch(reset,/autocomplete="new-password"/)
assert.match(reset,/data-recovery-link-form/)
assert.match(reset,/type="password" autocomplete="off"/)
const recovered=passwordAccessMarkup({...context,userId:user.id,recoveryActive:true})
assert.match(recovered,/SAVE NEW PASSWORD/)
assert.equal((recovered.match(/autocomplete="new-password"/g)||[]).length,2)
assert.match(passwordAccessMarkup({...context,recoveryError:'Expired <script>'}),/Expired &lt;script&gt;/)
const registration = passwordAccessMarkup(context, 'register')
assert.match(registration, /data-password-form="register"/)
assert.equal((registration.match(/autocomplete="new-password"/g) || []).length, 2)
assert.match(registration, /data-password-submit disabled/)
assert.match(registration, /data-registration-recheck/)
const setup = passwordAccessMarkup({ ...context, userId: user.id, email: '<private>&"@example.invalid' })
assert.match(setup, /data-password-form="setup"/)
assert.equal((setup.match(/autocomplete="new-password"/g) || []).length, 2)
assert.match(setup, /&lt;private&gt;&amp;&quot;/)
assert.doesNotMatch(setup, /<private>/)
assert.doesNotMatch(setup, /data-password-view="register"/)
assert.equal(passwordAccessMarkup({ ...context, configured: false }), '')
assert.equal(passwordAccessKey(context), 'signed-out')
assert.notEqual(passwordAccessKey({ ...context, userId: user.id }), passwordAccessKey(context))
console.log('PASS setup is authenticated-only, password-manager fields are explicit, and account text is escaped')
