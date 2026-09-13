#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?reconstructed app root required}"
cp "$ROOT_DIR/overlays/auth/phone-otp-v1.mjs" "$ROOT_DIR/overlays/auth/phone-otp-v1.d.mts" "$TARGET/src/auth/"
python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])/'src'
def replace(path,old,new):
    s=path.read_text()
    assert s.count(old)==1,(path,old)
    path.write_text(s.replace(old,new,1))
auth=root/'auth/auth-service.ts'
auth.write_text("import { createPhoneOtp } from './phone-otp-v1.mjs'\n"+auth.read_text())
replace(auth,'export class LetMeFlyAuthService {','''export class LetMeFlyAuthService {
  async requestPhoneOtp(phone: string): Promise<void> {
    await createPhoneOtp(supabase.auth).request(phone)
  }
  async verifyPhoneOtp(phone: string, token: string): Promise<VerifiedAuth> {
    return createPhoneOtp(supabase.auth).verify(phone, token)
  }
''')
vault=root/'auth/private-vault-controller.ts'
s=vault.read_text()
start=s.index('  async verifyCode(')
end=s.index('  async syncNow()',start)
phone=s[start:end].replace('async verifyCode(', 'async verifyPhoneCode(',1).replace('email: string,','phone: string,',1).replace('this.auth.verifyEmailOtp(email, token)','this.auth.verifyPhoneOtp(phone, token)',1).replace('verified.user.email ?? email','verified.user.email ?? null',1)
assert 'verifyEmailOtp' not in phone and '?? email' not in phone
request='''  async requestPhoneCode(phone: string): Promise<void> {
    this.patch({ mode: 'OTP_REQUESTED', lastError: null })
    try { await this.auth.requestPhoneOtp(phone) }
    catch (error) {
      this.patch({ mode: 'LOCAL_ONLY', lastError: errorMessage(error) })
      throw error
    }
  }

'''
vault.write_text(s[:end]+request+phone+s[end:])
main=root/'main.ts'
s=main.read_text()
marker='${state.cloud.configured && !snapshot?.session ? `'
start=s.index(marker)+len(marker)
end=s.index("` : ''}",start)
existing=s[start:end]
assert 'send-otp-signin' in existing
s=s[:start]+'${phoneOtpCard()}<details class="card"><summary>Email sign-in</summary>'+existing+'</details>'+s[end:]
onboard='<div class="field"><label>Display name</label><input id="onboard-name"'
assert s.count(onboard)==1
s=s.replace(onboard,"${state.cloud.configured ? phoneOtpCard() : ''}"+onboard,1)
bind='function bindCommonEvents(): void {\n'
assert s.count(bind)==1
s=s.replace(bind,bind+'''  document.querySelector('[data-action="send-phone-otp"]')?.addEventListener('click', sendPhoneOtp)
  document.querySelector('[data-action="verify-phone-otp"]')?.addEventListener('click', verifyPhoneOtp)
''',1)
s+='''

// Installed only after SMS delivery and the existing account's verified number
// have been configured. These forms use the native Auth and vault boundaries.
function phoneOtpCard(): string {
  return `<section class="card lmf-phone-signin"><h2>Text-message sign-in</h2><p class="muted">Use the phone number linked to your existing LetMeFly account.</p><div class="form-grid"><div class="field"><label for="cloud-phone">Mobile number</label><input id="cloud-phone" class="input" type="tel" autocomplete="tel" placeholder="+1 202 555 0100"></div><div class="field"><label for="cloud-phone-code">Text-message code</label><input id="cloud-phone-code" class="input" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Code from your text"></div></div><div class="btn-row"><button class="btn primary" data-action="send-phone-otp">SEND TEXT CODE</button><button class="btn ghost" data-action="verify-phone-otp" disabled>VERIFY TEXT CODE</button></div></section>`
}

async function sendPhoneOtp(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('[data-action="send-phone-otp"]')
  if (!button || button.disabled) return
  const phone = document.querySelector<HTMLInputElement>('#cloud-phone')?.value ?? ''
  button.disabled = true
  try {
    await state.cloud.vault.requestPhoneCode(phone)
    showToast('Text-message code sent')
    const verify = document.querySelector<HTMLButtonElement>('[data-action="verify-phone-otp"]')
    if (verify) verify.disabled = false
    button.textContent = 'RESEND AVAILABLE IN A MINUTE'
    window.setTimeout(() => {
      if (button.isConnected) { button.disabled = false; button.textContent = 'SEND TEXT CODE' }
    }, 60000)
  } catch (error) { button.disabled = false; showToast(errorMessage(error)) }
}

async function verifyPhoneOtp(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('[data-action="verify-phone-otp"]')
  if (!button || button.disabled) return
  const phone = document.querySelector<HTMLInputElement>('#cloud-phone')?.value ?? ''
  const code = document.querySelector<HTMLInputElement>('#cloud-phone-code')?.value ?? ''
  button.disabled = true
  try {
    const decision = await state.cloud.vault.verifyPhoneCode(phone, code)
    state.cloudSnapshot = state.cloud.vault.snapshot
    if (decision.kind !== 'manual-choice-required') {
      state.athlete = await getActiveAthlete()
      state.programInstance = state.athlete ? await getCurrentProgramInstance(state.athlete.id) : null
      await refreshWorkout()
    }
    render()
    showToast(decision.kind === 'manual-choice-required' ? 'Local/cloud athlete mismatch — automatic merge blocked' : 'Phone sign-in verified')
  } catch (error) { button.disabled = false; showToast(errorMessage(error)) }
}
'''
main.write_text(s)
PY
node "$ROOT_DIR/ci/audit-phone-otp-v1.mjs"
echo 'LetMeFly existing-account text-code sign-in: APPLIED'
