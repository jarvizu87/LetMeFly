import { summarizeAthlete, compareVolume, buildCoachBrief, readCoachProfile } from './athlete-insights.mjs'
import { progressDetail } from './progress-detail-ui.mjs'
import { readPrivateHistory, historyWindows } from './private-history.mjs'
import { createHistoryCache } from './history-cache.mjs'
import { coachDecisionView, changeCoachDecision, clickCoachDecision, resetCoachDecision } from './coach-decisions-ui.mjs'

const manifest = await fetch(new URL('./coach-rule-manifest.json', import.meta.url)).then(r => {
  if (!r.ok) throw new Error('Coach source context unavailable')
  return r.json()
}).catch(() => null)
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmt = value => value === null || value === undefined ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
const dateLabel = value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
const norm = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
let timer = 0, generation = 0, selectedKey = '', coachTopic = 'recent'
let selectedReps = null, selectedDimension = 'roles'
const history = createHistoryCache(readPrivateHistory)
const topics = { recent: [], difficult: ['DR-001', 'DR-002'], time: ['DR-004'], missed: ['DR-015'], specialty: ['DR-008', 'DR-009', 'DR-010'] }

function selectedRange() {
  const key = document.querySelector('[data-pg-range]')?.value
  return ['7d', '30d', 'all'].includes(key) ? key : '30d'
}
function unitFor(data) { return data.preferences[0]?.weight_unit === 'kg' ? 'kg' : 'lb' }
function displayLoad(kg, unit) { return kg == null ? null : kg / (unit === 'lb' ? 0.45359237 : 1) }
function summaryFor(data, range) {
  const windows = historyWindows(range)
  const current = summarizeAthlete(data, { athleteId: data.athlete.id, ...windows.current })
  const previous = windows.previous ? summarizeAthlete(data, { athleteId: data.athlete.id, ...windows.previous }) : null
  return { current, previous }
}
function exerciseSummary(summary, key) {
  if (!key) return summary
  const exercise = summary.exercises.find(row => row.exerciseKey === key)
  return { ...summary, sessions: exercise?.history ?? [], exercises: exercise ? [exercise] : [], sets: summary.sets.filter(row => row.exerciseKey === key), totals: exercise ?? { externalLoadVolumeKg: null, completedSets: 0, volumeSetCount: 0, averageRpe: null, rpeSetCount: 0 } }
}
function metric(label, value, detail) { return `<div class="lmf-ai-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>` }

function chart(rows, unit) {
  const points = rows.filter(row => row.volumeSetCount > 0).slice(-12)
  if (points.length < 2) return '<p class="lmf-ai-empty">Log loaded reps in two completed sessions to start your workload graph.</p>'
  const values = points.map(row => displayLoad(row.externalLoadVolumeKg, unit))
  const max = Math.max(1, ...values), first = Date.parse(points[0].completedAt), span = Date.parse(points.at(-1).completedAt) - first
  const coords = values.map((value, index) => [30 + (span ? (Date.parse(points[index].completedAt) - first) / span : index / (points.length - 1)) * 530, 146 - value / max * 120])
  const line = coords.map(p => p.join(',')).join(' ')
  return `<figure class="lmf-ai-chart"><svg viewBox="0 0 590 174" role="img" aria-label="Logged volume by session, from zero. Exact values follow in Session details."><path d="M30 26H560M30 86H560M30 146H560" class="lmf-ai-grid"/><polygon points="30,146 ${line} 560,146" class="lmf-ai-area"/><polyline points="${line}" class="lmf-ai-line"/>${coords.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3"><title>${esc(dateLabel(points[i].completedAt))}: ${fmt(values[i])} ${unit}-reps</title></circle>`).join('')}<text x="30" y="16">${esc(fmt(Math.max(...values)))} ${unit}-reps</text><text x="10" y="150">0</text><text x="30" y="168">${esc(dateLabel(points[0].completedAt))}</text><text x="560" y="168" text-anchor="end">${esc(dateLabel(points.at(-1).completedAt))}</text></svg><figcaption>Last ${points.length} sessions with logged lifting volume · time along the bottom</figcaption></figure>`
}

function renderProgress(target, data) {
  const { current, previous } = summaryFor(data, selectedRange())
  if (selectedKey && !current.exercises.some(row => row.exerciseKey === selectedKey)) selectedKey = ''
  const view = exerciseSummary(current, selectedKey), prior = previous && exerciseSummary(previous, selectedKey)
  const comparison = prior && compareVolume(view, prior), unit = unitFor(data), totals = view.totals
  const comparisonCopy = !prior ? 'Choose 7 or 30 days to compare equal rolling periods.' : comparison.status !== 'available' ? 'Needs two sessions with logged lifting volume in each period.' : comparison.percentChange === null ? 'The previous period has zero logged volume; a percentage is unavailable.' : `${comparison.percentChange >= 0 ? '+' : ''}${fmt(comparison.percentChange)}% volume vs. the previous ${selectedRange() === '7d' ? '7' : '30'} days · ${comparison.currentSessions} vs. ${comparison.previousSessions} loaded sessions.`
  const catalog = window.LetMeFlyExerciseIntelligence
  const detail = progressDetail(data, current, view, { exerciseKey: selectedKey, reps: selectedReps, dimension: selectedDimension, unit, catalog: catalog?.getAllExercises() ?? [], catalogVersion: catalog?.version ?? null })
  const sessions = view.sessions, signature = JSON.stringify([data.athlete.id, selectedRange(), selectedKey, view.totals, sessions, comparison, detail.signature])
  let section = target.querySelector('#lmf-advanced-progress')
  if (section?.dataset.signature === signature) return
  if (!section) { section = document.createElement('section'); section.id = 'lmf-advanced-progress'; section.className = 'lmf-athlete-insights'; target.appendChild(section) }
  const chosen = current.exercises.find(row => row.exerciseKey === selectedKey)
  const openDetails = [...section.querySelectorAll('details[data-ai-detail-key][open]')].map(row => row.dataset.aiDetailKey)
  const focus = section.contains(document.activeElement) ? ['data-ai-exercise', 'data-ai-reps', 'data-ai-dimension'].find(key => document.activeElement.hasAttribute(key)) : null
  section.innerHTML = `<header><div><span class="lmf-ai-kicker">THE WORK YOU PUT IN</span><h3>Training workload</h3></div><button type="button" data-ai-refresh aria-label="Refresh training workload">Refresh</button></header><p>${current.totals.completedSessions ? 'Every completed session adds to your training history.' : 'Your first completed session starts the story.'}</p><label class="lmf-ai-select">Exercise<select data-ai-exercise><option value="">All exercises</option>${current.exercises.map(row => `<option value="${esc(row.exerciseKey)}" ${row.exerciseKey === selectedKey ? 'selected' : ''}>${esc(row.exerciseName)}</option>`).join('')}</select></label><div class="lmf-ai-metrics">${metric('TOTAL LIFTED', `${fmt(displayLoad(totals.externalLoadVolumeKg, unit))} ${unit}-reps`, `${totals.volumeSetCount} sets with logged load × reps`)}${metric('COMPLETED SESSIONS', sessions.length, selectedRange() === 'all' ? 'All stored history' : `Rolling ${selectedRange() === '7d' ? '7' : '30'} days`)}${metric('COMPLETED SETS', totals.completedSets, chosen ? chosen.exerciseName : 'All exercise types')}${metric('AVERAGE RPE', fmt(totals.averageRpe), `${totals.rpeSetCount} sets with effort recorded`)}</div>${chart(sessions, unit)}<p class="lmf-ai-comparison">${esc(comparisonCopy)}</p><p class="lmf-ai-note">Volume describes work done. Exercise mix and session count affect comparisons. It does not measure strength gains on its own.</p>${chosen?.prescribedExerciseKeys.some(key => key !== chosen.exerciseKey) ? '<p class="lmf-ai-note">Substitutions are grouped under the exercise performed.</p>' : ''}<details data-ai-session-details><summary>Session details (${sessions.length})</summary><div class="lmf-ai-table"><table><caption>Completed sessions in the selected range</caption><thead><tr><th scope="col">Session</th><th scope="col">Lifted (${unit}-reps)</th><th scope="col">Sets</th><th scope="col">RPE</th></tr></thead><tbody>${[...sessions].reverse().map(row => `<tr><th scope="row">${esc(dateLabel(row.completedAt))}${row.workoutName ? `<small>${esc(row.workoutName)}</small>` : ''}</th><td>${fmt(displayLoad(row.externalLoadVolumeKg, unit))}</td><td>${row.completedSets}</td><td>${fmt(row.averageRpe)}</td></tr>`).join('')}</tbody></table></div></details><p class="lmf-ai-note">Only completed sessions and saved sets count. Missing values stay blank. Distance and timed work are tracked separately; bodyweight, per-side reps and paired implements are never multiplied automatically.</p>`
  section.insertAdjacentHTML('beforeend', detail.html)
  for (const key of openDetails) { const row = section.querySelector(`[data-ai-detail-key="${key}"]`); if (row) row.open = true }
  if (focus) section.querySelector(`[${focus}]`)?.focus({ preventScroll: true })
  section.dataset.signature = signature
}

function coachExercise(summary) {
  const select = document.getElementById('lmf-coach-exercise-context')
  if (!select?.value) return null
  const exercise = window.LetMeFlyExerciseIntelligence?.getExercise(select.value)
  const names = [exercise?.id, exercise?.canonicalName, ...(exercise?.aliases ?? [])].map(norm).filter(Boolean)
  const matches = summary.exercises.filter(row => names.includes(norm(row.exerciseKey)) || names.includes(norm(row.exerciseName)))
  return matches.length === 1 ? matches[0] : null
}
function profileContext(profile) {
  const goal = profile.fields.find(field => field.key === 'primaryGoal').value
  const saved = profile.fields.filter(field => field.value)
  return `<div class="lmf-ai-context" data-ai-profile><strong>Your athlete profile</strong><p>${goal ? `Your primary goal: ${esc(goal)}` : 'Your primary goal is not saved yet.'}</p><small>${profile.savedCount} of ${profile.fields.length} coaching details saved · optional context you control</small><details><summary>Saved details and gaps</summary>${saved.length ? `<dl class="lmf-ai-profile-fields">${saved.map(field => `<dt>${esc(field.label)}</dt><dd>${esc(field.value)}</dd>`).join('')}</dl>` : '<p>No goals, training background or preferences have been saved yet.</p>'}${profile.missing.length ? `<p>Not saved: ${esc(profile.missing.map(field => field.label.toLowerCase()).join(', '))}.</p>` : ''}<p>These are your saved preferences. They do not confirm a training rule or change your program.</p></details><a class="lmf-ai-profile-link" href="#/profile">${profile.missing.length ? 'Add athlete details' : 'Edit athlete details'}</a></div>`
}
// Native details keep supporting context compact and retain open/focus state
// through the same render cycle as the existing check-in controls.
function coachDetail(key, label, content) {
  const paths = {
    profile: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
    evidence: '<path d="M6 3h8l4 4v14H6Z M14 3v5h4 M9 12h6 M9 16h6"/>',
  }
  return `<details class="lmf-coach-detail" data-ai-coach-detail="workspace-${key}"><summary><svg class="lmf-coach-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>${label}</summary><div class="lmf-coach-detail-content">${content}</div></details>`
}
function renderCoach(target, data) {
  const { current } = summaryFor(data, '30d'), exercise = coachExercise(current), unit = unitFor(data)
  const athleteProfile = readCoachProfile(data.athlete, data.athlete.id)
  const activePrograms = data.programs.filter(row => row.status === 'active')
  const program = activePrograms.length === 1 ? activePrograms[0] : null
  const selectedExerciseId = document.getElementById('lmf-coach-exercise-context')?.value || ''
  const selectedExercise = window.LetMeFlyExerciseIntelligence?.getExercise(selectedExerciseId)
  const decision = coachDecisionView(data, current, { selection: { selectedExerciseId, selectedExerciseName: selectedExercise?.canonicalName || selectedExerciseId, exerciseKey: exercise?.exerciseKey }, athleteProfile, manifest })
  const readiness = data.readiness.filter(row => Number.isFinite(Date.parse(row.recorded_at ?? row.created_at)) && Date.parse(row.recorded_at ?? row.created_at) <= Date.now()).sort((a, b) => Date.parse(b.recorded_at ?? b.created_at) - Date.parse(a.recorded_at ?? a.created_at))[0]
  const brief = manifest ? buildCoachBrief(current, { athleteId: data.athlete.id, exerciseKey: exercise?.exerciseKey, requestedRuleIds: topics[coachTopic], athleteProfile }, manifest) : null
  const signature = JSON.stringify([data.athlete.id, current.totals, current.sessions.at(-1), exercise, program, readiness, coachTopic, athleteProfile, decision.signature])
  let section = target.querySelector('#lmf-athlete-coach')
  if (section?.dataset.signature === signature) return
  if (!section) { section = document.createElement('section'); section.id = 'lmf-athlete-coach'; section.className = 'lmf-athlete-insights'; target.appendChild(section) }
  const openDetails = [...section.querySelectorAll('details[data-ai-coach-detail][open]')].map(row => row.dataset.aiCoachDetail)
  const focusKey = section.contains(document.activeElement) ? document.activeElement.dataset.aiFeedback : null
  const focusAction = section.contains(document.activeElement) ? ['data-ai-review-current', 'data-ai-clear-current', 'data-ai-coach-topic'].find(key => document.activeElement.hasAttribute(key)) : null
  const latest = exercise?.history.at(-1) ?? current.sessions.at(-1)
  const effort = latest ? `${latest.completedSets} completed sets${latest.averageRpe !== null ? ` · average RPE ${fmt(latest.averageRpe)} from ${latest.rpeSetCount} sets` : ' · no RPE recorded'}` : 'Complete a session to build your first history point.'
  const readinessParts = ['energy', 'sleep_quality', 'soreness', 'stress'].filter(key => typeof readiness?.[key] === 'number' && readiness[key] >= 1 && readiness[key] <= 5).map(key => `${key.replace('_', ' ')} ${readiness[key]}/5`)
  const historyMarkup = `<header><div><span class="lmf-ai-kicker">YOUR TRAINING CONTEXT</span><h3>${esc(data.athlete.display_name || 'Athlete')} · Coach read</h3></div><button type="button" data-ai-refresh aria-label="Refresh Coach history">Refresh</button></header><p>${esc(program ? `${program.program_name || program.program_key} · Week ${program.current_week ?? '—'} · ${String(program.current_day_key ?? '').replace('-', ' ')}` : activePrograms.length > 1 ? 'Multiple active programs need review.' : 'No active program found.')}</p><div class="lmf-ai-metrics">${metric('LAST 30 DAYS', `${current.totals.completedSessions} sessions`, `${current.totals.completedSets} completed sets`)}${metric('LOGGED LIFTING VOLUME', `${fmt(displayLoad(current.totals.externalLoadVolumeKg, unit))} ${unit}-reps`, 'Completed load × reps')}</div><div class="lmf-ai-context"><strong>${esc(exercise ? exercise.exerciseName : 'Latest completed session')}</strong><p>${esc(effort)}</p>${latest ? `<small>${esc(dateLabel(latest.completedAt))}${exercise ? ` · ${exercise.sessionCount} sessions for this exercise in 30 days` : ''}</small>` : ''}${document.getElementById('lmf-coach-exercise-context')?.value && !exercise ? '<small>No unambiguous completed history for the selected exercise in this range.</small>' : ''}</div><div class="lmf-ai-context"><strong>Latest readiness check-in</strong><p>${esc(readinessParts.length ? readinessParts.join(' · ') : 'No scored readiness check-in available.')}</p>${readiness ? `<small>${esc(dateLabel(readiness.recorded_at ?? readiness.created_at))} · recorded context, not a current recovery score</small>` : ''}</div>`
  const guidanceMarkup = `<label class="lmf-ai-select">Review a training situation<select data-ai-coach-topic><option value="recent">Recent effort</option><option value="difficult">A difficult session</option><option value="time">Short on time</option><option value="missed">Missed accessory work</option><option value="specialty">Specialization progress</option></select></label><div class="lmf-ai-source"><strong>${coachTopic === 'recent' ? 'Build the evidence' : 'Training Intelligence · review guidance'}</strong>${coachTopic === 'recent' ? '<p>Compare the same exercise and prescription across sessions. Log effort consistently so one difficult day can be understood in context.</p>' : brief ? `<p>These source rules are conditional. Your saved history alone does not confirm their triggers.</p>${brief.reviewContext.map(rule => `<details><summary>${esc(rule.trigger)}</summary><p>${esc(rule.sourceAction)}</p><small>${esc(rule.boundary)}</small></details>`).join('')}` : '<p>Source guidance is unavailable. Your saved training history remains available above.</p>'}<small>Your active program controls the prescription. No workout changes are applied here.</small>${brief && coachTopic !== 'recent' ? `<details><summary>Source and status</summary><p>Training Intelligence ${esc(brief.source.version)} · reconstructed decision index · candidate rules awaiting application review.</p><small>${esc(brief.reviewContext.map(rule => rule.id).join(' · '))}</small></details>` : ''}</div>`
  section.innerHTML = coachDetail('profile', 'Your profile', profileContext(athleteProfile)) + coachDetail('history', 'Recent workouts', historyMarkup) + coachDetail('evidence', 'Coaching evidence', decision.html + guidanceMarkup)
  section.querySelector('[data-ai-coach-topic]').value = coachTopic
  for (const key of openDetails) { const row = section.querySelector(`[data-ai-coach-detail="${key}"]`); if (row) row.open = true }
  if (focusKey) section.querySelector(`[data-ai-feedback="${focusKey}"]`)?.focus({ preventScroll: true })
  if (focusAction) section.querySelector(`[${focusAction}]`)?.focus({ preventScroll: true })
  section.dataset.signature = signature
}

async function refresh(force = false) {
  const token = ++generation
  const panel = document.querySelector('#lmf-progress-dashboard-v1 [data-pg-panel="strength"]')
  const coach = document.querySelector('#coach-answer')?.closest('.coach-chat')
  if (!panel && !coach) return
  try {
    const snapshot = await history.get({ force })
    if (token !== generation) return
    if (!snapshot) throw new Error('No local athlete history available')
    panel?.querySelector('.lmf-ai-unavailable')?.remove()
    coach?.querySelector('.lmf-ai-unavailable')?.remove()
    if (panel?.isConnected && panel.dataset.pgPanel === 'strength') renderProgress(panel, snapshot)
    if (coach?.isConnected) renderCoach(coach, snapshot)
  } catch (_) {
    if (token !== generation) return
    history.invalidate()
    for (const target of [panel, coach].filter(x => x?.isConnected)) {
      if (target.querySelector('.lmf-ai-unavailable')) continue
      target.querySelector('#lmf-advanced-progress, #lmf-athlete-coach')?.remove()
      const note = document.createElement('p'); note.className = 'lmf-ai-unavailable'; note.textContent = 'Training history is temporarily unavailable. '; const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.aiRefresh = ''; retry.textContent = 'Retry'; note.append(retry); target.append(note)
    }
  }
}
function schedule() { if (!timer) timer = setTimeout(() => { timer = 0; void refresh() }, 120) }
new MutationObserver(records => {
  if (records.some(r => !(r.target instanceof Element) || !r.target.closest('.lmf-athlete-insights, .lmf-ai-unavailable'))) schedule()
}).observe(document.body, { childList: true, subtree: true })
document.addEventListener('change', event => {
  changeCoachDecision(event.target)
  if (event.target.matches('[data-ai-exercise]')) { selectedKey = event.target.value; selectedReps = null }
  if (event.target.matches('[data-ai-reps]')) selectedReps = Number(event.target.value)
  if (event.target.matches('[data-ai-dimension]')) selectedDimension = event.target.value === 'muscles' ? 'muscles' : 'roles'
  if (event.target.matches('[data-ai-coach-topic]')) coachTopic = Object.hasOwn(topics, event.target.value) ? event.target.value : 'recent'
  schedule()
})
document.addEventListener('click', event => {
  if (clickCoachDecision(event.target, () => void refresh(true))) { void refresh(true); return }
  if (event.target.closest('[data-ai-refresh]')) void refresh(true)
})
window.addEventListener('hashchange', () => { resetCoachDecision(); generation++; history.invalidate(); selectedKey = ''; selectedReps = null; coachTopic = 'recent'; schedule() })
window.addEventListener('letmefly:exercise-intelligence-ready', schedule)
window.addEventListener('storage', () => { history.invalidate(); schedule() })
window.addEventListener('lmf:profile-v2-updated', () => { void refresh(true) })
document.addEventListener('visibilitychange', () => { if (!document.hidden) { history.invalidate(); schedule() } })
window.__LMF_ATHLETE_INSIGHTS__ = Object.freeze({ version: 1, refresh: () => refresh(true) })
schedule()
