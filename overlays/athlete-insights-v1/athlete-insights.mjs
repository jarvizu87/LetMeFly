// Pure calculations over an explicit athlete snapshot. No persistence or network.
const LB_TO_KG = 0.45359237
const number = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const time = value => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const live = row => row && !row.deleted_at
const validId = value => typeof value === 'string' && value.trim().length > 0
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const sum = values => values.length ? values.reduce((a, b) => a + b, 0) : null

function uniqueOwned(rows, athleteId, diagnostics, label) {
  const index = new Map(), duplicates = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!live(row) || row.athlete_id !== athleteId) continue
    if (!validId(row.id)) { diagnostics.invalidIds++; continue }
    if (index.has(row.id)) duplicates.add(row.id)
    index.set(row.id, row)
  }
  for (const id of duplicates) index.delete(id)
  diagnostics[label] = duplicates.size
  return index
}

function measuredMetric(performance) {
  const value = number(performance.actualMetricValue)
  if (value === null || value < 0) return null
  const unit = String(performance.actualMetricUnit ?? '').trim().toLowerCase()
  if (performance.actualMetricKind === 'distance') {
    const factors = { m: 1, meters: 1, km: 1000, yd: 0.9144, yards: 0.9144, ft: 0.3048, feet: 0.3048, mi: 1609.344 }
    return Object.hasOwn(factors, unit) ? { distanceM: value * factors[unit] } : null
  }
  if (performance.actualMetricKind === 'duration') {
    const factors = { s: 1, sec: 1, seconds: 1, min: 60, minutes: 60, h: 3600 }
    return Object.hasOwn(factors, unit) ? { durationSeconds: value * factors[unit] } : null
  }
  return null
}

function metrics(sets) {
  const volumes = sets.filter(s => s.volumeKg !== null).map(s => s.volumeKg)
  const distances = sets.filter(s => s.distanceM !== null).map(s => s.distanceM)
  const durations = sets.filter(s => s.durationSeconds !== null).map(s => s.durationSeconds)
  const rpes = sets.filter(s => s.rpe !== null).map(s => s.rpe)
  return {
    completedSets: sets.length,
    externalLoadVolumeKg: sum(volumes), volumeSetCount: volumes.length,
    distanceM: sum(distances), distanceSetCount: distances.length,
    durationSeconds: sum(durations), durationSetCount: durations.length,
    averageRpe: rpes.length ? sum(rpes) / rpes.length : null, rpeSetCount: rpes.length,
  }
}

/** Window is [from, until), based on session completion. Identity is explicit. */
export function summarizeAthlete(snapshot, { athleteId, from, until }) {
  if (!validId(athleteId)) throw new Error('An explicit athlete ID is required')
  const start = time(from), end = time(until)
  if (start === null || end === null || start >= end) throw new Error('A valid explicit time window is required')
  snapshot = object(snapshot)
  const diagnostics = { invalidIds: 0, invalidCompletionDates: 0, orphanSets: 0, inconsistentSessionLinks: 0, unavailableVolumeSets: 0, invalidActualMetrics: 0 }
  const allSessions = uniqueOwned(snapshot.sessions, athleteId, diagnostics, 'duplicateSessionIds')
  const exercises = uniqueOwned(snapshot.exercises, athleteId, diagnostics, 'duplicateExerciseIds')
  const sets = uniqueOwned(snapshot.sets, athleteId, diagnostics, 'duplicateSetIds')
  const sessions = new Map([...allSessions].filter(([, row]) => {
    if (row.status !== 'completed') return false
    const completed = time(row.completed_at)
    if (completed === null) { diagnostics.invalidCompletionDates++; return false }
    return completed >= start && completed < end
  }))
  const actuals = []
  for (const row of sets.values()) {
    if (row.completed !== true) continue
    const exercise = exercises.get(row.workout_exercise_id)
    if (!exercise || !allSessions.has(row.workout_session_id)) { diagnostics.orphanSets++; continue }
    if (exercise.workout_session_id !== row.workout_session_id) { diagnostics.inconsistentSessionLinks++; continue }
    if (!sessions.has(row.workout_session_id)) continue
    const savedAt = time(row.completed_at)
    if (savedAt === null || savedAt >= end) { diagnostics.invalidCompletionDates++; continue }
    if (!validId(exercise.exercise_key)) { diagnostics.invalidIds++; continue }
    const performance = object(row.performance_data)
    const kind = performance.actualMetricKind
    const sourceSet = object(exercise.prescription_snapshot).sourceSets?.[Number(row.set_number) - 1]
    const target = [performance.programmedReps, sourceSet?.reps].filter(x => typeof x === 'string').join(' ')
    const metricPrescription = performance.distance != null || performance.duration != null || sourceSet?.distance != null || sourceSet?.duration != null || /\d\s*(?:m|s|h|min|minutes?|seconds?|sec|meters?|yards?|miles?|km|yd|ft|rounds?)\b/i.test(target)
    const isMetric = (kind != null && kind !== 'reps') || metricPrescription
    const measurement = measuredMetric(performance)
    if (isMetric && !measurement) diagnostics.invalidActualMetrics++
    const reps = number(row.reps), load = number(row.load_value)
    const unit = String(row.load_unit ?? '').trim().toLowerCase()
    const loadKg = load !== null && load >= 0 ? (unit === 'kg' ? load : unit === 'lb' ? load * LB_TO_KG : null) : null
    const volumeKg = !isMetric && reps !== null && reps > 0 && Number.isInteger(reps) && loadKg !== null ? reps * loadKg : null
    if (!isMetric && volumeKg === null) diagnostics.unavailableVolumeSets++
    const rpe = number(row.rpe)
    const savedExerciseKey = performance.substitutionPerformedExerciseKey
    if (savedExerciseKey && savedExerciseKey !== exercise.exercise_key) { diagnostics.inconsistentSessionLinks++; continue }
    actuals.push({
      id: row.id, sessionId: row.workout_session_id, exerciseKey: exercise.exercise_key,
      exerciseName: exercise.exercise_name_snapshot ?? exercise.exercise_key,
      prescribedExerciseKey: exercise.substituted_from_exercise_key ?? exercise.exercise_key,
      loadKg, reps: !isMetric && Number.isInteger(reps) && reps > 0 ? reps : null,
      volumeKg, distanceM: measurement?.distanceM ?? null, durationSeconds: measurement?.durationSeconds ?? null,
      rpe: rpe !== null && rpe >= 0 && rpe <= 10 ? rpe : null,
    })
  }
  const bySession = new Map(), byExercise = new Map()
  for (const set of actuals) {
    if (!bySession.has(set.sessionId)) bySession.set(set.sessionId, [])
    if (!byExercise.has(set.exerciseKey)) byExercise.set(set.exerciseKey, [])
    bySession.get(set.sessionId).push(set); byExercise.get(set.exerciseKey).push(set)
  }
  const sessionRows = [...sessions.values()].sort((a, b) => time(a.completed_at) - time(b.completed_at) || a.id.localeCompare(b.id)).map(session => ({
    sessionId: session.id, completedAt: session.completed_at, programKey: session.program_key,
    workoutName: session.workout_name ?? 'Completed workout',
    ...metrics(bySession.get(session.id) ?? []),
  }))
  const exerciseRows = [...byExercise.keys()].sort().map(exerciseKey => {
    const matching = byExercise.get(exerciseKey), workBySession = new Map()
    for (const set of matching) {
      if (!workBySession.has(set.sessionId)) workBySession.set(set.sessionId, [])
      workBySession.get(set.sessionId).push(set)
    }
    const history = sessionRows.filter(s => workBySession.has(s.sessionId)).map(session => {
      const work = workBySession.get(session.sessionId)
      const loads = work.filter(set => set.loadKg !== null).map(set => set.loadKg)
      return { sessionId: session.sessionId, completedAt: session.completedAt, ...metrics(work), topLoadKg: loads.length ? Math.max(...loads) : null }
    })
    return { exerciseKey, exerciseName: matching[0].exerciseName, sessionCount: history.length,
      prescribedExerciseKeys: [...new Set(matching.map(s => s.prescribedExerciseKey))].sort(), ...metrics(matching), history }
  })
  return { schemaVersion: 1, athleteId, window: { from, until }, scope: 'completed-session-actuals',
    totals: { completedSessions: sessions.size, ...metrics(actuals) }, sessions: sessionRows, exercises: exerciseRows, diagnostics }
}

export function compareVolume(current, previous) {
  if (!validId(current?.athleteId) || !validId(previous?.athleteId)) throw new Error('An explicit athlete ID is required')
  if (current.athleteId !== previous.athleteId) throw new Error('Cannot compare different athletes')
  const cw = current.window, pw = previous.window
  if ([cw?.from, cw?.until, pw?.from, pw?.until].some(x => time(x) === null) || time(cw.from) >= time(cw.until) || time(cw.from) !== time(pw.until) || time(cw.until) - time(cw.from) !== time(pw.until) - time(pw.from)) throw new Error('Comparison requires adjacent equal-duration windows')
  const currentSessions = current.sessions.filter(s => s.volumeSetCount > 0).length
  const previousSessions = previous.sessions.filter(s => s.volumeSetCount > 0).length
  const a = current.totals.externalLoadVolumeKg, b = previous.totals.externalLoadVolumeKg
  const enough = currentSessions >= 2 && previousSessions >= 2 && a !== null && b !== null
  return { status: enough ? 'available' : 'insufficient-history', currentSessions, previousSessions,
    deltaKg: enough ? a - b : null, percentChange: enough && b > 0 ? (a - b) / b * 100 : null,
    interpretation: 'Descriptive external-load volume only; exercise mix and session count may differ. Not a strength or recovery diagnosis.' }
}

/** Saved coaching context only. A blank v2 field intentionally overrides legacy data. */
export function readCoachProfile(athlete, athleteId) {
  if (!validId(athleteId) || athlete?.id !== athleteId || !live(athlete)) throw new Error('Coach profile identity mismatch')
  const context = object(athlete.profile_context_v2)
  const fields = [
    ['primaryGoal', 'Primary goal', 'primary_goal'],
    ['strengthGoals', 'Strength goals', 'strength_goals'],
    ['developmentPriorities', 'Development priorities', 'development_priorities'],
    ['trainingExperience', 'Training experience', 'training_experience'],
    ['trainingHistory', 'Training history', 'training_history'],
    ['preferredExercises', 'Preferred exercises / methods', 'preferred_exercises'],
    ['avoidExercises', 'Avoid / dislike', 'avoid_exercises'],
    ['equipment', 'Equipment available', 'equipment'],
    ['coachingNotes', 'Coaching notes', 'coaching_notes'],
  ].map(([key, label, legacy]) => {
    const saved = context[key] ?? athlete[legacy]
    return { key, label, value: typeof saved === 'string' ? saved.trim() : '' }
  })
  return { athleteId, source: 'saved-athlete-profile', fields, savedCount: fields.filter(field => field.value).length,
    missing: fields.filter(field => !field.value).map(({ key, label }) => ({ key, label })) }
}

/** Standby source rules are context for review, never executable instructions. */
export function buildCoachBrief(summary, { athleteId, exerciseKey = null, requestedRuleIds = [], athleteProfile = null }, manifest) {
  if (!validId(athleteId) || summary.athleteId !== athleteId) throw new Error('Coach athlete identity mismatch')
  if (athleteProfile && athleteProfile.athleteId !== athleteId) throw new Error('Coach profile identity mismatch')
  if (manifest?.executionMode !== 'review-only' || manifest.source?.recovery !== 'reconstructed-control-index' || !/^[a-f0-9]{64}$/.test(manifest.source?.sectionSha256 ?? '')) throw new Error('Provenance-qualified review manifest required')
  if (!Array.isArray(requestedRuleIds) || requestedRuleIds.some(id => typeof id !== 'string')) throw new Error('Rule IDs must be explicit')
  const known = new Map(manifest.rules.map(rule => [rule.id, rule]))
  if (known.size !== manifest.rules.length) throw new Error('Duplicate source rule IDs')
  for (const id of requestedRuleIds) if (!known.has(id)) throw new Error(`Unknown source rule: ${id}`)
  const reviewContext = [...new Set(requestedRuleIds)].map(id => known.get(id)).sort((a, b) => a.priority - b.priority)
  if (reviewContext.some(rule => rule.state !== 'STANDBY')) throw new Error('Unexpected rule state requires separate review')
  return {
    athleteId, window: { ...summary.window }, history: { ...summary.totals },
    athleteProfile: structuredClone(athleteProfile),
    selectedExercise: structuredClone(summary.exercises.find(exercise => exercise.exerciseKey === exerciseKey) ?? null),
    diagnostics: { ...summary.diagnostics }, source: { ...manifest.source },
    reviewContext: reviewContext.map(rule => ({ ...rule, triggerConfirmed: false, mode: 'source-context-only' })),
    recommendation: 'No automatic plan change. Review current feedback and comparable history before applying any governed decision.',
    mutations: [],
  }
}
