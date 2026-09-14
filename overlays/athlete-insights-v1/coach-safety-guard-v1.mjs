const RED_FLAG_PATTERN = /\b(severe pain|acute trauma|cannot bear weight|can't bear weight|inability to bear weight|major instability|significant swelling|neurolog(?:ic|ical) symptoms?|numbness|new weakness|clearly worsening symptoms?|rapidly worsening)\b/i
const HIP_PATTERN = /\b(anterior hip|hip pinching|deep hip flexion|deep squat(?:s|ting)?|hip discomfort)\b/i
const KNEE_PATTERN = /\b(knee pain|loaded knee flexion|deep knee flexion|painful knee flexion)\b/i
const GENERAL_PAIN_PATTERN = /\b(pain|painful|hurt|hurts|hurting|discomfort)\b/i
const PROFILE_RELEVANT_PATTERN = /\b(pain|painful|hurt|hurts|hurting|discomfort|limitation|substitut|swap|replace|range|squat|knee|hip|train around)\b/i

export function classifyCoachSafetyContext(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (RED_FLAG_PATTERN.test(text)) return 'red-flag'
  if (HIP_PATTERN.test(text)) return 'hip-limitation'
  if (KNEE_PATTERN.test(text)) return 'knee-limitation'
  if (GENERAL_PAIN_PATTERN.test(text)) return 'general-limitation'
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
      body: 'Do not blindly replace a deep squat with another deep-squat variation just because it trains similar muscles. Stay out of the range that reproduces the hip pinching. If you use Substitute Today, choose an approved option that preserves the programmed movement role, muscle emphasis, stimulus, equipment context, and training phase while allowing a non-provocative range. Keep the original prescription identifiable. This is training-modification guidance, not a diagnosis. If symptoms are severe, worsening, or follow acute trauma, stop training and seek professional evaluation.',
    }
  }
  if (kind === 'knee-limitation') {
    return {
      label: 'TRAINING MODIFICATION · NOT A DIAGNOSIS',
      title: 'AVOID PAINFUL LOADED OR DEEP KNEE FLEXION TODAY',
      body: 'Do not simply swap to another exercise that reproduces the same painful loaded or deep knee-flexion demand. If you use Substitute Today, choose an approved option that preserves the programmed purpose and stimulus while using a tolerable range and loading pattern. Keep the original prescription and substitution provenance intact. This is training-modification guidance, not a diagnosis. If weight bearing is difficult, the knee feels unstable, swelling is significant, symptoms are worsening, or there was acute trauma, stop training and seek professional evaluation.',
    }
  }
  if (kind === 'general-limitation') {
    return {
      label: 'TRAINING MODIFICATION · NOT A DIAGNOSIS',
      title: 'DO NOT TRAIN THROUGH PAIN',
      body: 'Stop the movement or range that is causing pain. Do not choose a replacement only because it trains the same muscle; any Substitute Today option must preserve the programmed purpose while avoiding the provoking movement or range. This is training-modification guidance, not a diagnosis. If pain is severe, worsening, follows acute trauma, affects weight bearing, involves major instability or swelling, or includes neurological symptoms, stop the session and seek professional evaluation.',
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
    return [profile.coachingNotes, profile.avoidExercises, profile.exerciseAvoidances, profile.developmentPriorities]
      .filter(Boolean).join(' ')
  } finally {
    db.close()
  }
}

function renderSafetyResponse(response) {
  const host = document.querySelector('#coach-answer')
  if (!host || !response) return false
  host.dataset.coachSafetyGuard = response.title
  host.innerHTML = `<div class="coach-message-mark" aria-hidden="true">♛</div><div><span>${response.label}</span><h2>${response.title}</h2><p>${response.body}</p></div>`
  return true
}

async function resolveProfileSafety(question, fallbackKind = null) {
  try {
    const notes = await activeAthleteSafetyNotes()
    const profileKind = classifyCoachSafetyContext(notes)
    if (profileKind && profileKind !== 'general-limitation') {
      renderSafetyResponse(coachSafetyResponse(profileKind))
      return true
    }
    if (fallbackKind) return renderSafetyResponse(coachSafetyResponse(fallbackKind))
    return false
  } catch (error) {
    console.warn('Coach safety context unavailable', error)
    if (fallbackKind) return renderSafetyResponse(coachSafetyResponse(fallbackKind))
    return false
  }
}

function handleExplicitSafetyQuestion(question, event) {
  const kind = classifyCoachSafetyContext(question)
  if (!kind) return false

  // Generic pain/hurt wording still belongs to Safety First. Claim the event
  // synchronously so a later async substitution/exercise handler cannot overwrite
  // the answer, then upgrade to a saved hip/knee limitation when the athlete
  // profile provides one.
  if (kind === 'general-limitation') {
    event?.preventDefault?.()
    event?.stopImmediatePropagation?.()
    renderSafetyResponse(coachSafetyResponse(kind))
    void resolveProfileSafety(question, kind)
    return true
  }

  const rendered = renderSafetyResponse(coachSafetyResponse(kind))
  if (!rendered) return false
  // Safety outranks descriptive exercise/substitution handlers. Prevent a generic
  // downstream response from briefly or permanently replacing the safety answer.
  event?.preventDefault?.()
  event?.stopImmediatePropagation?.()
  return true
}

async function applyProfileSafetyContext(question) {
  try {
    // Explicit safety language is handled synchronously above. Profile notes are
    // supplemental context only and never mutate program/workout/private data.
    if (classifyCoachSafetyContext(question)) return
    if (!PROFILE_RELEVANT_PATTERN.test(String(question ?? ''))) return
    await resolveProfileSafety(question)
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
  // Window capture executes before document-level Coach interceptors. Explicit
  // safety questions own the event; ordinary Coach questions remain untouched.
  window.addEventListener('click', event => {
    const control = event.target?.closest?.('.coach-shell [data-coach-prompt], .coach-shell [data-action="ask-coach"]')
    if (!control || control.disabled) return
    const question = submittedQuestion(control)
    if (handleExplicitSafetyQuestion(question, event)) return
    setTimeout(() => { void applyProfileSafetyContext(question) }, 0)
  }, true)
  window.addEventListener('keydown', event => {
    if (event.target?.id !== 'coach-question' || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return
    const question = event.target.value || ''
    if (handleExplicitSafetyQuestion(question, event)) return
    setTimeout(() => { void applyProfileSafetyContext(question) }, 0)
  }, true)
}