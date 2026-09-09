import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const mainPath = path.join(root, 'src/main.ts')
const servicePath = path.join(root, 'src/services/workout-service.ts')
const outPath = path.join(root, 'WORKOUT_PERSISTENCE_SOURCE_AUDIT.md')

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

function lineNumberAt(source, index) {
  return source.slice(0, Math.max(0, index)).split('\n').length
}

function excerptAround(source, needle, radius = 2200) {
  const i = source.indexOf(needle)
  if (i < 0) return null
  const start = Math.max(0, i - radius)
  const end = Math.min(source.length, i + needle.length + radius)
  return {
    code: source.slice(start, end),
    line: lineNumberAt(source, i),
  }
}

function extractFunction(source, name) {
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`),
    new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`),
  ]
  let start = -1
  for (const pattern of patterns) {
    const match = pattern.exec(source)
    if (match) { start = match.index; break }
  }
  if (start < 0) return null

  // Return-type object literals may contain braces before the actual function
  // body. Find a brace whose matching block is followed by function-level
  // syntax rather than stopping at the first return-type brace.
  let brace = source.indexOf('{', start)
  while (brace >= 0) {
    let depth = 0
    let quote = null
    let escaped = false
    let templateDepth = 0
    for (let i = brace; i < source.length; i += 1) {
      const ch = source[i]
      if (escaped) { escaped = false; continue }
      if (quote) {
        if (ch === '\\') { escaped = true; continue }
        if (quote === '`' && ch === '$' && source[i + 1] === '{') { templateDepth += 1; i += 1; continue }
        if (quote === '`' && templateDepth && ch === '}') { templateDepth -= 1; continue }
        if (ch === quote && templateDepth === 0) quote = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
      if (ch === '{') depth += 1
      if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          const before = source.slice(start, brace)
          const looksLikeBody = /\)\s*(?::[^=]+)?\s*$/.test(before) || /=>\s*$/.test(before)
          if (looksLikeBody) {
            return {
              code: source.slice(start, i + 1),
              line: lineNumberAt(source, start),
            }
          }
          brace = source.indexOf('{', i + 1)
          break
        }
      }
    }
    if (brace < 0) break
  }
  return null
}

const main = read(mainPath)
const service = read(servicePath)
if (!main || !service) {
  console.error(`Workout persistence source audit: reconstructed source missing under ${root}`)
  process.exit(1)
}

const blocks = []
const seen = new Set()
function addBlock(sourceName, name, result) {
  if (!result) return
  const key = `${sourceName}:${name}:${result.line}`
  if (seen.has(key)) return
  seen.add(key)
  blocks.push({ source: sourceName, name, ...result })
}

const mainNames = [
  'toggleSetFromRow',
  'completionStats',
  'completeSelectedWorkout',
  'startSelectedWorkout',
  'refreshWorkout',
  'workoutSwipePages',
  'setRow',
  'loggedExerciseCard',
]
const serviceNames = [
  'startWorkout',
  'logSet',
  'uncompleteSet',
  'updateWorkoutSet',
  'completeWorkout',
  'findWorkoutForDay',
  'loadWorkoutBundle',
  'getWorkoutBundle',
  'setRecordFromProgram',
]

for (const name of mainNames) addBlock('src/main.ts', name, extractFunction(main, name))
for (const name of serviceNames) addBlock('src/services/workout-service.ts', name, extractFunction(service, name))

const mainNeedles = [
  'function completionStats',
  'sets logged',
  'data-action="toggle-set"',
  'Set saved locally',
  'COMPLETE WORKOUT',
]
const serviceNeedles = [
  'logSet',
  'uncompleteSet',
  'completed: true',
  'completed: false',
  'load_value',
  'performance_data',
  'workoutSets',
  'loadWorkoutBundle',
  'getAllFromIndex',
  'putEntityWithOutbox',
]
for (const needle of mainNeedles) addBlock('src/main.ts', `excerpt: ${needle}`, excerptAround(main, needle))
for (const needle of serviceNeedles) addBlock('src/services/workout-service.ts', `excerpt: ${needle}`, excerptAround(service, needle))

// The service is the authoritative local persistence layer and is intentionally
// included in full for this diagnostic artifact. It contains no athlete data.
blocks.push({
  source: 'src/services/workout-service.ts',
  name: 'FULL AUTHORITATIVE SERVICE SOURCE',
  line: 1,
  code: service,
})

const report = [
  '# LetMeFly Workout Persistence Source Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'Purpose: expose the reconstructed authoritative workout persistence/review boundaries for regression diagnosis. This audit does not modify program prescriptions or athlete data.',
  '',
  `Found ${blocks.length} relevant source block(s).`,
  '',
  ...blocks.flatMap(block => [
    `## ${block.source} — ${block.name}`,
    '',
    `Approx source line: ${block.line}`,
    '',
    '```ts',
    block.code,
    '```',
    '',
  ]),
]

fs.writeFileSync(outPath, report.join('\n'))
console.log(`Workout persistence source audit: PASS — ${blocks.length} block(s) written to ${outPath}`)
for (const block of blocks) console.log(`  ${block.source}:${block.line}: ${block.name}`)
