#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/ci/audit-seven-athlete-runtime.mjs"
TMP="$ROOT_DIR/ci/.seven-athlete-runtime-v2-${BASHPID}.mjs"
trap 'rm -f "$TMP"' EXIT

SOURCE="$SOURCE" TMP="$TMP" python3 - <<'PY'
from pathlib import Path
import os
source = Path(os.environ['SOURCE']).read_text()

old = """const fixtures = contract.athletes.map((row, index) => ({
  ...row,
"""
new = """const fixtures = contract.athletes.map((row, index) => {
  const assertions = row.requiredAssertions ?? row.scenarios?.flatMap(s => s.requiredAssertions ?? []) ?? []
  return {
  ...row,
"""
if source.count(old) != 1:
    raise SystemExit(f'Expected one seven-athlete fixture mapping boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

old = "developmentPriorities: row.requiredAssertions.slice(0, 3).join('; '),"
new = "developmentPriorities: assertions.slice(0, 3).join('; '),"
if source.count(old) != 1:
    raise SystemExit(f'Expected one seven-athlete assertion mapping boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

old = "equipmentAvailable: row.barbell.unit === 'kg' ? 'Metric barbell and metric plate inventory' : '45 lb barbell and standard plate inventory',"
new = "equipment: row.barbell.unit === 'kg' ? 'Metric barbell and metric plate inventory' : '45 lb barbell and standard plate inventory',"
if source.count(old) != 1:
    raise SystemExit(f'Expected one seven-athlete equipment profile boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

old = """  index,
}))
"""
new = """  index,
  }
})
"""
if source.count(old) != 1:
    raise SystemExit(f'Expected one seven-athlete fixture mapping close boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

# Replace the page-realm async polling helper with Node-side committed-state polling.
# This waits on the actual IndexedDB state and never treats an unresolved browser
# Promise as a successful condition.
start = source.index('async function waitForCompletionAndAdvance(page, sessionId, prior) {')
end = source.index('\nasync function openCoach(page) {', start)
source = source[:start] + '''async function waitForCompletionAndAdvance(page, sessionId, prior) {
  const deadline = Date.now() + 15000
  let last = null
  while (Date.now() < deadline) {
    const data = await snapshot(page)
    const session = (data.workoutSessions || []).find(row => row.id === sessionId)
    const active = session?.athlete_id
      ? (data.programInstances || []).find(row => !row.deleted_at && row.status === 'active' && row.athlete_id === session.athlete_id)
      : null
    last = {
      sessionStatus: session?.status ?? null,
      program: active?.program_key ?? null,
      week: active?.current_week ?? null,
      day: active?.current_day_key ?? null,
      pendingToken: active?.progression_state?.pendingWorkoutCompletion?.token ?? null,
    }
    if (session?.status === 'completed' && active
      && (active.program_key !== prior.program || Number(active.current_week) !== prior.week || active.current_day_key !== prior.dayKey)) return
    await page.waitForTimeout(25)
  }
  throw new Error(`Completion did not reach the next committed governed position: ${JSON.stringify(last)}`)
}
''' + source[end:]

# Hadrin's current slot must be the next uncompleted slot in his long history.
old = "current_phase_key:'block-2',current_week:8,current_day_key:'day-1'"
new = "current_phase_key:'block-9',current_week:53,current_day_key:'day-1'"
if source.count(old) != 1:
    raise SystemExit(f'Expected one Hadrin current-position boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

old = """          const phaseKey=exposure.replace('black-crown-','')
          const sid=`hadrin-session-${String(i).padStart(4,'0')}`,eid=`hadrin-exercise-${String(i).padStart(4,'0')}`
"""
new = """          const phaseKey=exposure.replace('black-crown-','')
          const historyWeek = exposure === 'crown-maintenance' ? (i % 3) + 1
            : exposure === 'black-crown-foundation' ? (i % 12) + 1
            : exposure === 'black-crown-volume' ? 13 + (i % 12)
            : exposure === 'black-crown-intensification' ? 25 + (i % 12)
            : exposure === 'black-crown-realization' ? 37 + (i % 16)
            : (i % 12) + 1
          const sid=`hadrin-session-${String(i).padStart(4,'0')}`,eid=`hadrin-exercise-${String(i).padStart(4,'0')}`
"""
if source.count(old) != 1:
    raise SystemExit(f'Expected one Hadrin history-week insertion boundary, found {source.count(old)}')
source = source.replace(old, new, 1)
old = "week_number:(i%12)+1"
new = "week_number:historyWeek"
if source.count(old) != 1:
    raise SystemExit(f'Expected one Hadrin historical week boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

Path(os.environ['TMP']).write_text(source)
PY

node --check "$TMP"
grep -Fq "row.scenarios?.flatMap" "$TMP"
grep -Fq "developmentPriorities: assertions.slice" "$TMP"
grep -Fq "equipment: row.barbell.unit" "$TMP"
! grep -Fq "equipmentAvailable:" "$TMP"
grep -Fq "const data = await snapshot(page)" "$TMP"
grep -Fq "pendingWorkoutCompletion" "$TMP"
grep -Fq "current_week:53" "$TMP"
grep -Fq "week_number:historyWeek" "$TMP"
node "$TMP" "$@"
