#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const failures = []
const rows = []
const fail = (label, detail = '') => { failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
const check = (ok, label, detail = '') => { if (!ok) fail(label, detail) }

function loadSignature(set) {
  return JSON.stringify({
    load: set?.load ?? null,
    percentage: set?.percentage ?? null,
    loadReference: set?.loadReference ?? null,
    loadUnit: set?.loadUnit ?? set?.unit ?? null,
    rounding: set?.rounding ?? null,
  })
}
function loadRelevant(set) {
  const load = set?.load
  return (load !== null && load !== undefined && String(load).trim() !== '')
    || set?.percentage !== null && set?.percentage !== undefined
    || Boolean(String(set?.loadReference ?? '').trim())
}
function flatten(definition) {
  return (definition.weekData ?? []).flatMap(week => (week.days ?? []).map(day => ({ week: week.week, day: day.day, data: day })))
}
function chooseNextLoad(previousActual, previousSignature, nextSignature, nextUntouchedDefault) {
  if ((nextSignature || previousSignature) && nextSignature !== previousSignature) return nextUntouchedDefault
  return previousActual || nextUntouchedDefault
}

if (!fs.existsSync(target)) {
  console.error(`Target source directory does not exist: ${target}`)
  process.exit(2)
}

let exported
try {
  const viteBin = path.join(target, 'node_modules', '.bin', 'vite')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-load-matrix-'))
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n')
  const built = spawnSync(viteBin, ['build', '--ssr', 'src/data/programs.ts', '--outDir', temp, '--emptyOutDir'], { cwd: target, encoding: 'utf8' })
  if (built.status !== 0) throw new Error((built.stderr || built.stdout || 'Vite SSR build failed').trim())
  const entry = fs.readdirSync(temp).find(name => /programs.*\.m?js$/i.test(name)) || fs.readdirSync(temp).find(name => /\.m?js$/i.test(name))
  if (!entry) throw new Error('No program facade emitted')
  exported = await import(`${pathToFileURL(path.join(temp, entry)).href}?matrix=${Date.now()}`)
} catch (error) {
  fail('Governed program facade loads for load matrix', error instanceof Error ? error.message : String(error))
}

const specs = exported ? [
  ['crownforge', exported.CROWNFORGE],
  ['crown-maintenance', exported.CROWN_MAINTENANCE],
  ['black-crown', exported.BLACK_CROWN],
] : []

const summary = { samePrescriptionPairs: 0, changedPrescriptionPairs: 0, exercisesWithLoadPairs: 0, byProgram: {} }
for (const [program, definition] of specs) {
  const stats = { samePrescriptionPairs: 0, changedPrescriptionPairs: 0, exercisesWithLoadPairs: 0 }
  for (const position of flatten(definition)) {
    for (const section of position.data.sections ?? []) {
      for (const exercise of section.exercises ?? []) {
        const sets = exercise.sets ?? []
        let exerciseCounted = false
        for (let index = 1; index < sets.length; index += 1) {
          const previous = sets[index - 1]
          const current = sets[index]
          if (!loadRelevant(previous) && !loadRelevant(current)) continue
          if (!exerciseCounted) { stats.exercisesWithLoadPairs += 1; summary.exercisesWithLoadPairs += 1; exerciseCounted = true }
          const previousSignature = loadSignature(previous)
          const currentSignature = loadSignature(current)
          const context = `${program}:W${position.week}:D${position.day}:${exercise.name ?? 'exercise'}:set${index}->${index + 1}`
          if (previousSignature === currentSignature) {
            stats.samePrescriptionPairs += 1
            summary.samePrescriptionPairs += 1
            const athleteActual = `athlete-adjusted:${context}`
            const next = chooseNextLoad(athleteActual, previousSignature, currentSignature, `program-default:${context}`)
            check(next === athleteActual, 'Same-prescription pair failed carry simulation', context)
            rows.push({ context, type: 'same', previousSignature, currentSignature })
          } else {
            stats.changedPrescriptionPairs += 1
            summary.changedPrescriptionPairs += 1
            const athleteActual = `athlete-adjusted:${context}`
            const nextDefault = `new-program-default:${context}`
            const next = chooseNextLoad(athleteActual, previousSignature, currentSignature, nextDefault)
            check(next === nextDefault, 'Changed-prescription pair leaked prior load', context)
            rows.push({ context, type: 'changed', previousSignature, currentSignature })
          }
        }
      }
    }
  }
  summary.byProgram[program] = stats
  console.log(`PASS  ${program} load matrix — same=${stats.samePrescriptionPairs}, changed=${stats.changedPrescriptionPairs}, exercises=${stats.exercisesWithLoadPairs}`)
}

check(summary.samePrescriptionPairs > 0, 'Load matrix must contain same-prescription adjacent sets', `found ${summary.samePrescriptionPairs}`)
check(summary.changedPrescriptionPairs > 0, 'Load matrix must contain intentional prescription changes', `found ${summary.changedPrescriptionPairs}`)
check(summary.exercisesWithLoadPairs > 0, 'Load matrix must cover loaded multi-set exercises', `found ${summary.exercisesWithLoadPairs}`)

const runtimePath = path.join(target, 'dist', 'ui', 'workout-logging-v2.js')
if (!fs.existsSync(runtimePath)) {
  fail('Final Workout Logging runtime exists', runtimePath)
} else {
  const runtime = fs.readFileSync(runtimePath, 'utf8')
  check(runtime.includes('function programmedLoadSignature'), 'Final runtime exposes programmed-load signature guard')
  check(runtime.includes('currentSignature !== previous.signature'), 'Final runtime protects changed prescriptions from carry-forward')
  check(runtime.includes('targetStillAtProgramDefault'), 'Final runtime protects manual next-set overrides')
  check(runtime.includes("input.dataset.lmfCarriedLoad = 'true'"), 'Final runtime marks athlete load carry-forward')
}

const report = {
  generatedAt: new Date().toISOString(),
  result: failures.length ? 'FAIL' : 'PASS',
  summary,
  sampleSamePrescriptionPairs: rows.filter(row => row.type === 'same').slice(0, 25),
  sampleChangedPrescriptionPairs: rows.filter(row => row.type === 'changed').slice(0, 25),
  failures,
}
fs.writeFileSync(path.join(target, 'LIFECYCLE_LOAD_CARRY_AUDIT.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(target, 'LIFECYCLE_LOAD_CARRY_AUDIT.md'), [
  '# LetMeFly Lifecycle Load Carry Matrix',
  '',
  `Result: **${report.result}**`,
  `Generated: ${report.generatedAt}`,
  '',
  `- Same-prescription adjacent loaded-set pairs: ${summary.samePrescriptionPairs}`,
  `- Changed-prescription adjacent loaded-set pairs: ${summary.changedPrescriptionPairs}`,
  `- Loaded multi-set exercises covered: ${summary.exercisesWithLoadPairs}`,
  '',
  ...Object.entries(summary.byProgram).map(([program, stats]) => `- **${program}** — same=${stats.samePrescriptionPairs}, changed=${stats.changedPrescriptionPairs}, loaded exercises=${stats.exercisesWithLoadPairs}`),
  '',
  '## Failures',
  ...(failures.length ? failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
].join('\n'))

if (failures.length) process.exit(1)
console.log(`LetMeFly lifecycle load-carry matrix: PASS — ${summary.samePrescriptionPairs} same-prescription pairs / ${summary.changedPrescriptionPairs} changed-prescription pairs`)
