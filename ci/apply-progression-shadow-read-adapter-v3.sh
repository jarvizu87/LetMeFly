#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

if [[ ! -f "$TARGET/src/services/progression-shadow-review-engine.ts" ]]; then
  echo "Stage 3 requires the Stage-2 Shadow review engine" >&2
  exit 1
fi
if [[ ! -f "$TARGET/src/services/progression-shadow-pilot.ts" ]]; then
  echo "Stage 3 requires the current-main Stage-1 Shadow pilot foundation" >&2
  exit 1
fi

cat > "$TARGET/src/services/progression-shadow-evidence-builder.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — Stage 3 pure evidence builder.
 *
 * Converts already-read canonical workout records into the Stage-2 review
 * contract. This module has no database, network, browser storage, UI, program,
 * or mutation dependencies.
 */
import {
  reviewProgressionShadowWorkout,
  type ShadowPilotSample,
  type ShadowReadiness,
  type ShadowWorkEvidence,
  type ShadowWorkPriority,
  type ShadowWorkoutEvidenceReview,
} from './progression-shadow-review-engine'

export type ShadowEvidenceRecord = Record<string, any>

export interface ShadowEvidenceRecordBundle {
  athleteId: string
  session: ShadowEvidenceRecord | null
  readiness: ShadowEvidenceRecord | null
  exercises: readonly ShadowEvidenceRecord[]
  sets: readonly ShadowEvidenceRecord[]
  decisions: readonly ShadowEvidenceRecord[]
}

export interface ProgressionShadowEvidenceBuildResult {
  athleteId: string
  sessionId: string | null
  completedAt: string | null
  readiness: ShadowReadiness
  technicalHealthy: boolean
  warnings: readonly string[]
  review: ShadowWorkoutEvidenceReview | null
  pilotSample: ShadowPilotSample | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function validInstant(value: unknown): string | null {
  const candidate = text(value)
  if (!candidate) return null
  return Number.isFinite(Date.parse(candidate)) ? candidate : null
}

function sameAthlete(row: ShadowEvidenceRecord | null, athleteId: string): boolean {
  return Boolean(row && !row.deleted_at && row.athlete_id === athleteId)
}

function classifyLinkedReadiness(row: ShadowEvidenceRecord | null, athleteId: string): ShadowReadiness {
  if (!sameAthlete(row, athleteId)) return 'unknown'
  const sleepQuality = Number(row!.sleep_quality)
  const soreness = Number(row!.soreness)
  const stress = Number(row!.stress)
  const energy = Number(row!.energy)
  const values = [sleepQuality, soreness, stress, energy]
  if (values.some((value) => !Number.isFinite(value) || value < 1 || value > 5)) return 'unknown'
  const avg = (sleepQuality + (6 - soreness) + (6 - stress) + energy) / 4
  if (avg >= 4) return 'green'
  if (avg >= 2.75) return 'yellow'
  return 'red'
}

function normalizePriority(value: unknown): ShadowWorkPriority | null {
  return value === 'mandatory' || value === 'conditional' || value === 'optional' ? value : null
}

function stateObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
}

function validEffectiveUnits(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

interface DecisionResolution {
  effectivePrescribedUnits?: number
  conditionalActive?: boolean
  warnings: string[]
  technicalHealthy: boolean
}

function resolveDecision(
  athleteId: string,
  sessionId: string,
  completedAt: string,
  exerciseId: string,
  sourceExerciseKey: string,
  rows: readonly ShadowEvidenceRecord[],
): DecisionResolution {
  const warnings: string[] = []
  let technicalHealthy = true
  const completedMs = Date.parse(completedAt)
  const candidates: Array<{ row: ShadowEvidenceRecord; effectiveMs: number; id: string }> = []

  for (const row of rows) {
    if (row.deleted_at || row.athlete_id !== athleteId || row.workout_session_id !== sessionId) continue
    if (row.decision_type !== 'effective_prescription_adjustment' || row.status !== 'active') continue
    const effectiveFrom = validInstant(row.effective_from)
    if (!effectiveFrom) continue
    const effectiveMs = Date.parse(effectiveFrom)
    if (effectiveMs > completedMs) continue
    const before = stateObject(row.before_state)
    const after = stateObject(row.after_state)
    const linkedExerciseId = text(after?.workout_exercise_id) ?? text(before?.workout_exercise_id)
    if (linkedExerciseId !== exerciseId) continue
    const keyedExercise = text(after?.exercise_key) ?? text(before?.exercise_key)
    if (keyedExercise && keyedExercise !== sourceExerciseKey) {
      technicalHealthy = false
      warnings.push(`DECISION_EXERCISE_KEY_MISMATCH:${exerciseId}`)
      continue
    }
    candidates.push({ row, effectiveMs, id: text(row.id) ?? '' })
  }

  candidates.sort((a, b) => a.effectiveMs - b.effectiveMs || a.id.localeCompare(b.id))
  const latest = candidates.at(-1)?.row
  if (!latest) return { warnings, technicalHealthy }

  const after = stateObject(latest.after_state)
  if (!after) {
    return { warnings: [...warnings, `DECISION_AFTER_STATE_INVALID:${exerciseId}`], technicalHealthy: false }
  }

  const result: DecisionResolution = { warnings, technicalHealthy }
  const effective = validEffectiveUnits(after.effective_prescribed_units)
  if (after.effective_prescribed_units !== undefined && effective === undefined) {
    result.technicalHealthy = false
    result.warnings.push(`DECISION_EFFECTIVE_UNITS_INVALID:${exerciseId}`)
  } else if (effective !== undefined) {
    result.effectivePrescribedUnits = effective
  }

  if (after.conditional_active !== undefined) {
    if (typeof after.conditional_active !== 'boolean') {
      result.technicalHealthy = false
      result.warnings.push(`DECISION_CONDITIONAL_STATE_INVALID:${exerciseId}`)
    } else {
      result.conditionalActive = after.conditional_active
    }
  }
  return result
}

export function buildProgressionShadowEvidence(
  records: ShadowEvidenceRecordBundle,
): ProgressionShadowEvidenceBuildResult {
  const athleteId = text(records.athleteId) ?? ''
  const warnings: string[] = []
  let technicalHealthy = true
  const session = records.session

  if (!athleteId || !sameAthlete(session, athleteId) || session?.status !== 'completed') {
    return Object.freeze({
      athleteId,
      sessionId: text(session?.id),
      completedAt: validInstant(session?.completed_at),
      readiness: 'unknown' as const,
      technicalHealthy: false,
      warnings: Object.freeze(['SESSION_INVALID_OR_NOT_COMPLETED']),
      review: null,
      pilotSample: null,
    })
  }

  const sessionId = text(session!.id)
  const completedAt = validInstant(session!.completed_at)
  if (!sessionId || !completedAt) {
    return Object.freeze({
      athleteId,
      sessionId,
      completedAt,
      readiness: 'unknown' as const,
      technicalHealthy: false,
      warnings: Object.freeze(['SESSION_ID_OR_COMPLETION_TIME_INVALID']),
      review: null,
      pilotSample: null,
    })
  }

  let linkedReadiness: ShadowEvidenceRecord | null = records.readiness
  const readinessId = text(session!.readiness_id)
  if (!readinessId || !linkedReadiness || text(linkedReadiness.id) !== readinessId || !sameAthlete(linkedReadiness, athleteId)) {
    linkedReadiness = null
    warnings.push('SESSION_LINKED_READINESS_MISSING_OR_INVALID')
  }
  const readiness = classifyLinkedReadiness(linkedReadiness, athleteId)
  if (readiness === 'unknown') warnings.push('READINESS_UNKNOWN')

  const work: ShadowWorkEvidence[] = []
  const relevantExercises = records.exercises
    .filter((row) => !row.deleted_at && row.workout_session_id === sessionId)
    .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))

  const foreignExercises = relevantExercises.filter((row) => row.athlete_id !== athleteId)
  if (foreignExercises.length) {
    technicalHealthy = false
    warnings.push('FOREIGN_EXERCISE_JOIN')
  }

  for (const exercise of relevantExercises.filter((row) => row.athlete_id === athleteId)) {
    const exerciseId = text(exercise.id)
    const snapshot = stateObject(exercise.prescription_snapshot)
    const sourceSets = Array.isArray(snapshot?.sourceSets) ? snapshot!.sourceSets : null
    const sourceKey = text(snapshot?.prescribedExerciseKey)
      ?? text(exercise.substituted_from_exercise_key)
      ?? text(exercise.exercise_key)
    const priority = normalizePriority(snapshot?.priority)

    if (!exerciseId || !sourceKey || !sourceSets || !priority) {
      technicalHealthy = false
      warnings.push(`EXERCISE_SNAPSHOT_INVALID:${exerciseId ?? 'unknown'}`)
      continue
    }

    const prescribedUnits = sourceSets.length
    const exerciseSets = records.sets.filter((row) => !row.deleted_at && row.workout_exercise_id === exerciseId)
    if (exerciseSets.some((row) => row.athlete_id !== athleteId || row.workout_session_id !== sessionId)) {
      technicalHealthy = false
      warnings.push(`FOREIGN_SET_JOIN:${exerciseId}`)
    }

    const canonical = new Map<number, ShadowEvidenceRecord>()
    for (const set of exerciseSets.filter((row) => row.athlete_id === athleteId && row.workout_session_id === sessionId)) {
      const setNumber = Number(set.set_number)
      if (!Number.isInteger(setNumber) || setNumber < 1) {
        technicalHealthy = false
        warnings.push(`SET_NUMBER_INVALID:${exerciseId}`)
        continue
      }
      if (setNumber > prescribedUnits) {
        warnings.push(`EXTRA_SET_IGNORED:${exerciseId}:${setNumber}`)
        continue
      }
      if (canonical.has(setNumber)) {
        technicalHealthy = false
        warnings.push(`DUPLICATE_CANONICAL_SET:${exerciseId}:${setNumber}`)
        continue
      }
      canonical.set(setNumber, set)
    }

    if (canonical.size !== prescribedUnits) {
      technicalHealthy = false
      warnings.push(`SET_SKELETON_INCOMPLETE:${exerciseId}`)
    }

    const completedUnits = Array.from(canonical.values()).filter((row) => row.completed === true).length
    const decision = resolveDecision(
      athleteId,
      sessionId,
      completedAt,
      exerciseId,
      sourceKey,
      records.decisions,
    )
    if (!decision.technicalHealthy) technicalHealthy = false
    warnings.push(...decision.warnings)

    const evidence: ShadowWorkEvidence = {
      id: exerciseId,
      priority,
      prescribedUnits,
      completedUnits,
    }
    if (decision.effectivePrescribedUnits !== undefined) evidence.effectivePrescribedUnits = decision.effectivePrescribedUnits
    if (decision.conditionalActive !== undefined) evidence.conditionalActive = decision.conditionalActive
    work.push(evidence)
  }

  if (work.length === 0) {
    technicalHealthy = false
    warnings.push('NO_VALID_WORK_ITEMS')
  }

  const review = reviewProgressionShadowWorkout({ workoutId: sessionId, readiness, work })
  const pilotSample: ShadowPilotSample | null = review.eligibleForRealPilotReview && technicalHealthy
    ? Object.freeze({
        workoutId: sessionId,
        completedAt,
        readiness,
        realWorkout: true,
        technicalHealthy: true,
        decisionCoverageClean: review.pilotDecisionCoverageClean,
        // Strength qualification is intentionally withheld until a dedicated,
        // current-source classification rule is reviewed. Never infer it here.
        strengthQualifying: false,
      })
    : null

  return Object.freeze({
    athleteId,
    sessionId,
    completedAt,
    readiness,
    technicalHealthy,
    warnings: Object.freeze(Array.from(new Set(warnings))),
    review,
    pilotSample,
  })
}
TS

cat > "$TARGET/src/services/progression-shadow-read-adapter.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — Stage 3 read-only canonical-data adapter.
 *
 * Reads only the completed workout's linked canonical records, then delegates to
 * the pure evidence builder. No write transaction, sync operation, network call,
 * program mutation, or UI side effect is permitted.
 */
import { getAllFromIndex, getById, type LocalDomainRecord } from '../db/local-db'
import {
  buildProgressionShadowEvidence,
  type ProgressionShadowEvidenceBuildResult,
} from './progression-shadow-evidence-builder'

export interface ProgressionShadowReadBacklogEntry {
  athleteId: string
  sessionId: string
  result: ProgressionShadowEvidenceBuildResult
}

const reviewBacklog = new Map<string, ProgressionShadowReadBacklogEntry>()

export async function progressionShadowReviewCompletedWorkout(
  athleteId: string,
  sessionId: string,
): Promise<ProgressionShadowEvidenceBuildResult> {
  const session = await getById<LocalDomainRecord>('workoutSessions', sessionId)
  const readinessId = typeof session?.readiness_id === 'string' ? session.readiness_id : null
  const readiness = readinessId
    ? await getById<LocalDomainRecord>('readinessEntries', readinessId)
    : null
  const exercises = await getAllFromIndex<LocalDomainRecord>('workoutExercises', 'by-session', sessionId)
  const sets = await getAllFromIndex<LocalDomainRecord>('workoutSets', 'by-session', sessionId)
  const decisions = await getAllFromIndex<LocalDomainRecord>('coachingDecisions', 'by-session', sessionId)

  const result = buildProgressionShadowEvidence({
    athleteId,
    session: session ?? null,
    readiness: readiness ?? null,
    exercises,
    sets,
    decisions,
  })

  if (result.sessionId) {
    reviewBacklog.set(`${athleteId}:${result.sessionId}`, Object.freeze({ athleteId, sessionId: result.sessionId, result }))
  }
  return result
}

export function progressionShadowReadAdapterBacklog(): readonly ProgressionShadowReadBacklogEntry[] {
  return Object.freeze(Array.from(reviewBacklog.values()))
}
TS

python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / 'src/main.ts'
text = p.read_text()

old_import = "import { progressionShadowPilotReview } from './services/progression-shadow-pilot'\n"
new_import = "import { progressionShadowReviewCompletedWorkout } from './services/progression-shadow-read-adapter'\n"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('Stage 3 could not find Stage-1 Shadow import')

old_block = "  try {\n    progressionShadowPilotReview({\n      eventId: completedSessionId,\n      athleteId: state.athlete.id,\n      programKey: completedProgram,\n      week: completedWeek,\n      day: completedDay,\n      completedAt: new Date().toISOString(),\n    })\n  } catch {\n    // Shadow is observational only: never block workout completion or governed progression.\n  }"
new_block = "  try {\n    await progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)\n  } catch {\n    // Shadow is read-only and fail-open: never block completion or governed progression.\n  }"
if old_block in text:
    text = text.replace(old_block, new_block, 1)
elif 'progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)' not in text:
    raise SystemExit('Stage 3 could not find Stage-1 completion hook')

p.write_text(text)
PY

echo "LetMeFly Progression Shadow Stage-3 read-only canonical-data adapter: APPLIED"
