#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const fixturePath = process.argv[2] || path.resolve('ci/six-athlete-release-audit.v1.json')
const fail = (message) => {
  console.error(`six-athlete fixture: FAIL — ${message}`)
  process.exitCode = 1
}
const pass = (message) => console.log(`six-athlete fixture: PASS — ${message}`)
const requireCheck = (condition, message) => condition ? pass(message) : fail(message)

let fixture
try {
  fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  pass('JSON parses')
} catch (error) {
  console.error(`six-athlete fixture: FAIL — unable to parse ${fixturePath}: ${error.message}`)
  process.exit(1)
}

requireCheck(fixture.schemaVersion === 1, 'schemaVersion is 1')
requireCheck(fixture.fixtureId === 'letmefly-six-athlete-release-gate', 'fixtureId is canonical')
requireCheck(fixture.status === 'locked', 'fixture is locked')
requireCheck(fixture.dataBoundary?.syntheticOnly === true, 'fixtures are synthetic-only')
requireCheck(fixture.dataBoundary?.mayOverwriteRealAthlete === false, 'fixtures cannot overwrite real athletes')
requireCheck(fixture.dataBoundary?.stableInternalIds === true, 'internal QA IDs are stable')
requireCheck(fixture.globalRules?.preserveProgramLogic === true, 'program logic preservation is mandatory')
requireCheck(fixture.globalRules?.programSourceMutationAllowed === false, 'source-program mutation is forbidden')
requireCheck(fixture.globalRules?.crossAthleteDataLeakAllowed === false, 'cross-athlete data leakage is forbidden')
requireCheck(fixture.globalRules?.medicalDiagnosisAllowed === false, 'medical diagnosis is forbidden')
requireCheck(fixture.globalRules?.substitutionMustPreservePurpose === true, 'substitutions must preserve purpose')
requireCheck(fixture.globalRules?.readinessMayRewriteProgram === false, 'readiness cannot rewrite the program')

const canonicalRoster = new Map([
  ['qa_rook', 'Pevra Soll'],
  ['qa_forge', 'Dain Varr'],
  ['qa_titan', 'Raizen'],
  ['qa_metric', 'Corra Bellan'],
  ['qa_recovery', 'Mara Venn'],
  ['qa_substitution', 'Rurik Hale'],
])

requireCheck(Array.isArray(fixture.athletes) && fixture.athletes.length === 6, 'exactly six QA athletes exist')
const ids = fixture.athletes.map((athlete) => athlete.internalId)
requireCheck(new Set(ids).size === ids.length, 'QA athlete IDs are unique')

for (const [id, name] of canonicalRoster) {
  const athlete = fixture.athletes.find((row) => row.internalId === id)
  requireCheck(Boolean(athlete), `${id} exists`)
  if (!athlete) continue
  requireCheck(athlete.displayName === name, `${id} display name is ${name}`)
  requireCheck(['lb', 'kg'].includes(athlete.units?.weight), `${name} has a supported weight unit`)
  requireCheck(athlete.barbell?.unit === athlete.units?.weight, `${name} barbell unit matches profile unit`)
  requireCheck(Array.isArray(athlete.barbell?.platesPerSideInventory) && athlete.barbell.platesPerSideInventory.length > 0, `${name} has a plate inventory`)
  const maxes = athlete.trainingMaxes || {}
  for (const lift of ['back_squat', 'front_squat', 'bench_press', 'deadlift', 'overhead_press', 'power_clean']) {
    requireCheck(Number.isFinite(maxes[lift]) && maxes[lift] > 0, `${name} has a positive ${lift} TM`)
  }
  const readiness = athlete.readiness || {}
  for (const field of ['sleep_hours', 'sleep_quality', 'soreness', 'stress', 'energy']) {
    requireCheck(Number.isFinite(readiness[field]), `${name} readiness includes ${field}`)
  }
  requireCheck(Array.isArray(athlete.requiredAssertions) || id === 'qa_substitution', `${name} defines required assertions or governed sub-scenarios`)
}

const metric = fixture.athletes.find((row) => row.internalId === 'qa_metric')
requireCheck(metric?.units?.weight === 'kg' && metric?.barbell?.barWeight === 20, 'Corra uses a 20 kg bar')
requireCheck(metric?.barbell?.platesPerSideInventory?.includes(1.25), 'Corra includes 1.25 kg plates')

const recovery = fixture.athletes.find((row) => row.internalId === 'qa_recovery')
requireCheck(recovery?.readiness?.sleep_hours <= 5, 'Mara has a deliberate short-sleep seed')
requireCheck(recovery?.readiness?.energy <= 2, 'Mara has a deliberate low-energy seed')
requireCheck(recovery?.readiness?.stress >= 4 && recovery?.readiness?.soreness >= 4, 'Mara has deliberate high-stress/high-soreness seeds')

const rurik = fixture.athletes.find((row) => row.internalId === 'qa_substitution')
const rurikScenarioIds = new Set((rurik?.scenarios || []).map((scenario) => scenario.scenarioId))
for (const scenarioId of ['rurik-hip', 'rurik-knee', 'rurik-red-flag-escalation']) {
  requireCheck(rurikScenarioIds.has(scenarioId), `Rurik scenario ${scenarioId} exists`)
}
const redFlagScenario = (rurik?.scenarios || []).find((scenario) => scenario.scenarioId === 'rurik-red-flag-escalation')
requireCheck(Array.isArray(redFlagScenario?.redFlags) && redFlagScenario.redFlags.length >= 5, 'Rurik red-flag scenario has escalation triggers')

const flow = fixture.universalAuditFlow || []
requireCheck(Array.isArray(flow) && flow.length >= 15, 'universal audit flow is comprehensive')
const flowIds = new Set(flow.map((step) => step.id))
for (const stepId of ['fixture-reset', 'profile', 'home', 'program', 'readiness', 'train', 'bar-loader', 'logging', 'completion', 'history', 'progress', 'coach', 'cross-profile-isolation', 'program-integrity']) {
  requireCheck(flowIds.has(stepId), `universal flow includes ${stepId}`)
}

requireCheck(Array.isArray(fixture.releaseBlockers) && fixture.releaseBlockers.length > 0, 'release blockers are defined')
requireCheck(fixture.releaseBlockers?.every((blocker) => blocker.severity === 'BLOCKER'), 'all release blockers are classified BLOCKER')
requireCheck(fixture.resultContract?.requiredFields?.includes('releaseDecision'), 'result contract requires releaseDecision')
requireCheck(fixture.resultContract?.requiredFields?.includes('programIntegrityResult'), 'result contract requires programIntegrityResult')
requireCheck(fixture.resultContract?.requiredFields?.includes('athleteResults'), 'result contract requires athleteResults')
requireCheck(fixture.resultContract?.releaseDecisionEnum?.includes('PASS'), 'result contract supports PASS')
requireCheck(fixture.resultContract?.releaseDecisionEnum?.includes('FAIL'), 'result contract supports FAIL')

if (process.exitCode) {
  console.error('LetMeFly six-athlete release fixture validation: FAIL')
  process.exit(process.exitCode)
}
console.log('LetMeFly six-athlete release fixture validation: PASS')
