#!/usr/bin/env node
import fs from 'node:fs'

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const seven = readJson('ci/seven-athlete-release-audit.v2.json')
const chaos = readJson('ci/chaos-resilience-audit.v1.json')
const sevenResults = readJson('ci/seven-athlete-release-audit-results.template.json')
const chaosResults = readJson('ci/chaos-resilience-audit-results.template.json')

const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }

const expectedAthletes = [
  ['qa_rook', 'Pevra Soll'],
  ['qa_forge', 'Dain Varr'],
  ['qa_titan', 'Raizen'],
  ['qa_metric', 'Corra Bellan'],
  ['qa_recovery', 'Mara Venn'],
  ['qa_substitution', 'Rurik Hale'],
  ['qa_history', 'Hadrin Oss'],
]

assert(seven.schemaVersion === 2, 'seven-athlete fixture schemaVersion must be 2')
assert(seven.fixtureId === 'letmefly-seven-athlete-release-gate', 'seven-athlete fixtureId mismatch')
assert(seven.fixtureVersion === '2.0.0', 'seven-athlete fixtureVersion mismatch')
assert(seven.status === 'locked', 'seven-athlete fixture must be locked')
assert(seven.dataBoundary?.syntheticOnly === true, 'QA data must be synthetic-only')
assert(seven.dataBoundary?.mayOverwriteRealAthlete === false, 'QA data must never overwrite real athlete data')
assert(seven.globalRules?.programSourceMutationAllowed === false, 'program source mutation must be forbidden')
assert(seven.globalRules?.crossAthleteDataLeakAllowed === false, 'cross-athlete leakage must be forbidden')
assert(seven.globalRules?.medicalDiagnosisAllowed === false, 'medical diagnosis must be forbidden')
assert(seven.globalRules?.onePrimaryFailureDomainPerAthlete === true, 'primary-failure-domain rule must be enabled')

assert(Array.isArray(seven.athletes) && seven.athletes.length === 7, 'fixture must contain exactly seven athletes')
const ids = seven.athletes.map(a => a.internalId)
assert(new Set(ids).size === 7, 'athlete IDs must be unique')
for (const [id, displayName] of expectedAthletes) {
  const athlete = seven.athletes.find(a => a.internalId === id)
  assert(Boolean(athlete), `missing athlete ${id}`)
  if (!athlete) continue
  assert(athlete.displayName === displayName, `${id} display name must be ${displayName}`)
  assert(Boolean(athlete.primaryFailureDomain), `${id} needs a primaryFailureDomain`)
  assert(Boolean(athlete.units?.weight), `${id} needs weight units`)
  assert(Boolean(athlete.barbell?.barWeight), `${id} needs barbell configuration`)
  assert(Object.keys(athlete.trainingMaxes || {}).length >= 6, `${id} needs all core training maxes`)
}

const pevra = seven.athletes.find(a => a.internalId === 'qa_rook')
const raizen = seven.athletes.find(a => a.internalId === 'qa_titan')
const corra = seven.athletes.find(a => a.internalId === 'qa_metric')
const mara = seven.athletes.find(a => a.internalId === 'qa_recovery')
const rurik = seven.athletes.find(a => a.internalId === 'qa_substitution')
const hadrin = seven.athletes.find(a => a.internalId === 'qa_history')

assert(pevra?.trainingMaxes?.overhead_press === 65, 'Pevra low-load OHP boundary drifted')
assert(raizen?.trainingMaxes?.deadlift === 545, 'Raizen high-load deadlift boundary drifted')
assert(corra?.units?.weight === 'kg' && corra?.barbell?.barWeight === 20 && corra?.barbell?.unit === 'kg', 'Corra metric boundary invalid')
assert(Array.isArray(corra?.barbell?.platesPerSideInventory) && corra.barbell.platesPerSideInventory.includes(1.25), 'Corra metric microplate boundary missing')
assert(mara?.readiness?.sleep_hours === 4.5 && mara?.readiness?.energy === 2 && mara?.readiness?.stress === 4, 'Mara poor-readiness seed drifted')

const rurikScenarioIds = new Set((rurik?.scenarios || []).map(s => s.scenarioId))
for (const id of ['rurik-hip', 'rurik-knee', 'rurik-red-flag-escalation']) assert(rurikScenarioIds.has(id), `missing Rurik scenario ${id}`)
const red = rurik?.scenarios?.find(s => s.scenarioId === 'rurik-red-flag-escalation')
assert((red?.redFlags || []).includes('inability to bear weight'), 'Rurik red-flag inability-to-bear-weight missing')
assert((red?.requiredAssertions || []).some(x => x.includes('professional evaluation')), 'Rurik professional-evaluation escalation missing')

const hs = hadrin?.historyScale || {}
assert(hadrin?.primaryFailureDomain === 'multi-year-history-and-analytics-scale', 'Hadrin primary path invalid')
assert(hs.spanMonths >= 36, 'Hadrin history must span at least 36 months')
assert(hs.minCompletedWorkouts >= 400, 'Hadrin requires at least 400 completed workouts')
assert(hs.minWorkoutSets >= 5000, 'Hadrin requires at least 5000 workout sets')
assert(hs.minReadinessEntries >= 300, 'Hadrin requires at least 300 readiness entries')
assert(hs.minBodyweightEntries >= 200, 'Hadrin requires at least 200 bodyweight entries')
assert(hs.minTrainingMaxEvents >= 30, 'Hadrin requires at least 30 TM events')
assert(hs.minPersonalRecords >= 40, 'Hadrin requires at least 40 PR records')
for (const key of ['crownforge', 'crown-maintenance', 'black-crown-foundation', 'black-crown-volume', 'black-crown-intensification', 'black-crown-realization']) {
  assert((hs.requiredProgramExposure || []).includes(key), `Hadrin missing program exposure ${key}`)
}

const requiredFlow = ['fixture-reset', 'profile', 'home', 'program', 'readiness', 'train', 'bar-loader', 'logging', 'resume-recovery', 'substitution', 'completion', 'history', 'progress', 'coach', 'export-restore', 'cross-profile-isolation', 'program-integrity']
assert(JSON.stringify(seven.universalAuditFlow) === JSON.stringify(requiredFlow), 'universal seven-athlete flow drifted')
for (const blocker of ['cross-athlete-data-leak', 'unauthorized-program-mutation', 'semantic-unit-error', 'lost-or-duplicated-workout-data', 'unsafe-coach-behavior', 'privacy-or-auth-exposure', 'history-scale-silent-drop-duplicate-or-reassignment']) {
  assert(seven.releaseBlockers.includes(blocker), `missing seven-athlete release blocker ${blocker}`)
}

assert(chaos.schemaVersion === 1, 'chaos fixture schemaVersion must be 1')
assert(chaos.fixtureId === 'letmefly-chaos-resilience-audit', 'chaos fixtureId mismatch')
assert(chaos.dependsOn === 'ci/seven-athlete-release-audit.v2.json', 'chaos dependency must point to seven-athlete v2 fixture')
assert(Array.isArray(chaos.scenarios) && chaos.scenarios.length === 21, 'chaos audit must contain exactly 21 scenarios')
const expectedChaosIds = Array.from({length: 21}, (_, i) => `C${String(i + 1).padStart(2, '0')}`)
const chaosIds = chaos.scenarios.map(s => s.id)
assert(JSON.stringify(chaosIds) === JSON.stringify(expectedChaosIds), 'chaos scenario IDs must be C01-C21 in order')
assert(new Set(chaosIds).size === 21, 'chaos scenario IDs must be unique')
for (const scenario of chaos.scenarios) {
  assert(Boolean(scenario.name), `${scenario.id} needs a name`)
  assert(Array.isArray(scenario.primaryAthletes) && scenario.primaryAthletes.length > 0, `${scenario.id} needs primary athletes`)
  assert(Array.isArray(scenario.faults) && scenario.faults.length > 0, `${scenario.id} needs injected faults`)
  assert(Array.isArray(scenario.assertions) && scenario.assertions.length > 0, `${scenario.id} needs assertions`)
  for (const id of [...scenario.primaryAthletes, ...(scenario.secondaryAthletes || [])]) assert(ids.includes(id), `${scenario.id} references unknown athlete ${id}`)
}

const chaosNameById = Object.fromEntries(chaos.scenarios.map(s => [s.id, s.name]))
const requiredChaosNames = {
  C01:'workout-interruption-torture', C02:'rapid-input-duplicate-action', C03:'offline-workout', C04:'dirty-network-out-of-order', C05:'profile-switch-torture', C06:'metric-imperial-switching', C07:'bar-loader-edge-cases', C08:'program-boundary-transition', C09:'long-history-scale', C10:'empty-new-athlete', C11:'broken-incomplete-data', C12:'backup-restore-torture', C13:'upgrade-migration', C14:'two-device-conflict', C15:'coach-hallucination-unsupported-fact', C16:'coach-program-integrity-attack', C17:'substitution-chain', C18:'pr-invalid-input-abuse', C19:'calendar-date-abuse', C20:'ui-extreme-content', C21:'privacy-security-boundary'
}
for (const [id, name] of Object.entries(requiredChaosNames)) assert(chaosNameById[id] === name, `${id} chaos scenario name drifted`)

const c09 = chaos.scenarios.find(s => s.id === 'C09')
assert(c09?.primaryAthletes?.includes('qa_history'), 'long-history chaos must belong to Hadrin')
const c17 = chaos.scenarios.find(s => s.id === 'C17')
assert(c17?.primaryAthletes?.includes('qa_substitution'), 'substitution-chain chaos must belong to Rurik')
const c06 = chaos.scenarios.find(s => s.id === 'C06')
assert(c06?.primaryAthletes?.includes('qa_metric'), 'unit-switch chaos must belong to Corra')

for (const blocker of ['data-loss', 'training-history-duplication', 'cross-athlete-leakage', 'unauthorized-program-mutation', 'semantic-unit-corruption', 'unsafe-coach-behavior', 'corrupting-migration-or-restore', 'nondeterministic-program-advancement']) {
  assert(chaos.releaseBlockers.includes(blocker), `missing chaos release blocker ${blocker}`)
}

for (const [id, displayName] of expectedAthletes) {
  assert(sevenResults.athleteResults?.[id]?.displayName === displayName, `seven-athlete results template missing ${id}`)
}
for (const id of ['rurik-hip','rurik-knee','rurik-red-flag-escalation']) assert(Boolean(sevenResults.rurikScenarioResults?.[id]), `seven-athlete results template missing ${id}`)
assert(Boolean(sevenResults.hadrinScaleResult), 'seven-athlete results template missing Hadrin scale result')
assert(Object.keys(chaosResults.scenarioResults || {}).length === 21, 'chaos results template must contain 21 scenario result slots')
for (const id of expectedChaosIds) assert(Boolean(chaosResults.scenarioResults?.[id]), `chaos results template missing ${id}`)

if (failures.length) {
  console.error(`LetMeFly release audit contract validation FAILED: ${failures.length} issue(s)`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('LetMeFly seven-athlete + chaos/resilience audit contracts: PASS')
console.log(`Athletes: ${seven.athletes.length}; chaos scenarios: ${chaos.scenarios.length}`)
