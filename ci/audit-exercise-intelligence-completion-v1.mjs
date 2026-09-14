#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(target, 'dist')
const dataPath = path.join(dist, 'data/exercise-intelligence-v1.json')
if (!fs.existsSync(dataPath)) throw new Error(`Exercise Intelligence payload missing: ${dataPath}`)
const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const exercises = Array.isArray(payload.exercises) ? payload.exercises : []
const rules = Array.isArray(payload.substitutionRules) ? payload.substitutionRules : []
const failures = []
const direct = []
const fallback = []
const candidateDirect = []
const approvedSpecificArt = []
const builtInExactArt = []
const neutralArt = []
const substitutionPrimary = new Set()
const substitutionAlternative = new Set()
const builtInExactPaths = new Map([
  ['machine-hip-abduction', '/ui/exercises/machine-hip-abduction.svg'],
  ['seated-band-hip-abduction', '/ui/exercises/seated-band-hip-abduction.svg'],
])
const assetText = fs.existsSync(path.join(dist, 'assets'))
  ? fs.readdirSync(path.join(dist, 'assets')).map(name => fs.readFileSync(path.join(dist, 'assets', name), 'utf8')).join('\n')
  : ''

if (payload.schemaVersion !== '1.3-program-name-coverage') failures.push(`schema ${payload.schemaVersion} != 1.3-program-name-coverage`)
if (exercises.length !== 112) failures.push(`canonical exercise count ${exercises.length} != 112`)
if (rules.length !== 27) failures.push(`governed substitution rule count ${rules.length} != 27`)

for (const exercise of exercises) {
  const id = String(exercise.id || '')
  const name = String(exercise.canonicalName || id)
  for (const field of ['canonicalName','sourcePrograms','movementRoles','trainingCategory','equipment','purpose','primaryMuscles','coachingCues','commonMistakes','reviewStatus','demo','thumbnail']) {
    const value = exercise[field]
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) failures.push(`${name}: missing ${field}`)
  }
  if (!Array.isArray(exercise.secondaryMuscles)) failures.push(`${name}: secondaryMuscles is not an array`)
  if (exercise.reviewStatus !== 'READY FOR REVIEW') failures.push(`${name}: reviewStatus=${exercise.reviewStatus}`)

  const demo = exercise.demo || {}
  const url = String(demo.currentUrl || '')
  const candidate = String(demo.candidateDirectUrl || '')
  if (candidate) candidateDirect.push({ id, name, candidateDirectUrl: candidate })
  if (demo.candidateRequiresValidation !== false) failures.push(`${name}: demo still requires validation`)
  if (demo.currentStatus === 'direct-verified') {
    if (!/^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/.test(url)) failures.push(`${name}: invalid direct demo URL ${url}`)
    direct.push({ id, name, url })
  } else if (demo.currentStatus === 'search-fallback') {
    if (!url.startsWith('https://www.youtube.com/results?search_query=')) failures.push(`${name}: invalid search fallback ${url}`)
    fallback.push({ id, name, url })
  } else failures.push(`${name}: unsupported demo status ${demo.currentStatus}`)
  if (/vimeo\.com|drive\.google\.com/i.test(url)) failures.push(`${name}: forbidden legacy/private demo URL`)

  const thumb = exercise.thumbnail || {}
  if (!thumb.canonicalKey) failures.push(`${name}: missing thumbnail canonicalKey`)
  const approvedSpecific = Boolean(thumb.productionStatus || thumb.approval || thumb.reuses || thumb.reuseTarget)
  const builtInPath = builtInExactPaths.get(id)
  const builtInFile = builtInPath ? path.join(dist, builtInPath.replace(/^\//, '')) : null
  const hasBuiltInExact = Boolean(builtInFile && fs.existsSync(builtInFile) && assetText.includes(builtInPath))
  const row = { id, name, alignmentAudit: thumb.alignmentAudit || null }
  if (approvedSpecific) approvedSpecificArt.push(row)
  else if (hasBuiltInExact) builtInExactArt.push({ ...row, path: builtInPath })
  else neutralArt.push(row)
}

for (const rule of rules) {
  const primary = String(rule.primaryExerciseId || '')
  const alt = String(rule.alternativeExerciseId || '')
  if (!primary || !alt) failures.push(`substitution rule ${rule.id || '(unknown)'} missing identity`)
  substitutionPrimary.add(primary); substitutionAlternative.add(alt)
  if (!['PROMOTE CORE','PROMOTE CONTEXTUAL','DO NOT DEFAULT'].includes(rule.promotionStatus)) failures.push(`${rule.id}: unsupported promotionStatus ${rule.promotionStatus}`)
  if (!rule.primaryRole || !rule.rolePreserved || !rule.importantDifference || !rule.loadingAdjustment || !rule.useCondition || !rule.coachExplanation || !rule.programOwnershipRule) failures.push(`${rule.id}: incomplete governed substitution explanation`)
}

for (const [id, expectedPath] of builtInExactPaths) {
  if (!builtInExactArt.some(row => row.id === id) && !approvedSpecificArt.some(row => row.id === id)) {
    failures.push(`${id}: exact art fallback missing (${expectedPath})`)
  }
}

if (!assetText.includes('var(--exercise-art,var(--v2-mountain))')) failures.push('neutral non-misleading art fallback missing from final CSS')
const runtimeFiles = [
  'ui/exercise-intelligence-runtime-v1.js',
  'ui/exercise-intelligence-library-v1.js',
  'ui/exercise-intelligence-substitutions-v1.js',
  'ui/exercise-intelligence-coach-v1.js',
  'ui/exercise-intelligence-coach-substitutions-v1.js',
]
for (const file of runtimeFiles) if (!fs.existsSync(path.join(dist, file))) failures.push(`missing runtime ${file}`)

const lateral = Object.fromEntries(exercises.filter(e => ['machine-hip-abduction','seated-band-hip-abduction','mini-band-lateral-walk'].includes(e.id)).map(e => [e.id, {
  demo: e.demo,
  thumbnail: e.thumbnail,
  exactPublicFallback: builtInExactPaths.get(e.id) || null,
  substitutions: rules.filter(r => r.primaryExerciseId === e.id).map(r => ({ id:r.id, alternativeExerciseId:r.alternativeExerciseId, promotionStatus:r.promotionStatus }))
}]))

const report = {
  result: failures.length ? 'FAIL' : 'PASS',
  schemaVersion: payload.schemaVersion,
  canonicalExercises: exercises.length,
  substitutionRules: rules.length,
  metadataCoverage: `${exercises.length - failures.filter(x => x.includes(': missing ')).length}/${exercises.length}`,
  demoCoverage: { directVerified: direct.length, safeSearchFallback: fallback.length, candidateDirectUrlsNotPromoted: candidateDirect.length },
  artCoverage: { approvedSpecific: approvedSpecificArt.length, builtInExactFallback: builtInExactArt.length, neutralNonMisleadingFallback: neutralArt.length },
  substitutionCoverage: { primariesWithReviewedRules: substitutionPrimary.size, alternativesReferenced: substitutionAlternative.size, policy: 'No governed rule means no substitute is invented.' },
  directVerifiedExercises: direct,
  candidateDirectUrlsNotPromoted: candidateDirect,
  builtInExactArt,
  neutralFallbackExercises: neutralArt,
  lateralGluteEvidence: lateral,
  failures,
}
const outDir = path.join(target, 'EXERCISE_INTELLIGENCE_COMPLETION_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
console.log('LetMeFly Exercise Intelligence completion inventory: PASS')
