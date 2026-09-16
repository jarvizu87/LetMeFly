#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const target = process.argv[2]
if (!target) {
  console.error('Usage: node --experimental-strip-types ci/audit-progression-shadow-provenance-review-v5.mjs <target-source-dir>')
  process.exit(2)
}

const reviewPath = path.join(target, 'src/services/progression-shadow-provenance-review.ts')
const journalPath = path.join(target, 'src/services/progression-shadow-pilot-journal.ts')
const mainPath = path.join(target, 'src/main.ts')
if (!fs.existsSync(reviewPath) || !fs.existsSync(journalPath) || !fs.existsSync(mainPath)) {
  console.error('Missing Stage-5 provenance/review, Stage-4 journal, or main source')
  process.exit(1)
}

const source = fs.readFileSync(reviewPath, 'utf8')
const main = fs.readFileSync(mainPath, 'utf8')
const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok), detail })
  console.log(`progression shadow v5 ${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`)
}

check('review ledger uses isolated pilot-review database', source.includes("letmefly.progression.shadow.pilot.review.v1"))
check('review ledger has no browser key-value fallback', !/localStorage|sessionStorage/.test(source))
check('review ledger imports no canonical local database service', !/\.\.\/db\/local-db|from ['\"]\.\.\/db\/local-db/.test(source))
check('review ledger has no Supabase or network access', !/supabase|fetch\s*\(|XMLHttpRequest|WebSocket/.test(source))
check('review ledger has no UI access', !/document\.|window\.|navigator\.|showToast|render\s*\(/.test(source))
check('review ledger has no authoritative progression or governed program dependency', !/program-progression-service|programs\/(?:crownforge|crown-maintenance|black-crown)/.test(source))
check('review ledger has no Crownstorm or gamification dependency', !/Crownstorm|crownstorm|\bXP\b|main quest|level-up|streak/i.test(source))
check('provenance and human review storage are add-only', (source.match(/\.add\(record\)/g) ?? []).length === 2 && !/\.put\s*\(|\.delete\s*\(/.test(source))
check('provenance binds original receipt and mapped review SHA-256 digests', /originalReceiptDigest/.test(source) && /mappedReviewDigest/.test(source) && /provenanceDigest/.test(source) && /SHA-256/.test(source))
check('human review is immutable and digest-bound', /humanReviewDigest/.test(source) && /already finalized with different evidence/.test(source))
check('rebuilt review hard-locks visibility and auto-apply false', /visibilityAuthorized:\s*false as const/.test(source) && /autoApplyAllowed:\s*false as const/.test(source))

const completeAt = main.indexOf('await completeWorkout(state.athlete.id, completedSessionId)')
const reviewAt = main.indexOf('const shadowReview = await progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)')
const receiptAt = main.indexOf('const shadowReceipt = await progressionShadowRecordOriginalHookReceipt(shadowReview)')
const provenanceAt = main.indexOf('progressionShadowRecordOriginalHookProvenance(shadowReview, shadowReceipt)')
const advanceAt = main.indexOf('await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)')
check('provenance is captured only after canonical workout persistence', completeAt >= 0 && reviewAt > completeAt && receiptAt > reviewAt && provenanceAt > receiptAt)
check('provenance remains before authoritative program progression', advanceAt > provenanceAt)
check('human review finalization is never automatic in workout completion', !main.includes('progressionShadowFinalizeHumanReview'))
check('Stage-5 provenance remains inside fail-open Shadow catch', /try\s*\{[\s\S]*progressionShadowReviewCompletedWorkout[\s\S]*progressionShadowRecordOriginalHookReceipt[\s\S]*progressionShadowRecordOriginalHookProvenance[\s\S]*\}\s*catch\s*\{/.test(main))

const journal = await import(`${pathToFileURL(journalPath).href}?v5journal=${Date.now()}`)
const {
  progressionShadowRecordOriginalHookReceipt,
  progressionShadowGetPilotReceipt,
} = journal

// Node's type-strip runtime requires an explicit extension for the one Stage-5
// value import. The production source intentionally keeps bundler-style imports.
const runtimeReviewPath = path.join(target, 'src/services/progression-shadow-provenance-review.audit.ts')
const runtimeSource = source.replace("from './progression-shadow-pilot-journal'", "from './progression-shadow-pilot-journal.ts'")
fs.writeFileSync(runtimeReviewPath, runtimeSource)

let reviewModule
try {
  reviewModule = await import(`${pathToFileURL(runtimeReviewPath).href}?v5=${Date.now()}`)
} catch (error) {
  fs.unlinkSync(runtimeReviewPath)
  throw error
}

const {
  progressionShadowRecordOriginalHookProvenance,
  progressionShadowGetOriginalHookProvenance,
  progressionShadowFinalizeHumanReview,
  progressionShadowGetFinalizedHumanReview,
  progressionShadowRebuildFinalizedPilotReview,
} = reviewModule

const result = (sessionId, completedAt, options = {}) => {
  const coreRequiredUnits = options.coreRequiredUnits ?? 3
  const coreCompletedUnits = options.coreCompletedUnits ?? 3
  const technicalHealthy = options.technicalHealthy ?? true
  const readiness = options.readiness ?? 'green'
  const decisionCoverageClean = options.decisionCoverageClean ?? true
  const eligible = options.eligible ?? (technicalHealthy && decisionCoverageClean)
  return {
    athleteId: 'athlete-v5',
    sessionId,
    completedAt,
    readiness,
    technicalHealthy,
    warnings: Object.freeze(technicalHealthy ? [] : ['technical-fixture']),
    review: Object.freeze({
      workoutId: sessionId,
      readiness,
      work: Object.freeze([
        Object.freeze({
          id: `${sessionId}-exercise`,
          priority: 'mandatory',
          prescribedUnits: coreRequiredUnits,
          completedUnits: coreCompletedUnits,
          effectiveRequiredUnits: coreRequiredUnits,
          countsTowardCoreAdherence: true,
          conditionalActive: null,
        }),
      ]),
      decisionGaps: Object.freeze([]),
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

const firstResult = result('workout-v5-1', '2026-09-16T18:00:00.000Z')
const firstReceipt = await progressionShadowRecordOriginalHookReceipt(firstResult, '2026-09-16T18:00:01.000Z')
const firstProvenance = await progressionShadowRecordOriginalHookProvenance(firstResult, firstReceipt, '2026-09-16T18:00:02.000Z')
check('original-hook provenance is stored', firstProvenance?.workoutId === 'workout-v5-1')
check('provenance binds immutable original receipt digest', firstProvenance?.originalReceiptDigest === firstReceipt?.evidenceDigest)
check('mapped-review and provenance digests are SHA-256 hex', /^[a-f0-9]{64}$/.test(firstProvenance?.mappedReviewDigest ?? '') && /^[a-f0-9]{64}$/.test(firstProvenance?.provenanceDigest ?? ''))

const provenanceReplay = await progressionShadowRecordOriginalHookProvenance(firstResult, firstReceipt, '2026-09-16T18:10:00.000Z')
check('identical provenance replay returns immutable original record', provenanceReplay?.capturedAt === '2026-09-16T18:00:02.000Z' && provenanceReplay?.provenanceDigest === firstProvenance?.provenanceDigest)

let mappedConflictRejected = false
try {
  await progressionShadowRecordOriginalHookProvenance(
    result('workout-v5-1', '2026-09-16T18:00:00.000Z', { coreCompletedUnits: 2 }),
    firstReceipt,
    '2026-09-16T18:20:00.000Z',
  )
} catch (error) {
  mappedConflictRejected = /provenance conflict/.test(String(error))
}
check('changed mapped evidence cannot replace original provenance', mappedConflictRejected)

const thirdResult = result('workout-v5-3', '2026-09-18T18:00:00.000Z')
const thirdReceipt = await progressionShadowRecordOriginalHookReceipt(thirdResult, '2026-09-18T18:00:01.000Z')
let forgedReceiptRejected = false
try {
  await progressionShadowRecordOriginalHookProvenance(
    thirdResult,
    { ...thirdReceipt, evidenceDigest: '0'.repeat(64) },
    '2026-09-18T18:00:02.000Z',
  )
} catch (error) {
  forgedReceiptRejected = /immutable stored original receipt/.test(String(error))
}
check('provenance rejects a receipt that does not match immutable stored evidence', forgedReceiptRejected)

const humanInput = {
  athleteId: 'athlete-v5',
  workoutId: 'workout-v5-1',
  reviewerRef: 'qa-reviewer-1',
  reviewedAt: '2026-09-16T19:00:00.000Z',
  expectedReadiness: 'green',
  expectedCoreRequiredUnits: 3,
  expectedCoreCompletedUnits: 3,
  expectedDecisionCoverageClean: true,
  verdict: 'agree',
  notes: 'Independent pilot check matched machine evidence.',
}
const human = await progressionShadowFinalizeHumanReview(humanInput)
check('human review finalizes only after receipt and provenance exist', human?.originalReceiptDigest === firstReceipt?.evidenceDigest && human?.provenanceDigest === firstProvenance?.provenanceDigest)
check('human review carries deterministic digest', /^[a-f0-9]{64}$/.test(human?.humanReviewDigest ?? ''))

const humanReplay = await progressionShadowFinalizeHumanReview({ ...humanInput, reviewedAt: '2026-09-16T20:00:00.000Z' })
check('identical human-review replay returns immutable original review', humanReplay?.reviewedAt === '2026-09-16T19:00:00.000Z' && humanReplay?.humanReviewDigest === human?.humanReviewDigest)

let humanConflictRejected = false
try {
  await progressionShadowFinalizeHumanReview({ ...humanInput, verdict: 'disagree' })
} catch (error) {
  humanConflictRejected = /already finalized with different evidence/.test(String(error))
}
check('changed finalized human review cannot overwrite history', humanConflictRejected)

const rebuilt = await progressionShadowRebuildFinalizedPilotReview('athlete-v5', 'workout-v5-1')
check('canonical pilot review is rebuilt from receipt provenance and human evidence', rebuilt.receiptPresent && rebuilt.provenanceClean && rebuilt.humanReviewPresent && rebuilt.humanMatchesMachine)
check('matching human review may qualify sample but cannot authorize visibility', rebuilt.eligibleForHumanAcceptedPilotSample === true && rebuilt.visibilityAuthorized === false && rebuilt.autoApplyAllowed === false)

const pendingResult = result('workout-v5-2', '2026-09-17T18:00:00.000Z')
const pendingReceipt = await progressionShadowRecordOriginalHookReceipt(pendingResult, '2026-09-17T18:00:01.000Z')
await progressionShadowRecordOriginalHookProvenance(pendingResult, pendingReceipt, '2026-09-17T18:00:02.000Z')
const pending = await progressionShadowRebuildFinalizedPilotReview('athlete-v5', 'workout-v5-2')
check('provenance alone does not count as human-accepted pilot evidence', pending.provenanceClean && !pending.humanReviewPresent && !pending.eligibleForHumanAcceptedPilotSample)

const failedResult = result('workout-v5-failed', '2026-09-19T18:00:00.000Z', { technicalHealthy: false, eligible: false })
const failedReceipt = await progressionShadowRecordOriginalHookReceipt(failedResult, '2026-09-19T18:00:01.000Z')
await progressionShadowRecordOriginalHookProvenance(failedResult, failedReceipt, '2026-09-19T18:00:02.000Z')
await progressionShadowFinalizeHumanReview({
  athleteId: 'athlete-v5',
  workoutId: 'workout-v5-failed',
  reviewerRef: 'qa-reviewer-1',
  reviewedAt: '2026-09-19T19:00:00.000Z',
  expectedReadiness: 'green',
  expectedCoreRequiredUnits: 3,
  expectedCoreCompletedUnits: 3,
  expectedDecisionCoverageClean: true,
  verdict: 'agree',
})
const failedRebuilt = await progressionShadowRebuildFinalizedPilotReview('athlete-v5', 'workout-v5-failed')
check('human agreement cannot suppress technical failure', failedRebuilt.humanMatchesMachine && !failedRebuilt.technicallyHealthy && !failedRebuilt.eligibleForHumanAcceptedPilotSample)

const reloaded = await import(`${pathToFileURL(runtimeReviewPath).href}?reload=${Date.now()}`)
const persistedProvenance = await reloaded.progressionShadowGetOriginalHookProvenance('athlete-v5', 'workout-v5-1')
const persistedHuman = await reloaded.progressionShadowGetFinalizedHumanReview('athlete-v5', 'workout-v5-1')
check('provenance survives module reload through isolated IndexedDB', persistedProvenance?.provenanceDigest === firstProvenance?.provenanceDigest)
check('finalized human review survives module reload through isolated IndexedDB', persistedHuman?.humanReviewDigest === human?.humanReviewDigest)

const storedReceiptAfterHumanReview = await progressionShadowGetPilotReceipt('athlete-v5', 'workout-v5-1')
check('human review never mutates original Stage-4 receipt', storedReceiptAfterHumanReview?.evidenceDigest === firstReceipt?.evidenceDigest && storedReceiptAfterHumanReview?.capturedAt === firstReceipt?.capturedAt)

fs.unlinkSync(runtimeReviewPath)

const failedChecks = checks.filter((entry) => !entry.ok)
if (failedChecks.length) {
  console.error(`Progression Shadow Stage-5 provenance/human-review audit failed: ${failedChecks.length} check(s)`)
  process.exit(1)
}
console.log(`LetMeFly Progression Shadow Stage-5 provenance + human-review audit: PASS (${checks.length} checks)`)
