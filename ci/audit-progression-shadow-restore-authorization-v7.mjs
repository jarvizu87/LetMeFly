#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const target = process.argv[2]
if (!target) {
  console.error('Usage: node --experimental-strip-types ci/audit-progression-shadow-restore-authorization-v7.mjs <target-source-dir>')
  process.exit(2)
}

const stage7Path = path.join(target, 'src/services/progression-shadow-restore-authorization.ts')
const opsPath = path.join(target, 'src/services/progression-shadow-pilot-operations.ts')
const reviewPath = path.join(target, 'src/services/progression-shadow-provenance-review.ts')
const journalPath = path.join(target, 'src/services/progression-shadow-pilot-journal.ts')
const mainPath = path.join(target, 'src/main.ts')
if (![stage7Path, opsPath, reviewPath, journalPath, mainPath].every(fs.existsSync)) {
  console.error('Missing Stage-7, Stage-6, Stage-5, Stage-4, or main source')
  process.exit(1)
}

const source = fs.readFileSync(stage7Path, 'utf8')
const main = fs.readFileSync(mainPath, 'utf8')
const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok), detail })
  console.log(`progression shadow v7 ${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`)
}

check('restore authorization database is isolated from canonical app database', source.includes("letmefly.progression.shadow.pilot.restore.v1") && !/\.\.\/db\/local-db|from ['\"]\.\.\/db\/local-db/.test(source))
check('Stage-7 storage has no browser key-value fallback', !/localStorage|sessionStorage/.test(source))
check('Stage-7 has no Supabase or network access', !/supabase|fetch\s*\(|XMLHttpRequest|WebSocket/.test(source))
check('Stage-7 has no UI access', !/document\.|window\.|navigator\.|showToast|render\s*\(/.test(source))
check('Stage-7 has no authoritative program dependency', !/program-progression-service|programs\/(?:crownforge|crown-maintenance|black-crown)/.test(source))
check('restore and authorization records are add-only', (source.match(/\.add\(record\)/g) ?? []).length === 2 && !/\.put\s*\(|\.delete\s*\(/.test(source))
check('restore verifies schema and SHA-256 content digest', /restore schema mismatch/.test(source) && /content digest mismatch/.test(source) && /SHA-256/.test(source))
check('restore independently rebuilds exported backlog', /progressionShadowRebuildAuditBacklogFromPackage/.test(source) && /rebuilt backlog mismatch/.test(source))
check('authorization requires explicit operator intent and real-evidence confirmation', /AUTHORIZE_VISIBLE_PILOT/.test(source) && /explicitly confirm real pilot evidence/.test(source))
check('authorization requires satisfied evidence gate', /authorization requires satisfied evidence gate/.test(source))
check('auto-apply stays hard-locked false', /autoApplyAllowed:\s*false as const/.test(source))
check('Stage-7 restore and authorization are never automatic in workout completion', !main.includes('progressionShadowRestoreAuditPackage') && !main.includes('progressionShadowRecordOperatorAuthorization'))

const journal = await import(`${pathToFileURL(journalPath).href}?v7journal=${Date.now()}`)
const { progressionShadowRecordOriginalHookReceipt } = journal

const runtimeReviewPath = path.join(target, 'src/services/progression-shadow-provenance-review.audit-v7.ts')
const reviewSource = fs.readFileSync(reviewPath, 'utf8').replace("from './progression-shadow-pilot-journal'", "from './progression-shadow-pilot-journal.ts'")
fs.writeFileSync(runtimeReviewPath, reviewSource)
const review = await import(`${pathToFileURL(runtimeReviewPath).href}?v7review=${Date.now()}`)
const {
  progressionShadowRecordOriginalHookProvenance,
  progressionShadowFinalizeHumanReview,
} = review

const runtimeOpsPath = path.join(target, 'src/services/progression-shadow-pilot-operations.audit-v7.ts')
const opsSource = fs.readFileSync(opsPath, 'utf8')
  .replace("from './progression-shadow-pilot-journal'", "from './progression-shadow-pilot-journal.ts'")
  .replace("from './progression-shadow-provenance-review'", "from './progression-shadow-provenance-review.audit-v7.ts'")
fs.writeFileSync(runtimeOpsPath, opsSource)
const ops = await import(`${pathToFileURL(runtimeOpsPath).href}?v7ops=${Date.now()}`)
const {
  progressionShadowRecordReviewDisposition,
  progressionShadowRecordReplacementWorkout,
  progressionShadowExportPilotAuditJournal,
} = ops

const stage7 = await import(`${pathToFileURL(stage7Path).href}?v7=${Date.now()}`)
const {
  progressionShadowVerifyAuditPackage,
  progressionShadowRestoreAuditPackage,
  progressionShadowGetRestoredAuditPackage,
  progressionShadowRecordOperatorAuthorization,
  progressionShadowGetOperatorAuthorization,
  progressionShadowAuthorizationStatus,
  progressionShadowRebuildAuditBacklogFromPackage,
} = stage7

const result = (athleteId, sessionId, completedAt, readiness = 'green', options = {}) => {
  const coreRequiredUnits = options.coreRequiredUnits ?? 3
  const coreCompletedUnits = options.coreCompletedUnits ?? 3
  const technicalHealthy = options.technicalHealthy ?? true
  const decisionCoverageClean = options.decisionCoverageClean ?? true
  const eligible = options.eligible ?? (technicalHealthy && decisionCoverageClean)
  return {
    athleteId,
    sessionId,
    completedAt,
    readiness,
    technicalHealthy,
    warnings: Object.freeze(technicalHealthy ? [] : ['technical-fixture']),
    review: Object.freeze({
      workoutId: sessionId,
      readiness,
      work: Object.freeze([Object.freeze({
        id: `${sessionId}-exercise`,
        priority: 'mandatory',
        prescribedUnits: coreRequiredUnits,
        completedUnits: coreCompletedUnits,
        effectiveRequiredUnits: coreRequiredUnits,
        countsTowardCoreAdherence: true,
        conditionalActive: null,
      })]),
      decisionGaps: Object.freeze(decisionCoverageClean ? [] : [{ id: `${sessionId}-gap` }]),
      decisionGapCount: decisionCoverageClean ? 0 : 1,
      pilotDecisionCoverageClean: decisionCoverageClean,
      coreRequiredUnits,
      coreCompletedUnits,
      coreCompletionRate: coreRequiredUnits ? coreCompletedUnits / coreRequiredUnits : 1,
      eligibleForRealPilotReview: eligible,
      autoApplyAllowed: false,
    }),
    pilotSample: eligible ? Object.freeze({
      workoutId: sessionId,
      completedAt,
      readiness,
      realWorkout: true,
      technicalHealthy,
      decisionCoverageClean,
      strengthQualifying: false,
    }) : null,
  }
}

async function finalize(athleteId, workoutId, completedAt, readiness = 'green', verdict = 'agree') {
  const mapped = result(athleteId, workoutId, completedAt, readiness)
  const receipt = await progressionShadowRecordOriginalHookReceipt(mapped, `${completedAt.slice(0, -1)}1Z`)
  const provenance = await progressionShadowRecordOriginalHookProvenance(mapped, receipt, `${completedAt.slice(0, -1)}2Z`)
  const human = await progressionShadowFinalizeHumanReview({
    athleteId,
    workoutId,
    reviewerRef: 'qa-reviewer-v7',
    reviewedAt: `${completedAt.slice(0, -1)}3Z`,
    expectedReadiness: readiness,
    expectedCoreRequiredUnits: 3,
    expectedCoreCompletedUnits: 3,
    expectedDecisionCoverageClean: true,
    verdict,
  })
  return { mapped, receipt, provenance, human }
}

const athleteId = 'athlete-v7'
const badHuman = await finalize(athleteId, 'green-bad-human', '2026-09-28T12:00:00.000Z', 'green', 'disagree')
await finalize(athleteId, 'yellow-good', '2026-09-29T12:00:00.000Z', 'yellow')
await finalize(athleteId, 'green-good-1', '2026-09-30T12:00:00.000Z', 'green')
await finalize(athleteId, 'green-good-2', '2026-10-01T12:00:00.000Z', 'green')

const disposition = await progressionShadowRecordReviewDisposition({
  athleteId,
  workoutId: 'green-bad-human',
  reviewerRef: 'qa-reviewer-v7',
  reason: 'HUMAN_REVIEW_ERROR',
  dispositionedAt: '2026-10-02T12:00:00.000Z',
})
await progressionShadowRecordReplacementWorkout({
  athleteId,
  disqualifiedWorkoutId: 'green-bad-human',
  replacementWorkoutId: 'green-good-2',
  reviewerRef: 'qa-reviewer-v7',
  linkedAt: '2026-10-02T13:00:00.000Z',
})

const exported = await progressionShadowExportPilotAuditJournal(athleteId, '2026-10-02T14:00:00.000Z')
check('Stage-6 fixture reaches evidence gate before restore', exported.backlog.evidenceGateSatisfied === true && exported.backlog.visibilityAuthorized === false)
const rebuiltDirect = progressionShadowRebuildAuditBacklogFromPackage(exported)
check('Stage-7 independent rebuild matches Stage-6 active sample count and coverage', rebuiltDirect.activeAcceptedWorkoutIds.length === exported.backlog.activeAcceptedWorkoutIds.length && rebuiltDirect.greenAcceptedCount === exported.backlog.greenAcceptedCount && rebuiltDirect.yellowAcceptedCount === exported.backlog.yellowAcceptedCount)

const verified = await progressionShadowVerifyAuditPackage(exported)
check('valid audit package verifies before restore', verified.evidenceGateSatisfied === true && verified.visibilityAuthorized === false)
const restored = await progressionShadowRestoreAuditPackage(exported, '2026-10-02T15:00:00.000Z')
check('valid audit package restores into isolated QA storage', restored?.athleteId === athleteId && restored?.contentDigest === exported.contentDigest && /^[a-f0-9]{64}$/.test(restored?.restoreDigest ?? ''))
check('restore rebuild is equivalent to exported backlog', restored.rebuiltBacklog.evidenceGateSatisfied === exported.backlog.evidenceGateSatisfied && restored.rebuiltBacklog.activeAcceptedWorkoutIds.length === exported.backlog.activeAcceptedWorkoutIds.length)
const restoreReplay = await progressionShadowRestoreAuditPackage(exported, '2026-10-03T15:00:00.000Z')
check('identical restore replay returns immutable original record', restoreReplay.restoredAt === '2026-10-02T15:00:00.000Z' && restoreReplay.restoreDigest === restored.restoreDigest)

let badSchemaRejected = false
try {
  await progressionShadowVerifyAuditPackage({ ...structuredClone(exported), schemaVersion: 'wrong.schema' })
} catch (error) {
  badSchemaRejected = /schema mismatch/.test(String(error))
}
check('restore rejects unknown schema', badSchemaRejected)

let badDigestRejected = false
try {
  const tampered = structuredClone(exported)
  tampered.backlog.greenAcceptedCount += 1
  await progressionShadowVerifyAuditPackage(tampered)
} catch (error) {
  badDigestRejected = /content digest mismatch/.test(String(error))
}
check('restore rejects package with broken outer digest', badDigestRejected)

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}
async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)))
  const out = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(out)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
function exportContent(pkg) {
  return {
    schemaVersion: pkg.schemaVersion,
    athleteId: pkg.athleteId,
    receipts: pkg.receipts,
    provenance: pkg.provenance,
    humanReviews: pkg.humanReviews,
    dispositions: pkg.dispositions,
    replacements: pkg.replacements,
    backlog: pkg.backlog,
  }
}
let semanticTamperRejected = false
try {
  const tampered = structuredClone(exported)
  tampered.backlog.greenAcceptedCount += 1
  tampered.contentDigest = await digest(exportContent(tampered))
  await progressionShadowVerifyAuditPackage(tampered)
} catch (error) {
  semanticTamperRejected = /rebuilt backlog mismatch/.test(String(error))
}
check('restore rejects semantically altered package even after outer digest is recomputed', semanticTamperRejected)

let athleteMismatchRejected = false
try {
  const tampered = structuredClone(exported)
  tampered.receipts[0].athleteId = 'foreign-athlete'
  tampered.contentDigest = await digest(exportContent(tampered))
  await progressionShadowVerifyAuditPackage(tampered)
} catch (error) {
  athleteMismatchRejected = /receipt athlete mismatch/.test(String(error))
}
check('restore rejects cross-athlete evidence injection', athleteMismatchRejected)

const beforeAuthorization = await progressionShadowAuthorizationStatus(athleteId, exported.contentDigest)
check('passing restored evidence alone cannot authorize visibility', beforeAuthorization.evidenceGateSatisfied === true && beforeAuthorization.operatorAuthorizationPresent === false && beforeAuthorization.visibilityAuthorized === false && beforeAuthorization.autoApplyAllowed === false)

let missingRestoreRejected = false
try {
  await progressionShadowRecordOperatorAuthorization({
    athleteId: 'unrestored-athlete',
    contentDigest: 'a'.repeat(64),
    operatorRef: 'operator-v7',
    operatorIntent: 'AUTHORIZE_VISIBLE_PILOT',
    realPilotEvidenceConfirmed: true,
  })
} catch (error) {
  missingRestoreRejected = /requires verified restored evidence/.test(String(error))
}
check('operator authorization cannot bypass verified restore', missingRestoreRejected)

let missingRealConfirmationRejected = false
try {
  await progressionShadowRecordOperatorAuthorization({
    athleteId,
    contentDigest: exported.contentDigest,
    operatorRef: 'operator-v7',
    operatorIntent: 'AUTHORIZE_VISIBLE_PILOT',
    realPilotEvidenceConfirmed: false,
  })
} catch (error) {
  missingRealConfirmationRejected = /explicitly confirm real pilot evidence/.test(String(error))
}
check('operator authorization requires explicit real-evidence confirmation', missingRealConfirmationRejected)

const notReadyAthlete = 'athlete-v7-not-ready'
await finalize(notReadyAthlete, 'only-green', '2026-10-03T12:00:00.000Z', 'green')
const notReadyExport = await progressionShadowExportPilotAuditJournal(notReadyAthlete, '2026-10-03T14:00:00.000Z')
await progressionShadowRestoreAuditPackage(notReadyExport, '2026-10-03T15:00:00.000Z')
let gateBypassRejected = false
try {
  await progressionShadowRecordOperatorAuthorization({
    athleteId: notReadyAthlete,
    contentDigest: notReadyExport.contentDigest,
    operatorRef: 'operator-v7',
    operatorIntent: 'AUTHORIZE_VISIBLE_PILOT',
    realPilotEvidenceConfirmed: true,
  })
} catch (error) {
  gateBypassRejected = /requires satisfied evidence gate/.test(String(error))
}
check('operator action cannot authorize an unsatisfied evidence gate', gateBypassRejected)

const authInput = {
  athleteId,
  contentDigest: exported.contentDigest,
  operatorRef: 'operator-v7',
  operatorIntent: 'AUTHORIZE_VISIBLE_PILOT',
  realPilotEvidenceConfirmed: true,
  authorizedAt: '2026-10-04T12:00:00.000Z',
  notes: 'Explicit controlled-pilot authorization fixture.',
}
const authorization = await progressionShadowRecordOperatorAuthorization(authInput)
check('explicit operator authorization is digest-bound to verified restore', authorization.restoreDigest === restored.restoreDigest && /^[a-f0-9]{64}$/.test(authorization.authorizationDigest))
const authorizedStatus = await progressionShadowAuthorizationStatus(athleteId, exported.contentDigest)
check('visibility requires evidence plus explicit matching operator authorization', authorizedStatus.evidenceGateSatisfied === true && authorizedStatus.operatorAuthorizationMatchesRestore === true && authorizedStatus.realPilotEvidenceConfirmed === true && authorizedStatus.visibilityAuthorized === true && authorizedStatus.autoApplyAllowed === false)

const authReplay = await progressionShadowRecordOperatorAuthorization({ ...authInput, authorizedAt: '2026-10-05T12:00:00.000Z' })
check('identical authorization replay returns immutable original record', authReplay.authorizedAt === '2026-10-04T12:00:00.000Z' && authReplay.authorizationDigest === authorization.authorizationDigest)
let authConflictRejected = false
try {
  await progressionShadowRecordOperatorAuthorization({ ...authInput, notes: 'changed later' })
} catch (error) {
  authConflictRejected = /already finalized with different evidence/.test(String(error))
}
check('operator authorization cannot be edited after finalization', authConflictRejected)

const reloaded = await import(`${pathToFileURL(stage7Path).href}?v7reload=${Date.now()}`)
const persistedRestore = await reloaded.progressionShadowGetRestoredAuditPackage(athleteId, exported.contentDigest)
const persistedAuth = await reloaded.progressionShadowGetOperatorAuthorization(athleteId, exported.contentDigest)
check('restore package survives module reload in isolated QA storage', persistedRestore?.restoreDigest === restored.restoreDigest)
check('operator authorization survives module reload in isolated QA storage', persistedAuth?.authorizationDigest === authorization.authorizationDigest)
check('Stage-7 operations never mutate Stage-6 immutable evidence', disposition.originalReceiptDigest === badHuman.receipt.evidenceDigest && exported.dispositions[0].dispositionDigest === disposition.dispositionDigest)

fs.unlinkSync(runtimeOpsPath)
fs.unlinkSync(runtimeReviewPath)

const failedChecks = checks.filter((entry) => !entry.ok)
if (failedChecks.length) {
  console.error(`Progression Shadow Stage-7 restore/authorization audit failed: ${failedChecks.length} check(s)`)
  process.exit(1)
}
console.log(`LetMeFly Progression Shadow Stage-7 restore + authorization audit: PASS (${checks.length} checks)`)
