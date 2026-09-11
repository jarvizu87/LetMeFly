// Read-only recap of immutable session identity and saved actuals. No estimates or writes.
export const LB_TO_KG = 0.45359237
const num = v => (typeof v === 'number' || typeof v === 'string' && v.trim()) && Number.isFinite(Number(v)) ? Number(v) : null
const time = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const id = v => typeof v === 'string' && v.trim()
const sum = values => values.some(v => v !== null) ? values.reduce((a, b) => a + (b ?? 0), 0) : null
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v

function unique(rows, athleteId) {
  const out = new Map(), conflicts = new Set()
  for (const row of rows ?? []) {
    if (!row || row.deleted_at || row.athlete_id !== athleteId || !id(row.id)) continue
    if (out.has(row.id) && JSON.stringify(stable(out.get(row.id))) !== JSON.stringify(stable(row))) conflicts.add(row.id)
    out.set(row.id, row)
  }
  for (const key of conflicts) out.delete(key)
  return { rows: [...out.values()], conflicts }
}

function actual(set, exercise) {
  const p = obj(set.performance_data), source = obj(exercise.prescription_snapshot?.sourceSets?.[Number(set.set_number) - 1])
  const text = [p.programmedReps, source.reps].filter(x => typeof x === 'string').join(' ')
  const metric = p.actualMetricKind && p.actualMetricKind !== 'reps' || p.distance != null || p.duration != null || source.distance != null || source.duration != null || /\d\s*(?:m|s|h|min|minutes?|seconds?|sec|meters?|yards?|miles?|km|yd|ft|rounds?)\b/i.test(text)
  const load = num(set.load_value), reps = num(set.reps), raw = num(p.actualMetricValue), unit = String(set.load_unit ?? '').toLowerCase()
  const loadKg = load !== null && load >= 0 ? unit === 'kg' ? load : unit === 'lb' ? load * LB_TO_KG : null : null
  const distance = { m: 1, meter: 1, meters: 1, km: 1000, yd: .9144, yards: .9144, ft: .3048, feet: .3048, mi: 1609.344 }
  const duration = { s: 1, sec: 1, seconds: 1, min: 60, minutes: 60, h: 3600, hr: 3600, hours: 3600 }
  const metricUnit = String(p.actualMetricUnit ?? '').toLowerCase()
  const measured = factors => raw !== null && raw >= 0 && Object.hasOwn(factors, metricUnit) ? raw * factors[metricUnit] : null
  // The saved load is counted once. No inference from DB/KB names or /side prose.
  const volumeKg = !metric && loadKg !== null && Number.isInteger(reps) && reps > 0 ? loadKg * reps : null
  const rpe = num(set.rpe), rir = num(set.rir)
  return { volumeKg, loadKg, reps: !metric && Number.isInteger(reps) && reps >= 0 ? reps : null,
    distanceM: p.actualMetricKind === 'distance' ? measured(distance) : null,
    durationSeconds: p.actualMetricKind === 'duration' ? measured(duration) : null,
    metric: Boolean(metric), rpe: rpe !== null && rpe >= 0 && rpe <= 10 ? rpe : null,
    rir: rir !== null && rir >= 0 ? rir : null }
}

export function recapSession(snapshot, { athleteId, sessionId, unit = 'lb', now = new Date().toISOString() }) {
  if (!id(athleteId) || !id(sessionId)) throw new Error('Explicit athlete and session identity required')
  if (!['lb', 'kg'].includes(unit)) throw new Error('Unsupported recap unit')
  const sessions = unique(snapshot.sessions, athleteId), allExercises = unique(snapshot.exercises, athleteId), allSets = unique(snapshot.sets, athleteId)
  const session = sessions.rows.find(row => row.id === sessionId)
  if (!session || !['completed', 'in_progress'].includes(session.status)) throw new Error('Saved session unavailable')
  const warnings = [], start = time(session.started_at), finish = session.status === 'completed' ? time(session.completed_at) : time(now)
  const elapsedSeconds = start !== null && finish !== null && finish >= start ? (finish - start) / 1000 : null
  const exercises = allExercises.rows.filter(e => e.workout_session_id === sessionId).sort((a,b) => Number(a.order_index) - Number(b.order_index) || a.id.localeCompare(b.id)).map(exercise => {
    const prescription = obj(exercise.prescription_snapshot), source = prescription.sourceSets
    const sets = allSets.rows.filter(s => s.workout_session_id === sessionId && s.workout_exercise_id === exercise.id).sort((a,b) => Number(a.set_number) - Number(b.set_number))
    const slots = new Map()
    for (const set of sets) slots.set(set.set_number, (slots.get(set.set_number) ?? 0) + 1)
    const validSource = Array.isArray(source) && source.every(s => s && typeof s === 'object')
    const coverageKnown = validSource && source.every((_, i) => slots.get(i + 1) === 1) && sets.every(s => Number.isInteger(s.set_number) && s.set_number > 0 && slots.get(s.set_number) === 1)
    const rows = sets.map(set => {
      const savedAt = time(set.completed_at)
      const valid = slots.get(set.set_number) === 1 && savedAt !== null && (start === null || savedAt >= start) && (finish === null || savedAt <= finish) && (!set.performance_data?.substitutionPerformedExerciseKey || set.performance_data.substitutionPerformedExerciseKey === exercise.exercise_key)
      const completed = set.completed === true && valid
      const sourceSet = obj(source?.[Number(set.set_number) - 1]), p = obj(set.performance_data)
      const optional = prescription.priority === 'optional' || sourceSet.optional === true
      const skipped = !completed && (set.completion_state === 'skipped' || p.skipped === true || exercise.completion_state === 'skipped')
      return { id: set.id, number: set.set_number, completed, optional, skipped,
        status: completed ? 'Logged' : skipped ? 'Skipped' : optional ? 'Optional · unlogged' : set.completed ? 'Record needs review' : 'Unlogged',
        prescribed: [p.programmedLabel ?? sourceSet.label, p.programmedReps ?? sourceSet.reps, p.programmedLoadText ?? sourceSet.loadText, sourceSet.distance ?? p.distance, sourceSet.duration ?? p.duration].filter(v => v != null && v !== '').map(String),
        ...actual(set, exercise), rawLoad: num(set.load_value), loadUnit: set.load_unit, notes: typeof set.notes === 'string' ? set.notes : '',
        extra: validSource && Number(set.set_number) > source.length }
    })
    const completed = rows.filter(s => s.completed)
    return { id: exercise.id, key: exercise.exercise_key, name: exercise.exercise_name_snapshot ?? exercise.exercise_key,
      group: exercise.group_key, groupType: exercise.group_type, prescription,
      prescribedName: prescription.prescribedExerciseName ?? exercise.exercise_name_snapshot,
      prescribedKey: exercise.substituted_from_exercise_key ?? exercise.exercise_key,
      substituted: Boolean(exercise.substituted_from_exercise_key), priority: prescription.priority ?? 'unspecified', rows,
      completedSets: completed.length, plannedSets: coverageKnown ? source.length : null, coverageKnown,
      volumeKg: sum(completed.map(s => s.volumeKg)), distanceM: sum(completed.map(s => s.distanceM)), durationSeconds: sum(completed.map(s => s.durationSeconds)),
      fullyCompleted: coverageKnown && source.every((_, i) => rows.some(s => s.number === i + 1 && s.completed)) }
  })
  const sets = exercises.flatMap(e => e.rows), completed = sets.filter(s => s.completed)
  if ([sessions, allExercises, allSets].some(x => x.conflicts.size)) warnings.push('Conflicting duplicate records are excluded.')
  if (allSets.rows.some(s => s.workout_session_id === sessionId && !exercises.some(e => e.id === s.workout_exercise_id))) warnings.push('Some saved sets have no matching exercise and are excluded.')
  if (exercises.some(e => !e.coverageKnown)) warnings.push('Some saved prescription slots are missing or ambiguous; a complete planned total is unavailable.')
  const integrityIssues = warnings.length > 0 || sets.some(s => s.status === 'Record needs review')
  const volumeKg = sum(completed.map(s => s.volumeKg)), volume = volumeKg === null ? null : unit === 'kg' ? volumeKg : volumeKg / LB_TO_KG
  const missingVolume = completed.filter(s => !s.metric && s.volumeKg === null).length
  if (missingVolume) warnings.push(`${missingVolume} logged rep sets have no usable load × reps and are excluded from lifting volume.`)
  const totalPlanned = exercises.length && exercises.every(e => e.coverageKnown) ? exercises.reduce((n,e) => n + e.plannedSets,0) : null
  const counts = { completed: completed.length, planned: totalPlanned, exercises: exercises.length,
    completedExercises: exercises.filter(e => e.fullyCompleted).length,
    unlogged: sets.filter(s => !s.completed && !s.skipped && !s.optional).length,
    optionalUnlogged: sets.filter(s => !s.completed && !s.skipped && s.optional).length,
    skipped: sets.filter(s => s.skipped).length, extra: completed.filter(s => s.extra).length,
    volumeSets: completed.filter(s => s.volumeKg !== null).length }
  const encouragement = counts.completed ? { title: 'You put in the work.', body: `${counts.completed} ${counts.completed === 1 ? 'set' : 'sets'} recorded. Give yourself credit for the work you completed today. A lighter or modified session still belongs in your training story.` } : { title: 'Your session is recorded.', body: 'No completed sets are logged. Recovery and an honest record matter; today does not need a bigger number.' }
  return { athleteId, sessionId, session, unit, volumeKg, volume, tonnage: volume === null ? null : volume / (unit === 'lb' ? 2000 : 1000),
    tonnageUnit: unit === 'lb' ? 'US short tons' : 'metric tonnes', elapsedSeconds, exercises, counts, warnings, integrityIssues, encouragement }
}

function comparisonKey(recap) {
  const s = recap.session
  if (![s.program_key,s.program_version,s.phase_key,s.day_key,s.workout_name].every(id)) return null
  if (!recap.exercises.length || recap.exercises.some(e => !e.coverageKnown) || recap.integrityIssues) return null
  // Exact saved program phase, prescription, performed identity and substitution
  // load/equipment context. A different deload, replacement or program is held.
  return JSON.stringify(stable([s.program_key, s.program_version, s.phase_key, s.day_key, s.workout_name,
    recap.exercises.map(e => [e.prescribedKey, e.key, e.group, e.groupType, e.priority,
      e.prescription.sourceSets, e.prescription.category, e.rows.map(r => [r.number, r.completed && r.volumeKg !== null]), e.prescription.substitution ? {
        loadStrategy: e.prescription.substitution.loadStrategy,
        loadingAdjustment: e.prescription.substitution.loadingAdjustment,
        equipment: e.prescription.substitution.equipment,
      } : null])]))
}

export function previousComparable(snapshot, recap) {
  const key = comparisonKey(recap), before = time(recap.session.started_at)
  if (!key || before === null || recap.volume === null) return null
  const candidates = unique(snapshot.sessions, recap.athleteId).rows.filter(s => s.id !== recap.sessionId && s.status === 'completed' && time(s.completed_at) !== null && time(s.completed_at) < before)
    .sort((a,b) => time(b.completed_at) - time(a.completed_at) || a.id.localeCompare(b.id))
  for (const session of candidates) {
    const prior = recapSession(snapshot, { athleteId: recap.athleteId, sessionId: session.id, unit: recap.unit })
    if (prior.volume !== null && comparisonKey(prior) === key) return prior
  }
  return null
}

export function mountainGeometry(current, previous = null) {
  const values = [previous, current].filter(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
  const max = Math.max(1, ...values) * 1.28, baseline = 208, height = 172
  return { baseline, max, height, currentY: current === null ? null : baseline - current / max * height,
    previousY: previous === null ? null : baseline - previous / max * height }
}
