// Descriptive views of validated actuals. No program changes, forecasts or writes.
const norm = value => typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() : ''
const instant = value => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const sumKnown = values => values.some(value => value !== null) ? values.reduce((n, value) => n + (value ?? 0), 0) : null
const labels = values => [...new Set((Array.isArray(values) ? values : []).filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))]
function ownedUnique(rows, athleteId) {
  const index = new Map(), duplicates = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.deleted_at || row.athlete_id !== athleteId || typeof row.id !== 'string' || !row.id.trim()) continue
    if (index.has(row.id)) duplicates.add(row.id)
    index.set(row.id, row)
  }
  for (const id of duplicates) index.delete(id)
  return index
}
function identity(summary) {
  if (typeof summary?.athleteId !== 'string' || !summary.athleteId.trim() || !Array.isArray(summary.sets)) throw new Error('Validated athlete actuals are required')
}

/** Resolve only exact IDs or unique normalized names/aliases in the loaded catalog. */
export function trainingDistribution(summary, catalog = [], dimension = 'roles') {
  identity(summary)
  if (!['roles', 'muscles'].includes(dimension)) throw new Error('Unknown training distribution')
  const rows = Array.isArray(catalog) ? catalog.filter(row => row && typeof row.id === 'string' && row.id.trim()) : []
  const groups = new Map(), unresolved = []
  let mappedSets = 0
  for (const exercise of summary.exercises) {
    const exact = rows.filter(row => row.id === exercise.exerciseKey)
    const names = new Set([norm(exercise.exerciseKey), norm(exercise.exerciseName)].filter(Boolean))
    const matches = exact.length ? exact : rows.filter(row => [row.id, row.canonicalName, ...(Array.isArray(row.aliases) ? row.aliases : [])].some(value => names.has(norm(value))))
    const match = matches.length === 1 && rows.filter(row => row.id === matches[0].id).length === 1 ? matches[0] : null
    const tags = labels(match?.[dimension === 'roles' ? 'movementRoles' : 'primaryMuscles'])
    if (!tags.length) { unresolved.push({ exerciseKey: exercise.exerciseKey, exerciseName: exercise.exerciseName, completedSets: exercise.completedSets }); continue }
    mappedSets += exercise.completedSets
    for (const label of tags) {
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(exercise)
    }
  }
  return {
    dimension, mappedSets, totalSets: summary.totals.completedSets, unresolved,
    groups: [...groups].map(([label, exercises]) => ({ label,
      completedSets: exercises.reduce((n, row) => n + row.completedSets, 0),
      sessionCount: new Set(exercises.flatMap(row => row.history.map(point => point.sessionId))).size,
      exerciseNames: exercises.map(row => row.exerciseName),
      volumeKg: sumKnown(exercises.map(row => row.externalLoadVolumeKg)),
    })).sort((a, b) => b.completedSets - a.completedSets || a.label.localeCompare(b.label)),
  }
}

/** Top observed load at the same recorded rep count; no estimated max or gain claim. */
export function exerciseTrend(summary, exerciseKey, requestedReps = null) {
  identity(summary)
  const sets = summary.sets.filter(set => set.exerciseKey === exerciseKey && set.volumeKg !== null && set.loadKg !== null && set.reps > 0)
  const frequency = new Map()
  for (const set of sets) frequency.set(set.reps, (frequency.get(set.reps) ?? 0) + 1)
  const repOptions = [...frequency.keys()].sort((a, b) => a - b)
  const defaultReps = [...frequency].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null
  const reps = requestedReps === null ? defaultReps : repOptions.includes(requestedReps) ? requestedReps : null
  const points = summary.sessions.flatMap(session => {
    const matching = sets.filter(set => set.sessionId === session.sessionId && set.reps === reps)
    if (!matching.length) return []
    const loadKg = Math.max(...matching.map(set => set.loadKg)), top = matching.filter(set => set.loadKg === loadKg)
    const effort = top.map(set => set.rpe).filter(value => value !== null)
    return [{ sessionId: session.sessionId, completedAt: session.completedAt, loadKg, setCount: matching.length,
      averageRpe: effort.length ? effort.reduce((a, b) => a + b, 0) / effort.length : null, rpeSetCount: effort.length }]
  })
  return { exerciseKey, reps, repOptions, points }
}

/** Completion of saved prescription slots, never assumed calendar attendance. */
export function sessionCompletion(snapshot, summary, exerciseKey = null) {
  identity(summary)
  const exercises = ownedUnique(snapshot.exercises, summary.athleteId), sets = ownedUnique(snapshot.sets, summary.athleteId)
  const accepted = new Set(summary.sets.map(set => set.id))
  const sessions = summary.sessions.map(session => {
    const work = [...exercises.values()].filter(row => row.workout_session_id === session.sessionId && (!exerciseKey || row.exercise_key === exerciseKey))
    let plannedSets = 0, completedSets = 0, extraSets = 0, available = work.length > 0
    if ((snapshot.exercises ?? []).some(row => row && !row.deleted_at && row.athlete_id === summary.athleteId && row.workout_session_id === session.sessionId && (!exerciseKey || row.exercise_key === exerciseKey) && !exercises.has(row.id))) available = false
    if (!exerciseKey && [...sets.values()].some(row => row.workout_session_id === session.sessionId && !exercises.has(row.workout_exercise_id))) available = false
    for (const exercise of work) {
      const source = exercise.prescription_snapshot?.sourceSets
      if (!Array.isArray(source) || !source.length || !source.every(row => row && typeof row === 'object' && !Array.isArray(row))) { available = false; continue }
      const rows = [...sets.values()].filter(row => row.workout_exercise_id === exercise.id)
      // Broken joins, duplicate slots and missing skeleton rows make the denominator uncertain.
      if (rows.some(row => row.workout_session_id !== session.sessionId || !Number.isInteger(row.set_number) || row.set_number < 1)) available = false
      if (rows.some(row => typeof row.completed !== 'boolean' || (row.completed && !accepted.has(row.id)))) available = false
      for (let slot = 1; slot <= source.length; slot++) {
        const matching = rows.filter(row => row.set_number === slot && row.workout_session_id === session.sessionId)
        if (matching.length !== 1) available = false
        else if (accepted.has(matching[0].id)) completedSets++
      }
      plannedSets += source.length
      extraSets += rows.filter(row => row.set_number > source.length && row.workout_session_id === session.sessionId && accepted.has(row.id)).length
    }
    return { sessionId: session.sessionId, completedAt: session.completedAt, workoutName: session.workoutName,
      status: available ? 'available' : 'unavailable', plannedSets: available ? plannedSets : null,
      completedSets: available ? completedSets : null, extraSets: available ? extraSets : null }
  })
  const covered = sessions.filter(row => row.status === 'available')
  const plannedSets = sumKnown(covered.map(row => row.plannedSets)), completedSets = sumKnown(covered.map(row => row.completedSets))
  return { sessions, coveredSessions: covered.length, unavailableSessions: sessions.length - covered.length, plannedSets, completedSets,
    percent: plannedSets > 0 ? completedSets / plannedSets * 100 : null,
    extraSets: covered.length ? covered.reduce((n, row) => n + row.extraSets, 0) : null }
}

/** Use each session's explicit check-in link; never attach a nearby or later record. */
export function sessionReadiness(snapshot, summary) {
  identity(summary)
  const readiness = ownedUnique(snapshot.readiness, summary.athleteId)
  return summary.sessions.map(session => {
    const row = readiness.get(session.readinessId), recordedAt = instant(row?.recorded_at), startedAt = instant(session.startedAt)
    const valid = recordedAt !== null && startedAt !== null && recordedAt <= startedAt && startedAt <= Date.parse(session.completedAt)
    const scores = Object.fromEntries(['energy', 'sleep_quality', 'soreness', 'stress'].map(key => [key,
      valid && typeof row[key] === 'number' && Number.isInteger(row[key]) && row[key] >= 1 && row[key] <= 5 ? row[key] : null]))
    return { sessionId: session.sessionId, completedAt: session.completedAt, recordedAt: valid ? row.recorded_at : null,
      linked: valid && Object.values(scores).some(value => value !== null), ...scores, averageRpe: session.averageRpe, rpeSetCount: session.rpeSetCount }
  })
}
