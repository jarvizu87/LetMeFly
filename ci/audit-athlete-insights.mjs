import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { summarizeAthlete, compareVolume, buildCoachBrief } from '../overlays/athlete-insights-v1/athlete-insights.mjs'
import { historyWindows } from '../overlays/athlete-insights-v1/private-history.mjs'

const manifest = JSON.parse(fs.readFileSync(new URL('../overlays/athlete-insights-v1/coach-rule-manifest.json', import.meta.url)))
const opts = { athleteId: 'jp', from: '2026-08-01T00:00:00Z', until: '2026-09-01T00:00:00Z' }
function fixture() {
  const date = '2026-08-15T12:00:00Z'
  return { sessions: [{ id: 'session', athlete_id: 'jp', completed_at: date, status: 'completed' }], exercises: [{ id: 'exercise', athlete_id: 'jp', workout_session_id: 'session', exercise_key: 'bench', exercise_name_snapshot: 'Bench' }], sets: [{ id: 'set', athlete_id: 'jp', workout_session_id: 'session', workout_exercise_id: 'exercise', completed: true, completed_at: date, load_value: 100, load_unit: 'kg', reps: 5, rpe: 8 }] }
}
const total = f => summarizeAthlete(f, opts).totals
test('actual external volume and RPE, with no mutation of source rows', () => {
  const f = fixture(), before = structuredClone(f)
  assert.equal(total(f).externalLoadVolumeKg, 500); assert.equal(total(f).averageRpe, 8)
  assert.deepEqual(f, before)
})
test('mixed units normalize before aggregation', () => {
  const f = fixture(); f.sets.push({ ...f.sets[0], id: 'lb', load_value: 100 / 0.45359237, load_unit: 'lb' })
  assert.ok(Math.abs(total(f).externalLoadVolumeKg - 1000) < 1e-9)
})
test('missing, blank and invalid load values never become zero', () => {
  for (const load of [null, undefined, '', ' ', NaN, Infinity, -1, true]) {
    const f = fixture(); f.sets[0].load_value = load; assert.equal(total(f).externalLoadVolumeKg, null)
  }
  const f = fixture(); f.sets[0].load_value = 0; assert.equal(total(f).externalLoadVolumeKg, 0)
})
test('missing and out-of-range effort remain unknown', () => {
  for (const rpe of [null, '', undefined, -1, 11]) { const f = fixture(); f.sets[0].rpe = rpe; assert.equal(total(f).averageRpe, null) }
})
test('incomplete sessions and sets do not count', () => {
  const f = fixture(); f.sessions[0].status = 'in_progress'; assert.equal(total(f).completedSets, 0)
  f.sessions[0].status = 'completed'; f.sets[0].completed = false; assert.equal(total(f).completedSets, 0)
})
test('foreign athletes, deleted rows, orphans and inconsistent links are excluded', () => {
  for (const table of ['sessions', 'exercises', 'sets']) {
    const f = fixture(); f[table][0].athlete_id = 'other'; assert.equal(total(f).completedSets, 0)
    const deleted = fixture(); deleted[table][0].deleted_at = opts.from; assert.equal(total(deleted).completedSets, 0)
  }
  const f = fixture(); f.exercises[0].workout_session_id = 'another'; assert.equal(total(f).completedSets, 0)
})
test('duplicate IDs are quarantined instead of double-counted', () => {
  for (const table of ['sessions', 'exercises', 'sets']) { const f = fixture(); f[table].push({ ...f[table][0] }); assert.equal(total(f).completedSets, 0) }
})
test('completed-session window is start-inclusive and end-exclusive', () => {
  const f = fixture(); f.sessions[0].completed_at = opts.from; f.sets[0].completed_at = opts.from; assert.equal(total(f).completedSets, 1)
  f.sessions[0].completed_at = opts.until; assert.equal(total(f).completedSets, 0)
  f.sessions[0].completed_at = 'invalid'; assert.equal(total(f).completedSets, 0)
})
test('set completed before the window still belongs to its completed session', () => {
  const f = fixture(); f.sets[0].completed_at = '2026-07-31T23:59:00Z'; assert.equal(total(f).completedSets, 1)
})
test('distance and timed targets never manufacture achieved volume or metrics', () => {
  for (const target of ['20m', '30 s', '10 min', '5 rounds']) {
    const f = fixture(); f.sets[0].performance_data = { programmedReps: target }
    assert.equal(total(f).externalLoadVolumeKg, null); assert.equal(total(f).distanceM, null); assert.equal(total(f).durationSeconds, null)
  }
  const f = fixture(); f.sets[0].set_number = 1; f.exercises[0].prescription_snapshot = { sourceSets: [{ distance: '20 m' }] }; assert.equal(total(f).externalLoadVolumeKg, null)
})
test('actual achieved distance and duration use explicit units', () => {
  const f = fixture(); f.sets[0].performance_data = { actualMetricKind: 'distance', actualMetricValue: 10, actualMetricUnit: 'yd' }
  assert.equal(total(f).externalLoadVolumeKg, null); assert.equal(total(f).distanceM, 9.144)
  f.sets[0].performance_data = { actualMetricKind: 'duration', actualMetricValue: 2, actualMetricUnit: 'min' }
  assert.equal(total(f).durationSeconds, 120)
})
test('side targets and paired implements do not multiply actual recorded load or reps', () => {
  const f = fixture(); f.sets[0].performance_data = { programmedReps: '5/side', notes: 'two dumbbells' }; assert.equal(total(f).externalLoadVolumeKg, 500)
})
test('performed substitution has its own history with prescribed origin retained', () => {
  const f = fixture(); f.exercises[0].exercise_key = 'dumbbell-bench'; f.exercises[0].substituted_from_exercise_key = 'bench'
  f.sets[0].performance_data = { substitutionPerformedExerciseKey: 'dumbbell-bench' }
  const result = summarizeAthlete(f, opts)
  assert.equal(result.exercises[0].exerciseKey, 'dumbbell-bench'); assert.deepEqual(result.exercises[0].prescribedExerciseKeys, ['bench'])
  f.sets[0].performance_data.substitutionPerformedExerciseKey = 'other'; assert.equal(total(f).completedSets, 0)
})
test('chronological ordering uses instants, including timezone offsets', () => {
  const f = fixture(); f.sessions[0].completed_at = '2026-08-15T12:00:00+03:00'
  f.sessions.push({ ...f.sessions[0], id: 'later', completed_at: '2026-08-15T10:00:00Z' })
  assert.deepEqual(summarizeAthlete(f, opts).sessions.map(s => s.sessionId), ['session', 'later'])
})
test('comparison requires enough evidence, matching athletes and equal adjacent periods', () => {
  const current = summarizeAthlete(fixture(), opts)
  const previous = structuredClone(current); previous.window = { from: '2026-07-01T00:00:00Z', until: opts.from }
  assert.equal(compareVolume(current, previous).status, 'insufficient-history')
  current.sessions.push({ ...current.sessions[0], sessionId: 'second' }); previous.sessions.push({ ...previous.sessions[0], sessionId: 'second' })
  previous.totals.externalLoadVolumeKg = 250; assert.equal(compareVolume(current, previous).percentChange, 100)
  previous.totals.externalLoadVolumeKg = 0; assert.equal(compareVolume(current, previous).percentChange, null)
  previous.athleteId = 'foreign'; assert.throws(() => compareVolume(current, previous), /different athletes/)
  previous.athleteId = 'jp'; previous.window.from = 'bad'; assert.throws(() => compareVolume(current, previous), /equal-duration/)
})
test('rolling windows have equal elapsed duration across DST', () => {
  const { current, previous } = historyWindows('7d', new Date('2026-03-10T12:00:00-04:00'))
  assert.equal(Date.parse(current.until) - Date.parse(current.from), 7 * 86400000)
  assert.equal(Date.parse(previous.until) - Date.parse(previous.from), 7 * 86400000)
  assert.equal(historyWindows('all').previous, null)
})
test('Coach rules are explicit, ordered, review-only, and cannot modify history', () => {
  const summary = summarizeAthlete(fixture(), opts)
  const brief = buildCoachBrief(summary, { athleteId: 'jp', exerciseKey: 'bench', requestedRuleIds: ['DR-001', 'DR-004'] }, manifest)
  assert.deepEqual(brief.reviewContext.map(r => r.id), ['DR-004', 'DR-001']); assert.deepEqual(brief.mutations, [])
  assert.ok(brief.reviewContext.every(r => r.triggerConfirmed === false))
  brief.selectedExercise.history[0].completedSets = 999; assert.equal(summary.exercises[0].history[0].completedSets, 1)
  assert.throws(() => buildCoachBrief(summary, { athleteId: 'other' }, manifest), /identity/)
  assert.throws(() => buildCoachBrief(summary, { athleteId: 'jp', requestedRuleIds: ['invented'] }, manifest), /Unknown/)
  assert.throws(() => buildCoachBrief(summary, { athleteId: 'jp' }, { ...manifest, executionMode: 'automatic' }), /review manifest/)
})
