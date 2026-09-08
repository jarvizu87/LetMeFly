import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const libraryPath = path.join(root, 'src/data/exercise-library.ts')
const mainPath = path.join(root, 'src/main.ts')
const programRoot = path.join(root, 'src/programs')
const programFiles = []
function collectProgramFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectProgramFiles(full)
    else if (entry.name.endsWith('.ts')) programFiles.push(full)
  }
}
collectProgramFiles(programRoot)
const programsText = programFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const mainText = fs.readFileSync(mainPath, 'utf8')

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-exlib-'))
const compile = spawnSync('tsc', [
  '--outDir', temp,
  '--target', 'ES2022',
  '--module', 'CommonJS',
  '--moduleResolution', 'Node',
  '--strict',
  '--skipLibCheck',
  libraryPath,
], { encoding: 'utf8' })
if (compile.status !== 0) {
  console.error(compile.stdout)
  console.error(compile.stderr)
  process.exit(compile.status || 1)
}
const require = createRequire(import.meta.url)
const lib = require(path.join(temp, 'exercise-library.js'))

const failures = []
const notes = []
const check = (condition, message) => { if (!condition) failures.push(message) }

const programNames = [...new Set(
  [...programsText.matchAll(/\bex\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
)].sort((a, b) => a.localeCompare(b))

check(lib.EXERCISE_LIBRARY_SOURCE_TOTAL === 202, 'Source exercise total must remain 202')
check(lib.APPROVED_SUBSTITUTION_SOURCE_TOTAL === 68, 'Source substitution total must remain 68')
check(Array.isArray(lib.EXERCISE_LIBRARY), 'EXERCISE_LIBRARY must be an array')
check(Array.isArray(lib.APPROVED_SUBSTITUTIONS), 'APPROVED_SUBSTITUTIONS must be an array')

const ids = new Set()
const names = new Set()
for (const row of lib.EXERCISE_LIBRARY) {
  check(Boolean(row.id), `Missing exercise id: ${row.canonicalName ?? '<unknown>'}`)
  check(!ids.has(row.id), `Duplicate exercise id: ${row.id}`)
  ids.add(row.id)
  check(!names.has(row.canonicalName.toLowerCase()), `Duplicate canonical exercise: ${row.canonicalName}`)
  names.add(row.canonicalName.toLowerCase())
  check(/^https:\/\//.test(row.demoUrl), `Demo URL is not HTTPS: ${row.canonicalName}`)
  if (row.videoStatus === 'direct-source-library') {
    check(!row.demoUrl.includes('youtube.com/results'), `Direct-source label points at YouTube search: ${row.canonicalName}`)
  }
}

const nonMovementCards = new Set(['Verified Crownforge Results', 'Black Crown Entry TM Rules'])
const unresolved = programNames.filter((name) => !nonMovementCards.has(name) && lib.getExerciseMatches(name).length === 0)
check(unresolved.length === 0, `Program exercise names unresolved: ${unresolved.join(', ')}`)

for (const row of lib.APPROVED_SUBSTITUTIONS) {
  check(['Crownforge', 'Crown Maintenance'].includes(row.program), `Unexpected substitution program in active source slice: ${row.program} / ${row.primary}`)
  check(lib.getExerciseMatches(row.alternative).length > 0, `Substitution alternative is not in library: ${row.alternative}`)
  check(row.approvalSource.length > 0, `Missing approval source for substitution: ${row.primary}`)
  check(row.loadingAdjustment.length > 0, `Missing loading rule for substitution: ${row.primary}`)
}

const frontRack = lib.getExerciseMatches('Front Rack Carry')
check(frontRack.length === 1 && frontRack[0].canonicalName === 'Kettlebell Front Rack Carry', 'Front Rack Carry must normalize to Kettlebell Front Rack Carry')

check(!/const\s+SUBSTITUTIONS\s*=/.test(mainText), 'Legacy hard-coded SUBSTITUTIONS object still exists in main.ts')
check(mainText.includes('openExerciseDemo('), 'main.ts is not using the source-aware demo resolver')
check(mainText.includes('showExerciseSubstitutions('), 'main.ts is not using the source-aware substitution resolver')
check(mainText.includes('CROWNFORGE.weekData.map'), 'Program page is not rendering embedded Crownforge weeks')
check(mainText.includes('CROWN_MAINTENANCE.weekData.map'), 'Program page is not rendering embedded Crown Maintenance weeks')
check(mainText.includes('...CROWNFORGE.weekData, ...CROWN_MAINTENANCE.weekData'), 'Exercise page is not aggregating Crownforge + Crown Maintenance')
check(mainText.includes('reviewing a substitute does not change the public Crownforge program'), 'Substitution UI lacks explicit program-protection language')

notes.push(`Source catalog total: ${lib.EXERCISE_LIBRARY_SOURCE_TOTAL}`)
notes.push(`Embedded catalog records: ${lib.EXERCISE_LIBRARY.length}`)
notes.push(`Program display names audited: ${programNames.length}`)
notes.push(`Program display names resolved: ${programNames.length - unresolved.length}`)
notes.push(`Source substitution total: ${lib.APPROVED_SUBSTITUTION_SOURCE_TOTAL}`)
notes.push(`Embedded verified substitutions: ${lib.APPROVED_SUBSTITUTIONS.length}`)

if (failures.length) {
  console.error('Exercise Intelligence audit: FAIL')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Exercise Intelligence audit: PASS')
  for (const note of notes) console.log(`- ${note}`)
  console.log('- Front Rack Carry canonicalization: PASS')
  console.log('- Direct-video status integrity: PASS')
  console.log('- Public-program mutation boundary: PASS')
}

fs.rmSync(temp, { recursive: true, force: true })
