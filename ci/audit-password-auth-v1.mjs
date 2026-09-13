import assert from 'node:assert/strict'
import { createPasswordAuth } from '../overlays/auth/password-auth-v1.mjs'

const user = { id: 'existing-test-owner', email: 'athlete@example.invalid' }
const session = { user }
const password = '  A private passphrase!  '
const calls = []
let currentUser = user
let signinData = { user, session }
let updateError = null
const auth = {
  getUser: async () => ({ data: { user: currentUser }, error: null }),
  signInWithPassword: async payload => { calls.push(['signin', payload]); return { data: signinData, error: null } },
  updateUser: async payload => { calls.push(['update', payload]); return { data: { user: currentUser }, error: updateError } },
  signInWithOtp: () => { throw new Error('Messages are forbidden') },
  resetPasswordForEmail: () => { throw new Error('Recovery email is forbidden') },
  reauthenticate: () => { throw new Error('Reauthentication message is forbidden') },
  signUp: () => { throw new Error('New accounts are forbidden') },
}
const access = createPasswordAuth(auth)

await assert.rejects(access.signIn('not-an-email', password), /email address/)
await assert.rejects(access.signIn(user.email, ''), /password/)
await assert.rejects(access.setPassword(user.id, 'short', 'short'), /12 characters/)
await assert.rejects(access.setPassword(user.id, password, 'different'), /do not match/)
assert.equal(calls.length, 0)
console.log('PASS invalid or mismatched credentials cause no Auth mutations')

assert.deepEqual(await access.signIn(' ATHLETE@example.invalid ', password), { user, session })
assert.deepEqual(calls.pop(), ['signin', { email: user.email, password }])
console.log('PASS existing-account password sign-in preserves the exact password and verifies the server identity')

signinData = { user, session: { user: { id: 'other-owner' } } }
await assert.rejects(access.signIn(user.email, password), /valid session/)
signinData = { user, session }
currentUser = { id: 'other-owner' }
await assert.rejects(access.signIn(user.email, password), /account changed/)
calls.length = 0
await assert.rejects(access.setPassword(user.id, password, password), /account changed/)
currentUser = null
await assert.rejects(access.setPassword(user.id, password, password), /Sign in/)
assert.equal(calls.length, 0)
console.log('PASS signed-out and different-account password updates are blocked; mismatched sign-in sessions are rejected')

currentUser = user
await access.setPassword(user.id, password, password)
assert.deepEqual(calls.pop(), ['update', { password }])
assert.equal(calls.length, 0)
console.log('PASS password setup changes only the authenticated account password')

updateError = Object.assign(new Error('Reauthentication required'), { code: 'reauthentication_needed' })
await assert.rejects(access.setPassword(user.id, password, password), error => error === updateError)
assert.deepEqual(calls.pop(), ['update', { password }])
assert.equal(calls.length, 0)
console.log('PASS provider security requirements propagate without messages, bypasses or account creation')
