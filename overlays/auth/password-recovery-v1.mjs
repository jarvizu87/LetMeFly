// One-time recovery only. The user explicitly requests the email in the app.
// No admin credentials, account creation, athlete writes, or automatic messages.
const marker = 'lmf-password-reset'

export class PasswordRecoveryError extends Error {
  constructor(message) { super(message); this.name = 'PasswordRecoveryError' }
}

export function isPasswordRecoveryReturn(value) {
  try { return new URL(value).searchParams.get(marker) === '1' } catch { return false }
}

export function passwordRecoveryReturnUrl(value) {
  const page = new URL(value)
  if (page.protocol !== 'https:' && !(page.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(page.hostname))) {
    throw new PasswordRecoveryError('Open LetMeFly using its secure website address before requesting a reset.')
  }
  const target = new URL(page.origin)
  target.pathname = page.pathname
  target.searchParams.set(marker, '1')
  target.hash = '/profile'
  return target.href
}

function recoveryFailure(error) {
  if (error instanceof PasswordRecoveryError) return error
  const code = error?.code || ''
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code) || error?.status === 429) {
    return new PasswordRecoveryError('Too many recovery requests. Wait before requesting another email, or use the most recent unused reset link.')
  }
  if (['otp_expired', 'flow_state_expired', 'flow_state_not_found'].includes(code)) {
    return new PasswordRecoveryError('This reset link has expired or was already used. Request a fresh reset email.')
  }
  if (['bad_code_verifier', 'validation_failed', 'pkce_verifier_not_found'].includes(code) || error?.name === 'AuthPKCEGrantCodeExchangeError') {
    return new PasswordRecoveryError('Open the reset email in the same browser that requested it. Or request a fresh email, copy its Reset password link without opening it, and paste it into Forgot password in the app.')
  }
  if (code === 'email_address_not_authorized') {
    return new PasswordRecoveryError('The email service cannot send to this address with its current setup. Your account and local training data have been kept.')
  }
  return new PasswordRecoveryError('Password recovery could not be completed. Check your connection and try again. Your local training data has been kept.')
}

export function createPasswordRecovery(auth, { projectUrl, pageUrl }) {
  async function requireSignedOut() {
    const current = await auth.getSession()
    if (current.error) throw current.error
    if (current.data?.session) throw new PasswordRecoveryError('You are already signed in. Use the password form in Profile to choose a new password for this account.')
  }

  async function verifyIdentity(result) {
    if (result.error) throw result.error
    const { user, session } = result.data || {}
    if (!user || !session || session.user?.id !== user.id) {
      throw new PasswordRecoveryError('The reset link did not verify an account. Request a fresh reset email.')
    }
    const verified = await auth.getUser()
    if (verified.error || verified.data?.user?.id !== user.id) {
      throw new PasswordRecoveryError('The recovery account could not be verified. Your local training data has been kept.')
    }
    return { user: verified.data.user, session, passwordRecovery: true }
  }

  return {
    async request(email) {
      try {
        const address = String(email || '').trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new PasswordRecoveryError('Enter your existing LetMeFly account email address.')
        const redirectTo = passwordRecoveryReturnUrl(pageUrl())
        await requireSignedOut()
        const { error } = await auth.resetPasswordForEmail(address, { redirectTo })
        if (error) throw error
      } catch (error) { throw recoveryFailure(error) }
    },

    async verifyLink(value) {
      try {
        let link
        try { link = new URL(String(value || '').trim()) } catch {
          throw new PasswordRecoveryError('Paste the complete Reset password link from your most recent email.')
        }
        const project = new URL(projectUrl)
        const token = link.searchParams.get('token_hash') || link.searchParams.get('token')
        if (link.origin !== project.origin || link.protocol !== 'https:' || link.username || link.password ||
          link.pathname !== '/auth/v1/verify' || link.searchParams.get('type') !== 'recovery' ||
          !token || !/^[A-Za-z0-9_-]{16,2048}$/.test(token)) {
          throw new PasswordRecoveryError('Use the original Reset password link from the LetMeFly recovery email. Copy the link without opening it, then paste it here.')
        }
        await requireSignedOut()
        // Verify with the configured Auth client. Never navigate to or fetch the pasted URL.
        return await verifyIdentity(await auth.verifyOtp({ token_hash: token, type: 'recovery' }))
      } catch (error) { throw recoveryFailure(error) }
    },

    async completeReturn(value, replaceUrl) {
      if (!isPasswordRecoveryReturn(value)) return null
      const url = new URL(value)
      const current = new URL(pageUrl())
      if (url.origin !== current.origin || url.pathname !== current.pathname) {
        throw new PasswordRecoveryError('Open the reset link on the LetMeFly website that requested it.')
      }
      const fragment = new URLSearchParams(url.hash.slice(1))
      const callbackError = url.searchParams.get('error') || fragment.get('error')
      const errorCode = url.searchParams.get('error_code') || fragment.get('error_code')
      const code = url.searchParams.get('code')
      const flowId = url.searchParams.get('sb_flow_id')
      // Remove callback credentials before any network request, on success and failure.
      url.search = ''
      url.hash = '/profile'
      replaceUrl(`${url.origin}${url.pathname}${url.hash}`)
      try {
        if (callbackError || errorCode) throw { code: errorCode || 'otp_expired' }
        if (!code) throw new PasswordRecoveryError('This reset link is incomplete. Request a fresh reset email.')
        if (flowId !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId)) throw new PasswordRecoveryError('This reset link is incomplete. Request a fresh reset email.')
        await requireSignedOut()
        return await verifyIdentity(await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined))
      } catch (error) { throw recoveryFailure(error) }
    },
  }
}
