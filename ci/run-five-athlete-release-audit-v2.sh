#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/ci/audit-five-athlete-release-browser.mjs"
TMP="$ROOT_DIR/ci/.five-athlete-release-browser-v2-${BASHPID}.mjs"
trap 'rm -f "$TMP"' EXIT

SOURCE="$SOURCE" TMP="$TMP" python3 - <<'PY'
from pathlib import Path
import os

source = Path(os.environ['SOURCE']).read_text()
old = '''async function waitForCompletedSession(page, sessionId) {
  await page.waitForFunction(async id => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try { const row = await new Promise(resolve => { const r = db.transaction('workoutSessions','readonly').objectStore('workoutSessions').get(id); r.onsuccess = () => resolve(r.result) }); return row?.status === 'completed' } finally { db.close() }
  }, sessionId, { timeout: 12000 })
}
'''
new = '''async function waitForCompletedSession(page, sessionId) {
  await page.waitForFunction(async id => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try {
      const tx = db.transaction(['workoutSessions','programInstances'], 'readonly')
      const sessionRequest = tx.objectStore('workoutSessions').get(id)
      const programRequest = tx.objectStore('programInstances').getAll()
      const [session, programs] = await Promise.all([
        new Promise((resolve, reject) => { sessionRequest.onsuccess = () => resolve(sessionRequest.result); sessionRequest.onerror = () => reject(sessionRequest.error) }),
        new Promise((resolve, reject) => { programRequest.onsuccess = () => resolve(programRequest.result); programRequest.onerror = () => reject(programRequest.error) }),
      ])
      const athleteId = session?.athlete_id
      const active = athleteId ? programs.find(row => !row.deleted_at && row.status === 'active' && row.athlete_id === athleteId) : null
      return session?.status === 'completed'
        && Boolean(athleteId)
        && active?.program_key === 'crownforge'
        && Number(active?.current_week) === 1
        && active?.current_day_key === 'day-2'
    } finally { db.close() }
  }, sessionId, { timeout: 12000 })
}
'''
if source.count(old) != 1:
    raise SystemExit(f'Expected one five-athlete completion wait boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

# Keep the logger honest: the actual saved unit must match the active athlete,
# while the immutable programmed prescription fields remain independently checked.
old_logged = "      assert.equal(logged?.completed, true)\n      assert.deepEqual(prescriptionMap(afterLog, sessionId), beforePrescription, `${fixture.key}: logging rewrote programmed prescription fields`)"
new_logged = "      assert.equal(logged?.completed, true)\n      assert.equal(logged?.load_unit, fixture.weightUnit, `${fixture.key}: saved actual load unit must follow athlete setting`)\n      assert.deepEqual(prescriptionMap(afterLog, sessionId), beforePrescription, `${fixture.key}: logging rewrote programmed prescription fields`)"
if source.count(old_logged) != 1:
    raise SystemExit(f'Expected one saved-unit assertion boundary, found {source.count(old_logged)}')
source = source.replace(old_logged, new_logged, 1)

# Temporary QA-only trace: capture every programInstances.put plus the exact row
# sequence after Day 2 first becomes observable. This is designed to identify the
# stale writer that briefly restores Day 1; it does not alter production source.
old_finish = '''      page.once('dialog', dialog => dialog.accept())
      await page.locator('[data-recap-finish]').click()
      await waitForCompletedSession(page, sessionId)
      const afterFinish = await snapshot(page)
'''
new_finish = '''      await page.evaluate(() => {
        window.__LMF_PROGRAM_WRITE_TRACE__ = []
        const proto = IDBObjectStore.prototype
        if (!proto.__lmfTraceOriginalPut) {
          const original = proto.put
          Object.defineProperty(proto, '__lmfTraceOriginalPut', { value: original, configurable: true })
          proto.put = function(value, ...args) {
            if (this.name === 'programInstances') {
              window.__LMF_PROGRAM_WRITE_TRACE__.push({
                at: performance.now(), id: value?.id ?? null, athleteId: value?.athlete_id ?? null,
                status: value?.status ?? null, program: value?.program_key ?? null,
                week: value?.current_week ?? null, day: value?.current_day_key ?? null,
                localVersion: value?._local?.localVersion ?? null,
                pendingToken: value?.progression_state?.pendingWorkoutCompletion?.token ?? null,
                stack: new Error('programInstances.put').stack ?? '',
              })
            }
            return original.call(this, value, ...args)
          }
        }
      })
      page.once('dialog', dialog => dialog.accept())
      await page.locator('[data-recap-finish]').click()
      await waitForCompletedSession(page, sessionId)
      const checkpoints = []
      for (const delay of [0, 10, 30, 75, 150, 300, 600]) {
        if (delay) await page.waitForTimeout(delay - checkpoints.at(-1).delay)
        const data = await snapshot(page)
        checkpoints.push({
          delay,
          activePrograms: (data.programInstances || []).filter(row => row.athlete_id === athleteId && row.status === 'active' && !row.deleted_at).map(row => ({
            id: row.id, program: row.program_key, week: row.current_week, day: row.current_day_key,
            localVersion: row?._local?.localVersion ?? null,
            pendingToken: row?.progression_state?.pendingWorkoutCompletion?.token ?? null,
            updatedAt: row.updated_at ?? null,
          })),
          events: (data.programEvents || []).filter(row => row.athlete_id === athleteId && !row.deleted_at).slice(-6).map(row => ({
            id: row.id, type: row.event_type, at: row.effective_at, payload: row.event_payload ?? null,
          })),
        })
      }
      athleteResult.completionTrace = {
        writes: await page.evaluate(() => window.__LMF_PROGRAM_WRITE_TRACE__ ?? []),
        checkpoints,
      }
      const afterFinish = await snapshot(page)
'''
if source.count(old_finish) != 1:
    raise SystemExit(f'Expected one completion trace boundary, found {source.count(old_finish)}')
source = source.replace(old_finish, new_finish, 1)
Path(os.environ['TMP']).write_text(source)
PY

node --check "$TMP"
grep -Fq "row.athlete_id === athleteId" "$TMP"
grep -Fq "active?.current_day_key === 'day-2'" "$TMP"
grep -Fq "saved actual load unit must follow athlete setting" "$TMP"
grep -Fq "__LMF_PROGRAM_WRITE_TRACE__" "$TMP"
grep -Fq "checkpoints" "$TMP"
grep -Fq "assert.equal(activeProgram?.current_day_key, 'day-2')" "$TMP"
node "$TMP" "$@"
