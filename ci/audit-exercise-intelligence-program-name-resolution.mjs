#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.resolve(process.argv[2] || path.join(root, '.build-src', 'letmefly_app'))
const dataPath = path.join(target, 'dist', 'data', 'exercise-intelligence-v1.json')
const jsonOut = path.join(target, 'EXERCISE_INTELLIGENCE_NAME_RESOLUTION_AUDIT.json')
const mdOut = path.join(target, 'EXERCISE_INTELLIGENCE_NAME_RESOLUTION_AUDIT.md')

const fail = (message) => {
  console.error(`FAIL  ${message}`)
  process.exitCode = 1
}
const pass = (message) => console.log(`PASS  ${message}`)

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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

if (!fs.existsSync(target)) {
  console.error(`Target source directory does not exist: ${target}`)
  process.exit(2)
}
if (!fs.existsSync(dataPath)) {
  console.error(`Exercise Intelligence production data does not exist: ${dataPath}`)
  process.exit(2)
}

const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
if (payload.schemaVersion !== '1.3-program-name-coverage') {
  throw new Error(`Program-name audit requires schema 1.3-program-name-coverage, got ${payload.schemaVersion}`)
}
if (payload.counts?.exercises !== 112 || payload.counts?.substitutionRules !== 27) {
  throw new Error(`Program-name audit requires 112/27 Exercise Intelligence, got ${payload.counts?.exercises}/${payload.counts?.substitutionRules}`)
}
if (!Array.isArray(payload.exercises) || payload.exercises.length !== 112) {
  throw new Error('Program-name audit requires the complete 112-record Exercise Intelligence payload')
}

const compoundNames = Array.isArray(payload.compoundProgramDisplayNames)
  ? [...payload.compoundProgramDisplayNames]
  : []
const controlNames = Array.isArray(payload.programControlDisplayNames)
  ? [...payload.programControlDisplayNames]
  : []
const compoundSet = new Set(compoundNames)
const controlSet = new Set(controlNames)
if (compoundNames.length !== 20 || compoundSet.size !== 20) {
  throw new Error(`Expected 20 governed choice/ambiguity labels, got ${compoundNames.length}/${compoundSet.size}`)
}
if (controlNames.length !== 7 || controlSet.size !== 7) {
  throw new Error(`Expected 7 governed program-control/rest labels, got ${controlNames.length}/${controlSet.size}`)
}
const overlappingGovernance = compoundNames.filter((name) => controlSet.has(name))
if (overlappingGovernance.length) {
  throw new Error(`Program-owned labels overlap choice/control categories: ${overlappingGovernance.join(' | ')}`)
}

let programExports
try {
  const viteBin = path.join(target, 'node_modules', '.bin', 'vite')
  if (!fs.existsSync(viteBin)) throw new Error('production Vite executable is missing')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-ei-name-resolution-'))
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
  programExports = await import(`${pathToFileURL(entry).href}?audit=${Date.now()}`)
  pass('Governed program facade loaded through production Vite toolchain')
} catch (error) {
  throw new Error(`Unable to load governed programs: ${error instanceof Error ? error.message : String(error)}`)
}

const programs = [
  ['crownforge', programExports.CROWNFORGE],
  ['crown-maintenance', programExports.CROWN_MAINTENANCE],
  ['black-crown', programExports.BLACK_CROWN],
]
for (const [key, definition] of programs) {
  if (!definition?.weekData) throw new Error(`Missing governed program export: ${key}`)
}

const byId = new Map()
const byIdentity = new Map()
for (const exercise of payload.exercises) {
  byId.set(String(exercise.id), exercise)
  for (const value of [exercise.canonicalName, ...(exercise.aliases || [])]) {
    const key = normalize(value)
    if (key) byIdentity.set(key, exercise)
  }
}
const resolve = (name) => byId.get(name) || byIdentity.get(normalize(name)) || null

for (const name of [...compoundNames, ...controlNames]) {
  const resolved = resolve(name)
  if (resolved) {
    throw new Error(`Program-owned label unexpectedly resolves as canonical Exercise Intelligence: ${name} -> ${resolved.id}`)
  }
}

const requiredFinalMovementMap = new Map([
  ['Cable Pull-Through', 'cable-pull-through'],
  ['Pause Bench Press', 'pause-bench-press'],
  ['Hip Opener', 'hip-opener'],
  ['Relaxed Breathing', 'relaxed-breathing'],
])
for (const [name, expectedId] of requiredFinalMovementMap) {
  const resolved = resolve(name)
  if (resolved?.id !== expectedId) {
    throw new Error(`Final movement resolution mismatch: ${name} -> ${resolved?.id || 'unresolved'} (expected ${expectedId})`)
  }
}

const occurrences = []
for (const [programKey, definition] of programs) {
  for (const week of definition.weekData || []) {
    for (const day of week.days || []) {
      for (const section of day.sections || []) {
        for (const exercise of section.exercises || []) {
          const name = String(exercise?.name || '').trim()
          if (!name) continue
          const resolved = resolve(name)
          const category = resolved
            ? 'exercise-intelligence'
            : compoundSet.has(name)
              ? 'program-owned-choice'
              : controlSet.has(name)
                ? 'program-control-rest'
                : 'unclassified'
          occurrences.push({
            programKey,
            week: week.week,
            day: day.day,
            section: String(section.title || ''),
            name,
            category,
            resolvedExerciseId: resolved?.id || null,
            resolvedCanonicalName: resolved?.canonicalName || null,
          })
        }
      }
    }
  }
}

const uniqueNames = [...new Set(occurrences.map((item) => item.name))].sort((a, b) => a.localeCompare(b))
const categories = Object.fromEntries(uniqueNames.map((name) => {
  const resolved = resolve(name)
  return [name, resolved
    ? 'exercise-intelligence'
    : compoundSet.has(name)
      ? 'program-owned-choice'
      : controlSet.has(name)
        ? 'program-control-rest'
        : 'unclassified']
}))
const resolvedNames = uniqueNames.filter((name) => categories[name] === 'exercise-intelligence')
const choiceNamesInProgram = uniqueNames.filter((name) => categories[name] === 'program-owned-choice')
const controlNamesInProgram = uniqueNames.filter((name) => categories[name] === 'program-control-rest')
const unclassifiedNames = uniqueNames.filter((name) => categories[name] === 'unclassified')
const staleChoices = compoundNames.filter((name) => !uniqueNames.includes(name))
const staleControls = controlNames.filter((name) => !uniqueNames.includes(name))

const programSummary = Object.fromEntries(programs.map(([programKey]) => {
  const rows = occurrences.filter((item) => item.programKey === programKey)
  const names = [...new Set(rows.map((item) => item.name))]
  return [programKey, {
    occurrences: rows.length,
    uniqueNames: names.length,
    resolvedCanonical: names.filter((name) => categories[name] === 'exercise-intelligence').length,
    governedChoiceLabels: names.filter((name) => categories[name] === 'program-owned-choice').length,
    governedControlRestLabels: names.filter((name) => categories[name] === 'program-control-rest').length,
    unclassified: names.filter((name) => categories[name] === 'unclassified').length,
  }]
}))

const clean = unclassifiedNames.length === 0 && staleChoices.length === 0 && staleControls.length === 0
const report = {
  schemaVersion: 'lmf.exercise-intelligence.program-name-resolution.v2',
  exerciseIntelligence: {
    schemaVersion: payload.schemaVersion,
    exercises: payload.counts.exercises,
    substitutionRules: payload.counts.substitutionRules,
  },
  totals: {
    occurrences: occurrences.length,
    uniqueProgramLabels: uniqueNames.length,
    resolvedCanonicalNames: resolvedNames.length,
    governedChoiceLabels: choiceNamesInProgram.length,
    governedControlRestLabels: controlNamesInProgram.length,
    unclassified: unclassifiedNames.length,
    staleChoiceDeclarations: staleChoices.length,
    staleControlDeclarations: staleControls.length,
  },
  programs: programSummary,
  governedChoiceNames: compoundNames,
  governedControlRestNames: controlNames,
  unclassifiedNames,
  staleChoices,
  staleControls,
  finalMovementResolution: Object.fromEntries([...requiredFinalMovementMap].map(([name]) => [name, resolve(name)?.id || null])),
  status: clean ? 'PASS' : 'FAIL',
}

fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n')
const md = [
  '# LetMeFly Exercise Intelligence Program-Name Resolution Audit',
  '',
  `Status: **${report.status}**`,
  '',
  `- Exercise Intelligence: ${payload.counts.exercises} exercises / ${payload.counts.substitutionRules} substitution rules`,
  `- Program label occurrences: ${report.totals.occurrences}`,
  `- Unique governed program labels: ${report.totals.uniqueProgramLabels}`,
  `- Canonical/alias-resolved exercise labels: ${report.totals.resolvedCanonicalNames}`,
  `- Program-owned choice/ambiguity labels: ${report.totals.governedChoiceLabels}`,
  `- Program-control/rest labels: ${report.totals.governedControlRestLabels}`,
  `- Unclassified labels: ${report.totals.unclassified}`,
  '',
  '## Final canonical movement gaps closed',
  ...[...requiredFinalMovementMap].map(([name, id]) => `- ${name} → ${id}`),
  '',
  '## Program-owned choice/ambiguity labels',
  ...compoundNames.map((name) => `- ${name}`),
  '',
  '## Program-control/rest labels',
  ...controlNames.map((name) => `- ${name}`),
  '',
  '## Program summary',
  ...Object.entries(programSummary).map(([key, value]) => `- ${key}: ${value.occurrences} occurrences · ${value.uniqueNames} unique · ${value.resolvedCanonical} canonical · ${value.governedChoiceLabels} choice · ${value.governedControlRestLabels} control/rest · ${value.unclassified} unclassified`),
  '',
]
fs.writeFileSync(mdOut, md.join('\n'))

if (unclassifiedNames.length) fail(`Unclassified governed program labels: ${unclassifiedNames.join(' | ')}`)
else pass('Every governed program label has exactly one valid Exercise Intelligence/program-owned classification')

if (staleChoices.length) fail(`Stale choice/ambiguity declarations: ${staleChoices.join(' | ')}`)
else pass('All 20 program-owned choice/ambiguity labels are live and intentionally non-canonical')

if (staleControls.length) fail(`Stale program-control/rest declarations: ${staleControls.join(' | ')}`)
else pass('All 7 program-control/rest labels are live and intentionally non-canonical')

if (!process.exitCode) {
  pass(`Program-name resolution complete: ${resolvedNames.length} canonical + ${choiceNamesInProgram.length} choice + ${controlNamesInProgram.length} control/rest = ${uniqueNames.length} unique labels`)
}
