#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?reconstructed app root required}"
cp "$ROOT_DIR/overlays/auth/password-auth-v1.mjs" "$ROOT_DIR/overlays/auth/password-auth-v1.d.mts" "$ROOT_DIR/overlays/auth/password-access-ui-v1.ts" "$TARGET/src/auth/"
cp "$ROOT_DIR/overlays/auth/password-registration-v1.mjs" "$ROOT_DIR/overlays/auth/password-registration-v1.d.mts" "$TARGET/src/auth/"
python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])/'src'
def replace(path,old,new):
    s=path.read_text()
    assert s.count(old)==1,(path,old)
    path.write_text(s.replace(old,new,1))
auth=root/'auth/auth-service.ts'
auth.write_text("import { createPasswordAuth } from './password-auth-v1.mjs'\nimport { createPasswordRegistration } from './password-registration-v1.mjs'\n"+auth.read_text())
replace(auth,"import { supabase } from './supabase-client'","import { supabase, getPasswordRegistrationSettings } from './supabase-client'")
client=root/'auth/supabase-client.ts'
client.write_text(client.read_text()+'''

export async function getPasswordRegistrationSettings() {
  if (!supabaseUrl || !supabasePublishableKey) throw new Error('Cloud account access is not configured.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${supabaseUrl.replace(/\\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Registration settings could not be checked.')
    return await response.json()
  } finally { clearTimeout(timeout) }
}
''')
replace(auth,'export class LetMeFlyAuthService {','''export class LetMeFlyAuthService {
  async passwordRegistrationAvailability() {
    return createPasswordRegistration(supabase.auth, getPasswordRegistrationSettings).availability()
  }

  async registerWithPassword(email: string, password: string, confirmation: string): Promise<VerifiedAuth> {
    return createPasswordRegistration(supabase.auth, getPasswordRegistrationSettings).register(email, password, confirmation)
  }

  async signInWithPassword(email: string, password: string): Promise<VerifiedAuth> {
    return createPasswordAuth(supabase.auth).signIn(email, password)
  }

  async setAccountPassword(userId: string, password: string, confirmation: string): Promise<void> {
    await createPasswordAuth(supabase.auth).setPassword(userId, password, confirmation)
  }
''')
vault=root/'auth/private-vault-controller.ts'
s=vault.read_text()
start=s.index('  async verifyCode(')
# End at the end of this method, including when phone methods are installed later.
end=s.index('\n  async ',start+5)
method=s[start:end].replace('async verifyCode(', 'async signInWithPassword(',1).replace('token: string,','password: string,',1).replace('this.auth.verifyEmailOtp(email, token)','this.auth.signInWithPassword(email, password)',1)
assert 'verifyEmailOtp' not in method
registration=method.replace('async signInWithPassword(', 'async registerWithPassword(',1).replace('password: string,','password: string,\n    confirmation: string,',1).replace('this.auth.signInWithPassword(email, password)','this.auth.registerWithPassword(email, password, confirmation)',1)
registration=registration.replace("    this.patch({ mode: 'AUTHENTICATING', lastError: null })", "    if (this.state.session) throw new Error('You are already signed in. Use Profile to manage this account.')\n    this.patch({ mode: 'AUTHENTICATING', lastError: null })",1)
vault.write_text(s[:end]+'\n'+method+'\n'+registration+'''
  async passwordRegistrationAvailability() {
    return this.auth.passwordRegistrationAvailability()
  }

  async setAccountPassword(userId: string, password: string, confirmation: string): Promise<void> {
    if (!this.state.session || this.state.user?.id !== userId) {
      throw new Error('Sign in to your existing cloud account before setting a password.')
    }
    await this.auth.setAccountPassword(userId, password, confirmation)
  }
'''+s[end:])
main=root/'main.ts'
s=main.read_text()
s="import { passwordAccessKey, passwordAccessMarkup, bindPasswordAccess, type PasswordAccessContext } from './auth/password-access-ui-v1'\n"+s
marker='${state.cloud.configured && !snapshot?.session ? `'
start=s.index(marker)+len(marker)
end=s.index("` : ''}",start)
existing=s[start:end]
assert 'send-otp-signin' in existing
s=s[:start]+'<details class="card lmf-other-signin"><summary>Other sign-in options</summary>'+existing+'</details>'+s[end:]
s=s.replace(marker,'${passwordAccessHost()}\n  '+marker,1)
onboard='<div class="field"><label>Display name</label><input id="onboard-name"'
assert s.count(onboard)==1
s=s.replace(onboard,'${passwordAccessHost()}'+onboard,1)
bind='function bindCommonEvents(): void {\n'
assert s.count(bind)==1
s=s.replace(bind,bind+'  refreshPasswordAccess()\n',1)
update='function updateSyncPill(): void {\n'
assert s.count(update)==1
s=s.replace(update,update+'  refreshPasswordAccess()\n',1)
s+='''

function passwordAccessContext(): PasswordAccessContext {
  const snapshot = state.cloudSnapshot
  return {
    configured: state.cloud.configured,
    userId: snapshot?.session && snapshot.user ? snapshot.user.id : null,
    email: snapshot?.email || null,
    setPassword: (userId, password, confirmation) => state.cloud.vault.setAccountPassword(userId, password, confirmation),
    registrationAvailability: () => state.cloud.vault.passwordRegistrationAvailability(),
    register: async (email, password, confirmation) => {
      const decision = await state.cloud.vault.registerWithPassword(email, password, confirmation)
      state.cloudSnapshot = state.cloud.vault.snapshot
      if (decision.kind !== 'manual-choice-required') {
        state.athlete = await getActiveAthlete()
        state.programInstance = state.athlete ? await getCurrentProgramInstance(state.athlete.id) : null
        await refreshWorkout()
      }
      render()
      showToast(decision.kind === 'manual-choice-required' ? 'Local/cloud athlete mismatch — automatic merge blocked' : state.athlete ? 'Your LetMeFly account is ready' : 'Account created. Build your athlete profile below.')
    },
    signIn: async (email, password) => {
      const decision = await state.cloud.vault.signInWithPassword(email, password)
      state.cloudSnapshot = state.cloud.vault.snapshot
      if (decision.kind !== 'manual-choice-required') {
        state.athlete = await getActiveAthlete()
        state.programInstance = state.athlete ? await getCurrentProgramInstance(state.athlete.id) : null
        await refreshWorkout()
      }
      render()
      showToast(decision.kind === 'manual-choice-required' ? 'Local/cloud athlete mismatch — automatic merge blocked' : 'Signed in to your LetMeFly account')
    },
  }
}

function passwordAccessHost(): string {
  const context = passwordAccessContext()
  return `<div data-password-access-host data-password-key="${esc(passwordAccessKey(context))}">${passwordAccessMarkup(context)}</div>`
}

function refreshPasswordAccess(): void {
  const context = passwordAccessContext()
  document.querySelectorAll<HTMLElement>('[data-password-access-host]').forEach(host => {
    const key = passwordAccessKey(context)
    if (host.dataset.passwordKey !== key) {
      host.innerHTML = passwordAccessMarkup(context)
      host.dataset.passwordKey = key
    }
    bindPasswordAccess(host, context)
  })
}
'''
main.write_text(s)
PY
node "$ROOT_DIR/ci/audit-password-auth-v1.mjs"
node "$ROOT_DIR/ci/audit-password-registration-v1.mjs"
mkdir -p "$TARGET/public/ui"
cat "$ROOT_DIR/overlays/auth/password-access-ui-v1.ts" "$ROOT_DIR/overlays/auth/password-registration-v1.mjs" "$ROOT_DIR/ci/apply-password-access-v1.sh" | sha256sum | cut -d ' ' -f 1 > "$TARGET/public/ui/password-access-version.txt"
echo 'LetMeFly existing-account password access: APPLIED'
