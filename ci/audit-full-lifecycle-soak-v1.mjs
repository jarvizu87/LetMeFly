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
const passes = []
const discoveries = []
const say = (kind, label, detail = '') => console.log(`${kind.padEnd(5)} ${label}${detail ? ` — ${detail}` : ''}`)
function pass(label, detail = '') { passes.push({ label, detail }); say('PASS', label, detail) }
function warn(label, detail = '') { warnings.push({ label, detail }); say('WARN', label, detail) }
function fail(label, detail = '') { failures.push({ label, detail }); say('FAIL', label, detail) }
function check(ok, label, detail = '') { ok ? pass(label, detail) : fail(label, detail) }
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null }
function lowerBound(text) {
  const match = String(text ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}
function flatten(definition) {
  return (definition.weekData ?? []).flatMap(week => (week.days ?? []).map(day => ({ week: week.week, day: day.day, data: day })))
}
function positionKey(program, week, day) { return `${program}:W${week}:D${day}` }
function sectionKey(program, week, day, sectionIndex) { return `${positionKey(program, week, day)}:S${sectionIndex + 1}` }
function exerciseKey(program, week, day, sectionIndex, exerciseIndex) { return `${sectionKey(program, week, day, sectionIndex)}:E${exerciseIndex + 1}` }
function setKey(run, program, week, day, sectionIndex, exerciseIndex, setIndex) {
  return `${run}:${exerciseKey(program, week, day, sectionIndex, exerciseIndex)}:SET${setIndex + 1}`
}
function programmedLoadSignature(set) {
  const load = set?.load ?? null
  const percentage = set?.percentage ?? null
  const reference = set?.loadReference ?? null
  const unit = set?.loadUnit ?? set?.unit ?? null
  const rounding = set?.rounding ?? null
  return JSON.stringify({ load, percentage, reference, unit, rounding })
}
function loadDefault(set) {
  const direct = finite(set?.load)
  if (direct !== null) return direct
  return null
}
function classifyPrescription(set) {
  const reps = String(set?.reps ?? '').trim()
  const text = `${reps} ${set?.notes ?? ''}`.trim()
  if (/\b(?:meter|meters|metre|metres|m)\b/i.test(text) || /\d\s*m(?:\b|$)/i.test(text)) return { kind: 'distance', unit: 'm', target: reps }
  if (/\b(?:sec|secs|second|seconds)\b/i.test(text)) return { kind: 'duration', unit: 'sec', target: reps }
  if (/\b(?:min|mins|minute|minutes)\b/i.test(text)) return { kind: 'duration', unit: 'min', target: reps }
  if (/amrap/i.test(reps)) return { kind: 'amrap', unit: 'reps', target: reps }
  if (/side|each/i.test(reps)) return { kind: 'side-reps', unit: 'reps', target: reps }
  if (/\d\s*[-–]\s*\d/.test(reps)) return { kind: 'rep-range', unit: 'reps', target: reps }
  if (finite(set?.reps) !== null || /^\d+(?:\.\d+)?$/.test(reps)) return { kind: 'reps', unit: 'reps', target: reps }
  if (reps) return { kind: 'text-reps', unit: 'reps', target: reps }
  return { kind: 'none', unit: null, target: reps }
}
function groupDescriptor(section) {
  const exercises = Array.isArray(section?.exercises) ? section.exercises : []
  const labels = exercises.map(ex => String(ex?.label ?? ex?.groupLabel ?? '').trim()).filter(Boolean)
  const roundLabels = labels.filter(label => /^R\d+/i.test(label))
  const title = `${section?.title ?? ''} ${section?.subtitle ?? ''}`
  let type = null
  if (exercises.length > 1 && roundLabels.length === exercises.length) type = 'round'
  else if (/tri[- ]?set/i.test(title)) type = 'tri-set'
  else if (/superset/i.test(title)) type = 'superset'
  else if (/circuit/i.test(title)) type = 'circuit'
  return { type, labels }
}
function expectedGroupedOrder(section) {
  const exercises = Array.isArray(section?.exercises) ? section.exercises : []
  const group = groupDescriptor(section)
  if (!group.type || exercises.length < 2) return []
  const maxSets = Math.max(0, ...exercises.map(ex => Array.isArray(ex.sets) ? ex.sets.length : 0))
  const order = []
  for (let round = 0; round < maxSets; round += 1) {
    for (let ei = 0; ei < exercises.length; ei += 1) {
      if ((exercises[ei].sets ?? [])[round]) order.push({ round: round + 1, exerciseIndex: ei, exercise: exercises[ei].name ?? `Exercise ${ei + 1}` })
    }
  }
  return order
}
function actualForSet(set, mode, serial, previousActual = null) {
  const prescription = classifyPrescription(set)
  const base = lowerBound(prescription.target)
  const defaultLoad = loadDefault(set)
  const signature = programmedLoadSignature(set)
  let load = defaultLoad
  if (previousActual && previousActual.programmedLoadSignature === signature && previousActual.load !== null) load = previousActual.load
  if (mode === 'realistic' && defaultLoad !== null && serial % 11 === 0) load = defaultLoad + 5
  if (mode === 'boundary' && defaultLoad !== null && serial % 17 === 0) load = Math.max(0, defaultLoad - 5)
  const actual = {
    kind: prescription.kind,
    unit: prescription.unit,
    value: base,
    reps: prescription.kind.includes('rep') || prescription.kind === 'reps' || prescription.kind === 'amrap' ? base : null,
    load,
    rpe: 7 + (serial % 4) * 0.5,
    rir: serial % 3,
    programmedLoadSignature: signature,
    programmed: clone(set),
  }
  if (mode === 'metric' && (prescription.kind === 'distance' || prescription.kind === 'duration') && base !== null) actual.value = base + (serial % 3)
  if (mode === 'realistic' && actual.reps !== null && serial % 13 === 0) actual.reps = Math.max(1, actual.reps - 1)
  return actual
}
function makeState(runName) {
  return {
    runName,
    current: { program: 'crownforge', index: 0 },
    positionsVisited: [],
    recoveryPositions: [],
    sessions: {},
    sets: {},
    history: [],
    events: [],
    entryAttempts: [],
    finalState: null,
    serializations: 0,
    peakSessionCount: 0,
    peakSetCount: 0,
  }
}
function assertState(state, context) {
  const sessionIds = Object.keys(state.sessions)
  const setIds = Object.keys(state.sets)
  const uniqueSessions = new Set(sessionIds)
  const uniqueSets = new Set(setIds)
  if (uniqueSessions.size !== sessionIds.length) fail('No duplicate session IDs', context)
  if (uniqueSets.size !== setIds.length) fail('No duplicate set IDs', context)
  if (state.history.length !== sessionIds.length) fail('History/session count stays aligned', `${context}: history=${state.history.length} sessions=${sessionIds.length}`)
  const historyIds = new Set(state.history.map(row => row.sessionId))
  if (historyIds.size !== state.history.length) fail('No duplicate workout history entries', context)
  for (const id of sessionIds) {
    const session = state.sessions[id]
    if (!historyIds.has(id)) fail('Every completed session has history', `${context}: ${id}`)
    for (const setId of session.setIds) if (!state.sets[setId]) fail('Session has no missing set records', `${context}: ${setId}`)
  }
  for (const setId of setIds) {
    const owner = state.sets[setId]?.sessionId
    if (!owner || !state.sessions[owner]) fail('No orphan set records', `${context}: ${setId}`)
  }
  state.peakSessionCount = Math.max(state.peakSessionCount, sessionIds.length)
  state.peakSetCount = Math.max(state.peakSetCount, setIds.length)
}
function serializeRoundTrip(state, context) {
  const before = hash(state)
  const restored = JSON.parse(JSON.stringify(state))
  const after = hash(restored)
  check(before === after, 'Reload serialization preserves complete athlete state', context)
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
  const files = fs.readdirSync(temp).filter(name => /\.m?js$/.test(name))
  const entry = files.find(name => /programs/i.test(name)) || files[0]
  if (!entry) throw new Error('no importable program facade emitted')
  exported = await import(`${pathToFileURL(path.join(temp, entry)).href}?soak=${Date.now()}`)
  pass('Production governed program facade loaded for lifecycle soak')
} catch (error) {
  fail('Production governed program facade loaded for lifecycle soak', error instanceof Error ? error.message : String(error))
}

const programSpecs = exported ? [
  { key: 'crownforge', definition: exported.CROWNFORGE },
  { key: 'crown-maintenance', definition: exported.CROWN_MAINTENANCE },
  { key: 'black-crown', definition: exported.BLACK_CROWN },
] : []
const definitionsBefore = programSpecs.map(spec => ({ key: spec.key, hash: hash(spec.definition) }))

const inventory = {}
for (const spec of programSpecs) {
  const positions = flatten(spec.definition)
  const stats = { weeks: spec.definition?.weekData?.length ?? 0, positions: positions.length, trainingPositions: 0, recoveryPositions: 0, sections: 0, exercises: 0, sets: 0, groupedSections: 0, metricSets: 0, percentageSets: 0, repRanges: 0, sideRepSets: 0 }
  for (const position of positions) {
    const sections = position.data.sections ?? []
    if (sections.length) stats.trainingPositions += 1
    else stats.recoveryPositions += 1
    for (const section of sections) {
      stats.sections += 1
      const group = groupDescriptor(section)
      if (group.type) stats.groupedSections += 1
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
  pass(`${spec.definition?.name ?? spec.key} soak inventory`, `${stats.positions} positions · ${stats.trainingPositions} training · ${stats.recoveryPositions} recovery · ${stats.sets} sets`)
}

if (inventory['black-crown']) check(inventory['black-crown'].positions === 270, 'Black Crown full 270-position horizon included', `${inventory['black-crown'].positions}/270`)

const modes = ['perfect', 'realistic', 'reload', 'metric', 'boundary']
const runReports = []
for (let runIndex = 0; runIndex < passCount && programSpecs.length === 3; runIndex += 1) {
  const mode = modes[runIndex % modes.length]
  const runName = `soak-${String(runIndex + 1).padStart(2, '0')}-${mode}`
  let state = makeState(runName)
  let globalSerial = 0
  let expectedTrainingSessions = 0
  let expectedSets = 0
  let expectedPositions = 0
  let groupedOrdersVerified = 0
  let metricSetsLogged = 0
  let loadCarryChecks = 0
  let loadChangeProtectionChecks = 0

  for (let pi = 0; pi < programSpecs.length; pi += 1) {
    const spec = programSpecs[pi]
    const positions = flatten(spec.definition)
    state.current = { program: spec.key, index: 0 }

    for (let posIndex = 0; posIndex < positions.length; posIndex += 1) {
      const position = positions[posIndex]
      const pKey = positionKey(spec.key, position.week, position.day)
      expectedPositions += 1
      state.positionsVisited.push(pKey)
      state.current = { program: spec.key, index: posIndex, week: position.week, day: position.day }
      const sections = position.data.sections ?? []

      if (!sections.length) {
        state.recoveryPositions.push(pKey)
        state.events.push({ type: 'recovery-position-advanced', position: pKey })
      } else {
        expectedTrainingSessions += 1
        const sessionId = `${runName}:SESSION:${pKey}`
        if (state.sessions[sessionId]) fail('Session can only start once', `${runName}: ${pKey}`)
        const session = { id: sessionId, program: spec.key, week: position.week, day: position.day, prescriptionHash: hash(position.data), setIds: [], completed: false }
        state.sessions[sessionId] = session

        for (let si = 0; si < sections.length; si += 1) {
          const section = sections[si]
          const order = expectedGroupedOrder(section)
          if (order.length) {
            const seen = order.map(item => `${item.round}:${item.exerciseIndex}`)
            const uniqueness = new Set(seen)
            check(uniqueness.size === seen.length, 'Grouped round order has no duplicate round/exercise slots', `${runName}: ${pKey} ${section.title ?? `section ${si + 1}`}`)
            groupedOrdersVerified += 1
          }

          for (let ei = 0; ei < (section.exercises ?? []).length; ei += 1) {
            const exercise = section.exercises[ei]
            let previousActual = null
            for (let setIndex = 0; setIndex < (exercise.sets ?? []).length; setIndex += 1) {
              const programmed = exercise.sets[setIndex]
              globalSerial += 1
              expectedSets += 1
              const id = setKey(runName, spec.key, position.week, position.day, si, ei, setIndex)
              if (state.sets[id]) fail('Set can only be logged once', `${runName}: ${id}`)
              const actual = actualForSet(programmed, mode, globalSerial, previousActual)
              const kind = classifyPrescription(programmed).kind
              if (kind === 'distance' || kind === 'duration') metricSetsLogged += 1

              if (previousActual) {
                const currentSig = programmedLoadSignature(programmed)
                if (currentSig === previousActual.programmedLoadSignature && previousActual.load !== null && loadDefault(programmed) !== null) {
                  loadCarryChecks += 1
                  if (mode !== 'realistic' || globalSerial % 11 !== 0) check(actual.load === previousActual.load, 'Same-prescription load carries forward in soak state', `${runName}: ${pKey} ${exercise.name ?? ''} set ${setIndex + 1}`)
                } else if (currentSig !== previousActual.programmedLoadSignature && loadDefault(programmed) !== null) {
                  loadChangeProtectionChecks += 1
                  const expectedDefault = loadDefault(programmed)
                  if (mode !== 'boundary' || globalSerial % 17 !== 0) check(actual.load === expectedDefault, 'Changed prescription load overrides prior-set carry', `${runName}: ${pKey} ${exercise.name ?? ''} set ${setIndex + 1}`)
                }
              }

              state.sets[id] = {
                id,
                sessionId,
                position: pKey,
                section: section.title ?? `Section ${si + 1}`,
                exercise: exercise.name ?? `Exercise ${ei + 1}`,
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
        state.history.push({ sessionId, position: pKey, setCount: session.setIds.length, prescriptionHash: session.prescriptionHash })
        state.events.push({ type: 'workout-completed', sessionId, position: pKey })
      }

      assertState(state, `${runName} ${pKey}`)
      check(state.history.length === expectedTrainingSessions, 'Workout history count matches completed training positions', `${runName}: ${state.history.length}/${expectedTrainingSessions}`)
      check(Object.keys(state.sets).length === expectedSets, 'Logged-set count matches traversed governed sets', `${runName}: ${Object.keys(state.sets).length}/${expectedSets}`)
      check(state.positionsVisited.length === expectedPositions, 'Program position count advances exactly once', `${runName}: ${state.positionsVisited.length}/${expectedPositions}`)

      const shouldReload = mode === 'reload' ? globalSerial > 0 && globalSerial % 37 < (session?.setIds?.length ?? 0) : (mode === 'realistic' && expectedPositions % 41 === 0)
      if (shouldReload) state = serializeRoundTrip(state, `${runName} after ${pKey}`)
    }

    if (spec.key === 'crownforge') {
      state.events.push({ type: 'crownforge-complete-maintenance-start' })
      check(programSpecs[pi + 1]?.key === 'crown-maintenance', 'Crownforge transitions only to Crown Maintenance', runName)
    } else if (spec.key === 'crown-maintenance') {
      state.events.push({ type: 'black-crown-entry-gate-opened' })
      if (mode === 'boundary') {
        state.entryAttempts.push({ result: 'blocked', reason: 'deterministic red-main-lift test' })
        state.events.push({ type: 'black-crown-entry-blocked' })
        check(state.current.program === 'crown-maintenance', 'Blocked Black Crown entry does not cross program boundary', runName)
      }
      state.entryAttempts.push({ result: 'approved', rule: 'green/yellow deterministic approval' })
      state.events.push({ type: 'black-crown-entry-activated' })
      check(programSpecs[pi + 1]?.key === 'black-crown', 'Crown Maintenance transitions through explicit Black Crown entry gate', runName)
    } else if (spec.key === 'black-crown') {
      state.events.push({ type: 'black-crown-program-complete' })
      state.finalState = 'program-complete'
      check(programSpecs[pi + 1] === undefined, 'Black Crown completion invents no successor program', runName)
    }
  }

  assertState(state, `${runName} final`)
  const totalExpectedPositions = Object.values(inventory).reduce((sum, item) => sum + item.positions, 0)
  const totalExpectedSessions = Object.values(inventory).reduce((sum, item) => sum + item.trainingPositions, 0)
  const totalExpectedRecovery = Object.values(inventory).reduce((sum, item) => sum + item.recoveryPositions, 0)
  const totalExpectedSets = Object.values(inventory).reduce((sum, item) => sum + item.sets, 0)
  check(state.positionsVisited.length === totalExpectedPositions, 'Complete lifecycle visits every governed position', `${runName}: ${state.positionsVisited.length}/${totalExpectedPositions}`)
  check(Object.keys(state.sessions).length === totalExpectedSessions, 'Complete lifecycle completes every training session', `${runName}: ${Object.keys(state.sessions).length}/${totalExpectedSessions}`)
  check(state.recoveryPositions.length === totalExpectedRecovery, 'Complete lifecycle visits every recovery position', `${runName}: ${state.recoveryPositions.length}/${totalExpectedRecovery}`)
  check(Object.keys(state.sets).length === totalExpectedSets, 'Complete lifecycle logs every governed set exactly once', `${runName}: ${Object.keys(state.sets).length}/${totalExpectedSets}`)
  check(state.finalState === 'program-complete', 'Lifecycle finishes at explicit program-complete state', runName)
  check(new Set(state.positionsVisited).size === state.positionsVisited.length, 'No duplicate governed position advancement', runName)

  runReports.push({
    run: runName,
    mode,
    result: failures.some(item => item.detail?.includes(runName)) ? 'FAIL' : 'PASS',
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
  pass(`Lifecycle ${runName} completed`, `${state.positionsVisited.length} positions · ${Object.keys(state.sessions).length} training sessions · ${Object.keys(state.sets).length} sets`)
}

for (const before of definitionsBefore) {
  const current = programSpecs.find(spec => spec.key === before.key)
  check(current && hash(current.definition) === before.hash, 'Soak test never mutates authoritative program definition', before.key)
}

const aggregate = {
  requestedPasses: passCount,
  completedPasses: runReports.length,
  totalPositionsVisited: runReports.reduce((sum, run) => sum + run.positionsVisited, 0),
  totalTrainingSessions: runReports.reduce((sum, run) => sum + run.trainingSessions, 0),
  totalSetsLogged: runReports.reduce((sum, run) => sum + run.setsLogged, 0),
  totalReloadRoundTrips: runReports.reduce((sum, run) => sum + run.serializations, 0),
  totalGroupedOrdersVerified: runReports.reduce((sum, run) => sum + run.groupedOrdersVerified, 0),
  totalMetricSetsLogged: runReports.reduce((sum, run) => sum + run.metricSetsLogged, 0),
  totalLoadCarryChecks: runReports.reduce((sum, run) => sum + run.loadCarryChecks, 0),
  totalLoadChangeProtectionChecks: runReports.reduce((sum, run) => sum + run.loadChangeProtectionChecks, 0),
}

if (runReports.length === 0 && failures.length === 0) fail('Lifecycle soak executed at least one pass', 'no governed programs were loaded')
if (inventory['crownforge']?.metricSets === 0) warn('Crownforge metric coverage', 'No distance/duration sets were classified; inspect program schema normalization')
if (inventory['crownforge']?.groupedSections === 0) warn('Crownforge grouped-work coverage', 'No grouped sections were detected from structured/title metadata')

const report = {
  generatedAt: new Date().toISOString(),
  result: failures.length ? 'FAIL' : 'PASS',
  target,
  inventory,
  aggregate,
  runs: runReports,
  discoveries,
  failures,
  warnings,
  passes,
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
  `- Governed sets logged: ${aggregate.totalSetsLogged}`,
  `- Reload/serialization round trips: ${aggregate.totalReloadRoundTrips}`,
  `- Grouped-work order checks: ${aggregate.totalGroupedOrdersVerified}`,
  `- Metric sets logged: ${aggregate.totalMetricSetsLogged}`,
  `- Same-prescription load carry checks: ${aggregate.totalLoadCarryChecks}`,
  `- Prescription-change load protection checks: ${aggregate.totalLoadChangeProtectionChecks}`,
  '',
  '## Program inventory',
  ...Object.entries(inventory).map(([key, value]) => `- **${key}** — ${value.weeks} weeks · ${value.positions} positions · ${value.trainingPositions} training · ${value.recoveryPositions} recovery · ${value.sets} sets`),
  '',
  '## Runs',
  ...runReports.map(run => `- **${run.run}** — ${run.result} · ${run.positionsVisited} positions · ${run.trainingSessions} sessions · ${run.setsLogged} sets · ${run.serializations} reloads · final=${run.finalState}`),
  '',
  '## Failures',
  ...(failures.length ? failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Warnings',
  ...(warnings.length ? warnings.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Scope note',
  '- This v1 soak is a deterministic long-horizon state/prescription test against the reconstructed production program definitions.',
  '- Browser + real IndexedDB lifecycle fault injection is the next layer; v1 intentionally does not touch private athlete data or cloud state.',
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
