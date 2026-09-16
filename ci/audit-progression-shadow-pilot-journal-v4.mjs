#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const target = process.argv[2]
if (!target) {
  console.error('Usage: node --experimental-strip-types ci/audit-progression-shadow-pilot-journal-v4.mjs <target-source-dir>')
  process.exit(2)
}

const journalPath = path.join(target, 'src/services/progression-shadow-pilot-journal.ts')
const mainPath = path.join(target, 'src/main.ts')
if (!fs.existsSync(journalPath) || !fs.existsSync(mainPath)) {
  console.error('Missing Stage-4 Shadow journal or main source')
  process.exit(1)
}

const source = fs.readFileSync(journalPath, 'utf8')
const main = fs.readFileSync(mainPath, 'utf8')
const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok), detail })
  console.log(`progression shadow v4 ${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`)
}

check('journal uses isolated historical pilot database name', source.includes("letmefly.progression.shadow.pilot.v1"))
check('journal has no localStorage or sessionStorage fallback', !/localStorage|sessionStorage/.test(source))
check('journal imports no canonical local database service', !/\.\/\.\.\/db\/local-db|from ['\"]\.\.\/db\/local-db/.test(source))
check('journal has no Supabase or network access', !/supabase|fetch\s*\(|XMLHttpRequest|WebSocket/.test(source))
check('journal has no UI access', !/document\.|window\.|navigator\.|showToast|render\s*\(/.test(source))
check('journal has no authoritative progression or governed program dependency', !/program-progression-service|programs\/(?:crownforge|crown-maintenance|black-crown)/.test(source))
check('journal has no Crownstorm or gamification dependency', !/Crownstorm|crownstorm|\bXP\b|main quest|level-up|streak/i.test(source))
check('receipt storage is add-only, never put/update/delete', /\.add\(receipt\)/.test(source) && !/\.put\s*\(|\.delete\s*\(/.test(source))
check('receipt carries deterministic SHA-256 evidence digest', /SHA-256/.test(source) && /evidenceDigest/.test(source))
check('receipt exposes processing and decision-coverage state', /processingSucceeded/.test(source) && /decisionCoverageClean/.test(source))

const completeAt = main.indexOf('await completeWorkout(state.athlete.id, completedSessionId)')
const reviewAt = main.indexOf('const shadowReview = await progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)')
const receiptAt = main.indexOf('await progressionShadowRecordOriginalHookReceipt(shadowReview)')
const advanceAt = main.indexOf('await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)')
check('original hook reads review only after canonical workout persistence', completeAt >= 0 && reviewAt > completeAt)
check('original hook records receipt immediately after derived review', receiptAt > reviewAt)
check('Shadow receipt remains before authoritative program progression', advanceAt > receiptAt)
check('journal failure remains inside fail-open Shadow catch', /try\s*\{[\s\S]*progressionShadowReviewCompletedWorkout[\s\S]*progressionShadowRecordOriginalHookReceipt[\s\S]*\}\s*catch\s*\{/.test(main))

const moduleUrl = `${pathToFileURL(journalPath).href}?audit=${Date.now()}`
const journal = await import(moduleUrl)
const {
  progressionShadowRecordOriginalHookReceipt,
  progressionShadowGetPilotReceipt,
  progressionShadowPilotReceiptBacklog,
} = journal

const result = (sessionId, completedAt, coreCompletedUnits = 3) => ({
  athleteId: 'athlete-v4',
  sessionId,
  completedAt,
  readiness: 'green',
  technicalHealthy: true,
  warnings: Object.freeze([]),
  review: Object.freeze({
    workoutId: sessionId,
    readiness: 'green',
    work: Object.freeze([
      Object.freeze({
        id: `${sessionId}-exercise`,
        priority: 'mandatory',
        prescribedUnits: 3,
        completedUnits: coreCompletedUnits,
        effectiveRequiredUnits: 3,
        countsTowardCoreAdherence: true,
        conditionalActive: null,
      }),
    ]),
    decisionGaps: Object.freeze([]),
    decisionGapCount: 0,
    pilotDecisionCoverageClean: true,
    coreRequiredUnits: 3,
    coreCompletedUnits,
    coreCompletionRate: coreCompletedUnits / 3,
    eligibleForRealPilotReview: true,
    autoApplyAllowed: false,
  }),
  pilotSample: Object.freeze({
    workoutId: sessionId,
    completedAt,
    readiness: 'green',
    realWorkout: true,
    technicalHealthy: true,
    decisionCoverageClean: true,
    strengthQualifying: false,
  }),
})

const first = await progressionShadowRecordOriginalHookReceipt(
  result('workout-1', '2026-09-16T12:00:00.000Z'),
  '2026-09-16T12:00:01.000Z',
)
check('first original-hook receipt is stored', first?.workoutId === 'workout-1' && first?.processingSucceeded === true)
check('first receipt records eligibility without enabling visibility', first?.eligibleForRealPilotReview === true)
check('receipt digest is a SHA-256 hex value', /^[a-f0-9]{64}$/.test(first?.evidenceDigest ?? ''))

const replay = await progressionShadowRecordOriginalHookReceipt(
  result('workout-1', '2026-09-16T12:00:00.000Z'),
  '2026-09-16T12:05:00.000Z',
)
check('identical replay returns immutable original receipt', replay?.capturedAt === '2026-09-16T12:00:01.000Z' && replay?.evidenceDigest === first?.evidenceDigest)

const afterReplay = await progressionShadowPilotReceiptBacklog('athlete-v4')
check('identical replay cannot create a second receipt', afterReplay.length === 1)

let conflictRejected = false
try {
  await progressionShadowRecordOriginalHookReceipt(
    result('workout-1', '2026-09-16T12:00:00.000Z', 2),
    '2026-09-16T12:10:00.000Z',
  )
} catch (error) {
  conflictRejected = /evidence conflict/.test(String(error))
}
check('changed replay evidence cannot replace original receipt', conflictRejected)
const originalAfterConflict = await progressionShadowGetPilotReceipt('athlete-v4', 'workout-1')
check('original receipt survives conflicting replay unchanged', originalAfterConflict?.evidenceDigest === first?.evidenceDigest && originalAfterConflict?.coreCompletedUnits === 3)

await progressionShadowRecordOriginalHookReceipt(
  result('workout-2', '2026-09-17T12:00:00.000Z'),
  '2026-09-17T12:00:01.000Z',
)
const ordered = await progressionShadowPilotReceiptBacklog('athlete-v4')
check('athlete backlog reads isolated receipts in workout completion order', ordered.length === 2 && ordered[0]?.workoutId === 'workout-1' && ordered[1]?.workoutId === 'workout-2')

// Simulate app/module reload: a fresh module instance must read the same isolated
// IndexedDB receipt without depending on an in-memory cache.
const reloaded = await import(`${pathToFileURL(journalPath).href}?reload=${Date.now()}`)
const persisted = await reloaded.progressionShadowGetPilotReceipt('athlete-v4', 'workout-1')
check('pilot receipt survives module reload through isolated IndexedDB', persisted?.evidenceDigest === first?.evidenceDigest)

const failed = checks.filter((entry) => !entry.ok)
if (failed.length) {
  console.error(`Progression Shadow Stage-4 journal audit failed: ${failed.length} check(s)`)
  process.exit(1)
}
console.log(`LetMeFly Progression Shadow Stage-4 append-only pilot journal audit: PASS (${checks.length} checks)`)
