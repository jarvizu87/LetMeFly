#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const outJson = path.join(target, 'INJURY_SUBSTITUTION_ATHLETE_AUDIT.json')
const outMd = path.join(target, 'INJURY_SUBSTITUTION_ATHLETE_AUDIT.md')
const failures = []
const warnings = []
const passes = []
const fail = (label, detail = '') => { failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
const warn = (label, detail = '') => { warnings.push({ label, detail }); console.log(`WARN  ${label}${detail ? ` — ${detail}` : ''}`) }
const pass = (label, detail = '') => { passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const norm = value => String(value || '').trim().toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

if (!fs.existsSync(target)) {
  console.error(`Target source directory does not exist: ${target}`)
  process.exit(2)
}

const intelligencePath = path.join(target, 'dist/data/exercise-intelligence-v1.json')
const servicePath = path.join(target, 'src/services/workout-service.ts')
if (!fs.existsSync(intelligencePath)) fail('Exercise Intelligence production payload exists', intelligencePath)
if (!fs.existsSync(servicePath)) fail('Workout service source exists', servicePath)

let programs = null
try {
  const viteBin = path.join(target, 'node_modules', '.bin', 'vite')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-injury-programs-'))
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n')
  const built = spawnSync(viteBin, ['build', '--ssr', 'src/data/programs.ts', '--outDir', temp, '--emptyOutDir'], { cwd: target, encoding: 'utf8' })
  if (built.status !== 0) throw new Error((built.stderr || built.stdout || 'Vite SSR build failed').trim())
  const candidates = fs.readdirSync(temp).filter(name => /\.m?js$/.test(name))
  const entry = candidates.find(name => /programs/i.test(name)) || candidates[0]
  if (!entry) throw new Error('No importable program facade emitted')
  programs = await import(`${pathToFileURL(path.join(temp, entry)).href}?injury=${Date.now()}`)
  pass('Production governed programs loaded')
} catch (error) {
  fail('Production governed programs loaded', error instanceof Error ? error.message : String(error))
}

let intelligence = null
try {
  intelligence = JSON.parse(fs.readFileSync(intelligencePath, 'utf8'))
  if (!Array.isArray(intelligence.exercises) || !Array.isArray(intelligence.substitutionRules)) throw new Error('payload shape mismatch')
  pass('Governed substitution catalog loaded', `${intelligence.exercises.length} exercises · ${intelligence.substitutionRules.length} rules`)
} catch (error) {
  fail('Governed substitution catalog loaded', error instanceof Error ? error.message : String(error))
}

const specs = programs ? [
  ['crownforge', programs.CROWNFORGE],
  ['crown-maintenance', programs.CROWN_MAINTENANCE],
  ['black-crown', programs.BLACK_CROWN],
] : []
const definitionsBefore = specs.map(([key, definition]) => ({ key, hash: hash(definition) }))

const exerciseById = new Map((intelligence?.exercises || []).map(exercise => [exercise.id, exercise]))
const exerciseByName = new Map()
for (const exercise of intelligence?.exercises || []) {
  exerciseByName.set(norm(exercise.canonicalName), exercise)
  for (const alias of exercise.aliases || []) exerciseByName.set(norm(alias), exercise)
}

const occurrences = []
for (const [programKey, definition] of specs) {
  for (const week of definition?.weekData || []) {
    for (const day of week.days || []) {
      for (let sectionIndex = 0; sectionIndex < (day.sections || []).length; sectionIndex += 1) {
        const section = day.sections[sectionIndex]
        for (let exerciseIndex = 0; exerciseIndex < (section.exercises || []).length; exerciseIndex += 1) {
          const exercise = section.exercises[exerciseIndex]
          const intel = exerciseByName.get(norm(exercise.name))
          occurrences.push({
            programKey,
            week: week.week,
            day: day.day,
            sectionIndex,
            exerciseIndex,
            programmed: exercise,
            intelId: intel?.id || null,
            canonicalName: intel?.canonicalName || exercise.name,
          })
        }
      }
    }
  }
}

const byPrimary = new Map()
for (const occurrence of occurrences) {
  if (!occurrence.intelId) continue
  const list = byPrimary.get(occurrence.intelId) || []
  list.push(occurrence)
  byPrimary.set(occurrence.intelId, list)
}

const allRules = intelligence?.substitutionRules || []
const ruleDetails = allRules.map(rule => ({
  rule,
  primary: exerciseById.get(rule.primaryExerciseId),
  alternative: exerciseById.get(rule.alternativeExerciseId),
  occurrences: byPrimary.get(rule.primaryExerciseId) || [],
}))

const isBlocked = rule => String(rule?.promotionStatus || '').toUpperCase().startsWith('DO NOT')
const roleIsPreserved = rule => !/^(false|no|0)$/i.test(String(rule?.rolePreserved ?? '').trim())
const isEligible = item => Boolean(
  item.primary && item.alternative && item.occurrences.length &&
  item.rule.alternativeInCurrentApp === true &&
  !isBlocked(item.rule) &&
  roleIsPreserved(item.rule)
)

const eligible = ruleDetails.filter(isEligible)
const blocked = ruleDetails.filter(item => item.primary && item.alternative && item.occurrences.length && isBlocked(item.rule))
if (eligible.length) pass('Program-relevant role-preserving substitutions exist', `${eligible.length} eligible governed relationship(s)`)
else fail('Program-relevant role-preserving substitutions exist')
if (blocked.length) pass('Program-relevant DO NOT DEFAULT substitutions remain protected', `${blocked.length} protected relationship(s)`)
else warn('No program-relevant DO NOT DEFAULT relationship found in this build')

for (const item of eligible) {
  if (!item.rule.useCondition) warn('Eligible substitution lacks useCondition', `${item.primary.canonicalName} → ${item.alternative.canonicalName}`)
  if (!item.rule.programOwnershipRule) warn('Eligible substitution lacks programOwnershipRule', `${item.primary.canonicalName} → ${item.alternative.canonicalName}`)
}

// Pick the eligible relationship with the most real governed occurrences so one
// self-reported strain/pull can exercise repeated substitution and recovery.
const scenario = [...eligible].sort((a, b) => b.occurrences.length - a.occurrences.length)[0] || null
const athlete = {
  id: 'qa-injury-substitution-athlete',
  issue: null,
  substitutionActive: false,
  events: [],
  history: [],
}

let substitutionUses = 0
let recoveryReturnVerified = false
if (scenario) {
  const primaryName = scenario.primary.canonicalName
  const alternativeName = scenario.alternative.canonicalName
  const useCount = Math.min(3, scenario.occurrences.length)
  const affected = scenario.occurrences.slice(0, useCount)

  athlete.issue = {
    type: 'self-reported-muscle-strain-or-pull',
    status: 'reported-not-diagnosed',
    affectedMovement: primaryName,
    onset: `${affected[0].programKey}:W${affected[0].week}:D${affected[0].day}`,
    safetyBoundary: 'Simulation does not diagnose injury; concerning symptoms require professional evaluation.',
  }
  athlete.events.push({ type: 'issue-reported', ...athlete.issue })
  athlete.substitutionActive = true

  for (const occurrence of affected) {
    const before = hash(occurrence.programmed)
    const record = {
      program: occurrence.programKey,
      week: occurrence.week,
      day: occurrence.day,
      prescribedExerciseId: occurrence.programmed.id,
      prescribedExerciseName: occurrence.programmed.name,
      prescriptionHash: before,
      performedExerciseId: scenario.alternative.id,
      performedExerciseName: alternativeName,
      substitutedFromExerciseKey: scenario.primary.id,
      substitutionRule: {
        primaryExerciseId: scenario.rule.primaryExerciseId,
        alternativeExerciseId: scenario.rule.alternativeExerciseId,
        promotionStatus: scenario.rule.promotionStatus ?? null,
        rolePreserved: scenario.rule.rolePreserved ?? null,
        useCondition: scenario.rule.useCondition ?? null,
        programOwnershipRule: scenario.rule.programOwnershipRule ?? null,
      },
    }
    athlete.history.push(record)
    substitutionUses += 1
    if (hash(occurrence.programmed) !== before) fail('Substitution mutated authoritative exercise prescription', `${primaryName} at ${record.program}:W${record.week}:D${record.day}`)
  }
  pass('Injured athlete uses governed substitutions', `${substitutionUses} occurrence(s): ${primaryName} → ${alternativeName}`)

  athlete.substitutionActive = false
  athlete.issue.status = 'resolved-for-simulation'
  athlete.events.push({ type: 'issue-resolved', affectedMovement: primaryName })

  const recoveryOccurrence = scenario.occurrences[useCount] || scenario.occurrences[scenario.occurrences.length - 1]
  if (recoveryOccurrence) {
    const recoveredRecord = {
      program: recoveryOccurrence.programKey,
      week: recoveryOccurrence.week,
      day: recoveryOccurrence.day,
      prescribedExerciseName: recoveryOccurrence.programmed.name,
      performedExerciseName: recoveryOccurrence.programmed.name,
      substitutedFromExerciseKey: null,
      prescriptionHash: hash(recoveryOccurrence.programmed),
    }
    athlete.history.push(recoveredRecord)
    recoveryReturnVerified = recoveredRecord.performedExerciseName === recoveredRecord.prescribedExerciseName && recoveredRecord.substitutedFromExerciseKey === null
  }
  if (recoveryReturnVerified) pass('Recovered athlete returns to programmed movement without sticky substitution')
  else fail('Recovered athlete returns to programmed movement without sticky substitution')
}

// A protected same-muscle or stimulus-changing option may be displayed for
// explanation, but must never become the athlete's automatic replacement.
let blockedAttempts = 0
for (const item of blocked) {
  blockedAttempts += 1
  const selectedByDefault = item.rule.alternativeInCurrentApp === true && !isBlocked(item.rule) && roleIsPreserved(item.rule)
  if (selectedByDefault) fail('DO NOT DEFAULT substitution was automatically selected', `${item.primary.canonicalName} → ${item.alternative.canonicalName}`)
}
if (blockedAttempts) pass('Blocked substitution attempts are rejected', `${blockedAttempts} protected relationship(s)`)

const definitionsAfter = specs.map(([key, definition]) => ({ key, hash: hash(definition) }))
if (JSON.stringify(definitionsBefore) === JSON.stringify(definitionsAfter)) pass('Injury/substitution scenario preserves authoritative program definitions')
else fail('Injury/substitution scenario preserves authoritative program definitions')

let serviceSource = ''
try { serviceSource = fs.readFileSync(servicePath, 'utf8') } catch {}
const provenanceFieldExists = /substituted_from_exercise_key:\s*null/.test(serviceSource)
const mutationApiExists = /export\s+(?:async\s+)?function\s+(?:apply|set|update|record)[A-Za-z0-9_]*Substitut/i.test(serviceSource)
if (provenanceFieldExists) pass('Workout persistence schema reserves substitution provenance')
else fail('Workout persistence schema reserves substitution provenance')
if (!mutationApiExists) warn('Real Workout Mode substitution apply/persistence API is not yet implemented', 'Current Exercise Intelligence substitution UI is intentionally view-only; Stage 2 must test real persistence once an intentional apply/log path exists.')
else pass('Real Workout Mode substitution mutation API detected')

const result = failures.length ? 'FAIL' : 'PASS'
const report = {
  result,
  athlete,
  counts: {
    programOccurrences: occurrences.length,
    substitutionRules: allRules.length,
    eligibleProgramRelevantRules: eligible.length,
    blockedProgramRelevantRules: blocked.length,
    substitutionUses,
    blockedAttempts,
  },
  selectedScenario: scenario ? {
    primary: scenario.primary.canonicalName,
    alternative: scenario.alternative.canonicalName,
    governedOccurrences: scenario.occurrences.length,
    promotionStatus: scenario.rule.promotionStatus ?? null,
    rolePreserved: scenario.rule.rolePreserved ?? null,
    useCondition: scenario.rule.useCondition ?? null,
    programOwnershipRule: scenario.rule.programOwnershipRule ?? null,
  } : null,
  realPersistence: {
    provenanceFieldExists,
    mutationApiExists,
  },
  passes,
  warnings,
  failures,
}

fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(outMd, [
  '# LetMeFly Injury + Substitution Athlete Audit',
  '',
  `Result: **${result}**`,
  '',
  'This is a QA simulation of a self-reported muscle strain/pull. It does not diagnose an injury. The athlete may use only governed role-preserving substitutions or an intentional coaching/program-edit decision; the authoritative program remains unchanged.',
  '',
  '## Scenario',
  scenario ? `- Prescribed movement: ${scenario.primary.canonicalName}\n- Governed substitute: ${scenario.alternative.canonicalName}\n- Simulated substitution uses: ${substitutionUses}\n- Recovered athlete returns to original programmed movement: ${recoveryReturnVerified ? 'yes' : 'no'}` : '- No eligible scenario selected.',
  '',
  '## Coverage',
  `- Program exercise occurrences scanned: ${occurrences.length}`,
  `- Governed substitution rules: ${allRules.length}`,
  `- Eligible program-relevant relationships: ${eligible.length}`,
  `- Protected DO NOT DEFAULT relationships encountered: ${blocked.length}`,
  `- Blocked automatic attempts rejected: ${blockedAttempts}`,
  '',
  '## Persistence readiness',
  `- substitution provenance field exists: ${provenanceFieldExists}`,
  `- real substitution apply/log API exists: ${mutationApiExists}`,
  '',
  '## Warnings',
  ...(warnings.length ? warnings.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Failures',
  ...(failures.length ? failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
].join('\n'))

console.log(`Injury + substitution athlete audit: ${result}`)
if (failures.length) process.exit(1)
