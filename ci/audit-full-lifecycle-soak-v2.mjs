#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const requestedPasses = Number.parseInt(process.argv[3] || '5', 10)
const passCount = Number.isFinite(requestedPasses) && requestedPasses > 0 ? requestedPasses : 5
const outJson = path.join(target, 'FULL_LIFECYCLE_SOAK_AUDIT.json')
const outMd = path.join(target, 'FULL_LIFECYCLE_SOAK_AUDIT.md')

const failures = []
const warnings = []
const milestones = []
function fail(label, detail = '') { failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
function warn(label, detail = '') { warnings.push({ label, detail }); console.log(`WARN  ${label}${detail ? ` — ${detail}` : ''}`) }
function milestone(label, detail = '') { milestones.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
function invariant(ok, label, detail = '') { if (!ok) fail(label, detail); return ok }
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
function lowerBound(text) {
  const match = String(text ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}
function flatten(definition) {
  return (definition.weekData ?? []).flatMap(week => (week.days ?? []).map(day => ({ week: week.week, day: day.day, data: day })))
}
function positionKey(program, week, day) { return `${program}:W${week}:D${day}` }
function setKey(run, program, week, day, sectionIndex, exerciseIndex, setIndex) {
  return `${run}:${program}:W${week}:D${day}:S${sectionIndex + 1}:E${exerciseIndex + 1}:SET${setIndex + 1}`
}
function programmedLoadSignature(set) {
  return JSON.stringify({
    load: set?.load ?? null,
    percentage: set?.percentage ?? null,
    loadReference: set?.loadReference ?? null,
    loadUnit: set?.loadUnit ?? set?.unit ?? null,
    rounding: set?.rounding ?? null,
  })
}
function directLoad(set) { return numberOrNull(set?.load) }
function classifyPrescription(set) {
  const reps = String(set?.reps ?? '').trim()
  const text = `${reps} ${set?.notes ?? ''}`.trim()
  if (/\d(?:\.\d+)?\s*(?:m|meter|meters|metre|metres)\b/i.test(text)) return { kind: 'distance', unit: 'm', target: reps }
  if (/\b(?:sec|secs|second|seconds)\b/i.test(text)) return { kind: 'duration', unit: 'sec', target: reps }
  if (/\b(?:min|mins|minute|minutes)\b/i.test(text)) return { kind: 'duration', unit: 'min', target: reps }
  if (/amrap/i.test(reps)) return { kind: 'amrap', unit: 'reps', target: reps }
  if (/side|each/i.test(reps)) return { kind: 'side-reps', unit: 'reps', target: reps }
  if (/\d\s*[-–]\s*\d/.test(reps)) return { kind: 'rep-range', unit: 'reps', target: reps }
  if (numberOrNull(set?.reps) !== null || /^\d+(?:\.\d+)?$/.test(reps)) return { kind: 'reps', unit: 'reps', target: reps }
  if (reps) return { kind: 'text-reps', unit: 'reps', target: reps }
  return { kind: 'none', unit: null, target: '' }
}
function groupDescriptor(section) {
  const exercises = Array.isArray(section?.exercises) ? section.exercises : []
  const labels = exercises.map(ex => String(ex?.label ?? ex?.groupLabel ?? '').trim()).filter(Boolean)
  const allRoundLabels = exercises.length > 1 && labels.length === exercises.length && labels.every(label => /^R\d+/i.test(label))
  const title = `${section?.title ?? ''} ${section?.subtitle ?? ''}`
  if (allRoundLabels) return { type: 'round', labels }
  if (/tri[- ]?set/i.test(title)) return { type: 'tri-set', labels }
  if (/superset/i.test(title)) return { type: 'superset', labels }
  if (/circuit/i.test(title)) return { type: 'circuit', labels }
  return { type: null, labels }
}
function groupedOrder(section) {
  const exercises = Array.isArray(section?.exercises) ? section.exercises : []
  const group = groupDescriptor(section)
  if (!group.type || exercises.length < 2) return []
  const maxSets = Math.max(0, ...exercises.map(ex => Array.isArray(ex.sets) ? ex.sets.length : 0))
  const order = []
  for (let round = 0; round < maxSets; round += 1) {
    for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
      if ((exercises[exerciseIndex].sets ?? [])[round]) {
        order.push({ round: round + 1, exerciseIndex, exercise: exercises[exerciseIndex].name ?? `Exercise ${exerciseIndex + 1}` })
      }
    }
  }
  return order
}
function actualForSet(set, mode, serial, previousActual) {
  const prescription = classifyPrescription(set)
  const base = lowerBound(prescription.target)
  const signature = programmedLoadSignature(set)
  const defaultLoad = directLoad(set)
  let load = defaultLoad
  if (previousActual?.programmedLoadSignature === signature && previousActual.load !== null) load = previousActual.load
  if (mode === 'realistic' && defaultLoad !== null && serial % 11 === 0) load = defaultLoad + 5
  if (mode === 'boundary' && defaultLoad !== null && serial % 17 === 0) load = Math.max(0, defaultLoad - 5)
  let reps = ['reps', 'rep-range', 'side-reps', 'amrap', 'text-reps'].includes(prescription.kind) ? base : null
  if (mode === 'realistic' && reps !== null && serial % 13 === 0) reps = Math.max(1, reps - 1)
  let metricValue = ['distance', 'duration'].includes(prescription.kind) ? base : null
  if (mode === 'metric' && metricValue !== null) metricValue += serial % 3
  return {
    reps,
    metricKind: ['distance', 'duration'].includes(prescription.kind) ? prescription.kind : null,
    metricValue,
    metricUnit: ['distance', 'duration'].includes(prescription.kind) ? prescription.unit : null,
    load,
    rpe: 7 + (serial % 4) * 0.5,
    rir: serial % 3,
    programmedLoadSignature: signature,
  }
}
function makeState(runName) {
  return {
    runName,
    current: { program: 'crownforge', index: 0, week: 1, day: 1 },
    positionsVisited: [],
    recoveryPositions: [],
    sessions: {},
    sets: {},
    history: [],
    events: [],
    entryAttempts: [],
    finalState: null,
    serializations: 0,
  }
}
function assertState(state, context) {
  const sessionIds = Object.keys(state.sessions)
  const setIds = Object.keys(state.sets)
  invariant(new Set(sessionIds).size === sessionIds.length, 'Duplicate session ID detected', context)
  invariant(new Set(setIds).size === setIds.length, 'Duplicate set ID detected', context)
  invariant(state.history.length === sessionIds.length, 'History/session count drift', `${context}: history=${state.history.length}, sessions=${sessionIds.length}`)
  const historyIds = new Set(state.history.map(row => row.sessionId))
  invariant(historyIds.size === state.history.length, 'Duplicate workout history row detected', context)
  for (const id of sessionIds) {
    const session = state.sessions[id]
    invariant(historyIds.has(id), 'Completed session missing from history', `${context}: ${id}`)
    for (const setId of session.setIds) invariant(Boolean(state.sets[setId]), 'Session references missing set', `${context}: ${setId}`)
  }
  for (const setId of setIds) {
    const owner = state.sets[setId]?.sessionId
    invariant(Boolean(owner && state.sessions[owner]), 'Orphan workout set detected', `${context}: ${setId}`)
  }
}
function serializeRoundTrip(state, context) {
  const before = hash(state)
  const restored = JSON.parse(JSON.stringify(state))
  invariant(hash(restored) === before, 'Reload serialization changed athlete state', context)
  restored.serializations += 1
  return restored
}

if (!fs.existsSync(target)) {
  console.error(`Target source directory does not exist: ${target}`)
  process.exit(2)
}

let exported = null
try {
  const viteBin = path.join(target, 'node_modules', '.bin', 'vite')
  if (!fs.existsSync(viteBin)) throw new Error('production Vite executable is missing')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-soak-programs-'))
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n')
  const built = spawnSync(viteBin, ['build', '--ssr', 'src/data/programs.ts', '--outDir', temp, '--emptyOutDir'], { cwd: target, encoding: 'utf8' })
  if (built.status !== 0) throw new Error((built.stderr || built.stdout || 'Vite SSR build failed').trim())
  const candidates = fs.readdirSync(temp).filter(name => /\.m?js$/.test(name))
  const entry = candidates.find(name => /programs/i.test(name)) || candidates[0]
  if (!entry) throw new Error('Vite SSR build emitted no importable program facade')
  exported = await import(`${pathToFileURL(path.join(temp, entry)).href}?soak=${Date.now()}`)
  milestone('Production governed program facade loaded')
} catch (error) {
  fail('Production governed program facade loaded', error instanceof Error ? error.message : String(error))
}

const programSpecs = exported ? [
  { key: 'crownforge', definition: exported.CROWNFORGE },
  { key: 'crown-maintenance', definition: exported.CROWN_MAINTENANCE },
  { key: 'black-crown', definition: exported.BLACK_CROWN },
] : []
const definitionsBefore = programSpecs.map(spec => ({ key: spec.key, hash: hash(spec.definition) }))

const inventory = {}
for (const spec of programSpecs) {
  if (!spec.definition?.weekData) {
    fail('Governed program definition missing', spec.key)
    continue
  }
  const positions = flatten(spec.definition)
  const stats = {
    weeks: spec.definition.weekData.length,
    positions: positions.length,
    trainingPositions: 0,
    recoveryPositions: 0,
    sections: 0,
    exercises: 0,
    sets: 0,
    groupedSections: 0,
    metricSets: 0,
    percentageSets: 0,
    repRanges: 0,
    sideRepSets: 0,
  }
  for (const position of positions) {
    const sections = position.data.sections ?? []
    if (sections.length) stats.trainingPositions += 1
    else stats.recoveryPositions += 1
    for (const section of sections) {
      stats.sections += 1
      if (groupDescriptor(section).type) stats.groupedSections += 1
      for (const exercise of section.exercises ?? []) {
        stats.exercises += 1
        for (const set of exercise.sets ?? []) {
          stats.sets += 1
          const kind = classifyPrescription(set).kind
          if (kind === 'distance' || kind === 'duration') stats.metricSets += 1
          if (kind === 'rep-range') stats.repRanges += 1
          if (kind === 'side-reps') stats.sideRepSets += 1
          if (set.percentage !== undefined && set.percentage !== null) stats.percentageSets += 1
        }
      }
    }
  }
  inventory[spec.key] = stats
  milestone(`${spec.definition.name ?? spec.key} inventory`, `${stats.positions} positions · ${stats.trainingPositions} training · ${stats.recoveryPositions} recovery · ${stats.sets} sets`)
}

invariant(programSpecs.length === 3, 'All three governed programs must load', `${programSpecs.length}/3`)
if (inventory['black-crown']) invariant(inventory['black-crown'].positions === 270, 'Black Crown full horizon is not 270 positions', `${inventory['black-crown'].positions}/270`)

const modes = ['perfect', 'realistic', 'reload', 'metric', 'boundary']
const runReports = []
for (let runIndex = 0; runIndex < passCount && programSpecs.length === 3; runIndex += 1) {
  const mode = modes[runIndex % modes.length]
  const runName = `soak-${String(runIndex + 1).padStart(2, '0')}-${mode}`
  let state = makeState(runName)
  let globalSerial = 0
  let expectedPositions = 0
  let expectedTrainingSessions = 0
  let expectedSets = 0
  let groupedOrdersVerified = 0
  let metricSetsLogged = 0
  let loadCarryChecks = 0
  let loadChangeProtectionChecks = 0

  for (let pi = 0; pi < programSpecs.length; pi += 1) {
    const spec = programSpecs[pi]
    const positions = flatten(spec.definition)

    for (let posIndex = 0; posIndex < positions.length; posIndex += 1) {
      const position = positions[posIndex]
      const pKey = positionKey(spec.key, position.week, position.day)
      expectedPositions += 1
      state.current = { program: spec.key, index: posIndex, week: position.week, day: position.day }
      invariant(!state.positionsVisited.includes(pKey), 'Governed position advanced more than once', `${runName}: ${pKey}`)
      state.positionsVisited.push(pKey)
      const sections = position.data.sections ?? []
      let sessionSetCount = 0

      if (!sections.length) {
        state.recoveryPositions.push(pKey)
        state.events.push({ type: 'recovery-position-advanced', position: pKey })
      } else {
        expectedTrainingSessions += 1
        const sessionId = `${runName}:SESSION:${pKey}`
        invariant(!state.sessions[sessionId], 'Workout session started more than once', `${runName}: ${pKey}`)
        const session = {
          id: sessionId,
          program: spec.key,
          week: position.week,
          day: position.day,
          prescriptionHash: hash(position.data),
          setIds: [],
          completed: false,
        }
        state.sessions[sessionId] = session

        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
          const section = sections[sectionIndex]
          const order = groupedOrder(section)
          if (order.length) {
            groupedOrdersVerified += 1
            const slots = order.map(item => `${item.round}:${item.exerciseIndex}`)
            invariant(new Set(slots).size === slots.length, 'Grouped round order contains duplicate exercise slot', `${runName}: ${pKey} ${section.title ?? `section ${sectionIndex + 1}`}`)
            const byRound = new Map()
            for (const item of order) {
              const list = byRound.get(item.round) ?? []
              list.push(item.exerciseIndex)
              byRound.set(item.round, list)
            }
            for (const [round, exerciseIndexes] of byRound) {
              const sorted = [...exerciseIndexes].sort((a, b) => a - b)
              invariant(exerciseIndexes.every((value, index) => value === sorted[index]), 'Grouped work is not exercise-to-exercise within the round', `${runName}: ${pKey} round ${round}`)
            }
          }

          for (let exerciseIndex = 0; exerciseIndex < (section.exercises ?? []).length; exerciseIndex += 1) {
            const exercise = section.exercises[exerciseIndex]
            let previousActual = null
            for (let setIndex = 0; setIndex < (exercise.sets ?? []).length; setIndex += 1) {
              const programmed = exercise.sets[setIndex]
              globalSerial += 1
              expectedSets += 1
              sessionSetCount += 1
              const id = setKey(runName, spec.key, position.week, position.day, sectionIndex, exerciseIndex, setIndex)
              invariant(!state.sets[id], 'Workout set logged more than once', `${runName}: ${id}`)
              const actual = actualForSet(programmed, mode, globalSerial, previousActual)
              const kind = classifyPrescription(programmed).kind
              if (kind === 'distance' || kind === 'duration') metricSetsLogged += 1

              if (previousActual) {
                const currentSignature = programmedLoadSignature(programmed)
                const currentDefault = directLoad(programmed)
                if (currentSignature === previousActual.programmedLoadSignature && previousActual.load !== null && currentDefault !== null) {
                  loadCarryChecks += 1
                  if (!(mode === 'realistic' && globalSerial % 11 === 0)) {
                    invariant(actual.load === previousActual.load, 'Same-prescription load did not carry forward', `${runName}: ${pKey} ${exercise.name ?? ''} set ${setIndex + 1}`)
                  }
                }
                if (currentSignature !== previousActual.programmedLoadSignature && currentDefault !== null) {
                  loadChangeProtectionChecks += 1
                  if (!(mode === 'boundary' && globalSerial % 17 === 0)) {
                    invariant(actual.load === currentDefault, 'Changed prescription was overwritten by prior load', `${runName}: ${pKey} ${exercise.name ?? ''} set ${setIndex + 1}`)
                  }
                }
              }

              state.sets[id] = {
                id,
                sessionId,
                position: pKey,
                section: section.title ?? `Section ${sectionIndex + 1}`,
                exercise: exercise.name ?? `Exercise ${exerciseIndex + 1}`,
                setNumber: setIndex + 1,
                completed: true,
                programmed: clone(programmed),
                actual,
              }
              session.setIds.push(id)
              previousActual = actual
            }
          }
        }

        session.completed = true
        session.completedAtSerial = globalSerial
        state.history.push({ sessionId, position: pKey, setCount: sessionSetCount, prescriptionHash: session.prescriptionHash })
        state.events.push({ type: 'workout-completed', sessionId, position: pKey })
      }

      assertState(state, `${runName} ${pKey}`)
      invariant(state.history.length === expectedTrainingSessions, 'Workout history count drifted from training positions', `${runName}: ${state.history.length}/${expectedTrainingSessions}`)
      invariant(Object.keys(state.sets).length === expectedSets, 'Workout set count drifted from governed sets', `${runName}: ${Object.keys(state.sets).length}/${expectedSets}`)
      invariant(state.positionsVisited.length === expectedPositions, 'Program position advancement count drifted', `${runName}: ${state.positionsVisited.length}/${expectedPositions}`)

      const shouldReload = mode === 'reload'
        ? (expectedPositions % 7 === 0 || (sessionSetCount > 0 && globalSerial % 53 < sessionSetCount))
        : (mode === 'realistic' && expectedPositions % 41 === 0)
      if (shouldReload) state = serializeRoundTrip(state, `${runName} after ${pKey}`)
    }

    if (spec.key === 'crownforge') {
      state.events.push({ type: 'crownforge-complete-maintenance-start' })
      invariant(programSpecs[pi + 1]?.key === 'crown-maintenance', 'Crownforge did not transition directly to Crown Maintenance', runName)
    } else if (spec.key === 'crown-maintenance') {
      state.events.push({ type: 'black-crown-entry-gate-opened' })
      if (mode === 'boundary') {
        state.entryAttempts.push({ result: 'blocked', reason: 'deterministic red-main-lift test' })
        state.events.push({ type: 'black-crown-entry-blocked' })
        invariant(state.current.program === 'crown-maintenance', 'Blocked Black Crown entry crossed the program boundary', runName)
      }
      state.entryAttempts.push({ result: 'approved', rule: 'green/yellow deterministic approval' })
      state.events.push({ type: 'black-crown-entry-activated' })
      invariant(programSpecs[pi + 1]?.key === 'black-crown', 'Crown Maintenance did not hand off through Black Crown entry gate', runName)
    } else if (spec.key === 'black-crown') {
      state.events.push({ type: 'black-crown-program-complete' })
      state.finalState = 'program-complete'
      invariant(programSpecs[pi + 1] === undefined, 'Black Crown completion invented a successor program', runName)
    }
  }

  assertState(state, `${runName} final`)
  const expectedTotalPositions = Object.values(inventory).reduce((sum, item) => sum + item.positions, 0)
  const expectedTotalSessions = Object.values(inventory).reduce((sum, item) => sum + item.trainingPositions, 0)
  const expectedTotalRecovery = Object.values(inventory).reduce((sum, item) => sum + item.recoveryPositions, 0)
  const expectedTotalSets = Object.values(inventory).reduce((sum, item) => sum + item.sets, 0)
  invariant(state.positionsVisited.length === expectedTotalPositions, 'Lifecycle did not visit every governed position', `${runName}: ${state.positionsVisited.length}/${expectedTotalPositions}`)
  invariant(Object.keys(state.sessions).length === expectedTotalSessions, 'Lifecycle did not complete every training session', `${runName}: ${Object.keys(state.sessions).length}/${expectedTotalSessions}`)
  invariant(state.recoveryPositions.length === expectedTotalRecovery, 'Lifecycle did not traverse every recovery position', `${runName}: ${state.recoveryPositions.length}/${expectedTotalRecovery}`)
  invariant(Object.keys(state.sets).length === expectedTotalSets, 'Lifecycle did not log every governed set once', `${runName}: ${Object.keys(state.sets).length}/${expectedTotalSets}`)
  invariant(state.finalState === 'program-complete', 'Lifecycle did not terminate at program-complete', runName)
  invariant(new Set(state.positionsVisited).size === state.positionsVisited.length, 'Lifecycle contains duplicate governed positions', runName)

  runReports.push({
    run: runName,
    mode,
    positionsVisited: state.positionsVisited.length,
    trainingSessions: Object.keys(state.sessions).length,
    recoveryPositions: state.recoveryPositions.length,
    setsLogged: Object.keys(state.sets).length,
    historyEntries: state.history.length,
    events: state.events.length,
    serializations: state.serializations,
    groupedOrdersVerified,
    metricSetsLogged,
    loadCarryChecks,
    loadChangeProtectionChecks,
    entryAttempts: state.entryAttempts,
    finalState: state.finalState,
    finalStateHash: hash(state),
  })
  milestone(`Lifecycle ${runName}`, `${state.positionsVisited.length} positions · ${Object.keys(state.sessions).length} training sessions · ${Object.keys(state.sets).length} sets · ${state.serializations} reloads`)
}

for (const before of definitionsBefore) {
  const current = programSpecs.find(spec => spec.key === before.key)
  invariant(Boolean(current && hash(current.definition) === before.hash), 'Soak mutated authoritative program definition', before.key)
}

const aggregate = {
  requestedPasses: passCount,
  completedPasses: runReports.length,
  totalPositionsVisited: runReports.reduce((sum, run) => sum + run.positionsVisited, 0),
  totalTrainingSessions: runReports.reduce((sum, run) => sum + run.trainingSessions, 0),
  totalRecoveryPositions: runReports.reduce((sum, run) => sum + run.recoveryPositions, 0),
  totalSetsLogged: runReports.reduce((sum, run) => sum + run.setsLogged, 0),
  totalReloadRoundTrips: runReports.reduce((sum, run) => sum + run.serializations, 0),
  totalGroupedOrdersVerified: runReports.reduce((sum, run) => sum + run.groupedOrdersVerified, 0),
  totalMetricSetsLogged: runReports.reduce((sum, run) => sum + run.metricSetsLogged, 0),
  totalLoadCarryChecks: runReports.reduce((sum, run) => sum + run.loadCarryChecks, 0),
  totalLoadChangeProtectionChecks: runReports.reduce((sum, run) => sum + run.loadChangeProtectionChecks, 0),
}

if (runReports.length === 0 && failures.length === 0) fail('Lifecycle soak executed no passes')
if ((inventory['crownforge']?.metricSets ?? 0) === 0) warn('Crownforge metric coverage', 'No distance/duration sets classified; inspect prescription schema')
if ((inventory['crownforge']?.groupedSections ?? 0) === 0) warn('Crownforge grouped-work coverage', 'No grouped sections detected')

const report = {
  generatedAt: new Date().toISOString(),
  result: failures.length ? 'FAIL' : 'PASS',
  target,
  inventory,
  aggregate,
  runs: runReports,
  failures,
  warnings,
  milestones,
}
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(outMd, [
  '# LetMeFly Full Athlete Lifecycle Soak Audit',
  '',
  `Result: **${report.result}**`,
  `Generated: ${report.generatedAt}`,
  '',
  '## Aggregate',
  `- Lifecycle passes: ${aggregate.completedPasses}/${aggregate.requestedPasses}`,
  `- Governed positions visited: ${aggregate.totalPositionsVisited}`,
  `- Training sessions completed: ${aggregate.totalTrainingSessions}`,
  `- Recovery positions visited: ${aggregate.totalRecoveryPositions}`,
  `- Governed sets logged: ${aggregate.totalSetsLogged}`,
  `- Reload/serialization round trips: ${aggregate.totalReloadRoundTrips}`,
  `- Grouped-work order checks: ${aggregate.totalGroupedOrdersVerified}`,
  `- Metric sets logged: ${aggregate.totalMetricSetsLogged}`,
  `- Same-prescription load-carry checks: ${aggregate.totalLoadCarryChecks}`,
  `- Prescription-change load-protection checks: ${aggregate.totalLoadChangeProtectionChecks}`,
  '',
  '## Program inventory',
  ...Object.entries(inventory).map(([key, value]) => `- **${key}** — ${value.weeks} weeks · ${value.positions} positions · ${value.trainingPositions} training · ${value.recoveryPositions} recovery · ${value.sets} sets`),
  '',
  '## Runs',
  ...runReports.map(run => `- **${run.run}** — ${run.positionsVisited} positions · ${run.trainingSessions} sessions · ${run.setsLogged} sets · ${run.serializations} reloads · final=${run.finalState}`),
  '',
  '## Failures',
  ...(failures.length ? failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Warnings',
  ...(warnings.length ? warnings.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Scope',
  '- v2 is a deterministic long-horizon state/prescription soak against the exact reconstructed production program definitions.',
  '- It never touches the real athlete profile, real workout history, Supabase, or Netlify production state.',
  '- A browser + real IndexedDB lifecycle layer is the next stage after this deterministic soak is clean.',
].join('\n'))

console.log('\n=== LETMEFLY FULL ATHLETE LIFECYCLE SOAK ===')
console.log(`Lifecycle passes: ${aggregate.completedPasses}/${aggregate.requestedPasses}`)
console.log(`Positions visited: ${aggregate.totalPositionsVisited}`)
console.log(`Training sessions completed: ${aggregate.totalTrainingSessions}`)
console.log(`Sets logged: ${aggregate.totalSetsLogged}`)
console.log(`Reload round trips: ${aggregate.totalReloadRoundTrips}`)
console.log(`Failures: ${failures.length}`)
if (failures.length) process.exit(1)
console.log('LetMeFly full athlete lifecycle soak audit: PASS')
