#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?reconstructed app root required}"
TARGET="$TARGET" python3 - <<'PY'
from pathlib import Path
import os
p = Path(os.environ['TARGET']) / 'src/services/workout-service.ts'
text = p.read_text()
if 'const concurrentWorkoutSession' in text:
    print('Workout-start transaction serialization already installed')
    raise SystemExit(0)
# The early read remains the fast resume path. A second read must be inside the
# same read/write transaction as skeleton creation to serialize competing tabs.
start = text.index('export async function startWorkout(')
end = text.index('\nfunction resolvePrivateProgrammedLoad', start)
block = text[start:end]
needle = "    const session = prepareLocalMutation("
assert block.count(needle) == 1, 'Workout session insertion boundary moved'
insert = '''    const concurrentWorkoutSessions = await requestToPromise<LocalDomainRecord[]>(
      tx.objectStore('workoutSessions').index('by-athlete').getAll(athleteId),
    )
    const concurrentWorkoutSession = concurrentWorkoutSessions.find((session) =>
      !session.deleted_at
      && session.program_key === programKey
      && session.week_number === week
      && session.day_key === `day-${day.day}`
    )
    if (concurrentWorkoutSession) {
      await transactionDone(tx)
      return loadWorkoutBundle(concurrentWorkoutSession)
    }

'''
block = block.replace(needle, insert + needle, 1)
text = text[:start] + block + text[end:]
if '  requestToPromise,' not in text[:text.index("from '../db/local-db'")]:
    text = text.replace('  openLetMeFlyDb,\n', '  openLetMeFlyDb,\n  requestToPromise,\n', 1)
p.write_text(text)
PY

grep -Fq 'const concurrentWorkoutSession = concurrentWorkoutSessions.find' "$TARGET/src/services/workout-service.ts"
echo 'Workout start: competing requests share one persisted session skeleton: source guard installed'
