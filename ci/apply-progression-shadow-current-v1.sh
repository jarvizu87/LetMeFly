#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

if [[ ! -f "$TARGET/src/main.ts" ]]; then
  echo "Progression Shadow target is missing src/main.ts: $TARGET" >&2
  exit 1
fi
if [[ ! -f "$TARGET/src/services/program-progression-service.ts" ]]; then
  echo "Progression Shadow requires the current authoritative program progression service" >&2
  exit 1
fi

mkdir -p "$TARGET/src/services"
cat > "$TARGET/src/services/progression-shadow-pilot.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — current-main pilot foundation.
 *
 * This module is deliberately observational only. It may receive a completed
 * workout event, dedupe it in memory for the current runtime, and expose the
 * resulting review backlog to test/review code. It must not write athlete data,
 * mutate a program, call Supabase, update the DOM, or auto-apply coaching.
 */

export type ProgressionShadowOutcome = 'green' | 'yellow' | 'red' | 'unknown'
export type ProgressionShadowDecision = 'observe'

export interface ProgressionShadowCompletedWorkoutEvent {
  eventId: string
  athleteId: string
  programKey: string
  week: number | string
  day: number | string
  completedAt: string
}

export interface ProgressionShadowPilotReview {
  schemaVersion: 'progression-shadow-current-v1'
  event: Readonly<ProgressionShadowCompletedWorkoutEvent>
  observedAt: string
  outcome: ProgressionShadowOutcome
  decision: ProgressionShadowDecision
  approvalRequired: true
  canAutoApply: false
  evidenceStatus: 'event-captured-engine-review-pending'
}

const reviewsByEvent = new Map<string, ProgressionShadowPilotReview>()

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Progression Shadow requires ${label}`)
  }
  return value.trim()
}

function eventKey(event: ProgressionShadowCompletedWorkoutEvent): string {
  return `${requiredText(event.athleteId, 'athleteId')}:${requiredText(event.programKey, 'programKey')}:${requiredText(event.eventId, 'eventId')}`
}

export function progressionShadowPilotReview(
  input: ProgressionShadowCompletedWorkoutEvent,
  observedAt = new Date().toISOString(),
): ProgressionShadowPilotReview {
  const event = Object.freeze({
    eventId: requiredText(input.eventId, 'eventId'),
    athleteId: requiredText(input.athleteId, 'athleteId'),
    programKey: requiredText(input.programKey, 'programKey'),
    week: input.week,
    day: input.day,
    completedAt: requiredText(input.completedAt, 'completedAt'),
  })
  const key = eventKey(event)
  const existing = reviewsByEvent.get(key)
  if (existing) return existing

  const review = Object.freeze({
    schemaVersion: 'progression-shadow-current-v1' as const,
    event,
    observedAt: requiredText(observedAt, 'observedAt'),
    outcome: 'unknown' as const,
    decision: 'observe' as const,
    approvalRequired: true as const,
    canAutoApply: false as const,
    evidenceStatus: 'event-captured-engine-review-pending' as const,
  })
  reviewsByEvent.set(key, review)
  return review
}

export function progressionShadowPilotReviewBacklog(): readonly ProgressionShadowPilotReview[] {
  return Object.freeze(Array.from(reviewsByEvent.values()))
}
TS

python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / 'src/main.ts'
text = p.read_text()

shadow_import = "import { progressionShadowPilotReview } from './services/progression-shadow-pilot'\n"
if shadow_import not in text:
    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if "from './services/program-progression-service'" in line:
            lines.insert(i + 1, shadow_import)
            text = ''.join(lines)
            break
    else:
        raise SystemExit('Progression Shadow could not find authoritative progression import')

old = "  await completeWorkout(state.athlete.id, state.workout.session.id)\n  const progression = await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)"
new = "  const completedSessionId = state.workout.session.id\n  await completeWorkout(state.athlete.id, completedSessionId)\n  try {\n    progressionShadowPilotReview({\n      eventId: completedSessionId,\n      athleteId: state.athlete.id,\n      programKey: completedProgram,\n      week: completedWeek,\n      day: completedDay,\n      completedAt: new Date().toISOString(),\n    })\n  } catch {\n    // Shadow is observational only: never block workout completion or governed progression.\n  }\n  const progression = await advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)"

if old in text:
    text = text.replace(old, new, 1)
elif 'progressionShadowPilotReview({' not in text:
    raise SystemExit('Progression Shadow could not find current workout completion/progression boundary')

p.write_text(text)
PY

node "$ROOT_DIR/ci/audit-progression-shadow-current-v1.mjs" "$TARGET"
echo "LetMeFly Progression Shadow current-main pilot foundation: APPLIED"
