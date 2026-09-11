import { FEEDBACK_FIELDS, FEEDBACK_LIFETIME_MS, coachDecisionContext, captureCoachFeedback, buildCoachDecisionReview } from './coach-decisions.mjs'

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
let currentContext = null, draft = {}, feedback = null, expiryTimer = 0, notice = ''

export function resetCoachDecision() {
  clearTimeout(expiryTimer); expiryTimer = 0
  currentContext = null; draft = {}; feedback = null; notice = ''
}

export function changeCoachDecision(target) {
  if (!target.matches('[data-ai-feedback]') || !currentContext) return false
  const field = FEEDBACK_FIELDS.find(row => row.key === target.dataset.aiFeedback)
  if (!field || (target.value !== 'unknown' && !field.options.some(([value]) => value === target.value))) return false
  draft[field.key] = target.value
  feedback = null; clearTimeout(expiryTimer)
  notice = 'Answers changed. Review them when you are ready.'
  return true
}

export function clickCoachDecision(target, refresh) {
  if (!currentContext) return false
  if (target.closest('[data-ai-clear-current]')) {
    draft = {}; feedback = null; clearTimeout(expiryTimer)
    notice = 'Check-in cleared.'; return true
  }
  if (!target.closest('[data-ai-review-current]')) return false
  feedback = captureCoachFeedback(currentContext, draft, new Date().toISOString())
  notice = Object.keys(feedback.answers).length ? 'Current answers reviewed. Nothing is saved or applied.' : 'Choose at least one answer to review a situation.'
  clearTimeout(expiryTimer)
  expiryTimer = setTimeout(refresh, FEEDBACK_LIFETIME_MS + 10)
  return true
}

function fieldSelect(field) {
  return `<label class="lmf-ai-select">${esc(field.label)}<select data-ai-feedback="${field.key}"><option value="unknown">Not assessed / not sure</option>${field.options.map(([value, label]) => `<option value="${value}"${draft[field.key] === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>`
}
function sourceDetails(rule, source) {
  return `<details data-ai-coach-detail="source-${rule.id}"><summary>Why this appears · ${esc(rule.id)}</summary><p>You reported: ${rule.reportedFields.map(key => { const field = FEEDBACK_FIELDS.find(row => row.key === key); return `${esc(field.label)} — ${esc(field.options.find(([value]) => value === draft[key])?.[1])}` }).join('; ')}.</p><dl class="lmf-ai-profile-fields"><dt>Source rule</dt><dd>${esc(rule.trigger)}</dd><dt>Protects</dt><dd>${esc(rule.protectedOutcome)}</dd><dt>Evidence basis</dt><dd>${esc(rule.evidenceBasis)}</dd><dt>Boundary</dt><dd>${esc(rule.boundary)}</dd></dl><p>${esc(source.version)} · ${esc(source.sheet)} · ${esc(rule.id)} · priority ${rule.priority} · ${esc(rule.state)}.</p><small>Reconstructed factual base: ${esc(source.factualBase)}. Expanded master: ${esc(source.expandedMaster)}. Your report selects source guidance for review; it does not authorize a program change.</small></details>`
}

export function coachDecisionView(data, summary, { selection, athleteProfile, manifest }) {
  const context = coachDecisionContext(data, summary, selection)
  if (currentContext?.contextKey !== context.contextKey) {
    const hadAnswers = Object.keys(draft).length > 0 || feedback !== null
    resetCoachDecision()
    if (hadAnswers) notice = 'Training context changed. Check in again for this athlete, program and exercise.'
  }
  currentContext = context
  let review
  try { review = manifest && buildCoachDecisionReview(data, summary, { context, feedback, now: new Date().toISOString(), athleteProfile }, manifest) }
  catch (_) { review = null }
  if (!review) return { signature: ['unavailable', context.contextKey], html: '<div class="lmf-ai-context" data-ai-current-review><strong>Current check-in unavailable</strong><p>The reviewed decision source could not be loaded. Your history and native workout controls remain available.</p></div>' }
  const first = review.rules[0], secondary = review.rules.slice(1), e = review.evidence
  const contextCopy = context.program ? `${context.program.program_name || context.program.program_key} · Week ${context.program.current_week ?? '—'} · ${String(context.program.current_day_key ?? '').replace('-', ' ')}` : 'Current program not confirmed'
  const feedbackNotice = review.feedback.status === 'expired' ? 'This check-in expired. Review your current answers again.' : notice
  const checkin = `<details data-ai-coach-detail="checkin" class="lmf-ai-checkin"><summary>Check in for this session</summary><p>${esc(contextCopy)}${context.selectedExerciseName ? ` · ${esc(context.selectedExerciseName)}` : ' · Session-wide review'}</p><small>Use what is true now. Answers stay in this view for up to 15 minutes and clear when you leave or change training context. Saved preferences and old readiness ratings do not fill these answers.</small><div class="lmf-ai-feedback-grid">${FEEDBACK_FIELDS.filter(field => !field.extra).map(fieldSelect).join('')}</div><details data-ai-coach-detail="more-feedback"><summary>Performance, recovery and missed work</summary><div class="lmf-ai-feedback-grid">${FEEDBACK_FIELDS.filter(field => field.extra).map(fieldSelect).join('')}</div><p>Assess comparable sessions using the exercise, prescription, effort and execution. A lighter logged load alone does not establish a decline.</p></details><div class="lmf-ai-feedback-actions"><button type="button" data-ai-review-current>Review my current answers</button><button type="button" data-ai-clear-current>Clear check-in</button></div><p role="status" data-ai-feedback-status>${esc(feedbackNotice)}</p></details>`
  let result
  if (first) {
    const nativeCopy = ['DR-019', 'DR-014'].includes(first.id)
      ? 'For a change to today’s exercise, open that exercise in Train and use Substitute Today. Its eligibility, loading and acknowledgement checks still apply.'
      : 'Compare this guidance with today’s programmed roles and prescription before deciding on a change.'
    result = `<div class="lmf-ai-current-result" data-ai-current-result><span class="lmf-ai-kicker">REVIEW FIRST · ${esc(first.id)}</span><h4>${esc(first.trigger)}</h4><p>${esc(first.sourceAction)}</p><small>${esc(first.state)} · Source guidance for review. The active program remains authoritative.</small>${sourceDetails(first, review.source)}${secondary.length ? `<details data-ai-coach-detail="other-signals"><summary>${secondary.length} other reported ${secondary.length === 1 ? 'situation' : 'situations'}</summary><p>Review these after the higher-priority concern. These rules are not a combined adjustment plan.</p>${secondary.map(rule => `<article data-ai-secondary-rule="${rule.id}"><strong>${esc(rule.id)} · ${esc(rule.trigger)}</strong><p>${esc(rule.sourceAction)}</p>${sourceDetails(rule, review.source)}</article>`).join('')}</details>` : ''}<p>${esc(nativeCopy)}</p><a class="lmf-ai-profile-link" href="#/train">Review today’s workout</a></div>`
  } else {
    result = `<div class="lmf-ai-current-result" data-ai-current-result><strong>${review.feedback.status === 'current' && e.reportedAnswers ? 'No source situation matched these answers' : 'Start with your current situation'}</strong><p>${review.feedback.status === 'current' && e.reportedAnswers ? 'This is not clearance to increase training. Your active program and native checks still govern the session.' : 'Review your check-in above to see which source guidance fits. Unknown answers remain unknown.'}</p></div>`
  }
  const evidence = `<details data-ai-coach-detail="decision-evidence"><summary>Evidence and missing context</summary><p>${e.reportedAnswers} of ${e.availableQuestions} current questions answered. ${e.completedSessions} completed sessions, ${e.completedSets} saved sets and ${e.effortSets} effort ratings in the last 30 days.</p><p>${e.activeProgramSessions === null ? 'Active-program history cannot be separated until the program is confirmed.' : `${e.activeProgramSessions} sessions and ${e.activeProgramSets} sets share the active program key; different blocks or runs may be included.`}${context.selectedExerciseId ? ` Selected exercise: ${e.selectedExerciseSessions} sessions; ${e.sameRepSessions} sessions with logged loads at ${e.sameRepCount ?? 'an unknown number of'} reps.` : ''}</p><p>History counts describe the records available. They do not verify current pain, technical quality, equipment access or a primary performance decline.</p>${review.missing.length ? `<ul>${review.missing.map(message => `<li>${esc(message)}</li>`).join('')}</ul>` : ''}${review.unassessed.length ? `<p>Not assessed: ${esc(review.unassessed.join('; '))}.</p>` : ''}<p>Rules retain their original IDs and STANDBY status. Your current program still controls the prescription.</p></details>`
  return { signature: [context.contextKey, draft, feedback, review.feedback.status, review.evidence, review.missing, notice],
    html: `<div class="lmf-ai-current-review" data-ai-current-review><h4>Make sense of today</h4>${checkin}${result}${evidence}</div>` }
}
