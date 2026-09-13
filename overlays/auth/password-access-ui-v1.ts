// This view receives native account operations. It never stores credentials.
export interface PasswordAccessContext {
  configured: boolean
  userId: string | null
  email: string | null
  signIn(email: string, password: string): Promise<void>
  register(email: string, password: string, confirmation: string): Promise<void>
  registrationAvailability(): Promise<{ available: boolean; message: string }>
  setPassword(userId: string, password: string, confirmation: string): Promise<void>
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function passwordAccessKey(context: PasswordAccessContext): string {
  return context.configured ? context.userId || 'signed-out' : 'unconfigured'
}

export function passwordAccessMarkup(context: PasswordAccessContext, view: 'signin' | 'register' = 'signin'): string {
  if (!context.configured) return ''
  const signedIn = Boolean(context.userId)
  const registering = !signedIn && view === 'register'
  const newPassword = signedIn || registering
  return `<section class="card lmf-password-access" data-password-account="${escape(passwordAccessKey(context))}">
    <div class="page-kicker">LetMeFly account</div>
    ${signedIn ? '' : `<div class="btn-row" role="group" aria-label="Account access"><button type="button" class="btn ${registering ? 'ghost' : 'primary'}" data-password-view="signin" aria-pressed="${!registering}">Sign In</button><button type="button" class="btn ${registering ? 'primary' : 'ghost'}" data-password-view="register" aria-pressed="${registering}">Register</button></div>`}
    <h2>${signedIn ? 'Set your LetMeFly password' : registering ? 'Create your LetMeFly account' : 'Sign in with your password'}</h2>
    <p class="muted">${signedIn ? 'Choose a password for this signed-in account. Your training history and pictures stay with the same account.' : registering ? 'Register a new account with your email address and a password. Already have training history or pictures in an account? Choose Sign In.' : 'Use your existing LetMeFly account. Your email address identifies the account; this form does not send email or text codes.'}</p>
    <form data-password-form="${signedIn ? 'setup' : registering ? 'register' : 'signin'}">
      <div class="form-grid">
        <div class="field"><label for="lmf-account-email">Account email</label><input id="lmf-account-email" class="input" type="email" autocomplete="username" value="${escape(context.email || '')}" ${signedIn ? 'readonly' : 'required'}></div>
        <div class="field"><label for="lmf-account-password">${newPassword ? 'New password' : 'Password'}</label><input id="lmf-account-password" class="input" type="password" autocomplete="${newPassword ? 'new-password' : 'current-password'}" ${newPassword ? 'minlength="12"' : ''} required></div>
        ${newPassword ? '<div class="field"><label for="lmf-account-password-confirm">Confirm new password</label><input id="lmf-account-password-confirm" class="input" type="password" autocomplete="new-password" minlength="12" required></div>' : ''}
      </div>
      ${signedIn ? '<p class="source-note">Use at least 12 characters. This is separate from your Supabase dashboard password.</p>' : registering ? '<p class="source-note">Use at least 12 characters. Register creates a new account; it does not reset an existing password.</p>' : '<p class="source-note">Never set a password? Open Profile on a device already signed into your LetMeFly cloud account to set one.</p>'}
      <div class="btn-row"><button class="btn primary" type="submit" data-password-submit ${registering ? 'disabled' : ''}>${signedIn ? 'SET PASSWORD' : registering ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>${registering ? '<button class="btn ghost" type="button" data-registration-recheck>Check again</button>' : ''}</div>
      <p class="source-note" data-password-feedback role="status" aria-live="polite"></p>
    </form>
  </section>`
}

function failureMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid') {
    return 'Your account requires a fresh identity check before changing the password. No email or text was sent. Keep this session open for account recovery.'
  }
  if (code === 'current_password_required' || code === 'current_password_invalid') {
    return 'Your account requires the current password before it can be changed. Keep this session open for account recovery.'
  }
  if (code === 'invalid_credentials') return 'The account email or password was not accepted. Check your details and try again.'
  if (code === 'user_already_exists') return 'An account already exists with this email. Choose Sign In to access it.'
  return error instanceof Error ? error.message : 'The request could not be completed. Please try again.'
}

export function bindPasswordAccess(host: HTMLElement, context: PasswordAccessContext): void {
  const form = host.querySelector<HTMLFormElement>('[data-password-form]')
  if (!form || form.dataset.passwordBound) return
  form.dataset.passwordBound = 'true'
  host.querySelectorAll<HTMLButtonElement>('[data-password-view]').forEach(button => {
    button.addEventListener('click', () => {
      if (form.getAttribute('aria-busy') === 'true') return
      const view = button.dataset.passwordView === 'register' ? 'register' : 'signin'
      if (form.dataset.passwordForm === view) return
      const address = form.querySelector<HTMLInputElement>('#lmf-account-email')?.value || ''
      host.innerHTML = passwordAccessMarkup(context, view)
      const email = host.querySelector<HTMLInputElement>('#lmf-account-email')
      if (email) email.value = address
      bindPasswordAccess(host, context)
      host.querySelector<HTMLButtonElement>(`[data-password-view="${view}"]`)?.focus()
    })
  })
  if (form.dataset.passwordForm === 'register') {
    const checkAvailability = async () => {
      if (form.getAttribute('aria-busy') === 'true') return
      const submit = form.querySelector<HTMLButtonElement>('[data-password-submit]')
      const retry = form.querySelector<HTMLButtonElement>('[data-registration-recheck]')
      const feedback = form.querySelector<HTMLElement>('[data-password-feedback]')
      if (!submit || !retry || !feedback) return
      submit.disabled = true
      retry.disabled = true
      form.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.disabled = true })
      feedback.textContent = 'Checking registration…'
      try {
        const result = await context.registrationAvailability()
        if (!form.isConnected) return
        submit.disabled = !result.available
        form.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.disabled = !result.available })
        feedback.textContent = result.message
      } catch {
        if (form.isConnected) feedback.textContent = 'Registration could not be checked. Try again when you are connected.'
      } finally {
        retry.disabled = false
      }
    }
    form.querySelector('[data-registration-recheck]')?.addEventListener('click', () => { void checkAvailability() })
    void checkAvailability()
  }
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const button = form.querySelector<HTMLButtonElement>('[data-password-submit]')
    const feedback = form.querySelector<HTMLElement>('[data-password-feedback]')
    const email = form.querySelector<HTMLInputElement>('#lmf-account-email')
    const password = form.querySelector<HTMLInputElement>('#lmf-account-password')
    const confirmation = form.querySelector<HTMLInputElement>('#lmf-account-password-confirm')
    if (!button || !password || !feedback || button.disabled || form.getAttribute('aria-busy') === 'true' || !form.reportValidity()) return
    button.disabled = true
    form.setAttribute('aria-busy', 'true')
    feedback.textContent = context.userId ? 'Setting your password…' : form.dataset.passwordForm === 'register' ? 'Creating your account…' : 'Signing in…'
    try {
      if (context.userId) {
        await context.setPassword(context.userId, password.value, confirmation?.value || '')
        if (form.isConnected) feedback.textContent = 'Password saved. Use your account email and this password to sign in on another device.'
      } else if (form.dataset.passwordForm === 'register') {
        await context.register(email?.value || '', password.value, confirmation?.value || '')
      } else {
        await context.signIn(email?.value || '', password.value)
      }
    } catch (error) {
      if (form.isConnected) feedback.textContent = failureMessage(error)
    } finally {
      password.value = ''
      if (confirmation) confirmation.value = ''
      form.removeAttribute('aria-busy')
      button.disabled = false
    }
  })
}
