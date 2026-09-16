#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/audit-progression-shadow-hidden-pilot-integration.mjs <target-source-dir>')
  process.exit(2)
}

const mainPath = path.join(target, 'src/main.ts')
const authorityPath = path.join(target, 'src/services/program-progression-service.ts')
const manifestPath = path.join(target, 'src/services/progression-shadow-hidden-pilot-manifest.ts')
const checksumPath = path.join(target, 'PROGRESSION_SHADOW_HIDDEN_PILOT_AUTHORITY.sha256')
const shadowPaths = [
  'src/services/progression-shadow-pilot.ts',
  'src/services/progression-shadow-review-engine.ts',
  'src/services/progression-shadow-read-adapter.ts',
  'src/services/progression-shadow-pilot-journal.ts',
  'src/services/progression-shadow-provenance-review.ts',
  'src/services/progression-shadow-pilot-operations.ts',
  'src/services/progression-shadow-restore-authorization.ts',
  'src/services/progression-shadow-hidden-pilot-manifest.ts',
].map((file) => path.join(target, file))

const required = [mainPath, authorityPath, manifestPath, checksumPath, ...shadowPaths]
if (!required.every(fs.existsSync)) {
  console.error('Hidden Pilot Integration audit is missing required reconstructed source')
  process.exit(1)
}

const main = fs.readFileSync(mainPath, 'utf8')
const manifest = fs.readFileSync(manifestPath, 'utf8')
const shadowSource = shadowPaths.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok), detail })
  console.log(`hidden pilot integration ${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`)
}

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const recordedAuthorityHash = fs.readFileSync(checksumPath, 'utf8').trim()
const currentAuthorityHash = sha256File(authorityPath)
check('authoritative progression source checksum is unchanged by integration', /^[a-f0-9]{64}$/.test(recordedAuthorityHash) && recordedAuthorityHash === currentAuthorityHash)

const completeAt = main.indexOf('await completeWorkout(state.athlete.id, completedSessionId)')
const reviewAt = main.indexOf('progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)')
const receiptAt = main.indexOf('progressionShadowRecordOriginalHookReceipt(shadowReview)')
const provenanceAt = main.indexOf('progressionShadowRecordOriginalHookProvenance(shadowReview, shadowReceipt)')
const advanceAt = main.indexOf('await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)')
check('automatic hidden capture runs only after canonical completion', completeAt >= 0 && reviewAt > completeAt && receiptAt > reviewAt && provenanceAt > receiptAt)
check('authoritative governed progression still runs after hidden capture', advanceAt > provenanceAt)

const tryAt = main.lastIndexOf('try {', reviewAt)
const catchAt = main.indexOf('} catch {', provenanceAt)
check('automatic hidden capture remains inside fail-open catch', tryAt > completeAt && tryAt < reviewAt && catchAt > provenanceAt && catchAt < advanceAt)

const forbiddenAutomaticCalls = [
  'progressionShadowFinalizeHumanReview(',
  'progressionShadowRecordReviewDisposition(',
  'progressionShadowRecordReplacementWorkout(',
  'progressionShadowExportPilotAuditJournal(',
  'progressionShadowRestoreAuditPackage(',
  'progressionShadowRecordOperatorAuthorization(',
]
for (const call of forbiddenAutomaticCalls) {
  check(`workout completion does not auto-call ${call.replace('(', '')}`, !main.includes(call))
}

check('hidden integration manifest is inert and not imported by app runtime', !main.includes('progression-shadow-hidden-pilot-manifest'))
check('manifest identifies program progression service as canonical authority', manifest.includes("canonicalTrainingAuthority: 'program-progression-service'"))
check('manifest limits automatic work to evidence receipt and provenance capture', manifest.includes("'completed-workout-evidence'") && manifest.includes("'original-hook-receipt'") && manifest.includes("'original-hook-provenance'"))
check('manifest keeps human and operational actions manual-only', manifest.includes("'human-review'") && manifest.includes("'review-disposition'") && manifest.includes("'replacement-link'") && manifest.includes("'audit-restore'") && manifest.includes("'operator-authorization'"))
check('manifest keeps visibility and auto-apply disabled', /visibilityEnabled:\s*false as const/.test(manifest) && /autoApplyAllowed:\s*false as const/.test(manifest))
check('manifest keeps gamification disabled', /gamificationEnabled:\s*false as const/.test(manifest))
check('manifest adds no canonical writes program mutation or network access', /networkAccessAdded:\s*false as const/.test(manifest) && /canonicalWritesAdded:\s*false as const/.test(manifest) && /programMutationAdded:\s*false as const/.test(manifest))

check('Shadow source adds no direct network path', !/fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|supabase/i.test(shadowSource))
check('Shadow source adds no UI rendering path', !/document\.|window\.|showToast|innerHTML|insertAdjacentHTML/.test(shadowSource))
check('generated hidden pilot source contains no gamification feature markers', !/crownstorm|main quest/i.test(shadowSource))

for (const dbName of [
  'letmefly.progression.shadow.pilot.v1',
  'letmefly.progression.shadow.pilot.review.v1',
  'letmefly.progression.shadow.pilot.operations.v1',
  'letmefly.progression.shadow.pilot.restore.v1',
]) {
  check(`isolated Shadow database contract exists: ${dbName}`, shadowSource.includes(dbName))
}

check('hidden integration is candidate-only', /candidateOnly:\s*true as const/.test(manifest) && manifest.includes("mode: 'hidden-real-workout-pilot-candidate'"))

const failed = checks.filter((entry) => !entry.ok)
if (failed.length) {
  console.error(`Hidden Pilot Integration audit failed: ${failed.length} check(s)`)
  process.exit(1)
}
console.log(`LetMeFly Progression Shadow hidden real-workout pilot integration audit: PASS (${checks.length} checks)`)
