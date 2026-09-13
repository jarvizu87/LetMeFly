import assert from 'node:assert/strict'
import { createPasswordRegistration } from '../overlays/auth/password-registration-v1.mjs'

const user = { id:'new-test-owner', email:'athlete@example.invalid' }
const session = { user }
const password = '  A new private passphrase!  '
const calls = []
let settings = { external:{email:true}, disable_signup:false, mailer_autoconfirm:true }
let currentSession = null
let result = { data:{user,session}, error:null }
let verifiedUser = user
let settingsFailure = false
let signInDuringCheck = false
const never = () => { throw new Error('Unexpected account change or message') }
const auth = {
  getSession: async () => ({ data:{session:currentSession}, error:null }),
  getUser: async () => ({ data:{user:verifiedUser}, error:null }),
  signUp: async payload => { calls.push(payload); return result },
  updateUser:never, signInWithOtp:never, resetPasswordForEmail:never, reauthenticate:never,
}
const registration = createPasswordRegistration(auth, async () => {
  if (settingsFailure) throw new Error('Offline')
  if (signInDuringCheck) currentSession = session
  return settings
})

await assert.rejects(registration.register('invalid', password, password), /email/)
await assert.rejects(registration.register(user.email, 'short', 'short'), /12 characters/)
await assert.rejects(registration.register(user.email, password, 'different'), /do not match/)
assert.equal(calls.length, 0)
console.log('PASS registration validates the address and matching passwords before creating an account')

for (const policy of [
  {...settings,mailer_autoconfirm:false},
  {...settings,disable_signup:true},
  {...settings,external:{email:false}},
]) {
  const guarded = createPasswordRegistration(auth, async () => policy)
  assert.equal((await guarded.availability()).available, false)
  await assert.rejects(guarded.register(user.email, password, password))
}
settingsFailure = true
await assert.rejects(registration.register(user.email, password, password), /Offline/)
settingsFailure = false
assert.equal(calls.length, 0)
console.log('PASS email confirmation, closed registration and unavailable settings cause no sign-up or email request')

currentSession = session
await assert.rejects(registration.register(user.email, password, password), /already signed in/)
currentSession = null
signInDuringCheck = true
await assert.rejects(registration.register(user.email, password, password), /already signed in/)
signInDuringCheck = false
currentSession = null
assert.equal(calls.length, 0)
console.log('PASS registration cannot replace an existing signed-in account, including a sign-in during the settings check')

assert.equal((await registration.availability()).available, true)
assert.deepEqual(await registration.register(' ATHLETE@example.invalid ', password, password), {user,session})
assert.deepEqual(calls.pop(), {email:user.email,password})
console.log('PASS native password registration preserves the exact password and verifies the authenticated account')

for (const data of [
  {user,session:null},
  {user:{...user,identities:[]},session:null},
  {user,session:{user:{id:'other-owner'}}},
]) {
  result = {data,error:null}
  await assert.rejects(registration.register(user.email, password, password), /did not finish/)
}
result = {data:{user,session},error:null}
verifiedUser = {id:'other-owner'}
await assert.rejects(registration.register(user.email, password, password), /Unable to verify/)
const duplicate = Object.assign(new Error('User already registered'), {code:'user_already_exists'})
result = {data:{user:null,session:null},error:duplicate}
await assert.rejects(registration.register(user.email, password, password), error => error === duplicate)
console.log('PASS duplicate, unconfirmed and mismatched responses never become a successful registration or password reset')
