#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.resolve(process.argv[2] || path.join(repoRoot, '.build-src', 'letmefly_app'))
const dist = path.join(target, 'dist')
const payloadPath = path.join(dist, 'data', 'exercise-intelligence-v1.json')
const progressPath = path.join(dist, 'ui', 'progress-dashboard-v1.js')
const barLoaderPath = path.join(dist, 'ui', 'smart-names-bar-loader-v1.js')
const workoutServicePath = path.join(target, 'src', 'services', 'workout-service.ts')
const outputJson = path.join(target, 'ISSUE54_INTEGRATION_GATES.json')
const outputMd = path.join(target, 'ISSUE54_INTEGRATION_GATES.md')

const report = {
  result: 'PASS',
  checks: [],
  failures: [],
  barbellSubstitutionCases: [],
  personalRecordWriteSites: [],
  observations: {},
}

function check(label, ok, detail = '') {
  const row = { label, detail }
  if (ok) {
    report.checks.push(row)
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    report.result = 'FAIL'
    report.failures.push(row)
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function readRequired(file) {
  if (!fs.existsSync(file)) throw new Error(`Required Issue #54 integration input missing: ${file}`)
  return fs.readFileSync(file, 'utf8')
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(?:ts|tsx|js|mjs)$/i.test(entry.name)) out.push(full)
  }
  return out
}

function isBarbellExercise(exercise) {
  if (!exercise) return false
  const equipment = Array.isArray(exercise.equipment) ? exercise.equipment.join(' ') : ''
  const name = String(exercise.canonicalName || '')
  if (/\bbarbell\b/i.test(equipment)) return true
  if (/\b(?:front squat|back squat|box squat|bench press|deadlift|rdl|romanian deadlift|overhead press|strict press|push press|good morning|hip thrust|rack pull|clean|snatch|high pull|jerk|barbell row)\b/i.test(name) && !/\b(?:dumbbell|db|kettlebell|kb|machine|band|cable)\b/i.test(name)) return true
  return false
}

const payload = JSON.parse(readRequired(payloadPath))
const progress = readRequired(progressPath)
const barLoader = readRequired(barLoaderPath)
const workoutService = readRequired(workoutServicePath)
const exercises = new Map((payload.exercises || []).map(exercise => [exercise.id, exercise]))
const governedRules = (payload.substitutionRules || []).filter(rule => rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT'))

check('Finished Exercise Intelligence payload is available', Array.isArray(payload.exercises) && Array.isArray(payload.substitutionRules), `${payload.exercises?.length || 0} exercises / ${payload.substitutionRules?.length || 0} rules`)
check('Progress derived strength uses performed workout exercise identity', /liftIdFor\(exercise\.exercise_key\s*\|\|\s*exercise\.exercise_name_snapshot\)/.test(progress))
check('Core PR display resolves the PR record exercise key', /liftIdFor\(record\.exercise_key\)/.test(progress))
check('Workout service persists performed substitute as workout exercise identity', /exercise_key:\s*input\.alternativeExerciseKey/.test(workoutService) && /exercise_name_snapshot:\s*input\.alternativeExerciseName/.test(workoutService))
check('Workout service separately preserves programmed exercise provenance', /substituted_from_exercise_key:\s*prescribedKey/.test(workoutService) && /prescribedExerciseKey/.test(workoutService))
check('Previous performance lookup follows performed exercise identity', /row\.exercise_key\s*===\s*exerciseKey/.test(workoutService))

const sourceFiles = walk(path.join(target, 'src'))
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes('personalRecords')) continue
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (!line.includes('personalRecords')) return
    const start = Math.max(0, index - 4)
    const end = Math.min(lines.length, index + 5)
    const excerpt = lines.slice(start, end).join('\n')
    const writeLike = /putEntityWithOutbox|objectStore\([^\n]*personalRecords|(?:\.put|\.add)\s*\(|putRecord|addRecord|createPersonalRecord|savePersonalRecord/i.test(excerpt)
    if (writeLike) report.personalRecordWriteSites.push({ file: path.relative(target, file), line: index + 1, excerpt })
  })
}

report.observations.personalRecordsProducer = report.personalRecordWriteSites.length ? 'write-path-detected' : 'no-automatic-write-path-detected'
if (report.personalRecordWriteSites.length === 0) {
  check('No automatic personalRecords writer can mis-credit substitute performance in current source', true, 'PR dashboard consumption exists, but this reconstructed source has no automatic PR creation path')
} else {
  const safelyPerformed = report.personalRecordWriteSites.every(site => /exercise_key/.test(site.excerpt) && !/prescribedExerciseKey\s*[:=]/.test(site.excerpt))
  check('Automatic personalRecords writers are explicitly keyed to performed exercise identity', safelyPerformed, `${report.personalRecordWriteSites.length} write-like site(s) detected`)
}

for (const rule of governedRules) {
  const primary = exercises.get(rule.primaryExerciseId)
  const alternative = exercises.get(rule.alternativeExerciseId)
  if (!isBarbellExercise(alternative)) continue
  report.barbellSubstitutionCases.push({
    ruleId: rule.id || null,
    primaryExerciseId: rule.primaryExerciseId || null,
    primaryExercise: primary?.canonicalName || rule.primaryExercise || null,
    alternativeExerciseId: rule.alternativeExerciseId || null,
    alternativeExercise: alternative?.canonicalName || rule.alternativeExercise || null,
    promotionStatus: rule.promotionStatus || null,
    loadTransfer: rule.loadTransfer || null,
  })
}

check('Bar Loader binds to current active workout exercise cards', /querySelectorAll\('\.active-exercise'\)/.test(barLoader))
check('Bar Loader decides eligibility from current displayed exercise title', /exercise-title h3/.test(barLoader) && /isBarbellExercise\(name\)/.test(barLoader))
check('Bar Loader target follows current active load input', /\.load-input/.test(barLoader) && /activeLoadForCard\(card\)/.test(barLoader))
check('Bar Loader opens with performed exercise name and current working load', /openBarLoader\(\{\s*source:\s*'exercise',\s*exerciseName:\s*name,\s*target:\s*load\.target,\s*unit:\s*load\.unit\s*\}\)/.test(barLoader))

report.observations.governedPromotableRules = governedRules.length
report.observations.governedBarbellAlternativeCases = report.barbellSubstitutionCases.length
if (report.barbellSubstitutionCases.length === 0) {
  check('No governed barbell-alternative substitution case is being skipped by browser QA', true, 'Current finished catalog contains no promotable current-app rule whose alternative is a barbell movement; source architecture proves Bar Loader follows the performed card/load until such a governed case exists')
} else {
  check('Governed barbell-alternative substitution has dedicated browser proof before merge', false, `${report.barbellSubstitutionCases.length} real governed case(s) exist and must be added to browser QA rather than inventing a fixture`)
}

const markdown = [
  '# Issue #54 Integration Gates',
  '',
  `Result: **${report.result}**`,
  '',
  '## Checks',
  ...(report.checks.length ? report.checks.map(item => `- PASS — ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Failures',
  ...(report.failures.length ? report.failures.map(item => `- FAIL — ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## PR production path',
  `- Classification: ${report.observations.personalRecordsProducer}`,
  `- Write-like sites: ${report.personalRecordWriteSites.length}`,
  '',
  '## Governed barbell substitute cases',
  ...(report.barbellSubstitutionCases.length ? report.barbellSubstitutionCases.map(item => `- ${item.ruleId || 'rule'}: ${item.primaryExercise || item.primaryExerciseId} → ${item.alternativeExercise || item.alternativeExerciseId}`) : ['- None in the current finished governed catalog.']),
  '',
  'This audit does not invent a substitution relationship solely to satisfy Bar Loader testing. A real governed barbell-alternative rule automatically turns the missing browser proof into a failing merge gate.',
  '',
].join('\n')

fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(outputMd, markdown)
console.log(`Issue #54 integration gate audit: ${report.result}`)
if (report.failures.length) process.exit(1)
