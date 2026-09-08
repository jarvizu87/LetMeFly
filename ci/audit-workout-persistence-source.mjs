import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const mainPath = path.join(root, 'src/main.ts')
const servicePath = path.join(root, 'src/services/workout-service.ts')
const outPath = path.join(root, 'WORKOUT_PERSISTENCE_SOURCE_AUDIT.md')

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

function extractFunction(source, name) {
  const patterns = [
    new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`),
    new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`),
  ]
  let start = -1
  for (const pattern of patterns) {
    const match = pattern.exec(source)
    if (match) { start = match.index; break }
  }
  if (start < 0) return null
  const brace = source.indexOf('{', start)
  if (brace < 0) return null
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
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return source.slice(start, Math.min(source.length, start + 8000))
}

function excerptAround(source, needle, radius = 1600) {
  const i = source.indexOf(needle)
  if (i < 0) return null
  return source.slice(Math.max(0, i - radius), Math.min(source.length, i + needle.length + radius))
}

const main = read(mainPath)
const service = read(servicePath)
if (!main || !service) {
  console.error(`Workout persistence source audit: reconstructed source missing under ${root}`)
  process.exit(1)
}

const mainNames = [
  'toggleSetFromRow',
  'completionStats',
  'completeSelectedWorkout',
  'startSelectedWorkout',
  'refreshWorkout',
  'workoutSwipePages',
  'workoutExerciseCard',
  'activeWorkoutExerciseCard',
]
const serviceNames = [
  'startWorkout',
  'updateWorkoutSet',
  'completeWorkout',
  'findWorkoutForDay',
  'getWorkoutBundle',
  'loadWorkout',
]

const blocks = []
for (const name of mainNames) {
  const code = extractFunction(main, name)
  if (code) blocks.push({ source: 'src/main.ts', name, code })
}
for (const name of serviceNames) {
  const code = extractFunction(service, name)
  if (code) blocks.push({ source: 'src/services/workout-service.ts', name, code })
}

for (const [sourceName, source] of [['src/main.ts', main], ['src/services/workout-service.ts', service]]) {
  for (const needle of ['set.completed', 'load_value', 'workoutSets', 'COMPLETE WORKOUT', 'sets logged']) {
    if (blocks.some(block => block.code.includes(needle))) continue
    const code = excerptAround(source, needle)
    if (code) blocks.push({ source: sourceName, name: `excerpt: ${needle}`, code })
  }
}

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
    '```ts',
    block.code,
    '```',
    '',
  ]),
]

fs.writeFileSync(outPath, report.join('\n'))
console.log(`Workout persistence source audit: PASS — ${blocks.length} block(s) written to ${outPath}`)
for (const block of blocks) console.log(`  ${block.source}: ${block.name}`)
