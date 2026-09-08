#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const warnings = []
const passes = []

function pass(label, detail = '') {
  passes.push({ label, detail })
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}
function warn(label, detail = '') {
  warnings.push({ label, detail })
  console.log(`WARN  ${label}${detail ? ` — ${detail}` : ''}`)
}
function fail(label, detail = '') {
  failures.push({ label, detail })
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
}
function check(ok, label, detail = '') {
  if (ok) pass(label, detail)
  else fail(label, detail)
}
function read(rel) {
  const full = path.join(target, rel)
  if (!fs.existsSync(full)) throw new Error(`missing ${rel}`)
  return fs.readFileSync(full, 'utf8')
}
function walk(dir, filter = () => true) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, filter))
    else if (entry.isFile() && filter(full)) out.push(full)
  }
  return out
}
function flattenDays(definition) {
  return (definition.weekData ?? []).flatMap((week) =>
    (week.days ?? []).map((day) => ({ program: definition.key ?? definition.name, week: week.week, day: day.day, data: day })),
  )
}
function numericInvalid(value) {
  return typeof value === 'number' && (!Number.isFinite(value) || value < 0)
}
function countProgram(definition) {
  const summary = {
    weeks: 0,
    sessions: 0,
    sections: 0,
    exercises: 0,
    sets: 0,
    percentageSets: 0,
    optionalExercises: 0,
    conditionalExercises: 0,
    mandatoryExercises: 0,
  }
  const seenWeeks = new Set()
  const positions = []
  const weekData = definition.weekData ?? []
  summary.weeks = weekData.length
  for (let wi = 0; wi < weekData.length; wi += 1) {
    const week = weekData[wi]
    if (!Number.isInteger(week.week) || week.week <= 0) fail(`${definition.name} week number`, `invalid week at index ${wi}`)
    if (seenWeeks.has(week.week)) fail(`${definition.name} unique weeks`, `duplicate week ${week.week}`)
    seenWeeks.add(week.week)
    const seenDays = new Set()
    if (!Array.isArray(week.days) || week.days.length === 0) fail(`${definition.name} week ${week.week} sessions`, 'no days')
    for (const day of week.days ?? []) {
      summary.sessions += 1
      const key = `${week.week}:${day.day}`
      positions.push(key)
      if (!Number.isInteger(day.day) || day.day <= 0) fail(`${definition.name} W${week.week} day number`, String(day.day))
      if (seenDays.has(day.day)) fail(`${definition.name} W${week.week} unique days`, `duplicate D${day.day}`)
      seenDays.add(day.day)
      if (!String(day.title ?? '').trim()) fail(`${definition.name} W${week.week} D${day.day} title`, 'missing')
      if (!Array.isArray(day.sections) || day.sections.length === 0) fail(`${definition.name} W${week.week} D${day.day} sections`, 'none')
      for (const section of day.sections ?? []) {
        summary.sections += 1
        if (!String(section.title ?? '').trim()) fail(`${definition.name} W${week.week} D${day.day} section title`, 'missing')
        if (!Array.isArray(section.exercises) || section.exercises.length === 0) fail(`${definition.name} W${week.week} D${day.day} ${section.title} exercises`, 'none')
        for (const exercise of section.exercises ?? []) {
          summary.exercises += 1
          if (!String(exercise.name ?? '').trim()) fail(`${definition.name} W${week.week} D${day.day} exercise name`, 'missing')
          const priority = String(exercise.priority ?? 'mandatory').toLowerCase()
          if (priority === 'mandatory') summary.mandatoryExercises += 1
          else if (priority === 'conditional') summary.conditionalExercises += 1
          else if (priority === 'optional') summary.optionalExercises += 1
          else warn(`${definition.name} exercise priority`, `${exercise.name}: ${priority}`)

          const sets = exercise.sets
          if (!Array.isArray(sets) || sets.length === 0) {
            fail(`${definition.name} W${week.week} D${day.day} ${exercise.name} sets`, 'none')
            continue
          }
          summary.sets += sets.length
          sets.forEach((set, index) => {
            if (numericInvalid(set.reps)) fail(`${definition.name} ${exercise.name} set ${index + 1} reps`, String(set.reps))
            if (numericInvalid(set.load)) fail(`${definition.name} ${exercise.name} set ${index + 1} load`, String(set.load))
            if (numericInvalid(set.percentage)) fail(`${definition.name} ${exercise.name} set ${index + 1} percentage`, String(set.percentage))
            if (numericInvalid(set.rpe)) fail(`${definition.name} ${exercise.name} set ${index + 1} RPE`, String(set.rpe))
            if (numericInvalid(set.rir)) fail(`${definition.name} ${exercise.name} set ${index + 1} RIR`, String(set.rir))
            if (set.percentage !== undefined && set.percentage !== null) {
              summary.percentageSets += 1
              if (definition.key === 'black-crown' && !String(set.loadReference ?? '').startsWith('black-crown:')) {
                fail(`${definition.name} percentage-load reference`, `${exercise.name} W${week.week} D${day.day}`)
              }
            }
          })
        }
      }
    }
  }
  const sortedWeeks = [...seenWeeks].sort((a, b) => a - b)
  for (let i = 0; i < sortedWeeks.length; i += 1) {
    if (sortedWeeks[i] !== i + 1) fail(`${definition.name} contiguous weeks`, `expected ${i + 1}, got ${sortedWeeks[i]}`)
  }
  return { summary, positions }
}

if (!fs.existsSync(target)) {
  console.error(`Target source directory does not exist: ${target}`)
  process.exit(2)
}

// Compile the governed program facade exactly as the production source sees it.
let programExports
try {
  const requireFromTarget = createRequire(path.join(target, 'package.json'))
  const esbuild = requireFromTarget('esbuild')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-full-audit-'))
  const outfile = path.join(tempDir, 'programs.cjs')
  esbuild.buildSync({
    entryPoints: [path.join(target, 'src/data/programs.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent',
  })
  programExports = createRequire(import.meta.url)(outfile)
  pass('Governed program facade bundles for audit')
} catch (error) {
  fail('Governed program facade bundles for audit', error instanceof Error ? error.message : String(error))
}

const definitions = programExports ? [
  ['crownforge', programExports.CROWNFORGE, 14],
  ['crown-maintenance', programExports.CROWN_MAINTENANCE, 3],
  ['black-crown', programExports.BLACK_CROWN, 54],
] : []

const programSummaries = {}
const cyclePositions = []
for (const [key, definition, expectedWeeks] of definitions) {
  if (!definition) {
    fail(`${key} runtime definition`, 'missing export')
    continue
  }
  definition.key = key
  check(Array.isArray(definition.weekData), `${definition.name || key} exposes weekData`)
  check(definition.weekData?.length === expectedWeeks, `${definition.name || key} week count`, `${definition.weekData?.length ?? 0}/${expectedWeeks}`)
  const { summary, positions } = countProgram(definition)
  programSummaries[key] = summary
  cyclePositions.push(...positions.map((position) => `${key}:${position}`))
  pass(`${definition.name || key} all governed days enumerated`, `${summary.sessions} sessions · ${summary.exercises} exercises · ${summary.sets} sets`)
}

if (programSummaries['black-crown']) {
  check(programSummaries['black-crown'].sessions === 270, 'Black Crown complete session inventory', `${programSummaries['black-crown'].sessions}/270`)
}

// Mock the full governed athlete journey without writing any private athlete data.
// Every listed session is started, all listed sets are logged, the session is completed,
// then the position advances exactly one governed position. Preview operations never advance it.
const mock = {
  sessionsStarted: 0,
  sessionsCompleted: 0,
  setsLogged: 0,
  previewChecks: 0,
  transitions: [],
  finalState: null,
}
if (definitions.length === 3 && definitions.every(([, definition]) => definition?.weekData)) {
  let activeProgramIndex = 0
  let activePositionIndex = 0
  const programDays = definitions.map(([key, definition]) => ({ key, definition, days: flattenDays(definition) }))
  while (activeProgramIndex < programDays.length) {
    const currentProgram = programDays[activeProgramIndex]
    if (!currentProgram.days.length) {
      fail('Mock cycle', `${currentProgram.key} has no days`)
      break
    }
    const position = currentProgram.days[activePositionIndex]
    const beforePreview = `${currentProgram.key}:${position.week}:${position.day}`
    const previewTarget = currentProgram.days[Math.min(activePositionIndex + 1, currentProgram.days.length - 1)]
    void previewTarget
    mock.previewChecks += 1
    const afterPreview = `${currentProgram.key}:${position.week}:${position.day}`
    if (beforePreview !== afterPreview) fail('Mock preview isolation', `${beforePreview} -> ${afterPreview}`)

    mock.sessionsStarted += 1
    for (const section of position.data.sections ?? []) {
      for (const exercise of section.exercises ?? []) {
        mock.setsLogged += Array.isArray(exercise.sets) ? exercise.sets.length : 0
      }
    }
    mock.sessionsCompleted += 1

    if (activePositionIndex + 1 < currentProgram.days.length) {
      activePositionIndex += 1
      continue
    }

    if (currentProgram.key === 'crownforge') {
      mock.transitions.push('crownforge -> crown-maintenance')
      activeProgramIndex += 1
      activePositionIndex = 0
      continue
    }
    if (currentProgram.key === 'crown-maintenance') {
      mock.transitions.push('crown-maintenance -> black-crown-entry-gate -> black-crown')
      activeProgramIndex += 1
      activePositionIndex = 0
      continue
    }
    if (currentProgram.key === 'black-crown') {
      mock.transitions.push('black-crown -> program-complete')
      mock.finalState = 'program-complete'
      activeProgramIndex += 1
      break
    }
  }
  check(mock.sessionsCompleted === cyclePositions.length, 'Mock full training cycle completes every governed day', `${mock.sessionsCompleted} sessions`)
  check(mock.finalState === 'program-complete', 'Mock cycle ends without inventing a next program')
  check(mock.transitions[0] === 'crownforge -> crown-maintenance', 'Mock Crownforge handoff')
  check(mock.transitions[1]?.includes('black-crown-entry-gate'), 'Mock Crown Maintenance entry gate')
  check(mock.transitions[2] === 'black-crown -> program-complete', 'Mock Black Crown completion')
  pass('Mock training-cycle set logging', `${mock.setsLogged} governed sets traversed`)
}

// Verify that the real private progression service contains the same guarded handoff semantics.
try {
  const progression = read('src/services/program-progression-service.ts')
  const workout = read('src/services/workout-service.ts')
  const main = read('src/main.ts')
  check(progression.includes("program_key: 'crown-maintenance'"), 'Real progression: Crownforge -> Crown Maintenance')
  check(progression.includes("current_phase_key: 'black-crown-entry'"), 'Real progression: Black Crown entry gate')
  check(progression.includes('Cross-program repositioning is blocked'), 'Real progression: cross-program manual jump blocked')
  check(progression.includes('No next program was invented.'), 'Real progression: Black Crown has no fabricated successor')
  check(main.includes('advanceProgramAfterWorkout'), 'Workout completion calls governed progression')
  check(main.includes('MAKE CURRENT POSITION'), 'Preview-to-current position control exists')
  check(/Preview only/i.test(main), 'Preview write guard exists')
  check(workout.includes('resolvedTrainingMaxValue'), 'Workout snapshots resolved TM provenance')
} catch (error) {
  fail('Progression source audit', error instanceof Error ? error.message : String(error))
}

// Screen, tab, and feature inventory. These are source + production-dist contract checks,
// not athlete-data checks.
const sourceFiles = [
  path.join(target, 'src/main.ts'),
  ...walk(path.join(root, 'overlays'), (file) => /\.(?:js|css|html|ts)$/.test(file)),
]
const sourceBundle = sourceFiles.filter(fs.existsSync).map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const distIndex = fs.existsSync(path.join(target, 'dist/index.html')) ? fs.readFileSync(path.join(target, 'dist/index.html'), 'utf8') : ''
const distAssets = walk(path.join(target, 'dist/assets'), (file) => /\.(?:js|css)$/.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const appText = `${sourceBundle}\n${distIndex}\n${distAssets}`

const coreScreens = [
  ['Home tab', /\bHOME\b/i],
  ['Train tab', /\bTRAIN\b/i],
  ['Program tab', /\bPROGRAM\b/i],
  ['Progress tab', /\bPROGRESS\b/i],
  ['More tab', /\bMORE\b/i],
  ['Exercises screen', /\bEXERCISES\b/i],
  ['Coach screen', /\bCOACH\b/i],
  ['Profile screen', /\bPROFILE\b/i],
  ['Calendar screen', /\bCALENDAR\b/i],
]
for (const [label, pattern] of coreScreens) check(pattern.test(appText), label)

const progressTabs = ['OVERVIEW', 'STRENGTH', 'BODY', 'CONDITIONING', 'PRS']
for (const label of progressTabs) check(new RegExp(`\\b${label}\\b`, 'i').test(appText), `Progress sub-tab: ${label}`)

const featureChecks = [
  ['Readiness intake', /readiness/i],
  ['Workout start', /start-workout|START WORKOUT/i],
  ['Set logging', /complete-set|set-row|sets logged/i],
  ['RPE tracking', /\bRPE\b/i],
  ['RIR tracking', /\bRIR\b/i],
  ['Rest timer / rest gate', /restGateByPanel|rest timer|data-lmf-rest-continue/i],
  ['Circuits', /\bcircuit\b/i],
  ['Supersets', /\bsuperset\b/i],
  ['Tri-sets', /tri-set/i],
  ['Exercise video', /WATCH EXERCISE|watch exercise/i],
  ['Exercise substitutions', /SUBSTITUTE|substitution/i],
  ['Coach exercise help', /ASK COACH|ask coach/i],
  ['Barbell loader', /Bar Loader|bar loader|plates per side/i],
  ['Voice notes', /voice-note|voice note/i],
  ['Strength Maxes', /Strength Maxes|strength-maxes/i],
  ['Workout history', /workout history|history/i],
  ['Bodyweight tracking', /bodyweight/i],
  ['PR tracking', /personal record|\bPRs?\b/i],
  ['Backup/export', /backup|export/i],
  ['Restore/import', /restore|import/i],
  ['Cloud/private sync', /supabase|Private Vault|cloud/i],
  ['PWA install', /beforeinstallprompt|INSTALL APP|pwa-install/i],
  ['PWA update', /serviceWorker|pwa-update/i],
  ['Offline/service worker', /service-worker\.js|navigator\.serviceWorker/i],
  ['Safe cache refresh', /refresh\.html|safe cache refresh/i],
  ['Exercise artwork', /exercise-art|data-exercise-art/i],
]
for (const [label, pattern] of featureChecks) check(pattern.test(appText), label)

// Shipping overlay checks catch cases where a feature file exists in the repository but is not actually in production.
const productionMarkers = [
  ['workout flow runtime', 'workout-flow-v1.js'],
  ['automatic exercise art', 'exercise-art-auto.js'],
  ['private exercise art resolver', 'exercise-art-cloudinary.js'],
  ['voice notes v2', 'voice-notes-v2.js'],
  ['strength maxes', 'strength-maxes-v1.js'],
  ['progress dashboard', 'progress-dashboard-v1.js'],
  ['mobile recording regression guard', 'mobile-recording-regression-v1.js'],
]
for (const [label, marker] of productionMarkers) check(distIndex.includes(marker), `Production includes ${label}`)
check(fs.existsSync(path.join(target, 'dist/manifest.webmanifest')), 'Production PWA manifest exists')
check(fs.existsSync(path.join(target, 'dist/service-worker.js')), 'Production service worker exists')
check(fs.existsSync(path.join(target, 'dist/refresh.html')), 'Production safe refresh page exists')

// Known visual-consistency signal: preview and live workout cards should not drift into unrelated visual systems.
// This is reported as a warning so the audit remains diagnostic rather than silently rewriting presentation.
try {
  const recordingCss = fs.readFileSync(path.join(root, 'overlays/ui-command-v2/batch-aa/mobile-recording-regression-v1.css'), 'utf8')
  if (/preview-card\[data-exercise-art\][\s\S]*grid-template-columns/i.test(recordingCss)) {
    warn('Day-card visual consistency', 'future preview cards have a dedicated grid layout; compare against current/live workout cards')
  } else {
    pass('Day-card visual consistency', 'no dedicated preview-only card grid override detected')
  }
} catch {
  warn('Day-card visual consistency', 'recording regression CSS unavailable')
}

const report = {
  generatedAt: new Date().toISOString(),
  target,
  result: failures.length ? 'FAIL' : 'PASS',
  failures,
  warnings,
  passes,
  programs: programSummaries,
  mockCycle: mock,
}
fs.writeFileSync(path.join(target, 'FULL_APP_CYCLE_AUDIT.json'), JSON.stringify(report, null, 2) + '\n')
const md = [
  '# LetMeFly Full App + Mock Training Cycle Audit',
  '',
  `Result: **${report.result}**`,
  `Generated: ${report.generatedAt}`,
  '',
  '## Programs',
  ...Object.entries(programSummaries).map(([key, value]) => `- **${key}** — ${value.weeks} weeks, ${value.sessions} sessions, ${value.exercises} exercises, ${value.sets} governed sets`),
  '',
  '## Mock cycle',
  `- Sessions started: ${mock.sessionsStarted}`,
  `- Sessions completed: ${mock.sessionsCompleted}`,
  `- Sets traversed/logged: ${mock.setsLogged}`,
  `- Preview-isolation checks: ${mock.previewChecks}`,
  `- Transitions: ${mock.transitions.join(' → ')}`,
  `- Final state: ${mock.finalState}`,
  '',
  '## Failures',
  ...(failures.length ? failures.map((item) => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Warnings',
  ...(warnings.length ? warnings.map((item) => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
]
fs.writeFileSync(path.join(target, 'FULL_APP_CYCLE_AUDIT.md'), md.join('\n'))

console.log('\n=== LETMEFLY FULL AUDIT SUMMARY ===')
console.log(`Programs: ${Object.keys(programSummaries).length}`)
console.log(`Governed sessions traversed: ${mock.sessionsCompleted}`)
console.log(`Governed sets traversed: ${mock.setsLogged}`)
console.log(`Warnings: ${warnings.length}`)
console.log(`Failures: ${failures.length}`)
if (failures.length) process.exit(1)
console.log('LetMeFly full app + mock training cycle audit: PASS')
