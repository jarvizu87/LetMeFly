#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

if [[ ! -f "$TARGET/src/services/progression-shadow-pilot.ts" ]]; then
  echo "Stage 2 requires the current-main Stage-1 Shadow pilot foundation" >&2
  exit 1
fi

cat > "$TARGET/src/services/progression-shadow-review-engine.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — Stage 2 pure review engine.
 *
 * No storage, network, DOM, program mutation, or coaching mutation is permitted
 * here. The engine accepts already-derived evidence and returns a read-only
 * review. A later adapter may read canonical completed-workout evidence and feed
 * it here, but this module never owns that data.
 */

export type ShadowReadiness = 'green' | 'yellow' | 'red' | 'unknown'
export type ShadowWorkPriority = 'mandatory' | 'conditional' | 'optional'
export type ShadowDecisionGapCode =
  | 'MANDATORY_EFFECTIVE_TARGET_MISSING'
  | 'CONDITIONAL_STATE_MISSING'

export interface ShadowWorkEvidence {
  id: string
  priority: ShadowWorkPriority
  prescribedUnits: number
  completedUnits: number
  effectivePrescribedUnits?: number
  conditionalActive?: boolean
}

export interface ShadowDecisionGap {
  workItemId: string
  code: ShadowDecisionGapCode
}

export interface ShadowReviewedWorkItem {
  id: string
  priority: ShadowWorkPriority
  prescribedUnits: number
  completedUnits: number
  effectiveRequiredUnits: number
  countsTowardCoreAdherence: boolean
  conditionalActive: boolean | null
}

export interface ShadowWorkoutEvidenceInput {
  workoutId: string
  readiness: ShadowReadiness
  work: readonly ShadowWorkEvidence[]
}

export interface ShadowWorkoutEvidenceReview {
  workoutId: string
  readiness: ShadowReadiness
  work: readonly ShadowReviewedWorkItem[]
  decisionGaps: readonly ShadowDecisionGap[]
  decisionGapCount: number
  pilotDecisionCoverageClean: boolean
  coreRequiredUnits: number
  coreCompletedUnits: number
  coreCompletionRate: number | null
  eligibleForRealPilotReview: boolean
  autoApplyAllowed: false
}

export interface ShadowPilotSample {
  workoutId: string
  completedAt: string
  readiness: ShadowReadiness
  realWorkout: boolean
  technicalHealthy: boolean
  decisionCoverageClean: boolean
  strengthQualifying?: boolean
}

export interface ShadowPilotGateInput {
  samples: readonly ShadowPilotSample[]
  strengthReviewRequired: boolean
}

export interface ShadowPilotGateResult {
  pass: boolean
  countedReviews: number
  greenReviews: number
  yellowReviews: number
  redReviews: number
  technicalFailures: number
  duplicateWorkoutIds: readonly string[]
  strengthQualifyingReviews: number
  strengthWindowDays: number | null
  blockers: readonly string[]
  autoVisibilityAllowed: false
}

function finiteUnits(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Progression Shadow requires non-negative ${label}`)
  return value
}

function requiredText(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Progression Shadow requires ${label}`)
  return value.trim()
}

function cappedEffective(item: ShadowWorkEvidence, prescribed: number): number | undefined {
  if (item.effectivePrescribedUnits === undefined) return undefined
  return Math.min(prescribed, finiteUnits(item.effectivePrescribedUnits, `${item.id}.effectivePrescribedUnits`))
}

export function reviewProgressionShadowWorkout(input: ShadowWorkoutEvidenceInput): ShadowWorkoutEvidenceReview {
  const workoutId = requiredText(input.workoutId, 'workoutId')
  if (!['green', 'yellow', 'red', 'unknown'].includes(input.readiness)) {
    throw new Error('Progression Shadow requires a known readiness state')
  }

  const gaps: ShadowDecisionGap[] = []
  const reviewed: ShadowReviewedWorkItem[] = []
  let coreRequiredUnits = 0
  let coreCompletedUnits = 0

  for (const raw of input.work) {
    const id = requiredText(raw.id, 'work item id')
    const prescribed = finiteUnits(raw.prescribedUnits, `${id}.prescribedUnits`)
    const completed = finiteUnits(raw.completedUnits, `${id}.completedUnits`)
    const effective = cappedEffective(raw, prescribed)

    let required = 0
    let countsTowardCoreAdherence = false
    let conditionalActive: boolean | null = null

    if (raw.priority === 'optional') {
      // Source-optional work can never be promoted into core adherence.
      required = 0
    } else if (raw.priority === 'mandatory') {
      countsTowardCoreAdherence = true
      required = prescribed
      if (input.readiness === 'yellow') {
        if (effective !== undefined) {
          required = effective
        } else if (completed < prescribed) {
          gaps.push({ workItemId: id, code: 'MANDATORY_EFFECTIVE_TARGET_MISSING' })
        }
      }
      // RED is safety authority. We retain the governed source target for audit
      // rather than inventing a reduced target from whatever work happened.
    } else if (raw.priority === 'conditional') {
      conditionalActive = raw.conditionalActive ?? null
      if (input.readiness === 'red') {
        conditionalActive = false
        required = 0
      } else if (input.readiness === 'yellow') {
        if (raw.conditionalActive === undefined) {
          gaps.push({ workItemId: id, code: 'CONDITIONAL_STATE_MISSING' })
          required = 0
        } else if (raw.conditionalActive) {
          countsTowardCoreAdherence = true
          required = effective ?? prescribed
        }
      } else if (input.readiness === 'green') {
        const active = raw.conditionalActive !== false
        conditionalActive = active
        if (active) {
          countsTowardCoreAdherence = true
          required = effective ?? prescribed
        }
      } else {
        // Unknown readiness stays conservative: only explicitly active
        // conditional work can become a core requirement.
        const active = raw.conditionalActive === true
        conditionalActive = active
        if (active) {
          countsTowardCoreAdherence = true
          required = effective ?? prescribed
        }
      }
    } else {
      throw new Error(`Progression Shadow received unsupported priority for ${id}`)
    }

    if (countsTowardCoreAdherence) {
      coreRequiredUnits += required
      coreCompletedUnits += Math.min(completed, required)
    }

    reviewed.push(Object.freeze({
      id,
      priority: raw.priority,
      prescribedUnits: prescribed,
      completedUnits: completed,
      effectiveRequiredUnits: required,
      countsTowardCoreAdherence,
      conditionalActive,
    }))
  }

  const coverageClean = gaps.length === 0
  const coreCompletionRate = coreRequiredUnits > 0 ? coreCompletedUnits / coreRequiredUnits : null
  const eligibleForRealPilotReview =
    (input.readiness === 'green' || input.readiness === 'yellow')
    && coverageClean

  return Object.freeze({
    workoutId,
    readiness: input.readiness,
    work: Object.freeze(reviewed),
    decisionGaps: Object.freeze(gaps),
    decisionGapCount: gaps.length,
    pilotDecisionCoverageClean: coverageClean,
    coreRequiredUnits,
    coreCompletedUnits,
    coreCompletionRate,
    eligibleForRealPilotReview,
    autoApplyAllowed: false as const,
  })
}

function elapsedDays(a: string, b: string): number {
  const first = Date.parse(a)
  const last = Date.parse(b)
  if (!Number.isFinite(first) || !Number.isFinite(last)) throw new Error('Progression Shadow pilot sample has invalid completedAt')
  return Math.abs(last - first) / 86_400_000
}

export function evaluateProgressionShadowPilotGate(input: ShadowPilotGateInput): ShadowPilotGateResult {
  const blockers: string[] = []
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const counted: ShadowPilotSample[] = []
  let technicalFailures = 0

  for (const sample of input.samples) {
    const workoutId = requiredText(sample.workoutId, 'pilot workoutId')
    if (seen.has(workoutId)) {
      duplicates.add(workoutId)
      continue
    }
    seen.add(workoutId)
    // Validate the timestamp even for excluded samples so malformed evidence
    // cannot silently enter a future pilot export.
    elapsedDays(sample.completedAt, sample.completedAt)
    if (!sample.technicalHealthy) technicalFailures += 1
    if (sample.realWorkout && sample.technicalHealthy && sample.decisionCoverageClean) counted.push(sample)
  }

  const green = counted.filter((sample) => sample.readiness === 'green').length
  const yellow = counted.filter((sample) => sample.readiness === 'yellow').length
  const red = counted.filter((sample) => sample.readiness === 'red').length
  const strength = counted
    .filter((sample) => sample.strengthQualifying === true)
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))
  const strengthWindowDays = strength.length >= 2
    ? elapsedDays(strength[0]!.completedAt, strength[strength.length - 1]!.completedAt)
    : null

  if (counted.length < 3) blockers.push('AT_LEAST_THREE_REAL_REVIEWS_REQUIRED')
  if (green < 1) blockers.push('GREEN_REVIEW_REQUIRED')
  if (yellow < 1) blockers.push('YELLOW_REVIEW_REQUIRED')
  if (technicalFailures > 0) blockers.push('TECHNICAL_FAILURE_PRESENT')
  if (duplicates.size > 0) blockers.push('DUPLICATE_WORKOUT_SAMPLE')
  if (input.strengthReviewRequired) {
    if (strength.length < 2) blockers.push('MULTIPLE_STRENGTH_REVIEWS_REQUIRED')
    else if ((strengthWindowDays ?? 0) < 21) blockers.push('STRENGTH_WINDOW_21_DAYS_REQUIRED')
  }

  return Object.freeze({
    pass: blockers.length === 0,
    countedReviews: counted.length,
    greenReviews: green,
    yellowReviews: yellow,
    redReviews: red,
    technicalFailures,
    duplicateWorkoutIds: Object.freeze(Array.from(duplicates).sort()),
    strengthQualifyingReviews: strength.length,
    strengthWindowDays,
    blockers: Object.freeze(blockers),
    autoVisibilityAllowed: false as const,
  })
}
TS

echo "LetMeFly Progression Shadow Stage-2 pure review engine: APPLIED"
