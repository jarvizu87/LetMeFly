import { buildCoachBrief } from './athlete-insights.mjs'
import { exerciseTrend } from './progress-detail.mjs'

// A review lasts only in this Coach view. This is a UI freshness limit, not a
// physiological recovery rule or permission to change the current program.
export const FEEDBACK_LIFETIME_MS = 15 * 60 * 1000
export const FEEDBACK_FIELDS = [
  { key: 'pain', label: 'Pain or a medical concern right now', options: [['yes', 'Present'], ['no', 'None reported']] },
  { key: 'equipment', label: 'Equipment for the planned exercise', options: [['unavailable', 'Unavailable; need an alternative'], ['available', 'Available']] },
  { key: 'time', label: 'Time for this session', options: [['compressed', 'Short on time / delayed'], ['enough', 'Enough time']] },
  { key: 'quality', label: 'Power / Olympic technique today', options: [['red', 'RED: technique breaking down'], ['okay', 'Quality is acceptable'], ['not-applicable', 'Not part of this session']] },
  { key: 'grip', label: 'Grip affecting the intended work', options: [['material', 'Material interference'], ['none', 'No material interference']], extra: true },
  { key: 'yoke', label: 'Trap / yoke work affecting pulling', options: [['material', 'Material interference'], ['none', 'No material interference']], extra: true },
  { key: 'recovery', label: 'Effect of the recovery day on the next hard session', options: [['worse', 'Made that session worse'], ['not-worse', 'Did not make it worse']], extra: true },
  { key: 'conditioning', label: 'Conditioning affecting the primary work', options: [['material', 'Material interference'], ['none', 'No material interference']], extra: true },
  { key: 'primarySession', label: 'Your assessment of comparable primary sessions', options: [['one-poor', 'One isolated poor session'], ['two-declines', 'Two comparable declines'], ['neither', 'Neither pattern']], extra: true },
  { key: 'primaryStability', label: 'Your assessment of primary performance', options: [['stable', 'Stable'], ['not-stable', 'Not stable']], extra: true },
  { key: 'specialization', label: 'Your assessment of the specialization target', options: [['up', 'Improving'], ['flat', 'Flat'], ['down', 'Declining'], ['not-applicable', 'Not applicable']], extra: true },
  { key: 'missed', label: 'Lower-priority work missed', options: [['yes', 'Yes'], ['no', 'No']], extra: true },
]
const priorityIds = ['DR-019', 'DR-014', 'DR-004', 'DR-003', 'DR-005', 'DR-006', 'DR-007', 'DR-013', 'DR-010', 'DR-009', 'DR-008', 'DR-002', 'DR-001', 'DR-015']
const stamp = value => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const liveOwned = (row, id) => row && !row.deleted_at && row.athlete_id === id && typeof row.id === 'string' && row.id.trim()
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))

function qualifiedManifest(summary, manifest) {
  buildCoachBrief(summary, { athleteId: summary.athleteId }, manifest)
  if (manifest.source.version !== 'v1.9R5' || manifest.source.factualBase !== 'Stage4I v1.06R4' || manifest.source.expandedMaster !== 'Stage4I v1.10' || manifest.rules.length !== priorityIds.length || priorityIds.some((id, index) => {
    const rule = manifest.rules.find(row => row.id === id)
    return !rule || rule.priority !== index + 1 || rule.state !== 'STANDBY' || ['trigger', 'sourceAction', 'evidenceBasis', 'protectedOutcome', 'boundary'].some(key => typeof rule[key] !== 'string' || !rule[key].trim())
  })) throw new Error('Coach decision source requires a new governance review')
}

/** Identity and current program position bind a review. Ambiguous active rows
 * remain unknown, rather than selecting whichever happens to arrive first. */
export function coachDecisionContext(snapshot, summary, selection = {}) {
  const athleteId = summary?.athleteId
  if (!athleteId || snapshot?.athlete?.id !== athleteId || snapshot.athlete.deleted_at || (snapshot.athlete.athlete_id && snapshot.athlete.athlete_id !== athleteId)) throw new Error('Coach decision athlete identity mismatch')
  const active = (snapshot.programs ?? []).filter(row => liveOwned(row, athleteId) && row.status === 'active')
  const program = active.length === 1 && typeof active[0].program_key === 'string' && active[0].program_key.trim() ? active[0] : null
  const ongoing = (snapshot.sessions ?? []).filter(row => liveOwned(row, athleteId) && row.status === 'in_progress')
  const selectedExerciseId = typeof selection.selectedExerciseId === 'string' ? selection.selectedExerciseId : ''
  const exerciseKey = typeof selection.exerciseKey === 'string' ? selection.exerciseKey : null
  const position = program ? [program.id, program.program_key ?? '', program.current_week ?? null, program.current_day_key ?? null] : null
  const contextKey = JSON.stringify([athleteId, position, active.map(row => row.id).sort(), ongoing.map(row => row.id).sort(), selectedExerciseId, exerciseKey])
  return { athleteId, contextKey, program: program ? structuredClone(program) : null,
    programStatus: active.length > 1 ? 'ambiguous' : program ? 'available' : active.length ? 'incomplete' : 'missing',
    ongoingSessionCount: ongoing.length, selectedExerciseId, exerciseKey,
    selectedExerciseName: typeof selection.selectedExerciseName === 'string' ? selection.selectedExerciseName : '' }
}

export function validateCoachAnswers(input) {
  if (!plain(input)) throw new Error('Explicit current answers are required')
  const result = {}
  for (const [key, value] of Object.entries(input)) {
    const field = FEEDBACK_FIELDS.find(row => row.key === key)
    if (!field || typeof value !== 'string' || (value !== 'unknown' && !field.options.some(([option]) => option === value))) throw new Error('Unknown Coach feedback field or value')
    if (value !== 'unknown') result[key] = value
  }
  return result
}

export function captureCoachFeedback(context, answers, now) {
  if (!context?.athleteId || typeof context.contextKey !== 'string' || stamp(now) === null) throw new Error('Current athlete context and time are required')
  return { athleteId: context.athleteId, contextKey: context.contextKey, capturedAt: now, answers: validateCoachAnswers(answers) }
}

function feedbackState(feedback, context, now) {
  if (!feedback) return { status: 'missing', answers: {} }
  if (!plain(feedback) || feedback.athleteId !== context.athleteId) return { status: 'identity-changed', answers: {} }
  if (feedback.contextKey !== context.contextKey) return { status: 'context-changed', answers: {} }
  const captured = stamp(feedback.capturedAt)
  if (captured === null || captured > now) return { status: 'invalid-time', answers: {} }
  if (now - captured >= FEEDBACK_LIFETIME_MS) return { status: 'expired', answers: {} }
  try { return { status: 'current', answers: validateCoachAnswers(feedback.answers), expiresAt: new Date(captured + FEEDBACK_LIFETIME_MS).toISOString(), capturedAt: feedback.capturedAt } }
  catch (_) { return { status: 'invalid-answers', answers: {} } }
}

function reportedRules(a) {
  const conditions = [
    ['DR-019', a.pain === 'yes', ['pain']], ['DR-014', a.equipment === 'unavailable', ['equipment']],
    ['DR-004', a.time === 'compressed', ['time']], ['DR-003', a.quality === 'red', ['quality']],
    ['DR-005', a.grip === 'material', ['grip']], ['DR-006', a.yoke === 'material', ['yoke']],
    ['DR-007', a.recovery === 'worse', ['recovery']], ['DR-013', a.conditioning === 'material', ['conditioning']],
    ['DR-010', a.specialization === 'up' && a.primaryStability === 'not-stable', ['specialization', 'primaryStability']],
    ['DR-009', a.specialization === 'flat' && a.primaryStability === 'stable', ['specialization', 'primaryStability']],
    ['DR-008', a.specialization === 'up' && a.primaryStability === 'stable', ['specialization', 'primaryStability']],
    ['DR-002', a.primarySession === 'two-declines', ['primarySession']],
    ['DR-001', a.primarySession === 'one-poor', ['primarySession']], ['DR-015', a.missed === 'yes', ['missed']],
  ]
  return conditions.filter(([, applies]) => applies).map(([id, , fields]) => ({ id, fields }))
}

/** Explicit self-report selects source context; it does not promote a source
 * rule or prove a clinical, performance, equipment or program conclusion. */
export function buildCoachDecisionReview(snapshot, summary, { context, feedback = null, now, athleteProfile = null }, manifest) {
  if (stamp(now) === null) throw new Error('Explicit review time required')
  const actualContext = coachDecisionContext(snapshot, summary, context)
  if (actualContext.contextKey !== context?.contextKey || actualContext.athleteId !== context?.athleteId) throw new Error('Coach review context no longer matches')
  context = actualContext
  qualifiedManifest(summary, manifest)
  if (athleteProfile && athleteProfile.athleteId !== summary.athleteId) throw new Error('Coach profile identity mismatch')
  const current = feedbackState(feedback, context, stamp(now))
  const conflictingPrimary = current.answers.primarySession === 'two-declines' && current.answers.primaryStability === 'stable'
  const matched = reportedRules(conflictingPrimary ? { ...current.answers, primaryStability: undefined } : current.answers)
  const brief = buildCoachBrief(summary, { athleteId: summary.athleteId, requestedRuleIds: matched.map(row => row.id), exerciseKey: context.exerciseKey, athleteProfile }, manifest)
  const rules = brief.reviewContext.map(rule => ({ ...rule, reportedFields: matched.find(row => row.id === rule.id).fields,
    triggerBasis: 'current-athlete-report', triggerConfirmed: false, mode: 'source-context-only' }))
  const exercise = summary.exercises.find(row => row.exerciseKey === context.exerciseKey)
  const trend = exercise ? exerciseTrend(summary, exercise.exerciseKey) : null
  const programSessions = context.program ? summary.sessions.filter(row => row.programKey === context.program.program_key) : []
  const programIds = new Set(programSessions.map(row => row.sessionId))
  const programSets = summary.sets.filter(row => programIds.has(row.sessionId))
  const missing = []
  if (context.programStatus !== 'available') missing.push(context.programStatus === 'ambiguous' ? 'More than one active program is saved; the current program needs review.' : context.programStatus === 'incomplete' ? 'The active program record has no program key; its history cannot be matched.' : 'No active program is saved.')
  if (!summary.totals.completedSessions) missing.push('No completed sessions in the last 30 days.')
  if (!summary.totals.rpeSetCount) missing.push('No set effort ratings in this history window.')
  if (context.selectedExerciseId && !exercise) missing.push('No unambiguous saved history for the selected exercise.')
  if (current.status !== 'current') missing.push(current.status === 'expired' ? 'The current check-in expired. Review your answers again.' : 'Current feedback has not been reviewed for this context.')
  if (athleteProfile?.missing.length) missing.push(`${athleteProfile.missing.length} optional coaching details are not saved in Profile.`)
  const a = current.answers
  if (conflictingPrimary) missing.push('Two comparable declines and stable primary performance need clarification. Specialization guidance is withheld until that assessment is consistent.')
  if (['up', 'flat'].includes(a.specialization) && !a.primaryStability) missing.push('Specialization guidance needs your assessment of primary performance stability.')
  if (a.specialization === 'down') missing.push('This recovered decision index has no dedicated rule for a declining specialization target. Review the current program; no rule is invented.')
  if (a.primarySession === 'two-declines') missing.push('Two comparable declines is your report. Logged load alone cannot independently establish two primary performance declines.')
  const unassessed = FEEDBACK_FIELDS.filter(field => !Object.hasOwn(a, field.key)).map(field => field.label)
  return { ...brief, context: structuredClone(context), feedback: current, rules, firstRuleId: rules[0]?.id ?? null,
    evidence: { completedSessions: summary.totals.completedSessions, completedSets: summary.totals.completedSets,
      effortSets: summary.totals.rpeSetCount, activeProgramSessions: context.program ? programSessions.length : null,
      activeProgramSets: context.program ? programSets.length : null, selectedExerciseSessions: exercise?.sessionCount ?? 0,
      sameRepSessions: trend?.points.length ?? 0, sameRepCount: trend?.reps ?? null,
      reportedAnswers: Object.keys(a).length, availableQuestions: FEEDBACK_FIELDS.length },
    missing, unassessed, mutations: [] }
}
