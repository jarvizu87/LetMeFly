#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/generate-black-crown-runtime.mjs <target-source-dir>')
  process.exit(2)
}

const sourceDir = path.join(target, 'src/programs/black-crown/source-weeks')
const programDir = path.join(target, 'src/programs/black-crown')
const libraryPath = path.join(target, 'src/data/exercise-library.ts')
const registryPath = path.join(target, 'src/programs/registry.ts')
const rebuildAuditPath = path.join(target, 'scripts/audit-rebuild.mjs')
const architectureAuditPath = path.join(target, 'scripts/audit-program-architecture.mjs')

const slug = (value) => value
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[+/]/g, ' ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

function loadSourceWeek(file) {
  const text = fs.readFileSync(file, 'utf8')
  const marker = text.indexOf('= {')
  const end = text.lastIndexOf('} satisfies BlackCrownSourceWeek')
  if (marker < 0 || end < 0) throw new Error(`Unable to parse ${file}`)
  const literal = text.slice(marker + 2, end + 1)
  return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 })
}

const sourceWeeks = Array.from({ length: 54 }, (_, index) =>
  loadSourceWeek(path.join(sourceDir, `week-${String(index + 1).padStart(2, '0')}.ts`)),
)

const libraryTextOriginal = fs.readFileSync(libraryPath, 'utf8')
const canonicalNames = [...libraryTextOriginal.matchAll(/(?:direct|plan|fallback)\('([^']+)'/g)].map((m) => m[1])
const canonicalByLower = new Map(canonicalNames.map((name) => [name.toLowerCase(), name]))

const manualAliases = new Map(Object.entries({
  'hpc': 'Hang Power Clean',
  'strict ohp': 'Overhead Press',
  'ohp': 'Overhead Press',
  'kb swing': 'Kettlebell Swing',
  'pallof': 'Pallof Press',
  'rear delt': 'Rear Deltoid Fly',
  'rear deltoid': 'Rear Deltoid Fly',
  'external rotation': 'Cable External Rotation',
  'ham curl': 'Hamstring Curl',
  'neutral-grip pulldown': 'Neutral-Grip Lat Pulldown',
  'incline dumbbell press': 'Incline DB Press',
  'incline db press': 'Incline DB Press',
  'med-ball chest pass': 'Medicine Ball Chest Pass',
  'medicine ball chest pass': 'Medicine Ball Chest Pass',
  'trap-3 raise': 'Trap-3 Raise',
  'reverse lunge': 'Reverse Lunge',
  'box jump': 'Box Jump',
  'low box jump': 'Box Jump',
  'broad jump': 'Broad Jump',
  'finger extension': 'Finger Extension',
  'hip airplane': 'Hip Airplane',
  'ankle rocker': 'Ankle Rock',
  '90/90 hip switch': '90/90 Hip Mobility',
  '90/90 hip mobility': '90/90 Hip Mobility',
  'empty bar patterning': 'Empty Bar Patterning',
  'explosive push-up': 'Explosive Push-Up',
  'cable hip-flexor march': 'Cable March',
  'standing cable hip flexor march': 'Cable March',
  'standing cable hip-flexor march': 'Cable March',
  'sorenson hold': 'Sorenson Hold',
  'bird dog hold': 'Bird Dog',
  'prowler push': 'Sled Push',
  'trap-bar carry': 'Farmer Carry',
  'assisted pull-up': 'Pull-Up',
  'scap push-up': 'Scapular Push-Up',
  'glute bridge iso': 'Glute Bridge Isometric Hold',
  'rear delt fly': 'Rear Deltoid Fly',
  'rdl': 'Romanian Deadlift',
  'db curl': 'Dumbbell Curl',
  'cable pressdown': 'Rope Pushdown',
  'front rack carry': 'Kettlebell Front Rack Carry',
  'walking': 'Walking',
  'walk': 'Walking',
  'easy walk': 'Walking',
  'bike': 'Stationary Bike',
  'easy bike': 'Stationary Bike',
  'rower': 'Row',
  'cable march': 'Cable March',
  'chest-supported/kelso shrug': 'Chest-Supported Shrug',
  'kelso shrug': 'Chest-Supported Shrug',
  'trap-3': 'Trap-3 Raise',
}))

const compositeAliases = new Map(Object.entries({
  'pull-up or lat pulldown': 'Pull-Up',
  'assisted pull-up or pull-up': 'Pull-Up',
  'lat pulldown or assisted pull-up': 'Lat Pulldown',
  'chest-supported row or seated cable row': 'Chest-Supported Row',
  'snatch-grip rdl': 'Snatch-Grip RDL',
  'chest-supported dumbbell shrug': 'Chest-Supported Shrug',
  'kelso-style shrug': 'Chest-Supported Shrug',
}))

const searchTerms = [
  ...canonicalNames.map((name) => ({ needle: name.toLowerCase(), canonical: name })),
  ...manualAliases.entries().map(([needle, canonical]) => ({ needle, canonical })),
  ...compositeAliases.entries().map(([needle, canonical]) => ({ needle, canonical })),
].sort((a, b) => b.needle.length - a.needle.length)

function findCanonicalInText(text) {
  const lower = text.toLowerCase()
  let best = null
  for (const item of searchTerms) {
    const index = lower.indexOf(item.needle)
    if (index < 0) continue
    if (!best || index < best.index || (index === best.index && item.needle.length > best.needle.length)) {
      best = { ...item, index }
    }
  }
  return best?.canonical ?? null
}

const narrativeReject = /^(?:rest|quality|placement|order note|stop|choose one|optional|none|no\b|local source|only source|one finisher|lift-specific ramp|set projected|enter made|highest successful|warm-up|easy restoration|leave feeling|weekly roles|deadlift supplies|save yoke|hard pulling|low-fatigue support|recovery primary|one total|development|maintenance microdose|technique quality|controlled|source-local|hand health)/i

function fallbackCandidate(chunk) {
  let candidate = chunk
    .replace(/^(?:CONDITIONAL|OPTIONAL|MANDATORY):\s*/i, '')
    .split(/\s+[—–-]\s+/)[0]
    .trim()
  candidate = candidate.replace(/\s*\([^)]*\)\s*$/, '').trim()
  candidate = candidate.replace(/\s+(?:Technique|Strength Volume|Strength Maintenance|Warm-Up|Primer)$/i, '').trim()
  candidate = candidate.replace(/\s+\d+(?:\s*(?:to|–|-)\s*\d+)?\s*[x×]\s*\d+(?:\s*(?:to|–|-)\s*\d+)?(?:\s*\/\s*\w+)?\s*$/i, '').trim()
  if (!candidate || narrativeReject.test(candidate)) return null
  if (!/[A-Za-z]/.test(candidate) || candidate.length > 64 || candidate.split(/\s+/).length > 9) return null
  if (/^\d/.test(candidate)) return null
  if (/\b(?:minutes?|seconds?|yards?|yd|sets?|reps?|RPE)\b/i.test(candidate)) return null
  return candidate
}

function canonicalize(candidate) {
  if (!candidate) return null
  const lower = candidate.toLowerCase()
  return canonicalByLower.get(lower)
    ?? manualAliases.get(lower)
    ?? compositeAliases.get(lower)
    ?? candidate
}

function loadReferenceFor(name, sourceText) {
  const lower = name.toLowerCase()
  if (/attempt\s*\d/i.test(sourceText) || /projected third/i.test(sourceText)) {
    return `black-crown:test:${slug(name)}:projected-third`
  }
  if (lower.includes('close-grip bench') || lower.includes('bench press')) return 'black-crown:tm:bench-press'
  if (lower.includes('front squat')) return 'black-crown:tm:front-squat'
  if (lower.includes('back squat')) return 'black-crown:tm:back-squat'
  if (lower === 'deadlift' || lower.includes('deadlift ')) return 'black-crown:tm:deadlift'
  if (lower.includes('overhead press')) return 'black-crown:tm:overhead-press'
  if (lower.includes('hang power clean') || lower.includes('power clean') || lower.includes('clean pull')) return 'black-crown:tm:power-clean'
  if (lower.includes('push press')) return 'black-crown:tm:push-press'
  return `black-crown:tm:${slug(name)}`
}

function categoryFor(name, sectionTitle) {
  const lower = name.toLowerCase()
  const section = sectionTitle.toLowerCase()
  if (lower.includes('sled') || lower.includes('prowler')) return 'sled'
  if (lower.includes('carry') || lower.includes('march')) return 'carry'
  if (lower.includes('kettlebell') || lower.startsWith('kb ')) return 'kettlebell'
  if (/pallof|plank|bird dog|dead bug|hollow|sorenson|crunch/.test(lower)) return 'core'
  if (section.includes('warm-up') || section.includes('conditioning / recovery') || section.includes('recovery')) return 'recovery'
  if (section.includes('primer / power') || /jump|clean|explosive|push press/.test(lower)) return 'power'
  if (section.includes('primary')) return 'primary'
  return 'secondary'
}

function parseSetScheme(chunk, name) {
  const sourceText = chunk.trim()
  const percentageMatch = sourceText.match(/(?:@|•)\s*(\d+(?:\.\d+)?)%/) ?? sourceText.match(/\b(\d+(?:\.\d+)?)%\b/)
  const percentage = percentageMatch ? Number(percentageMatch[1]) : undefined
  const rpeMatch = sourceText.match(/\bRPE\s*([0-9]+(?:\.[0-9]+)?(?:\s*[–-]\s*[0-9]+(?:\.[0-9]+)?)?)/i)
  const rirMatch = sourceText.match(/\bRIR\s*([0-9]+(?:\.[0-9]+)?(?:\s*[–-]\s*[0-9]+(?:\.[0-9]+)?)?)/i)
  const attemptMatch = sourceText.match(/Attempt\s+(\d+)/i)

  const countMatch = sourceText.match(/(\d+)(?:\s*(?:to|–|-)\s*(\d+))?\s*[x×]\s*(\d+(?:\s*(?:to|–|-)\s*\d+)?)(?:\s*(?:\/\s*(side|leg)|each\s+(side|leg)))?(?:\s*(yards?|yd|seconds?|secs?|minutes?|mins?|steps?|reps?))?/i)

  const makeSet = (label, reps, unit) => {
    const set = { label, sourceText }
    if (reps !== undefined) set.reps = reps
    if (percentage !== undefined) {
      set.percentage = percentage
      set.loadReference = loadReferenceFor(name, sourceText)
      set.rounding = 'up-5'
    }
    if (rpeMatch) set.rpe = rpeMatch[1].replace(/\s/g, '')
    if (rirMatch) set.rir = rirMatch[1].replace(/\s/g, '')
    if (unit) {
      const normalized = unit.toLowerCase()
      const numeric = String(reps).replace(/\s/g, '')
      if (/yard|yd/.test(normalized)) {
        set.distance = `${numeric} yd`
        delete set.reps
      } else if (/second|sec/.test(normalized)) {
        set.duration = `${numeric} sec`
        delete set.reps
      } else if (/minute|min/.test(normalized)) {
        set.duration = `${numeric} min`
        delete set.reps
      }
    }
    return set
  }

  if (attemptMatch) {
    return [{
      label: `Attempt ${attemptMatch[1]}`,
      loadText: sourceText.split(/\s+[—–]\s+/).slice(1).join(' — ') || 'Governed test attempt',
      loadReference: loadReferenceFor(name, sourceText),
      sourceText,
    }]
  }

  if (countMatch) {
    const minSets = Number(countMatch[1])
    const maxSets = countMatch[2] ? Number(countMatch[2]) : minSets
    let reps = countMatch[3].replace(/\s*(?:to|–)\s*/g, '-')
    const side = countMatch[4] || countMatch[5]
    if (side) reps = `${reps}/${side}`
    const unit = countMatch[6]
    if (minSets === maxSets && minSets <= 10) {
      return Array.from({ length: minSets }, (_, i) => makeSet(`Set ${i + 1}`, reps, unit))
    }
    return [makeSet(`${minSets}-${maxSets} sets`, reps, unit)]
  }

  const easySetMatch = sourceText.match(/(\d+)\s*[–-]\s*(\d+)\s+(?:easy\s+)?sets?\s+(?:of\s+)?(\d+)/i)
  if (easySetMatch) {
    return [makeSet(`${easySetMatch[1]}-${easySetMatch[2]} sets`, easySetMatch[3])]
  }

  const durationMatch = sourceText.match(/\b(\d+(?:\s*(?:to|–|-)\s*\d+)?)\s*(minutes?|mins?|seconds?|secs?)(?:\s+easy)?\b/i)
  if (durationMatch) {
    const duration = durationMatch[1].replace(/\s*(?:to|–)\s*/g, '-')
    return [makeSet('Duration', duration, durationMatch[2])]
  }

  if (percentage !== undefined) {
    return [makeSet('Percentage work', undefined)]
  }

  if (/projected third|MAXES before test day/i.test(sourceText)) {
    return [{
      label: 'Test setup',
      loadText: 'Set projected third on MAXES before test day',
      loadReference: loadReferenceFor(name, sourceText),
      sourceText,
    }]
  }

  return []
}

function restFromPrescription(prescription) {
  const match = prescription.match(/Rest\s*[-–—:]\s*([^\n]+)/i)
  return match ? match[1].trim() : undefined
}

const generatedFallbacks = new Set()
const sourceSectionRecords = []
let exerciseCount = 0
let setCount = 0
let percentageSetCount = 0
let strictOhpCount = 0

function parseSection(sourceWeek, sourceDay, section, sectionIndex) {
  const exercises = []
  const byName = new Map()
  const sectionRest = restFromPrescription(section.prescription)
  let currentName = null

  const ensureExercise = (name, sourceFragment) => {
    const canonical = canonicalize(name)
    if (!canonical) return null
    if (!canonicalByLower.has(canonical.toLowerCase())) generatedFallbacks.add(canonical)
    const key = canonical.toLowerCase()
    if (!byName.has(key)) {
      const exercise = {
        id: `bc-w${String(sourceWeek.week).padStart(2, '0')}-d${sourceDay.day}-s${sectionIndex + 1}-${slug(canonical)}`,
        name: canonical,
        category: categoryFor(canonical, section.title),
        priority: section.priority,
        sets: [],
        notes: sourceFragment,
        coaching: `Black Crown v2.0 source section ${section.ordinal}: ${section.title}`,
        videoQuery: `${canonical} exercise tutorial`,
      }
      if (sectionRest) exercise.rest = sectionRest
      byName.set(key, exercise)
      exercises.push(exercise)
      exerciseCount += 1
    }
    return byName.get(key)
  }

  if (/PRIMARY\s+[—–-]\s+STRICT OHP/i.test(section.title)) {
    currentName = 'Overhead Press'
    strictOhpCount += 1
    const exercise = ensureExercise(currentName, section.prescription)
    const sets = parseSetScheme(section.prescription, currentName)
    exercise.sets.push(...sets)
    setCount += sets.length
    percentageSetCount += sets.filter((set) => set.percentage !== undefined).length
  } else {
    const lines = section.prescription.split(/\n/)
    for (const line of lines) {
      const chunks = line.split(/\s+\+\s+|;\s+/).map((item) => item.trim()).filter(Boolean)
      for (const chunk of chunks) {
        if (/^Rest\s*[-–—:]/i.test(chunk)) continue
        const matched = findCanonicalInText(chunk)
        const hasScheme = /(\d+)(?:\s*(?:to|–|-)\s*\d+)?\s*[x×]\s*\d+|Attempt\s+\d+|\b\d+(?:\.\d+)?%\b|projected third/i.test(chunk)
        let name = matched
        if (!name && hasScheme) name = fallbackCandidate(chunk)
        if (name) currentName = canonicalize(name)

        if (!currentName) continue
        const sets = parseSetScheme(chunk, currentName)
        if (!sets.length) continue
        const exercise = ensureExercise(currentName, chunk)
        if (!exercise) continue
        exercise.sets.push(...sets)
        exercise.notes = exercise.notes === chunk ? chunk : `${exercise.notes}\n${chunk}`
        setCount += sets.length
        percentageSetCount += sets.filter((set) => set.percentage !== undefined).length
      }
    }
  }

  sourceSectionRecords.push({
    week: sourceWeek.week,
    day: sourceDay.day,
    ordinal: section.ordinal,
    title: section.title,
    priority: section.priority,
    prescription: section.prescription,
    exerciseCount: exercises.length,
  })

  return {
    id: `bc-w${String(sourceWeek.week).padStart(2, '0')}-d${sourceDay.day}-s${sectionIndex + 1}`,
    title: `${section.ordinal}. ${section.title}`,
    subtitle: section.prescription,
    exercises,
  }
}

const runtimeWeeks = sourceWeeks.map((sourceWeek) => ({
  week: sourceWeek.week,
  intent: sourceWeek.title,
  days: sourceWeek.days.map((sourceDay) => ({
    day: sourceDay.day,
    title: sourceDay.title,
    role: sourceDay.role,
    readinessRule: `Black Crown v2.0 — ${sourceDay.status}. Protect mandatory work; remove optional work first, then conditional work, within the program's readiness rules.`,
    cutOrder: 'Optional → Conditional → Mandatory only when a governed readiness/test rule explicitly permits it.',
    sections: sourceDay.sections.map((section, index) => parseSection(sourceWeek, sourceDay, section, index)),
  })),
}))

function ts(value, indent = 0) {
  return JSON.stringify(value, null, 2)
    .replace(/"([^"\\]+)":/g, '$1:')
    .replace(/"(mandatory|conditional|optional|primary|secondary|power|kettlebell|sled|core|carry|recovery)"/g, "'$1'")
}

const weeksTs = `import type { ProgramWeek } from '../../program-engine/types'\n\n// Generated deterministically from the hash-audited Black Crown Revised v2.0 source weeks.\n// Do not hand-edit prescriptions here; update the canonical source transport and regenerate.\nexport const BLACK_CROWN_WEEKS: ProgramWeek[] = ${ts(runtimeWeeks)}\n`
fs.writeFileSync(path.join(programDir, 'weeks.ts'), weeksTs)

const blocks = [
  ['foundation-re-entry', 1, 6, 'Foundation / Re-Entry'],
  ['strength-accumulation', 7, 12, 'Strength Accumulation / Intensification'],
  ['strength-peak', 13, 18, 'Strength Peak / Intensification'],
  ['strength-consolidation', 19, 24, 'Strength Consolidation / Rebuild'],
  ['powerbuilding-yoke', 25, 30, 'Powerbuilding / Weak-Point Accumulation + Yoke'],
  ['specificity-bridge', 31, 36, 'Strength Intensification / Specificity Bridge'],
  ['crazy-ivan-rebuild', 37, 42, 'Crazy Ivan Controlled Rebuild / Armor Density'],
  ['post-realization-rebuild', 43, 48, 'Post-Realization Rebuild / Armor Accumulation'],
  ['final-realization', 49, 54, 'Final Realization / Maintenance Accessory'],
]

fs.writeFileSync(path.join(programDir, 'metadata.ts'), `import type { PublicProgramDefinition } from '../../program-engine/types'\n\nexport const BLACK_CROWN_METADATA = {\n  key: 'black-crown',\n  name: 'Black Crown Revised',\n  version: 'v2.0',\n  sourceEngine: 'Black Crown Revised v2.0 / Stage-5A production source',\n  description: '54-week strength, powerbuilding, athletic-development, and realization system with governed TM calibration, readiness, Olympic derivatives, kettlebells, sleds, carries, and weak-point work.',\n  weeks: 54,\n  trainingDaysPerWeek: 5,\n  status: 'active-source',\n} satisfies Omit<PublicProgramDefinition, 'sourceNotes' | 'weekData'>\n\nexport const BLACK_CROWN_BLOCKS = ${JSON.stringify(blocks.map(([key, startWeek, endWeek, title]) => ({ key, startWeek, endWeek, title })), null, 2).replace(/"([^"\\]+)":/g, '$1:')} as const\n\n// Compatibility export for older consumers. Canonical v2.0 governance uses nine six-week blocks.\nexport const BLACK_CROWN_PHASES = BLACK_CROWN_BLOCKS\n`)

fs.writeFileSync(path.join(programDir, 'rules.ts'), `export const BLACK_CROWN_SOURCE_NOTES = [\n  'Canonical runtime source: Black Crown Revised v2.0, 54 weeks / 270 sessions / nine six-week blocks.',\n  'Normal Block 1 entry is 90% of verified Crownforge 1RM, lift by lift; 87.5% is protective Yellow entry only; Red delays entry.',\n  'Percentage/TM prescriptions are loading authority. Selected TMs round to the nearest 5 lb; percentage work rounds up to the nearest 5 lb.',\n  'Strict OHP is a governed replacement/microdose, not an added training day; protected test/check/opener weeks remove it.',\n  'Mandatory work is protected. Readiness reductions remove Optional work first, then Conditional work, and never silently rewrite the public program.',\n  'Athlete calendar dates, current TMs, rendered pound loads, history, readiness, and workout results belong to private athlete data.',\n] as const\n`)

fs.writeFileSync(path.join(programDir, 'index.ts'), `import type { PublicProgramDefinition } from '../../program-engine/types'\nimport { BLACK_CROWN_METADATA } from './metadata'\nimport { BLACK_CROWN_SOURCE_NOTES } from './rules'\nimport { BLACK_CROWN_WEEKS } from './weeks'\n\nexport const BLACK_CROWN: PublicProgramDefinition = {\n  ...BLACK_CROWN_METADATA,\n  sourceNotes: [...BLACK_CROWN_SOURCE_NOTES],\n  weekData: BLACK_CROWN_WEEKS,\n}\n\nexport { BLACK_CROWN_METADATA, BLACK_CROWN_BLOCKS, BLACK_CROWN_PHASES } from './metadata'\nexport { BLACK_CROWN_SOURCE_NOTES } from './rules'\nexport { BLACK_CROWN_WEEKS } from './weeks'\n`)

// Add narrowly scoped fallback records only for exercise-like names discovered in
// canonical Black Crown source. Existing library records always win.
const missingFallbacks = [...generatedFallbacks]
  .filter((name) => !canonicalByLower.has(name.toLowerCase()))
  .filter((name) => !narrativeReject.test(name))
  .sort((a, b) => a.localeCompare(b))

let libraryText = libraryTextOriginal
const insertMarker = ']\n\nconst COMPOSITE_MATCHES'
if (!libraryText.includes(insertMarker)) throw new Error('Exercise library insertion marker not found')
if (missingFallbacks.length) {
  const rows = missingFallbacks.map((name) =>
    `  fallback('${name.replace(/'/g, "\\'")}', 'https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise tutorial`)}', ['Black Crown']),`,
  ).join('\n')
  libraryText = libraryText.replace(insertMarker, `${rows}\n]\n\nconst COMPOSITE_MATCHES`)
}
fs.writeFileSync(libraryPath, libraryText)

// Registry gets generic/Black Crown lookup only. Calendar lookup remains on the
// dated Crownforge/Maintenance packages because Black Crown dates are private.
let registry = fs.readFileSync(registryPath, 'utf8')
const registryNeedle = `export function getProgram(key: PublicProgramKey) {\n  return PROGRAMS.find((program) => program.key === key) ?? null\n}\n`
if (!registry.includes(registryNeedle)) throw new Error('Registry insertion point not found')
if (!registry.includes('getProgramWeek(key: PublicProgramKey')) {
  registry = registry.replace(registryNeedle, `${registryNeedle}\nexport function getProgramWeek(key: PublicProgramKey, week: number): ProgramWeek | null {\n  return getProgram(key)?.weekData.find((item) => item.week === week) ?? null\n}\n\nexport function getProgramDay(key: PublicProgramKey, week: number, day: number): ProgramDay | null {\n  return getProgramWeek(key, week)?.days.find((item) => item.day === day) ?? null\n}\n\nexport function getBlackCrownWeek(week: number): ProgramWeek | null {\n  return getProgramWeek('black-crown', week)\n}\n\nexport function getBlackCrownDay(week: number, day: number): ProgramDay | null {\n  return getProgramDay('black-crown', week, day)\n}\n`)
}
fs.writeFileSync(registryPath, registry)

// Update architecture guards from the old placeholder expectation to the now
// completed governed v2.0 package.
let rebuildAudit = fs.readFileSync(rebuildAuditPath, 'utf8')
rebuildAudit = rebuildAudit
  .replace(`assert(blackCrownMetadata.includes("status: 'catalog-only'"), 'Black Crown must remain catalog-only until full source import')`, `assert(blackCrownMetadata.includes("status: 'active-source'"), 'Black Crown must be active-source after governed v2.0 import')`)
  .replace(`blackCrown: 'catalog-only',`, `blackCrown: 'active-source-54-weeks',`)
fs.writeFileSync(rebuildAuditPath, rebuildAudit)

let architectureAudit = fs.readFileSync(architectureAuditPath, 'utf8')
architectureAudit = architectureAudit
  .replace(`check(blackCrown.includes('weekData: []'), 'Black Crown package must remain catalog-only until full governed source import')`, `check(blackCrown.includes('weekData: BLACK_CROWN_WEEKS'), 'Black Crown package must expose governed runtime week data')`)
  .replace(`check(blackCrownMetadata.includes("status: 'catalog-only'"), 'Black Crown metadata must remain catalog-only')`, `check(blackCrownMetadata.includes("status: 'active-source'"), 'Black Crown metadata must be active-source')`)
  .replace(`activePackages: ['crownforge', 'crown-maintenance'],\n  catalogPackages: ['black-crown'],`, `activePackages: ['crownforge', 'crown-maintenance', 'black-crown'],\n  catalogPackages: [],`)
fs.writeFileSync(architectureAuditPath, architectureAudit)

const sectionDigest = crypto.createHash('sha256')
  .update(sourceSectionRecords.map((row) => `${row.week}|${row.day}|${row.ordinal}|${row.title}|${row.priority}|${row.prescription}`).join('\n'))
  .digest('hex')

const audit = {
  version: 'Black Crown Revised v2.0',
  weeks: runtimeWeeks.length,
  sessions: runtimeWeeks.reduce((sum, week) => sum + week.days.length, 0),
  sourceSections: sourceSectionRecords.length,
  parsedExercises: exerciseCount,
  parsedSets: setCount,
  percentageSets: percentageSetCount,
  strictOhpExposures: strictOhpCount,
  generatedExerciseFallbacks: missingFallbacks,
  sourceSectionDigest: sectionDigest,
  sourceWeekHashes: sourceWeeks.map((week) => week.sourceHash),
}
fs.writeFileSync(path.join(target, 'BLACK_CROWN_RUNTIME_AUDIT.json'), JSON.stringify(audit, null, 2) + '\n')

console.log(JSON.stringify({ result: 'PASS', ...audit }, null, 2))
