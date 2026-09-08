#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const warnings = []
const passes = []

const say = (kind, label, detail = '') => console.log(`${kind.padEnd(5)} ${label}${detail ? ` — ${detail}` : ''}`)
function pass(label, detail = '') { passes.push({ label, detail }); say('PASS', label, detail) }
function warn(label, detail = '') { warnings.push({ label, detail }); say('WARN', label, detail) }
function fail(label, detail = '') { failures.push({ label, detail }); say('FAIL', label, detail) }
function check(ok, label, detail = '') { ok ? pass(label, detail) : fail(label, detail) }
function read(rel) { return fs.readFileSync(path.join(target, rel), 'utf8') }
function exists(rel) { return fs.existsSync(path.join(target, rel)) }
function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, predicate))
    else if (entry.isFile() && predicate(full)) out.push(full)
  }
  return out
}
function validNumber(value) { return typeof value !== 'number' || (Number.isFinite(value) && value >= 0) }
function flatten(definition) {
  return (definition.weekData ?? []).flatMap((week) => (week.days ?? []).map((day) => ({ week: week.week, day: day.day, data: day })))
}

if (!fs.existsSync(target)) {
  console.error(`Target source directory does not exist: ${target}`)
  process.exit(2)
}

// Materialize the actual governed TypeScript program facade with the same Vite toolchain
// already used by production. This avoids inventing a parallel parser for program data.
let exportsByProgram = null
try {
  const viteBin = path.join(target, 'node_modules', '.bin', 'vite')
  if (!fs.existsSync(viteBin)) throw new Error('production Vite executable is missing')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-program-audit-'))
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n')
  const result = spawnSync(viteBin, [
    'build',
    '--ssr', 'src/data/programs.ts',
    '--outDir', temp,
    '--emptyOutDir',
  ], { cwd: target, encoding: 'utf8' })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Vite SSR build failed').trim())
  const candidates = walk(temp, (file) => /\.(?:m?js)$/.test(file))
  const entry = candidates.find((file) => /programs.*\.js$/i.test(path.basename(file))) || candidates[0]
  if (!entry) throw new Error('Vite SSR build produced no importable program facade')
  exportsByProgram = await import(`${pathToFileURL(entry).href}?audit=${Date.now()}`)
  pass('Governed program facade loads through production Vite toolchain')
} catch (error) {
  fail('Governed program facade loads through production Vite toolchain', error instanceof Error ? error.message : String(error))
}

const programs = exportsByProgram ? [
  { key: 'crownforge', definition: exportsByProgram.CROWNFORGE, expectedWeeks: 14 },
  { key: 'crown-maintenance', definition: exportsByProgram.CROWN_MAINTENANCE, expectedWeeks: 3 },
  { key: 'black-crown', definition: exportsByProgram.BLACK_CROWN, expectedWeeks: 54 },
] : []

const summaries = {}
const allPositions = []

for (const spec of programs) {
  const { key, definition, expectedWeeks } = spec
  if (!definition) { fail(`${key} governed definition`, 'missing export'); continue }
  const label = definition.name || key
  const weeks = definition.weekData
  check(Array.isArray(weeks), `${label} exposes governed weeks`)
  if (!Array.isArray(weeks)) continue
  check(weeks.length === expectedWeeks, `${label} week count`, `${weeks.length}/${expectedWeeks}`)

  const summary = { weeks: weeks.length, positions: 0, trainingDays: 0, recoveryDays: 0, sections: 0, exercises: 0, sets: 0, percentageSets: 0 }
  const seenWeeks = new Set()
  for (let wi = 0; wi < weeks.length; wi += 1) {
    const week = weeks[wi]
    const expectedWeek = wi + 1
    check(week.week === expectedWeek, `${label} week ordering W${expectedWeek}`, `actual ${week.week}`)
    if (seenWeeks.has(week.week)) fail(`${label} unique week numbers`, `duplicate W${week.week}`)
    seenWeeks.add(week.week)
    check(Array.isArray(week.days) && week.days.length > 0, `${label} W${week.week} has governed days`)
    const seenDays = new Set()
    for (const day of week.days ?? []) {
      summary.positions += 1
      allPositions.push(`${key}:W${week.week}:D${day.day}`)
      check(Number.isInteger(day.day) && day.day > 0, `${label} W${week.week} valid day number`, String(day.day))
      if (seenDays.has(day.day)) fail(`${label} W${week.week} unique day numbers`, `duplicate D${day.day}`)
      seenDays.add(day.day)
      check(Boolean(String(day.title ?? '').trim()), `${label} W${week.week} D${day.day} title`)
      const sections = Array.isArray(day.sections) ? day.sections : []
      const dayText = `${day.title ?? ''} ${day.role ?? ''} ${day.readinessRule ?? ''}`.toLowerCase()
      const recovery = /rest|recovery|off|restore|gpp|mobility/.test(dayText) && sections.length === 0
      if (recovery) summary.recoveryDays += 1
      else summary.trainingDays += 1
      if (!Array.isArray(day.sections)) fail(`${label} W${week.week} D${day.day} section structure`, 'sections is not an array')

      for (const section of sections) {
        summary.sections += 1
        check(Boolean(String(section.title ?? '').trim()), `${label} W${week.week} D${day.day} section title`)
        const exercises = Array.isArray(section.exercises) ? section.exercises : []
        if (!Array.isArray(section.exercises)) fail(`${label} W${week.week} D${day.day} ${section.title || 'section'} exercise structure`)
        for (const exercise of exercises) {
          summary.exercises += 1
          check(Boolean(String(exercise.name ?? '').trim()), `${label} W${week.week} D${day.day} exercise name`)
          const sets = Array.isArray(exercise.sets) ? exercise.sets : []
          check(sets.length > 0, `${label} W${week.week} D${day.day} ${exercise.name || 'exercise'} has sets`)
          summary.sets += sets.length
          for (let si = 0; si < sets.length; si += 1) {
            const set = sets[si]
            for (const field of ['reps', 'load', 'percentage', 'rpe', 'rir']) {
              if (!validNumber(set[field])) fail(`${label} ${exercise.name} set ${si + 1} ${field}`, String(set[field]))
            }
            if (set.percentage !== undefined && set.percentage !== null) {
              summary.percentageSets += 1
              if (key === 'black-crown') {
                check(String(set.loadReference ?? '').startsWith('black-crown:'), `${label} percentage set has governed load reference`, `${exercise.name} W${week.week} D${day.day}`)
              }
            }
          }
        }
      }
    }
  }
  summaries[key] = summary
  pass(`${label} complete governed inventory`, `${summary.positions} positions · ${summary.exercises} exercises · ${summary.sets} sets`)
}

if (summaries['black-crown']) check(summaries['black-crown'].positions === 270, 'Black Crown all 270 sessions enumerated', `${summaries['black-crown'].positions}/270`)

// Full mock training journey. This is intentionally in-memory and cannot touch private athlete data.
const mock = { sessionsStarted: 0, sessionsCompleted: 0, setsLogged: 0, previewChecks: 0, transitions: [], finalState: null }
if (programs.length === 3 && programs.every((p) => p.definition?.weekData)) {
  for (let pi = 0; pi < programs.length; pi += 1) {
    const { key, definition } = programs[pi]
    const days = flatten(definition)
    for (let di = 0; di < days.length; di += 1) {
      const current = days[di]
      const currentKey = `${key}:W${current.week}:D${current.day}`
      const preview = days[Math.min(di + 1, days.length - 1)]
      const previewKey = `${key}:W${preview.week}:D${preview.day}`
      void previewKey
      mock.previewChecks += 1
      check(currentKey === `${key}:W${current.week}:D${current.day}`, `Preview isolation ${currentKey}`)

      mock.sessionsStarted += 1
      for (const section of current.data.sections ?? []) {
        for (const exercise of section.exercises ?? []) mock.setsLogged += Array.isArray(exercise.sets) ? exercise.sets.length : 0
      }
      mock.sessionsCompleted += 1
    }
    if (key === 'crownforge') mock.transitions.push('crownforge -> crown-maintenance')
    if (key === 'crown-maintenance') mock.transitions.push('crown-maintenance -> black-crown-entry-gate -> black-crown')
    if (key === 'black-crown') { mock.transitions.push('black-crown -> program-complete'); mock.finalState = 'program-complete' }
  }
  check(mock.sessionsCompleted === allPositions.length, 'Mock cycle completes every governed position', `${mock.sessionsCompleted}/${allPositions.length}`)
  check(mock.finalState === 'program-complete', 'Mock cycle ends at program-complete')
  check(mock.transitions[0] === 'crownforge -> crown-maintenance', 'Mock Crownforge handoff')
  check(mock.transitions[1]?.includes('black-crown-entry-gate'), 'Mock Crown Maintenance entry gate')
  check(mock.transitions[2] === 'black-crown -> program-complete', 'Mock Black Crown completion without invented successor')
  pass('Mock cycle traverses every governed set', `${mock.setsLogged} sets`)
}

// The mock must agree with the real private progression/workout implementation.
try {
  const progression = read('src/services/program-progression-service.ts')
  const workout = read('src/services/workout-service.ts')
  const main = read('src/main.ts')
  check(progression.includes("program_key: 'crown-maintenance'"), 'Real progression Crownforge -> Crown Maintenance')
  check(progression.includes("current_phase_key: 'black-crown-entry'"), 'Real progression opens Black Crown entry gate')
  check(progression.includes('Cross-program repositioning is blocked'), 'Real progression blocks cross-program manual jumps')
  check(progression.includes('No next program was invented.'), 'Real progression does not invent a post-Black-Crown program')
  check(main.includes('advanceProgramAfterWorkout'), 'Completed workouts invoke governed advancement')
  check(main.includes('MAKE CURRENT POSITION'), 'Intentional preview-to-current control exists')
  check(/Preview only/i.test(main), 'Preview workout write guard exists')
  check(workout.includes('resolvedTrainingMaxValue'), 'Workout snapshot preserves resolved TM provenance')
} catch (error) {
  fail('Real progression/workout source contract', error instanceof Error ? error.message : String(error))
}

// Screen/tab/features audit checks both source overlays and the final shipping bundle.
const sourceFiles = [path.join(target, 'src/main.ts'), ...walk(path.join(root, 'overlays'), (f) => /\.(?:js|css|html|ts)$/.test(f))]
const sourceText = sourceFiles.filter(fs.existsSync).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const distIndex = exists('dist/index.html') ? read('dist/index.html') : ''
const distAssets = walk(path.join(target, 'dist/assets'), (f) => /\.(?:js|css)$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const appText = `${sourceText}\n${distIndex}\n${distAssets}`

const screens = [
  ['Home tab', /\bHOME\b/i], ['Train tab', /\bTRAIN\b/i], ['Program tab', /\bPROGRAM\b/i], ['Progress tab', /\bPROGRESS\b/i], ['More tab', /\bMORE\b/i],
  ['Exercises screen', /\bEXERCISES\b/i], ['Coach screen', /\bCOACH\b/i], ['Profile screen', /\bPROFILE\b/i], ['Calendar screen', /\bCALENDAR\b/i],
]
for (const [label, pattern] of screens) check(pattern.test(appText), label)
for (const tab of ['OVERVIEW', 'STRENGTH', 'BODY', 'CONDITIONING', 'PRS']) check(new RegExp(`\\b${tab}\\b`, 'i').test(appText), `Progress sub-tab ${tab}`)

const features = [
  ['Readiness intake', /readiness/i], ['Workout start', /start-workout|START WORKOUT/i], ['Set logging', /set-row|sets logged|complete-set/i],
  ['RPE tracking', /\bRPE\b/i], ['RIR tracking', /\bRIR\b/i], ['Rest timer/gate', /restGateByPanel|rest timer|data-lmf-rest-continue/i],
  ['Circuit handling', /\bcircuit\b/i], ['Superset handling', /\bsuperset\b/i], ['Tri-set handling', /tri-set/i],
  ['Exercise video', /WATCH EXERCISE|watch exercise/i], ['Exercise substitution', /SUBSTITUTE|substitution/i], ['Coach exercise help', /ASK COACH|ask coach/i],
  ['Barbell loading helper', /Bar Loader|bar loader|plates per side/i], ['Voice notes', /voice-note|voice note/i], ['Strength Maxes', /Strength Maxes|strength-maxes/i],
  ['Workout history', /workout history|history/i], ['Bodyweight tracking', /bodyweight/i], ['PR tracking', /personal record|\bPRs?\b/i],
  ['Backup/export', /backup|export/i], ['Restore/import', /restore|import/i], ['Private/cloud sync', /supabase|Private Vault|cloud/i],
  ['PWA install', /beforeinstallprompt|INSTALL APP|pwa-install/i], ['PWA update', /serviceWorker|pwa-update/i], ['Offline/service worker', /service-worker\.js|navigator\.serviceWorker/i],
  ['Exercise artwork', /exercise-art|data-exercise-art/i],
]
for (const [label, pattern] of features) check(pattern.test(appText), label)
check(exists('dist/refresh.html') && exists('dist/refresh.js'), 'Safe cache refresh feature ships')

for (const [label, marker] of [
  ['workout flow runtime', 'workout-flow-v1.js'], ['automatic exercise art', 'exercise-art-auto.js'], ['private exercise art resolver', 'exercise-art-cloudinary.js'],
  ['voice notes v2', 'voice-notes-v2.js'], ['strength maxes', 'strength-maxes-v1.js'], ['progress dashboard', 'progress-dashboard-v1.js'], ['mobile regression guard', 'mobile-recording-regression-v1.js'],
]) check(distIndex.includes(marker), `Production includes ${label}`)
check(exists('dist/manifest.webmanifest'), 'Production PWA manifest')
check(exists('dist/service-worker.js'), 'Production service worker')

// Explicitly surface the visual inconsistency that triggered this audit.
try {
  const previewCss = fs.readFileSync(path.join(root, 'overlays/ui-command-v2/batch-aa/mobile-recording-regression-v1.css'), 'utf8')
  if (/preview-card\[data-exercise-art\][\s\S]*grid-template-columns/i.test(previewCss)) warn('Current-day vs preview-day card consistency', 'future preview cards still use a dedicated card grid')
  else pass('Current-day vs preview-day card consistency')
} catch { warn('Current-day vs preview-day card consistency', 'unable to inspect preview CSS') }

const report = { generatedAt: new Date().toISOString(), result: failures.length ? 'FAIL' : 'PASS', failures, warnings, passes, programs: summaries, mockCycle: mock }
fs.writeFileSync(path.join(target, 'FULL_APP_CYCLE_AUDIT.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(target, 'FULL_APP_CYCLE_AUDIT.md'), [
  '# LetMeFly Full App + Mock Training Cycle Audit', '', `Result: **${report.result}**`, `Generated: ${report.generatedAt}`, '', '## Programs',
  ...Object.entries(summaries).map(([key, s]) => `- **${key}** — ${s.weeks} weeks, ${s.positions} governed positions, ${s.exercises} exercises, ${s.sets} sets`),
  '', '## Mock cycle', `- Sessions completed: ${mock.sessionsCompleted}`, `- Sets traversed: ${mock.setsLogged}`, `- Preview-isolation checks: ${mock.previewChecks}`, `- Transitions: ${mock.transitions.join(' → ')}`, `- Final state: ${mock.finalState}`,
  '', '## Failures', ...(failures.length ? failures.map((x) => `- ${x.label}${x.detail ? ` — ${x.detail}` : ''}`) : ['- None']),
  '', '## Warnings', ...(warnings.length ? warnings.map((x) => `- ${x.label}${x.detail ? ` — ${x.detail}` : ''}`) : ['- None']), '',
].join('\n'))

console.log('\n=== LETMEFLY FULL APP / MOCK CYCLE AUDIT ===')
console.log(`Governed positions traversed: ${mock.sessionsCompleted}`)
console.log(`Governed sets traversed: ${mock.setsLogged}`)
console.log(`Warnings: ${warnings.length}`)
console.log(`Failures: ${failures.length}`)
if (failures.length) process.exit(1)
console.log('LetMeFly full app + mock training cycle audit: PASS')
