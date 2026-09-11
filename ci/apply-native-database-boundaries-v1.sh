#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?reconstructed app root required}"
TARGET="$TARGET" python3 - <<'PY'
import os
from pathlib import Path
root = Path(os.environ['TARGET'])
wpath = root / 'src/services/workout-service.ts'
p = root / 'src/services/program-progression-service.ts'
w = wpath.read_text()
g = p.read_text()

def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one source boundary, found {count}')
    return text.replace(old, new, 1)

if 'function putWorkoutSubstitutionInTransaction(' in w:
    raise SystemExit('Native database boundary patch must run once on reconstructed source')
w = once(w, '  openLetMeFlyDb,\n', '  openLetMeFlyDb,\n  requestToPromise,\n', 'workout request helper import')
needle = """    const session = prepareLocalMutation(
"""
w = once(w, needle, """    // Recheck inside the same readwrite transaction as skeleton creation.
    // IndexedDB serializes overlapping writers across tabs, not just this page.
    const concurrentSessions = await requestToPromise<LocalDomainRecord[]>(
      tx.objectStore('workoutSessions').index('by-athlete').getAll(athleteId),
    )
    const concurrentSession = concurrentSessions.find((row) => !row.deleted_at
      && row.program_key === programKey && row.week_number === week && row.day_key === `day-${day.day}`)
    if (concurrentSession) {
      await transactionDone(tx)
      return loadWorkoutBundle(concurrentSession)
    }

""" + needle, 'serialized workout-slot recheck')

helper = """// A substitute is one mutation of a workout slot, not independent row saves.
// The input is the full row read inside this transaction; only its local version
// and existing sync provenance are used as the mutation baseline.
function putWorkoutSubstitutionInTransaction(
  tx: IDBTransaction,
  storeName: 'workoutExercises' | 'workoutSets',
  input: LocalDomainRecord,
  context: { athleteId: string; deviceId: string },
): void {
  if (input.athlete_id !== context.athleteId) throw new Error('Refusing cross-athlete substitution write')
  const record = prepareLocalMutation(input, context, input)
  tx.objectStore(storeName).put(record)
  tx.objectStore('syncOutbox').add(makeOutboxEntry(storeName, record, context, 'upsert'))
}

"""
w = once(w, 'export async function substituteWorkoutExercise(', helper + 'export async function substituteWorkoutExercise(', 'atomic substitution helper')
for name, next_name in [('substituteWorkoutExercise', 'export async function revertWorkoutExerciseSubstitution('), ('revertWorkoutExerciseSubstitution', 'export interface PreviousExercisePerformance')]:
    start = w.index('export async function ' + name + '(')
    end = w.index(next_name, start)
    block = w[start:end]
    opening = block.index('): Promise<WorkoutBundle> {') + len('): Promise<WorkoutBundle> {')
    signature, body = block[:opening], block[opening:]
    if not body.endswith('\n}\n\n'):
        raise SystemExit(f'Unexpected closing boundary for {name}')
    body = body[1:-4]
    device_context = "  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')\n  const context = { athleteId, deviceId: device.deviceId }\n"
    body = once(body, device_context, '', name + ' preparation')
    body = once(body, "await getById<LocalDomainRecord>('workoutExercises', workoutExerciseId)", "await requestToPromise<LocalDomainRecord | undefined>(tx.objectStore('workoutExercises').get(workoutExerciseId))", name + ' parent read')
    body = once(body, "await getById<LocalDomainRecord>('workoutSessions', String(existing.workout_session_id))", "await requestToPromise<LocalDomainRecord | undefined>(tx.objectStore('workoutSessions').get(String(existing.workout_session_id)))", name + ' session read')
    body = once(body, "await getAllFromIndex<LocalDomainRecord>('workoutSets', 'by-exercise', workoutExerciseId)", "await requestToPromise<LocalDomainRecord[]>(tx.objectStore('workoutSets').index('by-exercise').getAll(workoutExerciseId))", name + ' set reads')
    body = body.replace("if (!session || session.athlete_id !== athleteId)", "if (!session || session.athlete_id !== athleteId || session.deleted_at)")
    if 'if (!existing.substituted_from_exercise_key) return loadWorkoutBundle(session)' in body:
        body = body.replace('if (!existing.substituted_from_exercise_key) return loadWorkoutBundle(session)', 'if (!existing.substituted_from_exercise_key) {\n    await committed\n    return loadWorkoutBundle(session)\n  }')
    body = once(body, "  const activeSets = sets.filter((set) => !set.deleted_at)\n", "  const activeSets = sets.filter((set) => !set.deleted_at)\n  if (activeSets.some((set) => set.athlete_id !== athleteId || set.workout_session_id !== session.id)) throw new Error('Refusing inconsistent substitution set ownership')\n", name + ' set ownership')
    if body.count('await putEntityWithOutbox(') != 2:
        raise SystemExit(f'Expected parent and set mutation sites in {name}')
    body = body.replace('await putEntityWithOutbox(', 'putWorkoutSubstitutionInTransaction(tx,')
    body = once(body, '\n  return loadWorkoutBundle(session)', '\n  await committed\n  return loadWorkoutBundle(session)', name + ' commit barrier')
    prelude = """
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  const tx = db.transaction(['workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox'], 'readwrite')
  const committed = transactionDone(tx)
  // Attach rejection handling immediately: validation/request failure may abort
  // before control reaches the final commit barrier.
  void committed.catch(() => undefined)
  try {
"""
    tail = """
  } catch (error) {
    try { tx.abort() } catch (_) { /* Already aborted/committed. */ }
    await committed.catch(() => undefined)
    throw error
  } finally {
    db.close()
  }
}

"""
    replacement = signature + prelude + '\n'.join('  ' + line if line else '' for line in body.splitlines()) + tail
    w = w[:start] + replacement + w[end:]

start = g.index('async function updatePositionWithEvent(')
end = g.index('async function transitionToMaintenance(', start)
block = g[start:end]
needle = '    const updated = prepareLocalMutation({'
block = once(block, needle, """    // A request can become stale while awaiting this writer transaction.
    // Verify its source position again before changing state or emitting events.
    if (current.program_key !== instance.program_key
      || current.current_week !== instance.current_week
      || current.current_day_key !== instance.current_day_key) {
      tx.abort()
      throw new Error('Program position changed before progression could be saved; reload the current position')
    }
""" + needle, 'progression compare-and-set')
g = g[:start] + block + g[end:]
# Repeated completion at the Maintenance gate must not reset a blocked/pending
# decision or create another handoff event for the same completed position.
start = g.index('async function openBlackCrownEntryGate(')
end = g.index('export async function advanceProgramAfterWorkout(', start)
block = g[start:end]
needle = '    const previous = (current.progression_state ?? {}) as Record<string, unknown>\n'
block = once(block, needle, needle + """    if (previous.handoffReady === true) {
      await transactionDone(tx)
      return current
    }
""", 'entry-gate repeat guard')
g = g[:start] + block + g[end:]

wpath.write_text(w)
p.write_text(g)
print('Native database boundaries: serialized workout start, atomic Substitute/Undo, guarded progression and entry-gate reuse installed')
PY
