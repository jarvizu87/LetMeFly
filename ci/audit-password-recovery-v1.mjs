import assert from 'node:assert/strict'
import { createPasswordRecovery, passwordRecoveryReturnUrl, isPasswordRecoveryReturn } from '../overlays/auth/password-recovery-v1.mjs'

const origin = 'https://preview.example.invalid'
const projectUrl = 'https://test-project.supabase.co'
const user = {id:'existing-recovery-owner',email:'athlete@example.invalid'}
const session = {user}
const calls = []
let currentSession = null
let result = {data:{user,session},error:null}
let verifiedUser = user
let requestError = null
let callbackWasCleaned = false
const never = () => { throw new Error('Unexpected account, credential or data mutation') }
const auth = {
  getSession:async () => ({data:{session:currentSession},error:null}),
  getUser:async () => ({data:{user:verifiedUser},error:null}),
  resetPasswordForEmail:async (...args) => {calls.push(['request',...args]);return {error:requestError}},
  verifyOtp:async (...args) => {calls.push(['verify',...args]);return result},
  exchangeCodeForSession:async (...args) => {assert.equal(callbackWasCleaned,true);calls.push(['exchange',...args]);return result},
  updateUser:never, signUp:never, signInWithOtp:never, signOut:never,
}
const recovery = createPasswordRecovery(auth,{projectUrl,pageUrl:()=>`${origin}/?old=discard#/train`})
const token = 'unused_token_from_email_0123456789'
const link = `${projectUrl}/auth/v1/verify?token=${token}&type=recovery&redirect_to=https://untrusted.invalid`
const callback = `${origin}/?lmf-password-reset=1&code=one-time-code&sb_flow_id=valid_flow_123#/profile`
const clean = value => {assert.equal(value,`${origin}/#/profile`);callbackWasCleaned=true}

assert.equal(passwordRecoveryReturnUrl(`${origin}/?code=old#/train`),`${origin}/?lmf-password-reset=1#/profile`)
assert.equal(new URL(passwordRecoveryReturnUrl(`${origin}//another.invalid/path`)).origin,origin)
assert.throws(()=>passwordRecoveryReturnUrl('http://insecure.invalid/'),/secure/)
assert.equal(isPasswordRecoveryReturn(callback),true)
assert.equal(isPasswordRecoveryReturn(`${origin}/?code=other`),false)
assert.equal(calls.length,0)
await assert.rejects(recovery.request('invalid'),/email/)
assert.equal(calls.length,0)
await recovery.request(' ATHLETE@example.invalid ')
assert.deepEqual(calls.pop(),['request',user.email,{redirectTo:`${origin}/?lmf-password-reset=1#/profile`}])
console.log('PASS explicit recovery requests target this app and never carry old callback credentials or create an account')

currentSession = session
await assert.rejects(recovery.request(user.email),/already signed in/)
await assert.rejects(recovery.verifyLink(link),/already signed in/)
await assert.rejects(recovery.completeReturn(callback,clean),/already signed in/)
assert.equal(calls.length,0)
currentSession = null
console.log('PASS recovery cannot send mail or replace an existing signed-in account')

for(const invalid of [
  link.replace(projectUrl,'https://unrelated.supabase.co'),
  link.replace('type=recovery','type=magiclink'),
  link.replace('/auth/v1/verify','/other'),
  link.replace('https:','http:'),
  'javascript:alert(1)',
  `${projectUrl}/auth/v1/verify?token=short&type=recovery`,
]) await assert.rejects(recovery.verifyLink(invalid),/Reset password link/)
assert.equal(calls.length,0)
assert.deepEqual(await recovery.verifyLink(link),{user,session,passwordRecovery:true})
assert.deepEqual(calls.pop(),['verify',{token_hash:token,type:'recovery'}])
console.log('PASS pasted reset links are verified only by the configured project and their redirect URLs are never followed')

callbackWasCleaned=false
assert.deepEqual(await recovery.completeReturn(callback,clean),{user,session,passwordRecovery:true})
assert.deepEqual(calls.pop(),['exchange','one-time-code',{flowId:'valid_flow_123'}])
assert.equal(await recovery.completeReturn(`${origin}/?code=normal-signin`,never),null)
callbackWasCleaned=false
await assert.rejects(recovery.completeReturn(`${origin}/?lmf-password-reset=1#error=access_denied&error_code=otp_expired`,clean),/expired/)
assert.equal(callbackWasCleaned,true)
await assert.rejects(recovery.completeReturn(`${origin}/?lmf-password-reset=1&code=one&sb_flow_id=bad`,clean),/incomplete/)
assert.equal(calls.length,0)
console.log('PASS callback credentials and errors are removed before use; PKCE flow identity survives cleanup and ordinary sign-in is untouched')

for(const data of [{user,session:null},{user,session:{user:{id:'other'}}}]) {
  result={data,error:null}
  await assert.rejects(recovery.verifyLink(link),/did not verify/)
}
result={data:{user,session},error:null}
verifiedUser={id:'different-owner'}
await assert.rejects(recovery.verifyLink(link),/could not be verified/)
verifiedUser=user
result={data:null,error:{code:'otp_expired',message:'must-not-display-private-token'}}
await assert.rejects(recovery.verifyLink(link),e=>/expired/.test(e.message)&&!e.message.includes('must-not-display'))
requestError={status:429,message:'private transport detail'}
await assert.rejects(recovery.request(user.email),/Too many recovery requests/)
requestError={code:'email_address_not_authorized'}
await assert.rejects(recovery.request(user.email),/email service cannot send/)
console.log('PASS invalid identities, used links, throttling and delivery restrictions cannot update a password or expose transport details')
