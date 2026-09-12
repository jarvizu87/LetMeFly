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
      const active = programs.find(row => !row.deleted_at && row.status === 'active')
      return session?.status === 'completed'
        && active?.program_key === 'crownforge'
        && Number(active?.current_week) === 1
        && active?.current_day_key === 'day-2'
    } finally { db.close() }
  }, sessionId, { timeout: 12000 })
}
'''
if source.count(old) != 1:
    raise SystemExit(f'Expected one five-athlete completion wait boundary, found {source.count(old)}')
Path(os.environ['TMP']).write_text(source.replace(old, new, 1))
PY

node --check "$TMP"
grep -Fq "active?.current_day_key === 'day-2'" "$TMP"
grep -Fq "assert.equal(activeProgram?.current_day_key, 'day-2')" "$TMP"
node "$TMP" "$@"
