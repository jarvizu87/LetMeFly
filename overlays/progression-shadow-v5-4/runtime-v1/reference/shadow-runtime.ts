import { ProgressionBridge } from '../progression-engine/bridge.js'
import { buildCreateMainQuestCommand, buildProcessWorkoutCommand, buildStreakCommand } from '../progression-engine/commands.js'
import { ProgressionEngine } from '../progression-engine/engine.js'
import { checkAdapterCompatibility } from '../progression-engine/compatibility.js'
import { createBrowserProgressionPersistence } from '../progression-engine/persistence.js'
import { buildShadowAuditReport, compareShadowWorkout } from '../progression-engine/shadowAudit.js'
import type { WorkoutBundle } from '../services/workout-service'
import { mapWorkoutBundleToProgression, scheduledEventTypeForBundle } from './lmf-shadow-adapter'

const persistence = createBrowserProgressionPersistence({
  dbName: 'letmefly.progression.shadow.v1',
})
const engine = new ProgressionEngine(persistence.store)
const bridge = new ProgressionBridge({
  mode: 'SHADOW',
  engine,
  queue: persistence.queue,
  isOnline: () => true,
  maxAttempts: 5,
  onError: (error, command) => {
    console.warn('[LMF progression shadow]', command.type, error)
  },
})

let replayStarted = false
async function replayPendingOnce(): Promise<void> {
  if (replayStarted) return
  replayStarted = true
  const result = await bridge.replayPending()
  const deadLettered = 'deadLettered' in result ? result.deadLettered : []
  if (result.failed.length || deadLettered.length) {
    console.warn('[LMF progression shadow] replay issues', result)
  }
}

export interface ShadowCompletionResult {
  processed: boolean
  readiness: string
  warnings: string[]
  xp?: number
  level?: number
  questStatus?: string
}

export async function recordCompletedWorkoutInProgressionShadow(
  bundle: WorkoutBundle,
): Promise<ShadowCompletionResult> {
  try {
    await replayPendingOnce()
    const mapped = await mapWorkoutBundleToProgression(bundle)
    const compatibility = checkAdapterCompatibility([
      { prescription: mapped.prescription, outcome: mapped.outcome },
    ])
    if (!compatibility.pass) {
      console.warn('[LMF progression shadow] mapping blocked', compatibility)
      return {
        processed: false,
        readiness: mapped.readiness,
        warnings: [...mapped.warnings, ...compatibility.errors, ...compatibility.warnings],
      }
    }

    await bridge.submit(buildCreateMainQuestCommand(
      mapped.prescription,
      String(bundle.session.started_at ?? mapped.outcome.completedAt),
    ))
    const processed = await bridge.submit<{
      newlyAwardedXp: number
      progress: { level: number }
      updatedQuest?: { status: string }
    }>(buildProcessWorkoutCommand(mapped.prescription, mapped.outcome))

    await bridge.submit(buildStreakCommand(
      mapped.prescription.athleteId,
      {
        id: `scheduled:${mapped.prescription.programRunId}:${mapped.prescription.workoutId}`,
        scheduled: true,
        type: scheduledEventTypeForBundle(bundle),
        handled: true,
        ...(mapped.readiness === 'red' ? { safetyHandled: true } : {}),
      },
      mapped.outcome.completedAt,
    ))

    return {
      processed: processed.processed,
      readiness: mapped.readiness,
      warnings: [...mapped.warnings, ...compatibility.warnings],
      ...(processed.result ? {
        xp: processed.result.newlyAwardedXp,
        level: processed.result.progress.level,
        questStatus: processed.result.updatedQuest?.status,
      } : {}),
    }
  } catch (error) {
    console.warn('[LMF progression shadow] completion hook failed open', error)
    return {
      processed: false,
      readiness: 'unknown',
      warnings: [error instanceof Error ? error.message : String(error)],
    }
  }
}

export async function replayProgressionShadowPending(): Promise<void> {
  try {
    await replayPendingOnce()
  } catch (error) {
    console.warn('[LMF progression shadow] startup replay failed open', error)
  }
}

export async function progressionShadowAudit(athleteId: string) {
  await replayPendingOnce()
  return buildShadowAuditReport(persistence.store, persistence.queue, athleteId)
}

export async function progressionShadowCompare(
  athleteId: string,
  workoutId: string,
  programRunId: string,
  expectedXp?: number,
) {
  return compareShadowWorkout(persistence.store, athleteId, {
    workoutId,
    programRunId,
    ...(expectedXp !== undefined ? { expectedXp } : {}),
  })
}
