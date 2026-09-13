import type { PasswordAccessContext } from './password-access-ui-v1'

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function passwordRecoveryMarkup(context: PasswordAccessContext): string {
  return `<section class="card lmf-password-access">
    <div class="page-kicker">LetMeFly account</div>
    <h2>Reset your password</h2>
    <p class="muted">Recover your existing account. Your training history and exercise pictures stay with it.</p>
    <p class="source-note">Still signed in on your phone or desktop? Open Profile there and choose a new password without email.</p>
    ${context.recoveryError ? `<p class="source-note" role="alert">${escape(context.recoveryError)}</p>` : ''}
    <form data-password-form="recovery">
      <div class="field"><label for="lmf-account-email">Account email</label><input id="lmf-account-email" class="input" type="email" autocomplete="username" value="${escape(context.email || '')}" required></div>
      <p class="source-note">Signed out everywhere? Request a one-time recovery email, then choose a new password. Everyday sign-in will still use your password.</p>
      <div class="btn-row"><button class="btn primary" type="submit" data-reset-request>SEND RESET EMAIL</button><button class="btn ghost" type="button" data-password-view="signin">Back to Sign In</button></div>
      <p class="source-note" data-reset-feedback role="status" aria-live="polite"></p>
    </form>
    <details class="lmf-recovery-link-help">
      <summary>Having trouble opening the reset link?</summary>
      <p class="source-note">Request a fresh email. Copy its Reset password link without opening it, then paste it below. On a phone, press and hold the link and choose Copy link. Keep the link private.</p>
      <form data-recovery-link-form>
        <div class="field"><label for="lmf-recovery-link">Reset link from your email</label><input id="lmf-recovery-link" class="input" type="password" autocomplete="off" spellcheck="false" required></div>
        <div class="btn-row"><button class="btn primary" type="submit">VERIFY RESET LINK</button></div>
        <p class="source-note" data-recovery-link-feedback role="status" aria-live="polite"></p>
      </form>
    </details>
  </section>`
}

export function bindPasswordRecovery(host: HTMLElement, context: PasswordAccessContext): void {
  const request = host.querySelector<HTMLFormElement>('[data-password-form="recovery"]')
  const linkForm = host.querySelector<HTMLFormElement>('[data-recovery-link-form]')
  if (!request || !linkForm) return
  let busy = false
  const lock = (value: boolean) => {
    busy = value
    request.setAttribute('aria-busy', String(value))
    linkForm.setAttribute('aria-busy', String(value))
    host.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = value })
  }
  request.addEventListener('submit', async event => {
    event.preventDefault()
    if (busy || !request.reportValidity()) return
    const email = request.querySelector<HTMLInputElement>('#lmf-account-email')!
    const feedback = request.querySelector<HTMLElement>('[data-reset-feedback]')!
    lock(true)
    feedback.textContent = 'Requesting your recovery email…'
    try {
      await context.requestPasswordReset(email.value)
      if (request.isConnected) feedback.textContent = 'If this address has an account, a reset email has been requested. Open its link in this same browser to choose a new password. If it opens somewhere else, use the link option below.'
    } catch (error) {
      if (request.isConnected) feedback.textContent = error instanceof Error ? error.message : 'The recovery email could not be requested. Try again.'
    } finally { lock(false) }
  })
  linkForm.addEventListener('submit', async event => {
    event.preventDefault()
    if (busy || !linkForm.reportValidity()) return
    const input = linkForm.querySelector<HTMLInputElement>('#lmf-recovery-link')!
    const feedback = linkForm.querySelector<HTMLElement>('[data-recovery-link-feedback]')!
    lock(true)
    feedback.textContent = 'Verifying the reset link…'
    const link = input.value
    input.value = ''
    try {
      await context.verifyPasswordResetLink(link)
    } catch (error) {
      if (linkForm.isConnected) feedback.textContent = error instanceof Error ? error.message : 'The reset link could not be verified. Request a fresh recovery email.'
    } finally { input.value = ''; lock(false) }
  })
}
