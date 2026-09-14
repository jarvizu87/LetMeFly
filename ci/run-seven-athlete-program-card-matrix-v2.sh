#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/ci/audit-seven-athlete-program-card-matrix-v1.mjs"
TMP="$ROOT_DIR/ci/.seven-athlete-program-card-matrix-v2-${BASHPID}.mjs"
APP="${1:-$ROOT_DIR/.build-src/letmefly_app}"
trap 'rm -f "$TMP"' EXIT

SOURCE="$SOURCE" TMP="$TMP" python3 - <<'PY'
from pathlib import Path
import os
source = Path(os.environ['SOURCE']).read_text()

old = """async function setPosition(page,athleteId,row,currentDay){await page.goto(`${origin}/#/home`,{waitUntil:'domcontentloaded'});await page.evaluate(async({athleteId,row,currentDay})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{const tx=db.transaction('programInstances','readwrite'),store=tx.objectStore('programInstances'),req=store.index('by-athlete-status').getAll([athleteId,'active']),rows=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});if(rows.length!==1)throw new Error('Expected exactly one active program');store.put({...rows[0],program_key:row.program,program_name:row.programName,current_week:row.week,current_day_key:`day-${currentDay}`,progression_state:{}});await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=tx.onabort=()=>rej(tx.error)})}finally{db.close()}},{athleteId,row,currentDay});await page.goto(`${origin}/#/train`,{waitUntil:'domcontentloaded'});await page.waitForSelector('.train-shell',{state:'visible',timeout:15000})}
"""
new = """let matrixReloadSerial=0
async function setPosition(page,athleteId,row,currentDay){
  // Load a real app document before touching the disposable vault.
  await page.goto(`${origin}/?matrix-seed=${++matrixReloadSerial}#/home`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>document.querySelector('main')&&!/Loading private athlete vault/i.test(document.body.innerText),null,{timeout:15000})
  await page.evaluate(async({athleteId,row,currentDay})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{const tx=db.transaction('programInstances','readwrite'),store=tx.objectStore('programInstances'),req=store.index('by-athlete-status').getAll([athleteId,'active']),rows=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});if(rows.length!==1)throw new Error('Expected exactly one active program');store.put({...rows[0],program_key:row.program,program_name:row.programName,current_week:row.week,current_day_key:`day-${currentDay}`,progression_state:{}});await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=tx.onabort=()=>rej(tx.error)})}finally{db.close()}},{athleteId,row,currentDay})
  // A hash-only navigation keeps the app's cached athlete/program position alive.
  // Change the document URL so the production runtime must re-read IndexedDB.
  await page.goto(`${origin}/?matrix=${encodeURIComponent(row.program)}-${row.week}-${currentDay}-${++matrixReloadSerial}#/train`,{waitUntil:'domcontentloaded'})
  await page.waitForSelector('.train-shell',{state:'visible',timeout:15000})
  await page.waitForFunction(day=>document.querySelector(`.day-chip.active[data-day="${day}"]`),currentDay,{timeout:10000})
  const activeDay=Number(await page.locator('.day-chip.active').first().getAttribute('data-day'))
  assert.equal(activeDay,currentDay,`${row.program} W${row.week}: cached current day ${activeDay} did not reload to D${currentDay}`)
}
"""
if source.count(old) != 1:
    raise SystemExit(f'Expected one matrix setPosition boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

old = """if(row.day!==currentDay){await chip.click();await page.waitForFunction(day=>document.querySelector(`.day-chip.active[data-day="${day}"]`),row.day)}const title="""
new = """if(row.day!==currentDay){
  await chip.click()
  await page.waitForFunction(day=>document.querySelector(`.day-chip.active[data-day="${day}"]`),row.day)
  await page.waitForFunction(()=>document.documentElement.classList.contains('lmf-preview-mode'),null,{timeout:10000})
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lmf-preview-mode')),true,`${row.program} W${row.week} D${row.day}: selected day never entered preview mode`)
  const start=page.locator('[data-action="start-workout"]:visible')
  assert.equal(await start.count(),0,`${row.program} W${row.week} D${row.day}: preview exposed Start Workout`)
}const title="""
if source.count(old) != 1:
    raise SystemExit(f'Expected one matrix preview-state boundary, found {source.count(old)}')
source = source.replace(old, new, 1)

Path(os.environ['TMP']).write_text(source)
PY

node --check "$TMP"
node "$TMP" "$APP"
