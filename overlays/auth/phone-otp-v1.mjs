// Existing-account SMS only. The native vault still owns athlete reconciliation.
// This module never creates accounts, falls back to email, changes an identity,
// writes workout data, or handles a service-role credential.
export function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter your phone number with its country code, starting with +.')
  return phone
}

export function createPhoneOtp(auth) {
  return Object.freeze({
    async request(value) {
      const phone = normalizePhone(value)
      const {error} = await auth.signInWithOtp({phone, options:{shouldCreateUser:false, channel:'sms'}})
      if (error) throw error
    },
    async verify(value, code) {
      const phone = normalizePhone(value)
      const token = String(code || '').replace(/\s/g, '')
      if (!/^\d{6,10}$/.test(token)) throw new Error('Enter the complete text-message code.')
      const {data, error} = await auth.verifyOtp({phone, token, type:'sms'})
      if (error) throw error
      if (!data?.session || !data.user) throw new Error('Text-message verification did not create a valid session.')
      const verified = await auth.getUser()
      if (verified.error || !verified.data?.user) throw verified.error || new Error('Unable to verify the signed-in account.')
      if (verified.data.user.id !== data.user.id || data.session.user.id !== data.user.id) throw new Error('Authenticated identity mismatch.')
      return {user:verified.data.user, session:data.session}
    },
  })
}
