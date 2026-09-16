#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node --experimental-strip-types ci/audit-progression-shadow-read-adapter-v3.mjs <target-source-dir>')
  process.exit(2)
}

const adapterPath = path.join(target, 'src/services/progression-shadow-read-adapter.ts')
const builderPath = path.join(target, 'src/services/progression-shadow-evidence-builder.ts')
const enginePath = path.join(target, 'src/services/progression-shadow-review-engine.ts')
const mainPath = path.join(target, 'src/main.ts')
for (const p of [adapterPath, builderPath, enginePath, mainPath]) {
  if (!fs.existsSync(p)) {
    console.error(`Missing Stage-3 Shadow prerequisite: ${p}`)
    process.exit(1)
  }
}

const adapterSource = fs.readFileSync(adapterPath, 'utf8')
const builderSource = fs.readFileSync(builderPath, 'utf8')
const mainSource = fs.readFileSync(mainPath, 'utf8')
const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok), detail })
  console.log(`progression shadow v3 ${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`)
}

check('adapter reads exact session-linked readiness id', adapterSource.includes("session?.readiness_id") && adapterSource.includes("getById<LocalDomainRecord>('readinessEntries', readinessId)"))
check('adapter never uses latest readiness', !/latestReadiness/.test(adapterSource + builderSource))
check('adapter reads exercises, sets, and decisions only by exact session',
  adapterSource.includes("'workoutExercises', 'by-session', sessionId")
  && adapterSource.includes("'workoutSets', 'by-session', sessionId")
  && adapterSource.includes("'coachingDecisions', 'by-session', sessionId"))
check('builder uses immutable prescription snapshot source sets', /prescription_snapshot/.test(builderSource) && /sourceSets/.test(builderSource))
check('builder preserves programmed identity across substitutions', /prescribedExerciseKey/.test(builderSource) && /substituted_from_exercise_key/.test(builderSource))
check('builder counts completed set rows rather than reps or load', /row\.completed === true/.test(builderSource) && !/\.reps\b|load_value|loadValue/.test(builderSource))
check('builder requires explicit effective prescription decision type', builderSource.includes("effective_prescription_adjustment"))
check('builder requires active decision status', builderSource.includes("row.status !== 'active'"))
check('builder rejects future decisions', /effectiveMs > completedMs/.test(builderSource))
check('builder keeps strength qualification fail-closed', builderSource.includes('strengthQualifying: false'))

const forbidden = [
  ['write transaction or mutation helper', /putEntityWithOutbox|prepareLocalMutation|openLetMeFlyDb|\.put\s*\(|\.add\s*\(|\.delete\s*\(/],
  ['sync/outbox write', /syncOutbox|makeOutboxEntry|pushPending|syncNow/],
  ['Supabase or network access', /supabase|fetch\s*\(|XMLHttpRequest|WebSocket/],
  ['browser persistent storage write', /localStorage|sessionStorage|indexedDB\.open/],
  ['DOM/UI access', /document\.|window\.|navigator\.|showToast|render\s*\(/],
  ['authoritative progression dependency', /program-progression-service/],
  ['governed program package dependency', /programs\/(?:crownforge|crown-maintenance|black-crown)/],
  ['gamification/Crownstorm dependency', /Crownstorm|crownstorm|\bXP\b|main quest|level-up|streak/i],
]
for (const [label, pattern] of forbidden) check(`Stage-3 source has no ${label}`, !pattern.test(adapterSource + builderSource))

check('main has exactly one Stage-3 completion hook', (mainSource.match(/progressionShadowReviewCompletedWorkout\s*\(/g) ?? []).length === 1)
const completeAt = mainSource.indexOf('await completeWorkout(state.athlete.id, completedSessionId)')
const shadowAt = mainSource.indexOf('await progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)')
const advanceAt = mainSource.indexOf('await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)')
check('Stage-3 hook runs after canonical completion persistence', completeAt >= 0 && shadowAt > completeAt)
check('Stage-3 hook remains before authoritative progression', advanceAt > shadowAt)
check('Stage-3 hook stays fail-open', /try\s*\{[\s\S]*progressionShadowReviewCompletedWorkout[\s\S]*\}\s*catch\s*\{/.test(mainSource))

// Import a temporary audit copy with an explicit .ts dependency specifier so
// Node's built-in type stripping can execute the pure builder without altering
// production TypeScript module specifiers.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-shadow-v3-'))
const tempEngine = path.join(temp, 'progression-shadow-review-engine.ts')
const tempBuilder = path.join(temp, 'progression-shadow-evidence-builder.ts')
fs.copyFileSync(enginePath, tempEngine)
fs.writeFileSync(tempBuilder, builderSource.replace("'./progression-shadow-review-engine'", "'./progression-shadow-review-engine.ts'"))
const { buildProgressionShadowEvidence } = await import(`${pathToFileURL(tempBuilder).href}?audit=${Date.now()}`)

const athleteId = 'athlete-1'
const completedAt = '2026-09-16T12:00:00.000Z'
const baseSession = {
  id: 'session-1', athlete_id: athleteId, readiness_id: 'ready-1', status: 'completed', completed_at: completedAt,
}
const ready = (overrides = {}) => ({
  id: 'ready-1', athlete_id: athleteId, sleep_quality: 5, soreness: 1, stress: 1, energy: 5, ...overrides,
})
const sourceSet = (label) => ({ label })
const exercise = (id, priority, count, overrides = {}) => ({
  id,
  athlete_id: athleteId,
  workout_session_id: 'session-1',
  exercise_key: `source-${id}`,
  order_index: 0,
  prescription_snapshot: {
    prescribedExerciseKey: `source-${id}`,
    prescribedExerciseName: id,
    priority,
    sourceSets: Array.from({ length: count }, (_, i) => sourceSet(`S${i + 1}`)),
  },
  ...overrides,
})
const setsFor = (exerciseId, count, completedCount, extra = []) => [
  ...Array.from({ length: count }, (_, i) => ({
    id: `${exerciseId}-set-${i + 1}`,
    athlete_id: athleteId,
    workout_session_id: 'session-1',
    workout_exercise_id: exerciseId,
    set_number: i + 1,
    completed: i < completedCount,
    reps: 999,
    load_value: 9999,
  })),
  ...extra,
]
const decision = (exerciseId, after, effectiveFrom, overrides = {}) => ({
  id: `${exerciseId}-${effectiveFrom}`,
  athlete_id: athleteId,
  workout_session_id: 'session-1',
  decision_type: 'effective_prescription_adjustment',
  status: 'active',
  effective_from: effectiveFrom,
  before_state: { workout_exercise_id: exerciseId, exercise_key: `source-${exerciseId}` },
  after_state: { workout_exercise_id: exerciseId, exercise_key: `source-${exerciseId}`, ...after },
  ...overrides,
})
const build = ({ session = baseSession, readiness = ready(), exercises = [], sets = [], decisions = [] }) =>
  buildProgressionShadowEvidence({ athleteId, session, readiness, exercises, sets, decisions })

const greenMain = exercise('main', 'mandatory', 3)
const green = build({ exercises: [greenMain], sets: setsFor('main', 3, 3) })
check('real completed Green workout becomes a healthy pilot sample', green.technicalHealthy && green.readiness === 'green' && green.pilotSample?.realWorkout === true)
check('actual units count completed canonical set rows only', green.review?.work[0]?.completedUnits === 3 && green.review?.work[0]?.prescribedUnits === 3)

const linkedYellow = ready({ sleep_quality: 3, soreness: 3, stress: 3, energy: 3 })
const yellowMain = exercise('yellow-main', 'mandatory', 4)
const yellowConditional = exercise('yellow-support', 'conditional', 3)
const yellow = build({
  readiness: linkedYellow,
  exercises: [yellowMain, yellowConditional],
  sets: [...setsFor('yellow-main', 4, 2), ...setsFor('yellow-support', 3, 0)],
  decisions: [
    decision('yellow-main', { effective_prescribed_units: 2 }, '2026-09-16T11:00:00.000Z'),
    decision('yellow-support', { conditional_active: false }, '2026-09-16T11:01:00.000Z'),
  ],
})
check('Yellow explicit mandatory reduction maps to effective target', yellow.review?.work.find((row) => row.id === 'yellow-main')?.effectiveRequiredUnits === 2)
check('Yellow explicit conditional inactive maps cleanly', yellow.review?.work.find((row) => row.id === 'yellow-support')?.effectiveRequiredUnits === 0 && yellow.pilotSample !== null)

const yellowFuture = build({
  readiness: linkedYellow,
  exercises: [yellowMain],
  sets: setsFor('yellow-main', 4, 2),
  decisions: [decision('yellow-main', { effective_prescribed_units: 2 }, '2026-09-16T13:00:00.000Z')],
})
check('future decision is ignored and Yellow gap stays explicit', yellowFuture.review?.decisionGaps.some((gap) => gap.code === 'MANDATORY_EFFECTIVE_TARGET_MISSING') === true && yellowFuture.pilotSample === null)

const latestDecision = build({
  readiness: linkedYellow,
  exercises: [yellowMain],
  sets: setsFor('yellow-main', 4, 2),
  decisions: [
    decision('yellow-main', { effective_prescribed_units: 3 }, '2026-09-16T10:00:00.000Z'),
    decision('yellow-main', { effective_prescribed_units: 2 }, '2026-09-16T11:00:00.000Z'),
  ],
})
check('latest valid decision at or before completion wins', latestDecision.review?.work[0]?.effectiveRequiredUnits === 2)

const ignoredInactive = build({
  readiness: linkedYellow,
  exercises: [yellowMain],
  sets: setsFor('yellow-main', 4, 2),
  decisions: [decision('yellow-main', { effective_prescribed_units: 2 }, '2026-09-16T11:00:00.000Z', { status: 'inactive' })],
})
check('inactive decision cannot satisfy Yellow coverage', ignoredInactive.pilotSample === null && ignoredInactive.review?.decisionGapCount === 1)

const substituted = exercise('sub', 'mandatory', 2, {
  exercise_key: 'approved-alternative',
  substituted_from_exercise_key: 'source-sub',
})
const substitutionResult = build({ exercises: [substituted], sets: setsFor('sub', 2, 2) })
check('performed substitution retains programmed source identity without changing unit count', substitutionResult.technicalHealthy && substitutionResult.review?.work[0]?.prescribedUnits === 2)

const extraSetResult = build({
  exercises: [greenMain],
  sets: setsFor('main', 3, 3, [{
    id: 'main-extra', athlete_id: athleteId, workout_session_id: 'session-1', workout_exercise_id: 'main', set_number: 4, completed: true,
  }]),
})
check('extra logged set stays outside governed completion units', extraSetResult.review?.work[0]?.completedUnits === 3 && extraSetResult.technicalHealthy === true)

const duplicateSetResult = build({
  exercises: [greenMain],
  sets: setsFor('main', 3, 3, [{
    id: 'main-duplicate', athlete_id: athleteId, workout_session_id: 'session-1', workout_exercise_id: 'main', set_number: 2, completed: true,
  }]),
})
check('duplicate canonical set fails technical health closed', duplicateSetResult.technicalHealthy === false && duplicateSetResult.pilotSample === null)

const missingReadiness = build({ readiness: null, exercises: [greenMain], sets: setsFor('main', 3, 3) })
check('missing linked readiness stays UNKNOWN and cannot enter pilot', missingReadiness.readiness === 'unknown' && missingReadiness.pilotSample === null)

const foreignReadiness = build({ readiness: ready({ athlete_id: 'other-athlete' }), exercises: [greenMain], sets: setsFor('main', 3, 3) })
check('foreign linked readiness stays UNKNOWN', foreignReadiness.readiness === 'unknown')

const badSession = build({ session: { ...baseSession, athlete_id: 'other-athlete' }, exercises: [greenMain], sets: setsFor('main', 3, 3) })
check('foreign completed session is rejected before review', badSession.review === null && badSession.technicalHealthy === false)

const optional = exercise('optional', 'optional', 2)
const optionalResult = build({
  readiness: linkedYellow,
  exercises: [optional],
  sets: setsFor('optional', 2, 2),
  decisions: [decision('optional', { effective_prescribed_units: 2, conditional_active: true }, '2026-09-16T11:00:00.000Z')],
})
check('explicit decision cannot promote source-optional work into core adherence', optionalResult.review?.coreRequiredUnits === 0)

const oversized = build({
  readiness: linkedYellow,
  exercises: [yellowMain],
  sets: setsFor('yellow-main', 4, 4),
  decisions: [decision('yellow-main', { effective_prescribed_units: 99 }, '2026-09-16T11:00:00.000Z')],
})
check('oversized imported effective target is capped by Stage-2 governed source', oversized.review?.coreRequiredUnits === 4)

const failed = checks.filter((entry) => !entry.ok)
if (failed.length) {
  console.error(`Progression Shadow Stage-3 adapter audit failed: ${failed.length} check(s)`)
  process.exit(1)
}
console.log(`LetMeFly Progression Shadow Stage-3 read-only adapter audit: PASS (${checks.length} checks)`)
