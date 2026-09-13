import test from 'node:test'
import assert from 'node:assert/strict'
import {createPhoneOtp,normalizePhone} from '../overlays/auth/phone-otp-v1.mjs'

function fixture() {
  const calls=[]
  const user={id:'existing-owner',email:'existing@example.invalid'}
  const state={user,session:{user},trusted:user,sendError:null,verifyError:null}
  const auth={
    async signInWithOtp(args){calls.push(['send',args]);return {error:state.sendError}},
    async verifyOtp(args){calls.push(['verify',args]);return {data:{user:state.user,session:state.session},error:state.verifyError}},
    async getUser(){calls.push(['verifyIdentity']);return {data:{user:state.trusted},error:null}},
  }
  return {calls,state,otp:createPhoneOtp(auth)}
}

test('SMS uses the existing account and cannot silently create a second athlete identity',async()=>{
  const {otp,calls}=fixture()
  await otp.request('+1 (202) 555-0100')
  assert.deepEqual(calls,[['send',{phone:'+12025550100',options:{shouldCreateUser:false,channel:'sms'}}]])
})
test('invalid or ambiguous phone numbers are rejected before a request',async()=>{
  const {otp,calls}=fixture()
  for(const value of ['2025550100','email@example.invalid','+00','+12025550100 extra','+1234567890123456'])await assert.rejects(otp.request(value))
  assert.equal(calls.length,0)
  assert.equal(normalizePhone('+44 7700 900123'),'+447700900123')
})
test('disabled provider and delivery failures never report a sent code or fall back to email',async()=>{
  const {otp,state,calls}=fixture()
  state.sendError=new Error('Phone provider is disabled')
  await assert.rejects(otp.request('+12025550100'),/disabled/)
  assert.equal(calls.length,1)
  assert.equal(calls[0][1].email,undefined)
})
test('verification retains the server-verified account and native session',async()=>{
  const {otp,state,calls}=fixture()
  assert.deepEqual(await otp.verify('+12025550100','123 456'),{user:state.user,session:state.session})
  assert.deepEqual(calls,[['verify',{phone:'+12025550100',token:'123456',type:'sms'}],['verifyIdentity']])
})
test('invalid codes, rejected codes and mismatched identities cannot be accepted',async()=>{
  const {otp,state,calls}=fixture()
  await assert.rejects(otp.verify('+12025550100','short'))
  assert.equal(calls.length,0)
  state.verifyError=new Error('Expired code')
  await assert.rejects(otp.verify('+12025550100','123456'),/Expired/)
  state.verifyError=null;state.trusted={id:'different-owner'}
  await assert.rejects(otp.verify('+12025550100','123456'),/identity mismatch/)
})
