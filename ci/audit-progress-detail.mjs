import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeAthlete } from '../overlays/athlete-insights-v1/athlete-insights.mjs'
import { trainingDistribution, exerciseTrend, sessionCompletion, sessionReadiness } from '../overlays/athlete-insights-v1/progress-detail.mjs'
const options = { athleteId: 'qa', from: '2026-08-01T00:00:00Z', until: '2026-09-01T00:00:00Z' }
const catalog = [{ id: 'bench', canonicalName: 'Bench Press', aliases: ['Barbell bench'], movementRoles: ['Horizontal press', 'Horizontal press', 'Primary strength'], primaryMuscles: ['Chest', 'Triceps'] }]
function fixture() {
  const date = '2026-08-15T12:00:00Z'
  return {
    sessions: [{ id: 's', athlete_id: 'qa', status: 'completed', started_at: date, completed_at: '2026-08-15T13:00:00Z', readiness_id: 'r' }],
    exercises: [{ id: 'e', athlete_id: 'qa', workout_session_id: 's', exercise_key: 'bench', exercise_name_snapshot: 'Bench Press', prescription_snapshot: { sourceSets: [{ reps: 5 }, { reps: 5 }] } }],
    sets: [1, 2].map(n => ({ id: `set${n}`, athlete_id: 'qa', workout_session_id: 's', workout_exercise_id: 'e', set_number: n, completed: n === 1, completed_at: n === 1 ? date : null, reps: 5, load_value: 100, load_unit: 'kg', rpe: 8 })),
    readiness: [{ id: 'r', athlete_id: 'qa', recorded_at: '2026-08-15T11:00:00Z', energy: 3, sleep_quality: 4, soreness: 2, stress: 3 }],
  }
}
const summary = f => summarizeAthlete(f, options)
test('role and muscle views count each set once per tag and disclose overlapping groups', () => {
  const f = fixture(), before = structuredClone(f), s = summary(f)
  const roles = trainingDistribution(s, catalog), muscles = trainingDistribution(s, catalog, 'muscles')
  assert.equal(roles.mappedSets, 1); assert.equal(roles.groups.length, 2)
  assert.ok(roles.groups.every(row => row.completedSets === 1 && row.sessionCount === 1))
  assert.equal(muscles.groups.reduce((n, row) => n + row.completedSets, 0), 2)
  assert.deepEqual(f, before)
})
test('unknown, ambiguous aliases and duplicate catalog IDs stay unmapped', () => {
  const f = fixture(); f.exercises[0].exercise_key = 'legacy-bench'
  assert.equal(trainingDistribution(summary(f), catalog).mappedSets, 1)
  const ambiguous = [...catalog, { ...catalog[0], id: 'another-bench' }]
  assert.equal(trainingDistribution(summary(f), ambiguous).mappedSets, 0)
  f.exercises[0].exercise_key = 'bench'
  assert.equal(trainingDistribution(summary(f), [...catalog, ...catalog]).mappedSets, 0)
  assert.equal(trainingDistribution(summary(f), []).unresolved[0].completedSets, 1)
})
test('substitutions use the performed identity; original role labels are not inherited', () => {
  const f = fixture(); f.exercises[0].exercise_key = 'cable-fly'; f.exercises[0].exercise_name_snapshot = 'Cable Fly'; f.exercises[0].substituted_from_exercise_key = 'bench'
  assert.equal(trainingDistribution(summary(f), catalog).mappedSets, 0)
  const c = [...catalog, { id: 'cable-fly', movementRoles: ['Chest isolation'] }]
  assert.deepEqual(trainingDistribution(summary(f), c).groups.map(row => row.label), ['Chest isolation'])
})
test('load trends compare equal reps, normalize units, omit timed work and show effort sample counts', () => {
  const f = fixture(); f.sets[1] = { ...f.sets[0], id: 'set2', set_number: 2, load_value: 110 / 0.45359237, load_unit: 'lb', rpe: null }
  f.sets.push({ ...f.sets[0], id: 'different-reps', reps: 3, load_value: 150 })
  f.sets.push({ ...f.sets[0], id: 'timed', load_value: 999, performance_data: { actualMetricKind: 'duration', actualMetricValue: 30, actualMetricUnit: 's' } })
  const trend = exerciseTrend(summary(f), 'bench')
  assert.equal(trend.reps, 5); assert.deepEqual(trend.repOptions, [3, 5])
  assert.ok(Math.abs(trend.points[0].loadKg - 110) < 1e-9)
  assert.equal(trend.points[0].setCount, 2); assert.equal(trend.points[0].averageRpe, null)
  assert.equal(exerciseTrend(summary(f), 'bench', 3).points[0].loadKg, 150)
  assert.equal(exerciseTrend(summary(f), 'bench', 10).points.length, 0)
})
test('completion counts saved slots without mistaking an unfinished prescription for performed work', () => {
  const f = fixture(), before = structuredClone(f), result = sessionCompletion(f, summary(f))
  assert.equal(result.completedSets, 1); assert.equal(result.plannedSets, 2); assert.equal(result.percent, 50)
  assert.equal(result.coveredSessions, 1); assert.deepEqual(f, before)
  f.sessions[0].status = 'in_progress'
  assert.equal(sessionCompletion(f, summary(f)).percent, null)
})
test('extra logged sets stay outside the completion numerator and denominator', () => {
  const f = fixture(); f.sets.push({ ...f.sets[0], id: 'extra', set_number: 3 })
  const result = sessionCompletion(f, summary(f))
  assert.equal(result.percent, 50); assert.equal(result.extraSets, 1)
})
test('missing skeleton, duplicate slots, invalid completion dates and incomplete plans cannot show full adherence', () => {
  for (const alter of [
    f => { f.exercises[0].prescription_snapshot = {} },
    f => { f.sets.pop() },
    f => { f.sets.push({ ...f.sets[0], id: 'duplicate-slot' }) },
    f => { f.sets[0].completed_at = 'bad' },
    f => { f.sets[0].completed_at = '2027-01-01T00:00:00Z' },
    f => { f.sets[0].workout_session_id = 'wrong' },
    f => { f.exercises.push({ ...f.exercises[0] }) },
  ]) { const f = fixture(); alter(f); const result = sessionCompletion(f, summary(f)); assert.equal(result.percent, null); assert.equal(result.unavailableSessions, 1) }
})
test('readiness is joined only by owned, unique, non-future session check-in identity', () => {
  const f = fixture(), result = sessionReadiness(f, summary(f))[0]
  assert.equal(result.linked, true); assert.equal(result.energy, 3)
  for (const alter of [
    f => { f.sessions[0].readiness_id = 'unknown' },
    f => { f.readiness[0].athlete_id = 'other' },
    f => { f.readiness[0].deleted_at = options.from },
    f => { f.readiness[0].recorded_at = '2026-08-15T14:00:00Z' },
    f => { f.sessions[0].started_at = null },
    f => { f.readiness.push({ ...f.readiness[0] }) },
  ]) { const x = fixture(); alter(x); assert.equal(sessionReadiness(x, summary(x))[0].linked, false) }
})
test('partial readiness ratings preserve valid fields and expose missing values', () => {
  const f = fixture(); Object.assign(f.readiness[0], { energy: null, stress: 9, sleep_quality: '4' })
  const result = sessionReadiness(f, summary(f))[0]
  assert.equal(result.linked, true); assert.equal(result.energy, null); assert.equal(result.sleep_quality, null); assert.equal(result.stress, null); assert.equal(result.soreness, 2)
})
test('empty history stays unavailable and detail views require an explicit validated identity', () => {
  const f = { sessions: [], exercises: [], sets: [], readiness: [] }, s = summary(f)
  assert.equal(sessionCompletion(f, s).percent, null); assert.deepEqual(sessionReadiness(f, s), [])
  assert.deepEqual(exerciseTrend(s, 'bench').points, [])
  assert.throws(() => trainingDistribution({ ...s, athleteId: '' }, catalog), /Validated/)
})
