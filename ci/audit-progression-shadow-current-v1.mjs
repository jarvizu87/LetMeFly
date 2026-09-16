#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/audit-progression-shadow-current-v1.mjs <target-source-dir>')
  process.exit(2)
}

const read = (relative) => fs.readFileSync(path.join(target, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(target, relative))
const shadowPath = 'src/services/progression-shadow-pilot.ts'
const shadow = exists(shadowPath) ? read(shadowPath) : ''
const main = read('src/main.ts')
const progression = read('src/services/program-progression-service.ts')

const completeIndex = main.indexOf('await completeWorkout(state.athlete.id, completedSessionId)')
const shadowIndex = main.indexOf('progressionShadowPilotReview({', completeIndex)
const progressionIndex = main.indexOf('advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)', completeIndex)

const forbiddenShadowPatterns = [
  ['IndexedDB access', /indexedDB|openLetMeFlyDb|requestToPromise|transactionDone/],
  ['Supabase/network access', /supabase|fetch\s*\(|XMLHttpRequest|WebSocket/],
  ['browser storage writes', /localStorage|sessionStorage/],
  ['DOM/UI access', /document\.|window\.|navigator\.|showToast|render\s*\(/],
  ['authoritative progression import', /program-progression-service/],
  ['governed program package import', /programs\/(?:crownforge|crown-maintenance|black-crown)/],
  ['Crownstorm/gamification dependency', /Crownstorm|crownstorm|XP\b|main quest/i],
]

const checks = new Map([
  ['shadow pilot source exists', exists(shadowPath)],
  ['shadow exposes completed-workout event review', shadow.includes('progressionShadowPilotReview(')],
  ['shadow exposes review backlog for audit/review', shadow.includes('progressionShadowPilotReviewBacklog()')],
  ['shadow is explicitly non-auto-applying', shadow.includes('canAutoApply: false')],
  ['shadow requires human approval', shadow.includes('approvalRequired: true')],
  ['stage-1 outcome remains unknown until engine review is ported', shadow.includes("outcome: 'unknown' as const")],
  ['stage-1 decision is observation only', shadow.includes("decision: 'observe' as const")],
  ['event dedupe is athlete/program/event scoped', shadow.includes("`${requiredText(event.athleteId, 'athleteId')}:${requiredText(event.programKey, 'programKey')}:${requiredText(event.eventId, 'eventId')}`")],
  ['main imports hidden shadow pilot', main.includes("import { progressionShadowPilotReview } from './services/progression-shadow-pilot'" )],
  ['exactly one completion hook exists', (main.match(/progressionShadowPilotReview\(\{/g) || []).length === 1],
  ['shadow runs only after completed workout persistence', completeIndex >= 0 && shadowIndex > completeIndex],
  ['shadow runs before authoritative progression without replacing it', shadowIndex >= 0 && progressionIndex > shadowIndex],
  ['shadow failure is fail-open', main.includes('Shadow is observational only: never block workout completion or governed progression.')],
  ['authoritative progression call remains present', progressionIndex >= 0],
  ['authoritative progression service remains intact', progression.includes('export async function advanceProgramAfterWorkout')],
])

for (const [label, pattern] of forbiddenShadowPatterns) {
  checks.set(`shadow has no ${label}`, !pattern.test(shadow))
}

// A Shadow failure must never surface as a user-facing completion failure.
const shadowBlockStart = main.lastIndexOf('try {', shadowIndex)
const shadowBlockEnd = main.indexOf('const progression = await advanceProgramAfterWorkout', shadowIndex)
const shadowBlock = shadowBlockStart >= 0 && shadowBlockEnd > shadowBlockStart
  ? main.slice(shadowBlockStart, shadowBlockEnd)
  : ''
checks.set('shadow completion block has no user-facing toast', !shadowBlock.includes('showToast'))
checks.set('shadow completion block has no athlete/program mutation', !/state\.(?:programInstance|selectedProgram|selectedWeek|selectedDay)\s*=/.test(shadowBlock))

let failed = 0
for (const [label, ok] of checks) {
  console.log(`progression shadow ${label}: ${ok ? 'PASS' : 'FAIL'}`)
  if (!ok) failed += 1
}
if (failed) {
  console.error(`Progression Shadow current-main audit failed: ${failed} check(s)`)
  process.exit(1)
}
console.log('LetMeFly Progression Shadow current-main stage-1 audit: PASS')
