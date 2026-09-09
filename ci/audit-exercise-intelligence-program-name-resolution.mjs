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
if (payload.schemaVersion !== '1.2-active-program-coverage') {
  throw new Error(`Program-name audit requires schema 1.2-active-program-coverage, got ${payload.schemaVersion}`)
}
if (payload.counts?.exercises !== 108 || payload.counts?.substitutionRules !== 27) {
  throw new Error(`Program-name audit requires 108/27 Exercise Intelligence, got ${payload.counts?.exercises}/${payload.counts?.substitutionRules}`)
}
if (!Array.isArray(payload.exercises) || payload.exercises.length !== 108) {
  throw new Error('Program-name audit requires the complete 108-record Exercise Intelligence payload')
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

const compoundNames = Array.isArray(payload.compoundProgramDisplayNames)
  ? [...payload.compoundProgramDisplayNames]
  : []
const compoundSet = new Set(compoundNames)
if (compoundNames.length !== 13 || compoundSet.size !== 13) {
  throw new Error(`Expected 13 governed compound/choice program labels, got ${compoundNames.length}/${compoundSet.size}`)
}

const occurrences = []
for (const [programKey, definition] of programs) {
  for (const week of definition.weekData || []) {
    for (const day of week.days || []) {
      for (const section of day.sections || []) {
        for (const exercise of section.exercises || []) {
          const name = String(exercise?.name || '').trim()
          if (!name) continue
          const resolved = byId.get(name) || byIdentity.get(normalize(name)) || null
          const governedCompound = !resolved && compoundSet.has(name)
          occurrences.push({
            programKey,
            week: week.week,
            day: day.day,
            section: String(section.title || ''),
            name,
            resolvedExerciseId: resolved?.id || null,
            resolvedCanonicalName: resolved?.canonicalName || null,
            governedCompound,
          })
        }
      }
    }
  }
}

const uniqueNames = [...new Set(occurrences.map((item) => item.name))].sort((a, b) => a.localeCompare(b))
const resolvedNames = uniqueNames.filter((name) => {
  return Boolean(byId.get(name) || byIdentity.get(normalize(name)))
})
const unresolvedNames = uniqueNames.filter((name) => {
  return !byId.get(name) && !byIdentity.get(normalize(name))
})
const unexpectedUnresolved = unresolvedNames.filter((name) => !compoundSet.has(name))
const staleCompounds = compoundNames.filter((name) => !unresolvedNames.includes(name))

const programSummary = Object.fromEntries(programs.map(([programKey]) => {
  const rows = occurrences.filter((item) => item.programKey === programKey)
  const names = [...new Set(rows.map((item) => item.name))]
  const resolved = names.filter((name) => Boolean(byId.get(name) || byIdentity.get(normalize(name))))
  const compounds = names.filter((name) => !byId.get(name) && !byIdentity.get(normalize(name)) && compoundSet.has(name))
  return [programKey, {
    occurrences: rows.length,
    uniqueNames: names.length,
    resolvedCanonical: resolved.length,
    governedCompoundLabels: compounds.length,
  }]
}))

const report = {
  schemaVersion: 'lmf.exercise-intelligence.program-name-resolution.v1',
  exerciseIntelligence: {
    schemaVersion: payload.schemaVersion,
    exercises: payload.counts.exercises,
    substitutionRules: payload.counts.substitutionRules,
  },
  totals: {
    occurrences: occurrences.length,
    uniqueProgramExerciseNames: uniqueNames.length,
    resolvedCanonicalNames: resolvedNames.length,
    governedCompoundLabels: unresolvedNames.filter((name) => compoundSet.has(name)).length,
    unexpectedUnresolved: unexpectedUnresolved.length,
    staleCompoundDeclarations: staleCompounds.length,
  },
  programs: programSummary,
  governedCompoundNames: compoundNames,
  unresolvedNames,
  unexpectedUnresolved,
  staleCompounds,
  status: unexpectedUnresolved.length === 0 && staleCompounds.length === 0 ? 'PASS' : 'FAIL',
}

fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n')
const md = [
  '# LetMeFly Exercise Intelligence Program-Name Resolution Audit',
  '',
  `Status: **${report.status}**`,
  '',
  `- Exercise Intelligence: ${payload.counts.exercises} exercises / ${payload.counts.substitutionRules} substitution rules`,
  `- Program exercise occurrences: ${report.totals.occurrences}`,
  `- Unique governed program exercise labels: ${report.totals.uniqueProgramExerciseNames}`,
  `- Canonical/alias-resolved labels: ${report.totals.resolvedCanonicalNames}`,
  `- Intentionally program-owned compound/choice labels: ${report.totals.governedCompoundLabels}`,
  `- Unexpected unresolved labels: ${report.totals.unexpectedUnresolved}`,
  '',
  '## Governed compound/choice labels',
  ...compoundNames.map((name) => `- ${name}`),
  '',
  '## Program summary',
  ...Object.entries(programSummary).map(([key, value]) => `- ${key}: ${value.occurrences} occurrences · ${value.uniqueNames} unique · ${value.resolvedCanonical} resolved · ${value.governedCompoundLabels} governed compound labels`),
  '',
]
fs.writeFileSync(mdOut, md.join('\n'))

if (unexpectedUnresolved.length) fail(`Unexpected unresolved program exercise labels: ${unexpectedUnresolved.join(' | ')}`)
else pass('Every ordinary governed program exercise label resolves to Exercise Intelligence')

if (staleCompounds.length) fail(`Declared compound/choice labels no longer match unresolved program labels: ${staleCompounds.join(' | ')}`)
else pass('All 13 intentionally program-owned compound/choice labels remain explicit and non-canonical')

if (!process.exitCode) {
  pass(`Program-name resolution complete: ${resolvedNames.length} canonical/alias names + ${unresolvedNames.length} governed compound labels = ${uniqueNames.length} unique program labels`)
}
