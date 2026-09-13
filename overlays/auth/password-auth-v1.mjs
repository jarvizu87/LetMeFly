// Existing-account access only. All credential handling stays in Supabase Auth.
// Never send a recovery message, create an account, or change athlete data here.
export function createPasswordAuth(auth) {
  async function trustedUser(expectedId) {
    const { data, error } = await auth.getUser()
    if (error || !data?.user) throw new Error('Sign in to your existing cloud account before setting a password.')
    if (data.user.id !== expectedId) throw new Error('The signed-in account changed. Open Profile again before continuing.')
    return data.user
  }

  return {
    async signIn(email, password) {
      const address = String(email || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter your LetMeFly account email address.')
      if (typeof password !== 'string' || !password) throw new Error('Enter your LetMeFly password.')
      const { data, error } = await auth.signInWithPassword({ email: address, password })
      if (error) throw error
      if (!data?.user || !data.session || data.session.user?.id !== data.user.id) {
        throw new Error('Password sign-in did not create a valid session.')
      }
      const user = await trustedUser(data.user.id)
      return { user, session: data.session }
    },

    async setPassword(expectedUserId, password, confirmation) {
      if (!expectedUserId) throw new Error('Sign in to your existing cloud account before setting a password.')
      if (typeof password !== 'string' || password.length < 12) throw new Error('Use at least 12 characters for your new password.')
      if (password !== confirmation) throw new Error('The new passwords do not match.')
      await trustedUser(expectedUserId)
      // Keep the server's password policy and reauthentication checks intact.
      // This never triggers reauthenticate() or an email/SMS recovery fallback.
      const { data, error } = await auth.updateUser({ password })
      if (error) throw error
      if (data?.user?.id !== expectedUserId) throw new Error('Unable to confirm the password update for this account.')
      await trustedUser(expectedUserId)
    },
  }
}
