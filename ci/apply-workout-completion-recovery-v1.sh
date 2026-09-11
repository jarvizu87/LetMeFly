#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?reconstructed app root required}"
TARGET="$TARGET" python3 - <<'PY'
from pathlib import Path
import os
root=Path(os.environ['TARGET'])
w=root/'src/services/workout-service.ts'
p=root/'src/services/program-progression-service.ts'
m=root/'src/main.ts'
workout=w.read_text(); progression=p.read_text(); main=m.read_text()
assert 'pendingWorkoutCompletion' not in workout, 'Completion recovery already installed or boundary changed'
start=workout.index('export async function completeWorkout(')
end=workout.index('\nexport async function loadWorkoutBundle(',start)
workout=workout[:start]+r'''export async function completeWorkout(athleteId: string, sessionId: string): Promise<void> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  const tx = db.transaction(['workoutSessions', 'programInstances', 'syncOutbox'], 'readwrite')
  const finished = transactionDone(tx)
  void finished.catch(() => {})
  try {
    const store = tx.objectStore('workoutSessions')
    const session = await requestToPromise<LocalDomainRecord | undefined>(store.get(sessionId))
    if (!session || session.deleted_at || session.athlete_id !== athleteId) throw new Error('Workout session not found')
    // Retries never rewrite timestamps or manufacture a second completion intent.
    if (session.status === 'completed') { await finished; return }
    if (session.status !== 'in_progress') throw new Error('Only an active workout can be completed')
    const instance = session.program_instance_id
      ? await requestToPromise<LocalDomainRecord | undefined>(tx.objectStore('programInstances').get(String(session.program_instance_id)))
      : undefined
    const now = new Date().toISOString()
    const completed = prepareLocalMutation({ ...session, status: 'completed', completed_at: now }, context, session)
    // The marker is private JSON in the existing program record, not a new cloud column.
    // Historical/preview sessions cannot enqueue automatic program advancement.
    if (instance && !instance.deleted_at && instance.athlete_id === athleteId && instance.status === 'active'
      && instance.program_key === session.program_key && instance.current_week === session.week_number
      && instance.current_day_key === session.day_key) {
      const previous = (instance.progression_state ?? {}) as Record<string, any>
      if (previous.pendingWorkoutCompletion) throw new Error('An earlier workout completion needs recovery first')
      const pending = { version: 1, token: newId(), sessionId, instanceId: instance.id,
        program: session.program_key, week: session.week_number, dayKey: session.day_key,
        completedAt: now, positionVersion: instance._local.localVersion + 1 }
      const queued = prepareLocalMutation({ ...instance,
        progression_state: { ...previous, pendingWorkoutCompletion: pending },
      }, context, instance)
      tx.objectStore('programInstances').put(queued)
      tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', queued, context, 'upsert'))
    }
    store.put(completed)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('workoutSessions', completed, context, 'upsert'))
    await finished
  } catch (error) {
    try { tx.abort() } catch (_) { /* Transaction may already have aborted. */ }
    await finished.catch(() => {})
    throw error
  } finally { db.close() }
}
''' + workout[end:]
# The ordinary governed progression engine remains the only owner of the next position.
helper=r'''
function withoutPendingWorkoutCompletion(instance: LocalDomainRecord): Record<string, unknown> {
  const value = { ...((instance.progression_state ?? {}) as Record<string, unknown>) }
  delete value.pendingWorkoutCompletion
  return value
}

async function verifyPendingWorkoutCompletion(
  tx: IDBTransaction, current: LocalDomainRecord, expected: LocalDomainRecord,
): Promise<void> {
  const pending = ((expected.progression_state ?? {}) as Record<string, any>).pendingWorkoutCompletion
  const latest = ((current.progression_state ?? {}) as Record<string, any>).pendingWorkoutCompletion
  if (!pending && !latest) return
  const invalid = () => { tx.abort(); throw new Error('Pending workout completion changed; reload before advancing') }
  if (!pending || !latest || pending.version !== 1 || !pending.token || latest.token !== pending.token
    || current.id !== pending.instanceId || current.program_key !== pending.program
    || current.current_week !== pending.week || current.current_day_key !== pending.dayKey
    || current._local.localVersion !== pending.positionVersion) return invalid()
  const session = await requestToPromise<LocalDomainRecord | undefined>(tx.objectStore('workoutSessions').get(pending.sessionId))
  if (!session || session.deleted_at || session.athlete_id !== current.athlete_id
    || session.program_instance_id !== current.id || session.status !== 'completed'
    || session.program_key !== pending.program || session.week_number !== pending.week
    || session.day_key !== pending.dayKey || session.completed_at !== pending.completedAt) return invalid()
}

export async function recoverPendingWorkoutProgression(athleteId: string): Promise<ProgressionResult | null> {
  const active = (await getAllFromIndex<LocalDomainRecord>('programInstances', 'by-athlete-status', [athleteId, 'active']))
    .filter(row => !row.deleted_at)
  if (!active.length) return null
  if (active.length !== 1) throw new Error('Multiple active programs; automatic completion recovery is blocked')
  const instance = active[0]
  const pending = ((instance.progression_state ?? {}) as Record<string, any>).pendingWorkoutCompletion
  if (!pending) return null
  const position = positionFromProgramInstance(instance)
  if (!position || pending.version !== 1 || typeof pending.token !== 'string' || !pending.token
    || pending.instanceId !== instance.id || pending.program !== position.program
    || pending.week !== position.week || pending.dayKey !== `day-${position.day}`
    || pending.positionVersion !== instance._local.localVersion) {
    throw new Error('Saved workout completion requires review; no program position was changed')
  }
  try {
    return await advanceProgramAfterWorkout(athleteId, position.program, position.week, position.day, pending.token)
  } catch (error) {
    // A competing tab may already have consumed or intentionally cancelled this intent.
    const latest = await getCurrentProgramInstance(athleteId)
    const latestPending = ((latest?.progression_state ?? {}) as Record<string, any>).pendingWorkoutCompletion
    if (!latestPending || latestPending.token !== pending.token) return null
    throw error
  }
}

'''
anchor='async function updatePositionWithEvent('
assert progression.count(anchor)==1
progression=progression.replace(anchor,helper+anchor,1)
progression=progression.replace("['programInstances', 'programEvents', 'syncOutbox']", "['programInstances', 'programEvents', 'workoutSessions', 'syncOutbox']")
# Ordinary advancement and explicit reposition share the writer, but only explicit
# reposition may cancel a pending intent without executing it.
anchor='    const updated = prepareLocalMutation({\n      ...current,\n      current_week: next.week,'
replacement="    if (eventType === 'program-position-advanced') await verifyPendingWorkoutCompletion(tx, current, instance)\n"+anchor.replace('      current_week:', '      progression_state: withoutPendingWorkoutCompletion(current),\n      current_week:')
assert progression.count(anchor)==1; progression=progression.replace(anchor,replacement,1)
anchor="    const completed = prepareLocalMutation({ ...current, status: 'completed', completed_on:"
replacement="    await verifyPendingWorkoutCompletion(tx, current, instance)\n"+anchor.replace("...current, status:","...current, progression_state: withoutPendingWorkoutCompletion(current), status:")
assert progression.count(anchor)==1; progression=progression.replace(anchor,replacement,1)
start=progression.index('async function openBlackCrownEntryGate('); end=progression.index('export async function advanceProgramAfterWorkout(',start)
block=progression[start:end]
anchor="    const previous = (current.progression_state ?? {}) as Record<string, unknown>"
assert block.count(anchor)==1
block=block.replace(anchor,"    await verifyPendingWorkoutCompletion(tx, current, instance)\n    const previous = withoutPendingWorkoutCompletion(current)",1)
progression=progression[:start]+block+progression[end:]
anchor="  day: number,\n): Promise<ProgressionResult> {\n  const instance = await getCurrentProgramInstance(athleteId)"
assert progression.count(anchor)==1
progression=progression.replace(anchor,"  day: number,\n  completionToken?: string,\n): Promise<ProgressionResult> {\n  const instance = await getCurrentProgramInstance(athleteId)",1)
anchor='  const next = nextPosition(program, week, day)'
assert progression.count(anchor)==1
progression=progression.replace(anchor,"  if (completionToken && ((instance.progression_state ?? {}) as Record<string, any>).pendingWorkoutCompletion?.token !== completionToken) {\n    throw new Error('Workout completion intent was already consumed or cancelled')\n  }\n\n"+anchor,1)
anchor="    const completed = prepareLocalMutation({ ...current, status: 'completed', current_phase_key: 'complete',"
assert progression.count(anchor)==1
progression=progression.replace(anchor,"    await verifyPendingWorkoutCompletion(tx, current, instance)\n"+anchor.replace("...current, status:","...current, progression_state: withoutPendingWorkoutCompletion(current), status:"),1)
# Run recovery before rendering the selected workout, never by scanning old history.
anchor='import { activateBlackCrownFromEntry, advanceProgramAfterWorkout,'
assert main.count(anchor)==1
main=main.replace(anchor,'import { recoverPendingWorkoutProgression, activateBlackCrownFromEntry, advanceProgramAfterWorkout,',1)
anchor='    if (state.athlete) {\n      state.programInstance = await getCurrentProgramInstance(state.athlete.id)'
assert main.count(anchor)==1
main=main.replace(anchor,"""    if (state.athlete) {
      try {
        const recovered = await recoverPendingWorkoutProgression(state.athlete.id)
        if (recovered) state.toast = 'Recovered your completed workout and next program position'
      } catch (error) {
        console.warn('Workout completion remains saved; automatic progression is blocked', error)
        state.toast = 'Completed workout is saved. Program recovery needs review before continuing.'
      }
      state.programInstance = await getCurrentProgramInstance(state.athlete.id)""",1)
w.write_text(workout);p.write_text(progression);m.write_text(main)
print('Durable workout completion intent and automatic boot recovery installed')
PY
