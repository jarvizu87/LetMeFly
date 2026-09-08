#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/audit-black-crown-runtime.mjs <target-source-dir>')
  process.exit(2)
}

const read = (rel) => fs.readFileSync(path.join(target, rel), 'utf8')
const fail = (message) => {
  console.error(`Black Crown runtime audit: FAIL — ${message}`)
  process.exit(1)
}

const auditPath = path.join(target, 'BLACK_CROWN_RUNTIME_AUDIT.json')
if (!fs.existsSync(auditPath)) fail('runtime audit manifest was not generated')
const generatedAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

function parseSourceWeek(week) {
  const text = read(`src/programs/black-crown/source-weeks/week-${String(week).padStart(2, '0')}.ts`)
  const marker = text.indexOf('= {')
  const end = text.lastIndexOf('} satisfies BlackCrownSourceWeek')
  if (marker < 0 || end < 0) fail(`cannot parse source week ${week}`)
  return vm.runInNewContext(`(${text.slice(marker + 2, end + 1)})`, Object.create(null), { timeout: 1000 })
}

function parseRuntimeWeeks() {
  const text = read('src/programs/black-crown/weeks.ts')
  const marker = text.indexOf('= [')
  const end = text.lastIndexOf(']\n')
  if (marker < 0 || end < 0) fail('cannot parse generated runtime weeks')
  return vm.runInNewContext(`(${text.slice(marker + 2, end + 1)})`, Object.create(null), { timeout: 2000 })
}

const sourceWeeks = Array.from({ length: 54 }, (_, i) => parseSourceWeek(i + 1))
const weeks = parseRuntimeWeeks()
if (!Array.isArray(weeks) || weeks.length !== 54) fail(`runtime week count is ${weeks?.length}, expected 54`)

const expectedBlockTitles = [
  'Foundation / Re-Entry',
  'Strength Accumulation / Intensification',
  'Strength Peak / Intensification',
  'Strength Consolidation / Rebuild',
  'Powerbuilding / Weak-Point Accumulation + Yoke',
  'Strength Intensification / Specificity Bridge',
  'Crazy Ivan Controlled Rebuild / Armor Density',
  'Post-Realization Rebuild / Armor Accumulation',
  'Final Realization / Maintenance Accessory',
]

let sessions = 0
let runtimeSections = 0
let sourceSections = 0
let exerciseCount = 0
let setCount = 0
let percentageSets = 0
let strictOhpExposures = 0
const priorities = new Set()
const runtimeNames = new Set()
const sectionDigestRows = []

const protectedStatuses = new Map([
  [12, 'VERIFIED 1RM TEST'],
  [18, 'NON-MAX CHECK'],
  [24, 'VERIFIED 1RM TEST'],
  [30, 'NON-MAX CHECK'],
  [36, 'VERIFIED 1RM TEST'],
  [42, 'NON-MAX CHECK'],
  [48, 'OPENER REHEARSAL'],
  [54, 'VERIFIED EXIT TEST'],
])

for (let i = 0; i < 54; i += 1) {
  const source = sourceWeeks[i]
  const runtime = weeks[i]
  const week = i + 1
  if (runtime.week !== week) fail(`runtime week ${week} has week=${runtime.week}`)
  if (runtime.intent !== source.title) fail(`week ${week} intent does not preserve source block title`)
  if (runtime.start !== undefined || runtime.end !== undefined) fail(`week ${week} exposes public calendar boundaries`)
  if (!Array.isArray(runtime.days) || runtime.days.length !== 5) fail(`week ${week} does not have exactly five sessions`)
  sessions += runtime.days.length

  const expectedBlockTitle = expectedBlockTitles[Math.floor(i / 6)]
  if (source.title !== expectedBlockTitle) fail(`week ${week} source block title drift: ${source.title}`)

  const expectedStatus = protectedStatuses.get(week)
  for (let d = 0; d < 5; d += 1) {
    const sourceDay = source.days[d]
    const runtimeDay = runtime.days[d]
    if (runtimeDay.day !== sourceDay.day) fail(`week ${week} day ${d + 1} day number drift`)
    if (runtimeDay.title !== sourceDay.title) fail(`week ${week} day ${d + 1} title drift`)
    if (runtimeDay.role !== sourceDay.role) fail(`week ${week} day ${d + 1} role drift`)
    if (runtimeDay.date !== undefined) fail(`week ${week} day ${d + 1} exposes a public calendar date`)
    if (!runtimeDay.readinessRule.includes(sourceDay.status)) fail(`week ${week} day ${d + 1} lost source status ${sourceDay.status}`)
    if (expectedStatus && !runtimeDay.readinessRule.includes(expectedStatus)) fail(`week ${week} protected status ${expectedStatus} missing`)
    if (!Array.isArray(runtimeDay.sections) || runtimeDay.sections.length !== sourceDay.sections.length) {
      fail(`week ${week} day ${d + 1} section count drift`)
    }

    for (let s = 0; s < sourceDay.sections.length; s += 1) {
      const sourceSection = sourceDay.sections[s]
      const runtimeSection = runtimeDay.sections[s]
      sourceSections += 1
      runtimeSections += 1
      priorities.add(sourceSection.priority)
      if (runtimeSection.subtitle !== sourceSection.prescription) fail(`week ${week} day ${d + 1} section ${s + 1} lost exact source prescription`)
      if (!runtimeSection.title.includes(sourceSection.ordinal) || !runtimeSection.title.includes(sourceSection.title)) {
        fail(`week ${week} day ${d + 1} section ${s + 1} title/ordinal drift`)
      }
      sectionDigestRows.push(`${week}|${sourceDay.day}|${sourceSection.ordinal}|${sourceSection.title}|${sourceSection.priority}|${sourceSection.prescription}`)

      for (const exercise of runtimeSection.exercises ?? []) {
        exerciseCount += 1
        runtimeNames.add(exercise.name)
        if (exercise.priority !== sourceSection.priority) fail(`week ${week} exercise ${exercise.name} priority drift`)
        if (exercise.name === 'Overhead Press' && /STRICT OHP/i.test(sourceSection.title)) strictOhpExposures += 1
        for (const set of exercise.sets ?? []) {
          setCount += 1
          if (set.percentage !== undefined) {
            percentageSets += 1
            if (set.rounding !== 'up-5') fail(`week ${week} ${exercise.name} percentage set is not up-5 rounded`)
            if (!set.loadReference || !String(set.loadReference).startsWith('black-crown:')) {
              fail(`week ${week} ${exercise.name} percentage set lacks governed Black Crown load reference`)
            }
          }
          const setText = JSON.stringify(set)
          if (/\b20\d\d-\d\d-\d\d\b/.test(setText)) fail(`week ${week} set contains public calendar date`)
          if (/(?:@|•)\s*\d+(?:\.\d+)?%\s*\(\s*\d{2,3}(?:\.\d+)?\s*\)/.test(setText)) fail(`week ${week} set contains athlete-derived rendered pound load`)
        }
      }
    }
  }
}

if (sessions !== 270) fail(`session count ${sessions} != 270`)
if (sourceSections !== runtimeSections) fail(`source/runtime section parity failed (${sourceSections}/${runtimeSections})`)
if (strictOhpExposures !== 42) fail(`Strict OHP runtime exposure count ${strictOhpExposures} != 42`)
for (const priority of ['mandatory', 'conditional', 'optional']) {
  if (!priorities.has(priority)) fail(`runtime source never preserves ${priority} priority`)
}

const sectionDigest = crypto.createHash('sha256').update(sectionDigestRows.join('\n')).digest('hex')
if (sectionDigest !== generatedAudit.sourceSectionDigest) fail('runtime/source section digest mismatch')
if (generatedAudit.weeks !== 54 || generatedAudit.sessions !== 270) fail('generated runtime manifest totals are wrong')
if (generatedAudit.strictOhpExposures !== 42) fail('generated runtime manifest OHP count is wrong')

const metadata = read('src/programs/black-crown/metadata.ts')
const index = read('src/programs/black-crown/index.ts')
const registry = read('src/programs/registry.ts')
const facade = read('src/data/programs.ts')
const library = read('src/data/exercise-library.ts')
if (!metadata.includes("status: 'active-source'")) fail('Black Crown metadata is not active-source')
if (!metadata.includes('BLACK_CROWN_BLOCKS')) fail('canonical nine-block metadata missing')
for (const title of expectedBlockTitles) if (!metadata.includes(title)) fail(`metadata missing block title ${title}`)
if (!index.includes('weekData: BLACK_CROWN_WEEKS')) fail('Black Crown package entrypoint does not expose runtime weeks')
if (!registry.includes("getProgramWeek(key: PublicProgramKey")) fail('generic program week lookup missing')
if (!registry.includes("getBlackCrownDay")) fail('Black Crown day lookup missing')
if (/prescription:|sets:\s*\[|percentage:/.test(registry)) fail('registry contains workout prescriptions')
if (/prescription:|sets:\s*\[|percentage:/.test(facade)) fail('compatibility facade contains workout prescriptions')

const libraryNames = new Set([...library.matchAll(/(?:direct|plan|fallback)\('([^']+)'/g)].map((m) => m[1].toLowerCase()))
const unresolved = [...runtimeNames].filter((name) => !libraryNames.has(name.toLowerCase()))
if (unresolved.length) fail(`exercise-library resolution failed: ${unresolved.join(', ')}`)

console.log(JSON.stringify({
  result: 'PASS',
  weeks: 54,
  sessions,
  sourceSections,
  parsedExercises: exerciseCount,
  parsedSets: setCount,
  percentageSets,
  strictOhpExposures,
  exerciseNames: runtimeNames.size,
  generatedExerciseFallbacks: generatedAudit.generatedExerciseFallbacks.length,
  sourceSectionDigest: sectionDigest,
  calendarDatesInPublicBlackCrown: 0,
  athleteDerivedRenderedLoads: 0,
}, null, 2))
