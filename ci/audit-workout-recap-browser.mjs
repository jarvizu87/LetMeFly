import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {applicationBootState} from './browser-boot-contract.mjs'
const root=path.resolve(import.meta.dirname,'..'),app=path.join(root,'.build-src/letmefly_app'),out=path.join(app,'WORKOUT_RECAP_AUDIT')
fs.mkdirSync(out,{recursive:true})
const {chromium}=createRequire(path.join(app,'package.json'))('playwright-core')
const origin=process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
const report={result:'RUNNING',checks:[],errors:[]}
async function dismissInstall(page) {
  const button=page.getByRole('button',{name:'Dismiss install prompt',exact:true})
  await button.waitFor({state:'visible',timeout:5000}).catch(()=>{})
  if(await button.isVisible())await button.click()
}
async function snapshot(page) {return page.evaluate(async()=>{
  const db=await new Promise((r,j)=>{const q=indexedDB.open('letmefly-private');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
  try {const names=['athletes','programInstances','workoutSessions','workoutExercises','workoutSets','syncOutbox'];return await new Promise((r,j)=>{const tx=db.transaction(names,'readonly'),data={};tx.oncomplete=()=>r(data);tx.onerror=()=>j(tx.error);for(const n of names){const q=tx.objectStore(n).getAll();q.onsuccess=()=>data[n]=q.result}})}finally{db.close()}
})}
try {
  for(const width of [412,1440]) {
    const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'})
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort())
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message))
    await page.goto(origin+'/#/train');await page.waitForFunction(applicationBootState);await dismissInstall(page)
    await page.locator('#onboard-name').fill('Disposable recap audit')
    if(width===1440)await page.locator('#onboard-unit').selectOption('kg')
    const expectedVolume=width===1440?'226.8':'500'
    await page.locator('[data-action="create-athlete"]').click();await page.locator('[data-action="create-athlete"]').waitFor({state:'detached'})
    for(const input of await page.locator('.active-page .readiness-field input[value="4"]').all())await input.locator('..').click()
    await page.locator('.active-page [data-action="start-workout"]').click();await page.locator('[data-set-id]').first().waitFor({state:'attached'})
    const row=page.locator('.active-exercise').filter({has:page.locator('h3',{hasText:/^Front Squat$/})}).locator('[data-set-id]').first()
    const setId=await row.getAttribute('data-set-id')
    await page.evaluate(id=>window.LetMeFlyWorkoutRecap.reviewSet(id),setId)
    await row.locator('.reps-input').fill('5');await row.locator('.load-input').fill('100');await row.locator('[data-action="toggle-set"]').click()
    await page.waitForFunction(id=>document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'),setId)
    let data=await snapshot(page),sessionId=data.workoutSessions.find(s=>s.status==='in_progress').id
    assert.equal(data.workoutSets.find(s=>s.id===setId).load_value,100)
    const reviewIndex=await page.locator('#swipe-viewport > .swipe-page').count()-1
    await page.locator(`#session-track [data-session-index="${reviewIndex}"]`).click()
    await page.locator('[data-recap-review]').click();await page.locator('.lmf-recap-dialog').waitFor({state:'visible'})
    assert.equal(await page.locator('[data-recap-volume]').innerText(),expectedVolume);assert.match(await page.locator('.lmf-recap-dialog').innerText(),/Review & finish/i)
    const beforeRead=await snapshot(page);await page.locator('[data-recap-detail] > summary').click()
    assert.match(await page.locator(`[data-recap-set="${setId}"]`).innerText(),/5 reps · 100 lb/)
    assert.deepEqual(await snapshot(page),beforeRead,'Read-only recap does not change saved rows')
    const correct=page.locator('[data-recap-correct]').first(), correctId=await correct.getAttribute('data-recap-correct')
    await correct.click()
    await page.waitForFunction(id=>document.querySelector(`[data-set-id="${id}"]`)?.closest('.swipe-page').classList.contains('active-page'),correctId)
    await page.reload();await page.waitForFunction(applicationBootState);await dismissInstall(page)
    data=await snapshot(page);assert.equal(data.workoutSets.find(s=>s.id===setId).completed,true)
    await page.locator(`#session-track [data-session-index="${reviewIndex}"]`).click();await page.locator('[data-recap-review]').click()
    page.once('dialog',d=>d.accept());await page.locator('[data-recap-finish]').click()
    await page.waitForFunction(id=>document.querySelector('[data-recap-session]')?.getAttribute('data-recap-session')===id&&document.querySelector('.lmf-eyebrow')?.textContent==='Session saved',sessionId)
    data=await snapshot(page);assert.equal(data.workoutSessions.find(s=>s.id===sessionId).status,'completed')
    assert.equal(data.programInstances.find(p=>p.status==='active').current_day_key,'day-2')
    assert.equal(await page.locator('[data-recap-volume]').innerText(),expectedVolume)
    assert.match(await page.locator('.lmf-recap-dialog').innerText(),/No previous matching session/)
    assert.match(await page.locator('.lmf-recap-dialog').innerText(),/Cloud sync pending/)
    assert.equal(await page.locator('.lmf-recap-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
    await page.waitForFunction(()=>[...document.querySelectorAll('.lmf-recap-dialog img')].every(el=>el.complete&&el.naturalWidth>0))
    await page.locator('.lmf-recap-dialog').screenshot({path:path.join(out,`saved-recap-${width}.png`)})
    await page.locator('[data-recap-history]').click();await page.reload();await page.waitForFunction(applicationBootState);await dismissInstall(page)
    const history=page.locator(`.history-list [data-workout-recap="${sessionId}"]`)
    // Native history is inside the existing Progress tools disclosure.
    const historyTools=page.locator('#lmf-pg-native-tools');await historyTools.waitFor({state:'visible'})
    if(!await historyTools.evaluate(el=>el.open))await historyTools.locator(':scope > summary').click()
    await history.click();await page.locator('[data-recap-session]').waitFor()
    assert.equal(await page.locator('[data-recap-session]').getAttribute('data-recap-session'),sessionId)
    assert.equal(await page.locator('[data-recap-volume]').innerText(),expectedVolume)
    assert.deepEqual(await snapshot(page),data,'History/reload recap preserves completion and progression')
    await page.locator('[data-recap-close]').first().click()
    // Disposable comparison fixture clones the saved prescription exactly; only
    // immutable IDs/times and actual logged load differ. No real athlete data.
    await page.evaluate(async sessionId=>{
      const db=await new Promise((r,j)=>{const q=indexedDB.open('letmefly-private');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
      const names=['workoutSessions','workoutExercises','workoutSets']
      const data=await new Promise((r,j)=>{const tx=db.transaction(names,'readonly'),v={};tx.oncomplete=()=>r(v);tx.onerror=()=>j(tx.error);for(const n of names){const q=tx.objectStore(n).getAll();q.onsuccess=()=>v[n]=q.result}})
      const current=data.workoutSessions.find(s=>s.id===sessionId), priorId='comparison-'+sessionId, at=new Date(Date.parse(current.started_at)-14*86400000).toISOString()
      await new Promise((r,j)=>{const tx=db.transaction(names,'readwrite');tx.oncomplete=r;tx.onerror=()=>j(tx.error)
        tx.objectStore('workoutSessions').put({...current,id:priorId,started_at:at,completed_at:at})
        for(let i=1;i<=7;i++){const date=new Date(Date.parse(current.started_at)-i*86400000).toISOString();tx.objectStore('workoutSessions').put({...current,id:'archive-'+i,started_at:date,completed_at:date,workout_name:'Disposable recovery record '+i})}
        for(const e of data.workoutExercises.filter(e=>e.workout_session_id===sessionId))tx.objectStore('workoutExercises').put({...e,id:'comparison-'+e.id,workout_session_id:priorId})
        for(const s of data.workoutSets.filter(s=>s.workout_session_id===sessionId))tx.objectStore('workoutSets').put({...s,id:'comparison-'+s.id,workout_session_id:priorId,workout_exercise_id:'comparison-'+s.workout_exercise_id,completed_at:s.completed?at:null,load_value:s.completed&&typeof s.load_value==='number'?s.load_value/2:s.load_value})
      });db.close()
    },sessionId)
    await history.click();await page.locator('[data-recap-session]').waitFor()
    const peaks=await page.locator('[data-peak]').evaluateAll(nodes=>nodes.map(n=>({value:Number(n.dataset.value),height:208-Number(n.dataset.summitY)})))
    assert.equal(peaks.length,2);assert.ok(Math.abs(peaks[1].height-peaks[0].height*2)<1e-8)
    await page.locator('.lmf-volume-chart').scrollIntoViewIfNeeded()
    await page.locator('.lmf-panel').screenshot({path:path.join(out,`matching-mountains-${width}.png`)})
    await page.locator('[data-recap-close]').first().click();await page.reload();await page.waitForFunction(applicationBootState);await dismissInstall(page)
    await page.locator('#lmf-recap-archive').waitFor({state:'attached'})
    if(!await historyTools.evaluate(el=>el.open))await historyTools.locator(':scope > summary').click()
    await page.locator('#lmf-recap-archive > summary').click()
    assert.equal(await page.locator(`.history-list [data-workout-recap="comparison-${sessionId}"]`).count(),0,'Older session falls outside native recent eight')
    await page.locator(`#lmf-recap-archive [data-workout-recap="comparison-${sessionId}"]`).click()
    await page.locator('[data-recap-session]').waitFor()
    assert.equal(await page.locator('[data-recap-session]').getAttribute('data-recap-session'),'comparison-'+sessionId)
    assert.equal(await page.locator('[data-recap-volume]').innerText(),width===1440?'113.4':'250')
    report.checks.push({width,passed:'native log → review → reload/resume → finish → governed advancement → saved recap → History/reload',sessionVolume:500})
    await context.close()
  }
  assert.deepEqual(report.errors,[]);report.result='PASS'
} catch(e) {report.result='FAIL';report.error=e.stack;throw e}
finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(JSON.stringify(report,null,2))
