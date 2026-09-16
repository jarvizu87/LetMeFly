#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const target = process.argv[2]
if (!target) {
  console.error('Usage: node --experimental-strip-types ci/audit-progression-shadow-pilot-operations-v6.mjs <target-source-dir>')
  process.exit(2)
}

const opsPath = path.join(target, 'src/services/progression-shadow-pilot-operations.ts')
const reviewPath = path.join(target, 'src/services/progression-shadow-provenance-review.ts')
const journalPath = path.join(target, 'src/services/progression-shadow-pilot-journal.ts')
const mainPath = path.join(target, 'src/main.ts')
if (![opsPath, reviewPath, journalPath, mainPath].every(fs.existsSync)) {
  console.error('Missing Stage-6 operations, Stage-5 review, Stage-4 journal, or main source')
  process.exit(1)
}

const source = fs.readFileSync(opsPath, 'utf8')
const main = fs.readFileSync(mainPath, 'utf8')
const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok), detail })
  console.log(`progression shadow v6 ${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`)
}

check('operations ledger is isolated from canonical app database', source.includes("letmefly.progression.shadow.pilot.operations.v1") && !/\.\.\/db\/local-db|from ['\"]\.\.\/db\/local-db/.test(source))
check('operations ledger has no browser key-value fallback', !/localStorage|sessionStorage/.test(source))
check('operations ledger has no Supabase or network access', !/supabase|fetch\s*\(|XMLHttpRequest|WebSocket/.test(source))
check('operations ledger has no UI access', !/document\.|window\.|navigator\.|showToast|render\s*\(/.test(source))
check('operations ledger has no authoritative program dependency', !/program-progression-service|programs\/(?:crownforge|crown-maintenance|black-crown)/.test(source))
check('operations storage is append-only', (source.match(/\.add\(record\)/g) ?? []).length === 2 && !/\.put\s*\(|\.delete\s*\(/.test(source))
check('only approved human-error disposition reasons exist', source.includes('HUMAN_REVIEW_ERROR') && source.includes('INVALID_RELOAD_CONFIRMATION'))
check('disposition cannot hide technical or decision-coverage failure', /cannot hide technical failure/.test(source) && /cannot hide decision-coverage failure/.test(source))
check('replacement must be a different human-accepted sample', /replacement must be a different workout/.test(source) && /replacement must be a human-accepted pilot sample/.test(source))
check('backlog keeps visibility and auto-apply hard-locked false', /visibilityAuthorized:\s*false as const/.test(source) && /autoApplyAllowed:\s*false as const/.test(source))
check('audit export carries deterministic SHA-256 content digest', /audit-export\.current\.v1/.test(source) && /contentDigest/.test(source) && /SHA-256/.test(source))
check('Stage-6 operations are not automatic in workout completion', !main.includes('progressionShadowRecordReviewDisposition') && !main.includes('progressionShadowRecordReplacementWorkout') && !main.includes('progressionShadowExportPilotAuditJournal'))

const journal = await import(`${pathToFileURL(journalPath).href}?v6journal=${Date.now()}`)
const { progressionShadowRecordOriginalHookReceipt } = journal

const runtimeReviewPath = path.join(target, 'src/services/progression-shadow-provenance-review.audit-v6.ts')
const reviewSource = fs.readFileSync(reviewPath, 'utf8').replace("from './progression-shadow-pilot-journal'", "from './progression-shadow-pilot-journal.ts'")
fs.writeFileSync(runtimeReviewPath, reviewSource)
const review = await import(`${pathToFileURL(runtimeReviewPath).href}?v6review=${Date.now()}`)
const {
  progressionShadowRecordOriginalHookProvenance,
  progressionShadowFinalizeHumanReview,
} = review

const runtimeOpsPath = path.join(target, 'src/services/progression-shadow-pilot-operations.audit-v6.ts')
const opsSource = source
  .replace("from './progression-shadow-pilot-journal'", "from './progression-shadow-pilot-journal.ts'")
  .replace("from './progression-shadow-provenance-review'", "from './progression-shadow-provenance-review.audit-v6.ts'")
fs.writeFileSync(runtimeOpsPath, opsSource)
const ops = await import(`${pathToFileURL(runtimeOpsPath).href}?v6ops=${Date.now()}`)
const {
  progressionShadowRecordReviewDisposition,
  progressionShadowGetReviewDisposition,
  progressionShadowRecordReplacementWorkout,
  progressionShadowGetReplacementRecord,
  progressionShadowPilotOperationsBacklog,
  progressionShadowExportPilotAuditJournal,
} = ops

const result = (athleteId, sessionId, completedAt, options = {}) => {
  const coreRequiredUnits = options.coreRequiredUnits ?? 3
  const coreCompletedUnits = options.coreCompletedUnits ?? 3
  const technicalHealthy = options.technicalHealthy ?? true
  const readiness = options.readiness ?? 'green'
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

async function finalizeMachineAndHuman(athleteId, workoutId, completedAt, readiness = 'green', humanOptions = {}) {
  const mapped = result(athleteId, workoutId, completedAt, { readiness, ...(humanOptions.machineOptions ?? {}) })
  const receipt = await progressionShadowRecordOriginalHookReceipt(mapped, `${completedAt.slice(0, -1)}1Z`)
  const provenance = await progressionShadowRecordOriginalHookProvenance(mapped, receipt, `${completedAt.slice(0, -1)}2Z`)
  const human = await progressionShadowFinalizeHumanReview({
    athleteId,
    workoutId,
    reviewerRef: humanOptions.reviewerRef ?? 'qa-reviewer-v6',
    reviewedAt: humanOptions.reviewedAt ?? `${completedAt.slice(0, -1)}3Z`,
    expectedReadiness: humanOptions.expectedReadiness ?? readiness,
    expectedCoreRequiredUnits: humanOptions.expectedCoreRequiredUnits ?? 3,
    expectedCoreCompletedUnits: humanOptions.expectedCoreCompletedUnits ?? 3,
    expectedDecisionCoverageClean: humanOptions.expectedDecisionCoverageClean ?? true,
    verdict: humanOptions.verdict ?? 'agree',
    notes: humanOptions.notes,
  })
  return { mapped, receipt, provenance, human }
}

const athleteId = 'athlete-v6'
const greenA = await finalizeMachineAndHuman(athleteId, 'green-a', '2026-09-20T12:00:00.000Z', 'green', {
  verdict: 'disagree',
  notes: 'Fixture: independent review was entered incorrectly.',
})
await finalizeMachineAndHuman(athleteId, 'yellow-b', '2026-09-21T12:00:00.000Z', 'yellow')
await finalizeMachineAndHuman(athleteId, 'green-c', '2026-09-22T12:00:00.000Z', 'green')
await finalizeMachineAndHuman(athleteId, 'green-d', '2026-09-23T12:00:00.000Z', 'green')

const dispositionInput = {
  athleteId,
  workoutId: 'green-a',
  reviewerRef: 'qa-reviewer-v6',
  reason: 'HUMAN_REVIEW_ERROR',
  dispositionedAt: '2026-09-24T12:00:00.000Z',
  notes: 'Quarantine immutable human-entry mistake; require replacement.',
}
const disposition = await progressionShadowRecordReviewDisposition(dispositionInput)
check('technically healthy human-review error can be quarantined without rewriting evidence', disposition?.workoutId === 'green-a' && disposition?.replacementRequired === true)
check('disposition binds receipt provenance and human-review digests', disposition?.originalReceiptDigest === greenA.receipt.evidenceDigest && disposition?.provenanceDigest === greenA.provenance.provenanceDigest && disposition?.humanReviewDigest === greenA.human.humanReviewDigest)

const dispositionReplay = await progressionShadowRecordReviewDisposition({ ...dispositionInput, dispositionedAt: '2026-09-25T12:00:00.000Z' })
check('identical disposition replay returns immutable original record', dispositionReplay?.dispositionedAt === '2026-09-24T12:00:00.000Z' && dispositionReplay?.dispositionDigest === disposition?.dispositionDigest)

let dispositionConflictRejected = false
try {
  await progressionShadowRecordReviewDisposition({ ...dispositionInput, reason: 'INVALID_RELOAD_CONFIRMATION' })
} catch (error) {
  dispositionConflictRejected = /already finalized with different evidence/.test(String(error))
}
check('changed disposition cannot overwrite immutable history', dispositionConflictRejected)

const failed = await finalizeMachineAndHuman('athlete-v6-failed', 'technical-failed', '2026-09-20T14:00:00.000Z', 'green', {
  machineOptions: { technicalHealthy: false, eligible: false },
})
let technicalFailureHidden = false
try {
  await progressionShadowRecordReviewDisposition({
    athleteId: 'athlete-v6-failed',
    workoutId: 'technical-failed',
    reviewerRef: 'qa-reviewer-v6',
    reason: 'HUMAN_REVIEW_ERROR',
  })
} catch (error) {
  technicalFailureHidden = /cannot hide technical failure/.test(String(error))
}
check('disposition cannot suppress technical failure', technicalFailureHidden && failed.receipt.technicalHealthy === false)

let selfReplacementRejected = false
try {
  await progressionShadowRecordReplacementWorkout({
    athleteId,
    disqualifiedWorkoutId: 'green-a',
    replacementWorkoutId: 'green-a',
    reviewerRef: 'qa-reviewer-v6',
  })
} catch (error) {
  selfReplacementRejected = /different workout/.test(String(error))
}
check('disqualified workout cannot replace itself', selfReplacementRejected)

const backlogBeforeReplacement = await progressionShadowPilotOperationsBacklog(athleteId)
check('disqualified sample is excluded and replacement is explicitly pending', backlogBeforeReplacement.disqualifiedWorkoutIds.includes('green-a') && !backlogBeforeReplacement.activeAcceptedWorkoutIds.includes('green-a') && backlogBeforeReplacement.replacementPendingWorkoutIds.includes('green-a'))
check('replacement requirement blocks evidence gate before link', backlogBeforeReplacement.evidenceGateSatisfied === false && backlogBeforeReplacement.replacementLinksRemaining === 1)

const replacement = await progressionShadowRecordReplacementWorkout({
  athleteId,
  disqualifiedWorkoutId: 'green-a',
  replacementWorkoutId: 'green-d',
  reviewerRef: 'qa-reviewer-v6',
  linkedAt: '2026-09-25T13:00:00.000Z',
})
check('replacement link binds a different human-accepted workout', replacement?.disqualifiedWorkoutId === 'green-a' && replacement?.replacementWorkoutId === 'green-d')
check('replacement record binds immutable disposition and replacement evidence', replacement?.dispositionDigest === disposition?.dispositionDigest && /^[a-f0-9]{64}$/.test(replacement?.replacementDigest ?? ''))

const replacementReplay = await progressionShadowRecordReplacementWorkout({
  athleteId,
  disqualifiedWorkoutId: 'green-a',
  replacementWorkoutId: 'green-d',
  reviewerRef: 'qa-reviewer-v6',
  linkedAt: '2026-09-26T13:00:00.000Z',
})
check('identical replacement replay returns immutable original link', replacementReplay?.linkedAt === '2026-09-25T13:00:00.000Z' && replacementReplay?.replacementDigest === replacement?.replacementDigest)

const backlog = await progressionShadowPilotOperationsBacklog(athleteId)
check('backlog reports three active accepted reviews after quarantine', backlog.activeAcceptedWorkoutIds.length === 3 && backlog.activeAcceptedWorkoutIds.includes('yellow-b') && backlog.activeAcceptedWorkoutIds.includes('green-c') && backlog.activeAcceptedWorkoutIds.includes('green-d'))
check('backlog reports required Green and Yellow coverage', backlog.greenAcceptedCount === 2 && backlog.yellowAcceptedCount === 1)
check('linked replacement clears replacement requirement without restoring disqualified sample', backlog.replacementLinksRemaining === 0 && !backlog.activeAcceptedWorkoutIds.includes('green-a'))
check('evidence gate may pass while visibility and auto-apply stay locked false', backlog.evidenceGateSatisfied === true && backlog.visibilityAuthorized === false && backlog.autoApplyAllowed === false)

const exportA = await progressionShadowExportPilotAuditJournal(athleteId, '2026-09-26T14:00:00.000Z')
const exportB = await progressionShadowExportPilotAuditJournal(athleteId, '2026-09-27T14:00:00.000Z')
check('audit export contains pilot evidence only and expected operations records', exportA.receipts.length === 4 && exportA.provenance.length === 4 && exportA.humanReviews.length === 4 && exportA.dispositions.length === 1 && exportA.replacements.length === 1)
check('audit export digest is stable across export timestamps', exportA.contentDigest === exportB.contentDigest && /^[a-f0-9]{64}$/.test(exportA.contentDigest))

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}
async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)))
  const result = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(result)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
const exportContent = {
  schemaVersion: exportA.schemaVersion,
  athleteId: exportA.athleteId,
  receipts: exportA.receipts,
  provenance: exportA.provenance,
  humanReviews: exportA.humanReviews,
  dispositions: exportA.dispositions,
  replacements: exportA.replacements,
  backlog: exportA.backlog,
}
check('independent verifier reproduces audit-export digest', await digest(exportContent) === exportA.contentDigest)
const tamperedContent = structuredClone(exportContent)
tamperedContent.backlog.greenAcceptedCount += 1
check('audit-export digest exposes tampering', await digest(tamperedContent) !== exportA.contentDigest)

const storedDisposition = await progressionShadowGetReviewDisposition(athleteId, 'green-a')
const storedReplacement = await progressionShadowGetReplacementRecord(athleteId, 'green-a')
check('operations records survive reloadable isolated IndexedDB storage', storedDisposition?.dispositionDigest === disposition?.dispositionDigest && storedReplacement?.replacementDigest === replacement?.replacementDigest)

fs.unlinkSync(runtimeOpsPath)
fs.unlinkSync(runtimeReviewPath)

const failedChecks = checks.filter((entry) => !entry.ok)
if (failedChecks.length) {
  console.error(`Progression Shadow Stage-6 pilot-operations audit failed: ${failedChecks.length} check(s)`)
  process.exit(1)
}
console.log(`LetMeFly Progression Shadow Stage-6 pilot operations audit: PASS (${checks.length} checks)`)
