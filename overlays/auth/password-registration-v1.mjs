// New-account registration is separate from existing-account password recovery.
export function createPasswordRegistration(auth, readSettings) {
  async function requireSignedOut() {
    const current = await auth.getSession()
    if (current.error) throw current.error
    if (current.data?.session) throw new Error('You are already signed in. Use Profile to manage this account.')
  }

  async function availability() {
    const settings = await readSettings()
    if (settings.disable_signup === true || settings.external?.email !== true) {
      return { available: false, message: 'New account registration is currently unavailable.' }
    }
    if (settings.mailer_autoconfirm !== true) {
      return { available: false, message: 'Registration needs a setup change before you can create an account without email confirmation. You can still sign in or create a local athlete.' }
    }
    return { available: true, message: 'Choose your password below. No email or text code is needed.' }
  }

  return {
    availability,
    async register(email, password, confirmation) {
      const address = String(email || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid account email address.')
      if (typeof password !== 'string' || password.length < 12) throw new Error('Use at least 12 characters for your password.')
      if (password !== confirmation) throw new Error('The passwords do not match.')
      await requireSignedOut()
      // Recheck immediately before sign-up. Do not start an unwanted email flow.
      const policy = await availability()
      if (!policy.available) throw new Error(policy.message)
      await requireSignedOut()
      const { data, error } = await auth.signUp({ email: address, password })
      if (error) throw error
      if (!data?.user || !data.session || data.session.user?.id !== data.user.id) {
        throw new Error('Registration did not finish signing you in. If you already have an account, choose Sign In. Your existing local data has been kept.')
      }
      const verified = await auth.getUser()
      if (verified.error || verified.data?.user?.id !== data.user.id) {
        throw new Error('Unable to verify the new account. Your existing local data has been kept.')
      }
      return { user: verified.data.user, session: data.session }
    },
  }
}
