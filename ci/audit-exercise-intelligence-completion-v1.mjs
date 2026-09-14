#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const requireFinal = process.argv.includes('--require')
const dist = path.join(target, 'dist')
const dataPath = path.join(dist, 'data/exercise-intelligence-v1.json')

if (!fs.existsSync(dataPath)) {
  if (requireFinal) throw new Error(`Exercise Intelligence payload missing: ${dataPath}`)
  console.log('LetMeFly Exercise Intelligence completion inventory: DEFERRED until final Exercise Intelligence assembly')
  process.exit(0)
}

const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const exercises = Array.isArray(payload.exercises) ? payload.exercises : []
const rules = Array.isArray(payload.substitutionRules) ? payload.substitutionRules : []
const failures = []
const demoStatuses = new Map()
const safeDirect = []
const safeSearch = []
const otherSafe = []
const art = { exactPublic: [], governedThumbnailKey: [], neutralFallback: [] }

const count = (map, key) => map.set(key, (map.get(key) || 0) + 1)
const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' && !/drive\.google\.com|vimeo\.com/i.test(url.hostname)
  } catch { return false }
}

// The established production audits own the Exercise Intelligence schema and run
// immediately before this completion audit in final assembly. Completion measures
// the user-facing result without inventing stronger requirements for optional
// equipment, thumbnail provenance, legacy rule shapes, or promotion labels.
if (payload.integrationStatus !== 'READY_FOR_NON_PRESCRIPTION_APP_INTEGRATION') {
  failures.push(`integrationStatus=${payload.integrationStatus}`)
}
if (payload.schemaVersion !== '1.3-program-name-coverage') failures.push(`schemaVersion=${payload.schemaVersion}`)
for (const [key, expected] of Object.entries({
  exercises: 112,
  substitutionRules: 27,
  roleCoverage: 112,
  coachingCoverage: 112,
  readyForReview: 112,
})) {
  if (payload.counts?.[key] !== expected) failures.push(`counts.${key}=${payload.counts?.[key]} expected ${expected}`)
}
if (exercises.length !== 112 || new Set(exercises.map((item) => item.id)).size !== 112) {
  failures.push(`canonical exercise identity coverage=${exercises.length}/112`)
}
if (rules.length !== 27) failures.push(`governed substitution rules=${rules.length}/27`)

const exactArt = new Map([
  ['machine-hip-abduction', '/ui/exercises/machine-hip-abduction.svg'],
  ['seated-band-hip-abduction', '/ui/exercises/seated-band-hip-abduction.svg'],
])
const assetDir = path.join(dist, 'assets')
const assetText = fs.existsSync(assetDir)
  ? fs.readdirSync(assetDir).filter((name) => /\.(js|css)$/.test(name)).map((name) => fs.readFileSync(path.join(assetDir, name), 'utf8')).join('\n')
  : ''
const serviceWorker = fs.existsSync(path.join(dist, 'service-worker.js'))
  ? fs.readFileSync(path.join(dist, 'service-worker.js'), 'utf8') : ''

for (const exercise of exercises) {
  const id = String(exercise.id || '')
  const name = String(exercise.canonicalName || id)
  const demo = exercise.demo || {}
  const status = String(demo.currentStatus || demo.status || 'unspecified')
  const url = String(demo.currentUrl || '').trim()
  count(demoStatuses, status)

  if (!url || !safeHttpUrl(url)) {
    failures.push(`${name}: Watch Exercise URL is missing/unsafe (${url || 'blank'})`)
  } else if (/youtube\.com\/watch\?|youtu\.be\//i.test(url)) {
    safeDirect.push({ id, name, status, url })
  } else if (/youtube\.com\/results\?search_query=/i.test(url)) {
    safeSearch.push({ id, name, status, url })
  } else {
    otherSafe.push({ id, name, status, url })
  }

  const exactPath = exactArt.get(id)
  if (exactPath) {
    const file = path.join(dist, exactPath.replace(/^\//, ''))
    if (!fs.existsSync(file) || !assetText.includes(exactPath) || !serviceWorker.includes(`'${exactPath}'`)) {
      failures.push(`${name}: exact public fallback art is not fully installed/offline-cached`)
    } else {
      art.exactPublic.push({ id, name, path: exactPath })
    }
    continue
  }

  const key = exercise?.thumbnail?.canonicalKey
  if (key) art.governedThumbnailKey.push({ id, name, canonicalKey: key })
  else art.neutralFallback.push({ id, name })
}

if (!assetText.includes('var(--exercise-art,var(--v2-mountain))')) {
  failures.push('neutral non-misleading exercise-art fallback is absent from final CSS')
}

const runtimeFiles = [
  'ui/exercise-intelligence-runtime-v1.js',
  'ui/exercise-intelligence-ui-v1.js',
  'ui/exercise-intelligence-library-v1.js',
  'ui/exercise-intelligence-coach-v1.js',
  'ui/exercise-intelligence-coach-substitutions-v1.js',
  'ui/exercise-intelligence-substitutions-v1.js',
]
for (const file of runtimeFiles) {
  if (!fs.existsSync(path.join(dist, file))) failures.push(`missing final runtime ${file}`)
}
const libraryRuntime = fs.existsSync(path.join(dist, 'ui/exercise-intelligence-library-v1.js'))
  ? fs.readFileSync(path.join(dist, 'ui/exercise-intelligence-library-v1.js'), 'utf8') : ''
if (!libraryRuntime.includes("const url = exercise?.demo?.currentUrl")) failures.push('Watch Exercise does not consume governed currentUrl')
if (!libraryRuntime.includes('NO GOVERNED SUBSTITUTE')) failures.push('no-reviewed-substitute state is not explicit in library UI')

// Existing production audits protect every governed rule structure/status. The
// completion layer only adds a focused assertion for the Black Crown v2.1 lateral-
// glute fallback hierarchy and never fabricates rules for other movements.
const machineAlternatives = rules
  .filter((rule) => rule.primaryExerciseId === 'machine-hip-abduction')
  .map((rule) => rule.alternativeExerciseId)
  .filter(Boolean)
  .sort()
const expectedMachineAlternatives = ['mini-band-lateral-walk', 'seated-band-hip-abduction'].sort()
if (JSON.stringify(machineAlternatives) !== JSON.stringify(expectedMachineAlternatives)) {
  failures.push(`Machine Hip Abduction governed alternatives=${machineAlternatives.join(',')}`)
}

const currentSerialized = JSON.stringify(exercises.map((exercise) => exercise.demo?.currentUrl || ''))
for (const forbidden of ['drive.google.com', 'vimeo.com', 'service_role', 'DATABASE_PASSWORD']) {
  if (currentSerialized.includes(forbidden)) failures.push(`forbidden current Watch Exercise value=${forbidden}`)
}

const report = {
  result: failures.length ? 'FAIL' : 'PASS',
  schemaVersion: payload.schemaVersion,
  integrationStatus: payload.integrationStatus,
  canonicalExercises: exercises.length,
  governedSubstitutionRules: rules.length,
  authoritativeCounts: payload.counts,
  watchExercise: {
    safeDirect: safeDirect.length,
    safeSearch: safeSearch.length,
    otherSafeHttps: otherSafe.length,
    totalUsable: safeDirect.length + safeSearch.length + otherSafe.length,
    statuses: Object.fromEntries([...demoStatuses.entries()].sort(([a], [b]) => a.localeCompare(b))),
  },
  artCoverage: {
    exactPublicFallbacks: art.exactPublic.length,
    governedThumbnailKeys: art.governedThumbnailKey.length,
    neutralNonMisleadingFallbacks: art.neutralFallback.length,
  },
  exactPublicArt: art.exactPublic,
  neutralFallbackExercises: art.neutralFallback,
  substitutionPolicy: {
    totalGovernedRules: rules.length,
    machineHipAbductionAlternatives: machineAlternatives,
    unreviewedPolicy: 'No governed rule means no substitute is invented; UI shows NO GOVERNED SUBSTITUTE.',
  },
  failures,
}

const outDir = path.join(target, 'EXERCISE_INTELLIGENCE_COMPLETION_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
console.log('LetMeFly Exercise Intelligence completion inventory: PASS')
