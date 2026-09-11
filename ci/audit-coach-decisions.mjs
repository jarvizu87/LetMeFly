import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { summarizeAthlete, readCoachProfile } from '../overlays/athlete-insights-v1/athlete-insights.mjs'
import { FEEDBACK_LIFETIME_MS, FEEDBACK_FIELDS, coachDecisionContext, validateCoachAnswers, captureCoachFeedback, buildCoachDecisionReview } from '../overlays/athlete-insights-v1/coach-decisions.mjs'

const manifest = JSON.parse(fs.readFileSync(new URL('../overlays/athlete-insights-v1/coach-rule-manifest.json', import.meta.url)))
const now = '2026-09-11T12:00:00.000Z'
const options = { athleteId: 'athlete-a', from: '2026-08-12T12:00:00.000Z', until: now }
function fixture() {
  const data = { athlete: { id: 'athlete-a', profile_context_v2: { equipment: 'No rack', coachingNotes: 'Old pain, poor technique and two declines' } },
    programs: [{ id: 'active-program', athlete_id: 'athlete-a', status: 'active', program_key: 'crownforge', current_week: 2, current_day_key: 'day-1' }],
    sessions: [], exercises: [], sets: [], readiness: [{ id: 'old-ready', athlete_id: 'athlete-a', recorded_at: '2026-08-13T12:00:00.000Z', soreness: 5, energy: 1 }] }
  for (let n = 0; n < 3; n++) {
    const date = `2026-09-0${n + 1}T12:00:00.000Z`
    data.sessions.push({ id: `session-${n}`, athlete_id: 'athlete-a', program_key: n === 0 ? 'black-crown' : 'crownforge', status: 'completed', completed_at: date })
    data.exercises.push({ id: `exercise-${n}`, athlete_id: 'athlete-a', workout_session_id: `session-${n}`, exercise_key: 'bench', exercise_name_snapshot: 'Bench' })
    data.sets.push({ id: `set-${n}`, athlete_id: 'athlete-a', workout_session_id: `session-${n}`, workout_exercise_id: `exercise-${n}`, completed: true, completed_at: date, load_value: 100 - n * 10, load_unit: 'kg', reps: 5, rpe: n === 2 ? null : 8 })
  }
  return data
}
function setup(data = fixture(), selection = { selectedExerciseId: 'catalog-bench', selectedExerciseName: 'Bench', exerciseKey: 'bench' }) {
  const summary = summarizeAthlete(data, options), context = coachDecisionContext(data, summary, selection)
  const athleteProfile = readCoachProfile(data.athlete, options.athleteId)
  return { data, summary, context, athleteProfile }
}
function review(f, answers = null, extras = {}) {
  const feedback = answers === null ? null : captureCoachFeedback(f.context, answers, now)
  return buildCoachDecisionReview(f.data, f.summary, { context: f.context, athleteProfile: f.athleteProfile, feedback, now, ...extras }, manifest)
}

test('history, profile phrases, equipment preferences and old readiness cannot supply current triggers', () => {
  const result = review(setup())
  assert.deepEqual(result.rules, []); assert.equal(result.feedback.status, 'missing')
  assert.equal(result.evidence.reportedAnswers, 0); assert.equal(result.unassessed.length, FEEDBACK_FIELDS.length)
  assert.equal(result.firstRuleId, null); assert.deepEqual(result.mutations, [])
})
test('current reports route by source priority with original IDs, status, boundaries and provenance intact', () => {
  const f = setup(), before = structuredClone({ data: f.data, summary: f.summary, manifest })
  const result = review(f, { time: 'compressed', primarySession: 'one-poor', equipment: 'unavailable', pain: 'yes' })
  assert.deepEqual(result.rules.map(row => row.id), ['DR-019', 'DR-014', 'DR-004', 'DR-001'])
  assert.equal(result.firstRuleId, 'DR-019'); assert.equal(result.evidence.reportedAnswers, 4)
  assert.deepEqual(result.source, manifest.source)
  for (const rule of result.rules) {
    const original = manifest.rules.find(row => row.id === rule.id)
    for (const key of Object.keys(original)) assert.deepEqual(rule[key], original[key])
    assert.equal(rule.triggerConfirmed, false); assert.equal(rule.mode, 'source-context-only')
    assert.equal(rule.triggerBasis, 'current-athlete-report')
  }
  result.rules[0].reportedFields.push('edited-copy'); result.context.program.current_week = 100
  assert.deepEqual({ data: f.data, summary: f.summary, manifest }, before)
})
test('every source rule has an explicit report path without inventing IDs', () => {
  const cases = [
    ['DR-019', { pain: 'yes' }], ['DR-014', { equipment: 'unavailable' }], ['DR-004', { time: 'compressed' }],
    ['DR-003', { quality: 'red' }], ['DR-005', { grip: 'material' }], ['DR-006', { yoke: 'material' }],
    ['DR-007', { recovery: 'worse' }], ['DR-013', { conditioning: 'material' }],
    ['DR-010', { specialization: 'up', primaryStability: 'not-stable' }], ['DR-009', { specialization: 'flat', primaryStability: 'stable' }],
    ['DR-008', { specialization: 'up', primaryStability: 'stable' }], ['DR-002', { primarySession: 'two-declines' }],
    ['DR-001', { primarySession: 'one-poor' }], ['DR-015', { missed: 'yes' }],
  ]
  for (const [id, answers] of cases) assert.deepEqual(review(setup(), answers).rules.map(row => row.id), [id])
})
test('specialization requires explicit primary stability; one poor session does not supply it', () => {
  for (const specialization of ['up', 'flat']) {
    const result = review(setup(), { specialization, primarySession: 'one-poor' })
    assert.deepEqual(result.rules.map(row => row.id), ['DR-001'])
    assert.ok(result.missing.some(row => row.includes('performance stability')))
  }
  const result = review(setup(), { specialization: 'down', primaryStability: 'stable' })
  assert.deepEqual(result.rules, []); assert.ok(result.missing.some(row => row.includes('no dedicated rule')))
})
test('conflicting primary reports withhold specialization routing until clarified', () => {
  const result = review(setup(), { primarySession: 'two-declines', primaryStability: 'stable', specialization: 'up' })
  assert.deepEqual(result.rules.map(row => row.id), ['DR-002'])
  assert.ok(result.missing.some(row => row.includes('need clarification')))
})
test('recorded load declines never independently activate either primary-performance rule', () => {
  const result = review(setup(), { pain: 'no', time: 'enough', primarySession: 'neither' })
  assert.deepEqual(result.rules, []); assert.equal(result.evidence.sameRepSessions, 3)
  const reported = review(setup(), { primarySession: 'two-declines' })
  assert.equal(reported.rules[0].triggerConfirmed, false)
  assert.ok(reported.missing.some(row => row.includes('your report')))
})
test('a review expires at the exact freshness boundary and future timestamps fail closed', () => {
  const f = setup(), feedback = captureCoachFeedback(f.context, { pain: 'yes' }, now)
  const later = ms => new Date(Date.parse(now) + ms).toISOString()
  assert.equal(review(f, null, { feedback, now: later(FEEDBACK_LIFETIME_MS - 1) }).rules.length, 1)
  const expired = review(f, null, { feedback, now: later(FEEDBACK_LIFETIME_MS) })
  assert.equal(expired.feedback.status, 'expired'); assert.deepEqual(expired.rules, [])
  for (const capturedAt of ['bad', later(1)]) {
    const result = review(f, null, { feedback: { ...feedback, capturedAt } })
    assert.equal(result.feedback.status, 'invalid-time'); assert.deepEqual(result.rules, [])
  }
})
test('feedback is rejected when athlete identity changes', () => {
  const f = setup(), feedback = captureCoachFeedback(f.context, { equipment: 'unavailable' }, now)
  feedback.athleteId = 'foreign'
  const result = review(f, null, { feedback })
  assert.equal(result.feedback.status, 'identity-changed'); assert.deepEqual(result.rules, [])
  assert.throws(() => coachDecisionContext({ ...f.data, athlete: { id: 'foreign' } }, f.summary), /identity/)
  assert.throws(() => coachDecisionContext({ ...f.data, athlete: { ...f.data.athlete, athlete_id: 'foreign' } }, f.summary), /identity/)
  assert.throws(() => review(f, null, { athleteProfile: { athleteId: 'foreign' } }), /identity/)
})
test('program identity, position, selected exercise and ongoing session changes invalidate reports', () => {
  for (const change of [data => { data.programs[0].id = 'new-run' }, data => { data.programs[0].current_week++ }, data => { data.programs[0].current_day_key = 'day-2' }, data => { data.programs[0].program_key = 'black-crown' }, data => { data.sessions.push({ id: 'new-session', athlete_id: 'athlete-a', status: 'in_progress' }) }]) {
    const f = setup(), feedback = captureCoachFeedback(f.context, { pain: 'yes' }, now)
    change(f.data); f.context = coachDecisionContext(f.data, f.summary, f.context)
    const result = review(f, null, { feedback })
    assert.equal(result.feedback.status, 'context-changed'); assert.deepEqual(result.rules, [])
  }
  const f = setup(), feedback = captureCoachFeedback(f.context, { pain: 'yes' }, now)
  f.context = coachDecisionContext(f.data, f.summary, { selectedExerciseId: 'squat', exerciseKey: null })
  assert.equal(review(f, null, { feedback }).feedback.status, 'context-changed')
})
test('stale supplied context is rejected against the current snapshot', () => {
  const f = setup(); f.data.programs[0].current_week++
  assert.throws(() => review(f, { quality: 'red' }), /no longer matches/)
})
test('active program identity excludes foreign and deleted records and marks ambiguity', () => {
  const data = fixture()
  data.programs.push({ ...data.programs[0], id: 'foreign', athlete_id: 'another' }, { ...data.programs[0], id: 'deleted', deleted_at: now })
  const f = setup(data); assert.equal(f.context.program.id, 'active-program')
  data.programs.push({ ...data.programs[0], id: 'duplicate-active' })
  const ambiguous = setup(data), result = review(ambiguous, { time: 'compressed' })
  assert.equal(ambiguous.context.programStatus, 'ambiguous'); assert.equal(result.evidence.activeProgramSessions, null)
  assert.ok(result.missing.some(row => row.includes('More than one active program')))
  assert.deepEqual(result.mutations, [])
})
test('counts distinguish all history, same program key, effort and equal-rep exercise samples', () => {
  const result = review(setup())
  assert.deepEqual(result.evidence, { completedSessions: 3, completedSets: 3, effortSets: 2, activeProgramSessions: 2, activeProgramSets: 2, selectedExerciseSessions: 3, sameRepSessions: 3, sameRepCount: 5, reportedAnswers: 0, availableQuestions: 12 })
  const f = setup(fixture(), { selectedExerciseId: 'unlogged', exerciseKey: null })
  const missing = review(f); assert.equal(missing.evidence.selectedExerciseSessions, 0)
  assert.ok(missing.missing.some(row => row.includes('unambiguous saved history')))
})
test('missing program keys cannot manufacture an active-program history match', () => {
  const data = fixture(); delete data.programs[0].program_key
  for (const session of data.sessions) delete session.program_key
  const f = setup(data), result = review(f)
  assert.equal(f.context.programStatus, 'incomplete')
  assert.equal(result.evidence.activeProgramSessions, null)
  assert.ok(result.missing.some(row => row.includes('no program key')))
})
test('missing data stays explicit without suppressing an explicit safety report', () => {
  const data = fixture(); data.programs = []; data.sessions = []; data.exercises = []; data.sets = []
  const result = review(setup(data), { pain: 'yes' })
  assert.equal(result.firstRuleId, 'DR-019'); assert.equal(result.evidence.activeProgramSessions, null)
  assert.equal(result.evidence.completedSessions, 0); assert.ok(result.missing.length >= 4)
})
test('unknown answers are omitted and malformed or invented input cannot activate guidance', () => {
  assert.deepEqual(validateCoachAnswers({ pain: 'unknown' }), {})
  for (const value of [null, [], 'pain', { pain: true }, { pain: 'old' }, { arbitrary: 'yes' }, JSON.parse('{"__proto__":"yes"}')]) assert.throws(() => validateCoachAnswers(value))
  const f = setup(), feedback = captureCoachFeedback(f.context, { pain: 'yes' }, now)
  const invalid = review(f, null, { feedback: { ...feedback, answers: { pain: 'yes', rule: 'DR-019' } } })
  assert.deepEqual(invalid.rules, []); assert.equal(invalid.feedback.status, 'invalid-answers')
})
test('modified source IDs, priorities, states or provenance require review rather than promotion', () => {
  const f = setup()
  for (const change of [m => { m.rules[0].id = 'DR-999' }, m => { m.rules[0].priority = 2 }, m => { m.rules[0].state = 'AUTHORIZED' }, m => { m.rules.pop() }, m => { m.source.version = 'new-source' }, m => { m.source.expandedMaster = 'unknown' }, m => { m.source.sectionSha256 = 'not-a-hash' }, m => { m.executionMode = 'automatic' }]) {
    const altered = structuredClone(manifest); change(altered)
    assert.throws(() => buildCoachDecisionReview(f.data, f.summary, { context: f.context, now }, altered))
  }
})
