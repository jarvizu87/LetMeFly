#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node --experimental-strip-types ci/audit-progression-shadow-review-engine-v2.mjs <target-source-dir>')
  process.exit(2)
}

const enginePath = path.join(target, 'src/services/progression-shadow-review-engine.ts')
if (!fs.existsSync(enginePath)) {
  console.error(`Missing Stage-2 Shadow review engine: ${enginePath}`)
  process.exit(1)
}

const source = fs.readFileSync(enginePath, 'utf8')
const engine = await import(`${pathToFileURL(enginePath).href}?audit=${Date.now()}`)
const { reviewProgressionShadowWorkout, evaluateProgressionShadowPilotGate } = engine

const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok), detail })
  console.log(`progression shadow v2 ${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`)
}

const forbidden = [
  ['IndexedDB access', /indexedDB|IDBDatabase|openLetMeFlyDb|requestToPromise|transactionDone/],
  ['Supabase or network access', /supabase|fetch\s*\(|XMLHttpRequest|WebSocket/],
  ['browser storage access', /localStorage|sessionStorage/],
  ['DOM/UI access', /document\.|window\.|navigator\.|showToast|render\s*\(/],
  ['authoritative progression dependency', /program-progression-service/],
  ['governed program package dependency', /programs\/(?:crownforge|crown-maintenance|black-crown)/],
  ['gamification/Crownstorm logic', /Crownstorm|crownstorm|\bXP\b|main quest|level-up|streak/i],
]
for (const [label, pattern] of forbidden) check(`engine has no ${label}`, !pattern.test(source))
check('engine hard-locks auto apply off', source.includes('autoApplyAllowed: false as const'))
check('pilot gate hard-locks automatic visibility off', source.includes('autoVisibilityAllowed: false as const'))

const green = reviewProgressionShadowWorkout({
  workoutId: 'green-1',
  readiness: 'green',
  work: [
    { id: 'main', priority: 'mandatory', prescribedUnits: 3, completedUnits: 3 },
    { id: 'support', priority: 'conditional', prescribedUnits: 2, completedUnits: 2 },
    { id: 'optional', priority: 'optional', prescribedUnits: 4, completedUnits: 4 },
  ],
})
check('Green source targets are core without Yellow inference', green.coreRequiredUnits === 5 && green.coreCompletedUnits === 5)
check('Green review is decision-clean', green.decisionGapCount === 0 && green.pilotDecisionCoverageClean === true)
check('Green optional work never becomes core adherence', green.work.find((row) => row.id === 'optional')?.countsTowardCoreAdherence === false)
check('Green clean review can enter real pilot review', green.eligibleForRealPilotReview === true)

const yellowClean = reviewProgressionShadowWorkout({
  workoutId: 'yellow-clean',
  readiness: 'yellow',
  work: [
    { id: 'reduced-main', priority: 'mandatory', prescribedUnits: 4, completedUnits: 2, effectivePrescribedUnits: 2 },
    { id: 'inactive-support', priority: 'conditional', prescribedUnits: 3, completedUnits: 0, conditionalActive: false },
    { id: 'optional', priority: 'optional', prescribedUnits: 2, completedUnits: 2, effectivePrescribedUnits: 2, conditionalActive: true },
  ],
})
check('Yellow explicit mandatory reduction becomes effective target', yellowClean.coreRequiredUnits === 2 && yellowClean.coreCompletedUnits === 2)
check('Yellow explicit inactive conditional is not a core requirement', yellowClean.work.find((row) => row.id === 'inactive-support')?.effectiveRequiredUnits === 0)
check('Yellow clean decision coverage can enter pilot review', yellowClean.decisionGapCount === 0 && yellowClean.eligibleForRealPilotReview === true)

const yellowGaps = reviewProgressionShadowWorkout({
  workoutId: 'yellow-gaps',
  readiness: 'yellow',
  work: [
    { id: 'reduced-main', priority: 'mandatory', prescribedUnits: 4, completedUnits: 2 },
    { id: 'unknown-support', priority: 'conditional', prescribedUnits: 3, completedUnits: 1 },
  ],
})
const gapCodes = new Set(yellowGaps.decisionGaps.map((gap) => gap.code))
check('Yellow missing reduced mandatory target is explicit gap', gapCodes.has('MANDATORY_EFFECTIVE_TARGET_MISSING'))
check('Yellow missing conditional state is explicit gap', gapCodes.has('CONDITIONAL_STATE_MISSING'))
check('Yellow gaps block real pilot review', yellowGaps.decisionGapCount === 2 && yellowGaps.eligibleForRealPilotReview === false)

const yellowFull = reviewProgressionShadowWorkout({
  workoutId: 'yellow-full',
  readiness: 'yellow',
  work: [{ id: 'main', priority: 'mandatory', prescribedUnits: 4, completedUnits: 4 }],
})
check('Yellow full source completion does not invent a reduction gap', yellowFull.decisionGapCount === 0 && yellowFull.coreRequiredUnits === 4)

const capped = reviewProgressionShadowWorkout({
  workoutId: 'yellow-cap',
  readiness: 'yellow',
  work: [{ id: 'main', priority: 'mandatory', prescribedUnits: 4, completedUnits: 4, effectivePrescribedUnits: 99 }],
})
check('oversized effective target is capped at governed source', capped.coreRequiredUnits === 4)

const optionalPromotion = reviewProgressionShadowWorkout({
  workoutId: 'optional-promotion',
  readiness: 'yellow',
  work: [{ id: 'optional', priority: 'optional', prescribedUnits: 5, completedUnits: 5, effectivePrescribedUnits: 5, conditionalActive: true }],
})
check('source-optional work cannot be promoted into core adherence', optionalPromotion.coreRequiredUnits === 0 && optionalPromotion.coreCompletedUnits === 0)

const red = reviewProgressionShadowWorkout({
  workoutId: 'red-1',
  readiness: 'red',
  work: [
    { id: 'main', priority: 'mandatory', prescribedUnits: 4, completedUnits: 1, effectivePrescribedUnits: 1 },
    { id: 'support', priority: 'conditional', prescribedUnits: 3, completedUnits: 3, conditionalActive: true },
  ],
})
check('RED overrides prior conditional activation', red.work.find((row) => row.id === 'support')?.conditionalActive === false)
check('RED never invents a reduced mandatory target from actual work', red.work.find((row) => row.id === 'main')?.effectiveRequiredUnits === 4)
check('RED is not auto-counted as a normal visible-pilot review', red.eligibleForRealPilotReview === false)

const unknown = reviewProgressionShadowWorkout({
  workoutId: 'unknown-1',
  readiness: 'unknown',
  work: [{ id: 'support', priority: 'conditional', prescribedUnits: 3, completedUnits: 3 }],
})
check('unknown readiness does not infer conditional activation', unknown.coreRequiredUnits === 0)
check('unknown readiness is not pilot eligible', unknown.eligibleForRealPilotReview === false)

const passGate = evaluateProgressionShadowPilotGate({
  strengthReviewRequired: true,
  samples: [
    { workoutId: 'w1', completedAt: '2026-09-01T12:00:00Z', readiness: 'green', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true, strengthQualifying: true },
    { workoutId: 'w2', completedAt: '2026-09-10T12:00:00Z', readiness: 'yellow', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
    { workoutId: 'w3', completedAt: '2026-09-22T12:00:00Z', readiness: 'green', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true, strengthQualifying: true },
  ],
})
check('pilot gate requires and accepts 3 unique real healthy reviews with Green + Yellow', passGate.pass === true && passGate.countedReviews === 3 && passGate.greenReviews === 2 && passGate.yellowReviews === 1)
check('strength gate accepts multiple qualifying reviews spanning at least 21 days', passGate.strengthQualifyingReviews === 2 && passGate.strengthWindowDays === 21)
check('pilot gate still cannot automatically enable visibility', passGate.autoVisibilityAllowed === false)

const shortStrength = evaluateProgressionShadowPilotGate({
  strengthReviewRequired: true,
  samples: [
    { workoutId: 's1', completedAt: '2026-09-01T12:00:00Z', readiness: 'green', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true, strengthQualifying: true },
    { workoutId: 's2', completedAt: '2026-09-10T12:00:00Z', readiness: 'yellow', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
    { workoutId: 's3', completedAt: '2026-09-21T11:59:59Z', readiness: 'green', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true, strengthQualifying: true },
  ],
})
check('strength gate fails closed below exact 21-day boundary', shortStrength.pass === false && shortStrength.blockers.includes('STRENGTH_WINDOW_21_DAYS_REQUIRED'))

const duplicateGate = evaluateProgressionShadowPilotGate({
  strengthReviewRequired: false,
  samples: [
    { workoutId: 'd1', completedAt: '2026-09-01T12:00:00Z', readiness: 'green', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
    { workoutId: 'd1', completedAt: '2026-09-02T12:00:00Z', readiness: 'yellow', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
    { workoutId: 'd2', completedAt: '2026-09-03T12:00:00Z', readiness: 'yellow', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
    { workoutId: 'd3', completedAt: '2026-09-04T12:00:00Z', readiness: 'green', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
  ],
})
check('duplicate workout samples fail closed instead of double-counting', duplicateGate.pass === false && duplicateGate.blockers.includes('DUPLICATE_WORKOUT_SAMPLE'))

const technicalGate = evaluateProgressionShadowPilotGate({
  strengthReviewRequired: false,
  samples: [
    { workoutId: 't1', completedAt: '2026-09-01T12:00:00Z', readiness: 'green', realWorkout: true, technicalHealthy: false, decisionCoverageClean: true },
    { workoutId: 't2', completedAt: '2026-09-02T12:00:00Z', readiness: 'yellow', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
    { workoutId: 't3', completedAt: '2026-09-03T12:00:00Z', readiness: 'green', realWorkout: true, technicalHealthy: true, decisionCoverageClean: true },
    { workoutId: 'synthetic', completedAt: '2026-09-04T12:00:00Z', readiness: 'green', realWorkout: false, technicalHealthy: true, decisionCoverageClean: true },
  ],
})
check('technical failure is never hidden by healthy or synthetic samples', technicalGate.pass === false && technicalGate.blockers.includes('TECHNICAL_FAILURE_PRESENT'))
check('synthetic sample cannot satisfy real-workout count', technicalGate.countedReviews === 2)

const failed = checks.filter((entry) => !entry.ok)
if (failed.length) {
  console.error(`Progression Shadow Stage-2 review audit failed: ${failed.length} check(s)`)
  process.exit(1)
}
console.log(`LetMeFly Progression Shadow Stage-2 pure review engine audit: PASS (${checks.length} checks)`)
