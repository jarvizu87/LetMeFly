const RED_FLAG_PATTERN = /\b(severe pain|acute trauma|cannot bear weight|can't bear weight|inability to bear weight|major instability|significant swelling|neurolog(?:ic|ical) symptoms?|numbness|new weakness|clearly worsening symptoms?|rapidly worsening)\b/i
const HIP_PATTERN = /\b(anterior hip|hip pinching|deep hip flexion|deep squat(?:s|ting)?|hip discomfort)\b/i
const KNEE_PATTERN = /\b(knee pain|loaded knee flexion|deep knee flexion|painful knee flexion)\b/i

export function classifyCoachSafetyContext(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (RED_FLAG_PATTERN.test(text)) return 'red-flag'
  if (HIP_PATTERN.test(text)) return 'hip-limitation'
  if (KNEE_PATTERN.test(text)) return 'knee-limitation'
  return null
}

export function coachSafetyResponse(kind) {
  if (kind === 'red-flag') {
    return {
      label: 'SAFETY FIRST',
      title: 'STOP ROUTINE TRAINING ADVICE',
      body: 'Do not use a routine exercise substitution to train around severe pain, acute trauma, inability to bear weight, major instability, significant swelling, neurological symptoms, or clearly worsening symptoms. Stop the training session and seek prompt evaluation from a qualified medical professional. If the situation feels urgent or severe, use appropriate urgent or emergency care. LetMeFly cannot diagnose the cause.',
    }
  }
  if (kind === 'hip-limitation') {
    return {
      label: 'TRAINING MODIFICATION · NOT A DIAGNOSIS',
      title: 'AVOID PROVOCATIVE DEEP HIP FLEXION TODAY',
      body: 'Do not blindly replace a deep squat with another deep-squat variation just because it trains similar muscles. Stay out of the range that reproduces the hip pinching. If you use Substitute Today, choose an approved option that preserves the programmed movement role, muscle emphasis, stimulus, equipment context, and training phase while allowing a non-provocative range. Keep the original prescription identifiable. If symptoms are severe, worsening, or follow acute trauma, stop training and seek professional evaluation.',
    }
  }
  if (kind === 'knee-limitation') {
    return {
      label: 'TRAINING MODIFICATION · NOT A DIAGNOSIS',
      title: 'AVOID PAINFUL LOADED OR DEEP KNEE FLEXION TODAY',
      body: 'Do not simply swap to another exercise that reproduces the same painful loaded or deep knee-flexion demand. If you use Substitute Today, choose an approved option that preserves the programmed purpose and stimulus while using a tolerable range and loading pattern. Keep the original prescription and substitution provenance intact. If weight bearing is difficult, the knee feels unstable, swelling is significant, symptoms are worsening, or there was acute trauma, stop training and seek professional evaluation.',
    }
  }
  return null
}

async function activeAthleteSafetyNotes() {
  if (typeof indexedDB === 'undefined') return ''
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('letmefly-private')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    if (!db.objectStoreNames.contains('athletes')) return ''
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction('athletes', 'readonly').objectStore('athletes').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const athlete = rows.find(row => !row.deleted_at)
    const profile = athlete?.profile_context_v2 ?? {}
    return [profile.coachingNotes, profile.exerciseAvoidances, profile.developmentPriorities]
      .filter(Boolean).join(' ')
  } finally {
    db.close()
  }
}

function renderSafetyResponse(response) {
  const host = document.querySelector('#coach-answer')
  if (!host || !response) return
  host.dataset.coachSafetyGuard = response.title
  host.innerHTML = `<div class="coach-message-mark" aria-hidden="true">♛</div><div><span>${response.label}</span><h2>${response.title}</h2><p>${response.body}</p></div>`
}

async function applySafetyGuard(question) {
  try {
    const notes = await activeAthleteSafetyNotes()
    const kind = classifyCoachSafetyContext(`${question ?? ''} ${notes}`)
    if (!kind) return
    renderSafetyResponse(coachSafetyResponse(kind))
  } catch (error) {
    console.warn('Coach safety context unavailable', error)
  }
}

function submittedQuestion(control) {
  return control?.getAttribute?.('data-coach-prompt')
    || document.querySelector('#coach-question')?.value
    || ''
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  // Run after native Coach handlers. This guard is read-only: it changes only the
  // displayed safety response and never edits the program, workout, or athlete data.
  window.addEventListener('click', event => {
    const control = event.target?.closest?.('.coach-shell [data-coach-prompt], .coach-shell [data-action="ask-coach"]')
    if (!control || control.disabled) return
    const question = submittedQuestion(control)
    setTimeout(() => { void applySafetyGuard(question) }, 0)
  }, true)
  window.addEventListener('keydown', event => {
    if (event.target?.id !== 'coach-question' || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return
    const question = event.target.value || ''
    setTimeout(() => { void applySafetyGuard(question) }, 0)
  }, true)
}
