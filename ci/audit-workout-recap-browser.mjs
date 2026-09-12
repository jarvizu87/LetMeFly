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
  try {const names=['athletes','athletePreferences','programInstances','workoutSessions','workoutExercises','workoutSets','syncOutbox'];return await new Promise((r,j)=>{const tx=db.transaction(names,'readonly'),data={};tx.oncomplete=()=>r(data);tx.onerror=()=>j(tx.error);for(const n of names){const q=tx.objectStore(n).getAll();q.onsuccess=()=>data[n]=q.result}})}finally{db.close()}
})}
try {
  for(const width of [412,1440]) {
    const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',locale:'en-US'})
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort())
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message))
    await page.goto(origin+'/#/train');await page.waitForFunction(applicationBootState);await dismissInstall(page)
    await page.locator('#onboard-name').fill('Disposable recap audit')
    const unit=width===1440?'kg':'lb'
    await page.locator('#onboard-unit').selectOption(unit)
    // Native logging honors the selected athlete unit: 5 x 100 kg is 500 kg.
    // Separately verify opposite-unit saved history below; never rely on the old
    // logger bug that silently saved a metric athlete's entry as pounds.
    const expectedVolume='500'
    await page.locator('[data-action="create-athlete"]').click();await page.locator('[data-action="create-athlete"]').waitFor({state:'detached'})
    for(const input of await page.locator('.active-page .readiness-field input[value="4"]').all())await input.locator('..').click()
    await page.locator('.active-page [data-action="start-workout"]').click();await page.locator('[data-set-id]').first().waitFor({state:'attached'})
    const exercise=page.locator('.active-exercise').filter({has:page.locator('h3',{hasText:/^Front Squat$/})})
    const row=exercise.locator('[data-set-id]').first()
    const setId=await row.getAttribute('data-set-id')
    if(width===1440)await page.locator('[data-lmf-desktop-workspace] #swipe-viewport [data-set-id]').first().waitFor({state:'attached'})
    // Enter the target section through the same visible control an athlete uses.
    // Calling the review bridge during initial workout mounting can race the
    // viewport's readiness selection. The actual recap correction is tested below.
    const sectionIndex=await row.evaluate(el=>Array.from(document.querySelectorAll('#swipe-viewport > .swipe-page')).indexOf(el.closest('.swipe-page')))
    await page.locator(`#session-track [data-session-index="${sectionIndex}"]`).click()
    // Native navigation sets the active class before its smooth scroll finishes.
    // Filling a field mid-slide invokes Playwright's own scrolling and can stop
    // the viewport on Warm-Up. Wait for the actual target pane to reach center.
    await page.waitForFunction(id=>{
      const pane=document.querySelector(`[data-set-id="${id}"]`)?.closest('.swipe-page')
      const viewport=document.querySelector('#swipe-viewport')
      if(!pane?.classList.contains('active-page')||!viewport)return false
      const a=pane.getBoundingClientRect(),v=viewport.getBoundingClientRect()
      return a.width>0&&Math.abs(a.left+a.width/2-v.left-v.width/2)<2
    },setId)
    if(!await exercise.evaluate(el=>el.classList.contains('lmf-flow-active')))await exercise.locator('.lmf-compact-summary').click()
    assert.equal(await row.getAttribute('data-load-unit'),unit,'Visible load entry uses the athlete unit')
    await row.locator('.reps-input').fill('5');await row.locator('.load-input').fill('100')
    if(width===1440) {
      try { await page.waitForFunction(() => document.querySelector('[data-lmf-desktop-v2-load]')?.textContent?.trim()==='100 kg') }
      catch (error) {
        const visible=await page.evaluate(()=>({section:document.querySelector('.active-page h2')?.textContent,tools:document.querySelector('.lmf-desktop-context-panel')?.textContent,focused:document.activeElement?.className}))
        await page.screenshot({path:path.join(out,'metric-tools-failure.png')})
        throw new Error(`Metric tools did not follow the visible field: ${JSON.stringify(visible)}`,{cause:error})
      }
    }
    await row.locator('[data-action="toggle-set"]').click()
    await page.waitForFunction(id=>document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'),setId)
    let data=await snapshot(page),sessionId=data.workoutSessions.find(s=>s.status==='in_progress').id
    assert.equal(data.workoutSets.find(s=>s.id===setId).load_value,100)
    assert.equal(data.workoutSets.find(s=>s.id===setId).load_unit,unit,'Saved actual load retains the entered unit')
    assert.equal(data.athletePreferences.find(p=>!p.deleted_at&&p.athlete_id===data.workoutSessions.find(s=>s.id===sessionId).athlete_id)?.weight_unit,unit)
    const reviewIndex=await page.locator('#swipe-viewport > .swipe-page').count()-1
    await page.locator(`#session-track [data-session-index="${reviewIndex}"]`).click()
    await page.locator('[data-recap-review]').click();await page.locator('.lmf-recap-dialog').waitFor({state:'visible'})
    assert.equal(await page.locator('[data-recap-volume]').innerText(),expectedVolume);assert.match(await page.locator('.lmf-recap-dialog').innerText(),/Review & finish/i)
    assert.equal(await page.locator('.lmf-weight > span').innerText(),unit)
    const beforeRead=await snapshot(page);await page.locator('[data-recap-detail] > summary').click()
    assert.match(await page.locator(`[data-recap-set="${setId}"]`).innerText(),new RegExp(`5 reps · 100 ${unit}`))
    assert.deepEqual(await snapshot(page),beforeRead,'Read-only recap does not change saved rows')
    const correct=page.locator('[data-recap-correct]').first(), correctId=await correct.getAttribute('data-recap-correct')
    await correct.click()
    await page.waitForFunction(id=>document.querySelector(`[data-set-id="${id}"]`)?.closest('.swipe-page').classList.contains('active-page'),correctId)
    await page.reload();await page.waitForFunction(applicationBootState);await dismissInstall(page)
    data=await snapshot(page);assert.equal(data.workoutSets.find(s=>s.id===setId).completed,true)
    assert.equal(data.workoutSets.find(s=>s.id===setId).load_unit,unit,'Reload preserves actual load units')
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
      const conversionId='unit-conversion-'+sessionId, conversionAt=new Date(Date.parse(current.started_at)-21*86400000).toISOString()
      await new Promise((r,j)=>{const tx=db.transaction(names,'readwrite');tx.oncomplete=r;tx.onerror=()=>j(tx.error)
        tx.objectStore('workoutSessions').put({...current,id:priorId,started_at:at,completed_at:at})
        tx.objectStore('workoutSessions').put({...current,id:conversionId,started_at:conversionAt,completed_at:conversionAt})
        for(let i=1;i<=7;i++){const date=new Date(Date.parse(current.started_at)-i*86400000).toISOString();tx.objectStore('workoutSessions').put({...current,id:'archive-'+i,started_at:date,completed_at:date,workout_name:'Disposable recovery record '+i})}
        for(const e of data.workoutExercises.filter(e=>e.workout_session_id===sessionId))tx.objectStore('workoutExercises').put({...e,id:'comparison-'+e.id,workout_session_id:priorId})
        for(const s of data.workoutSets.filter(s=>s.workout_session_id===sessionId))tx.objectStore('workoutSets').put({...s,id:'comparison-'+s.id,workout_session_id:priorId,workout_exercise_id:'comparison-'+s.workout_exercise_id,completed_at:s.completed?at:null,load_value:s.completed&&typeof s.load_value==='number'?s.load_value/2:s.load_value})
        // Independent old-session fixture: exactly 5 reps x 100 in the opposite
        // saved unit. Recap must convert the total and retain raw-unit breakdowns.
        for(const e of data.workoutExercises.filter(e=>e.workout_session_id===sessionId))tx.objectStore('workoutExercises').put({...e,id:'unit-conversion-'+e.id,workout_session_id:conversionId})
        for(const s of data.workoutSets.filter(s=>s.workout_session_id===sessionId))tx.objectStore('workoutSets').put({...s,id:'unit-conversion-'+s.id,workout_session_id:conversionId,workout_exercise_id:'unit-conversion-'+s.workout_exercise_id,completed_at:s.completed?conversionAt:null,load_value:s.completed?100:s.load_value,load_unit:s.completed?(s.load_unit==='kg'?'lb':'kg'):s.load_unit})
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
    assert.equal(await page.locator('[data-recap-volume]').innerText(),'250')
    await page.locator('[data-recap-close]').first().click()
    const beforeConversion=await snapshot(page)
    await page.locator(`#lmf-recap-archive [data-workout-recap="unit-conversion-${sessionId}"]`).click()
    await page.locator('[data-recap-session]').waitFor()
    assert.equal(await page.locator('[data-recap-session]').getAttribute('data-recap-session'),'unit-conversion-'+sessionId)
    const convertedVolume=unit==='kg'?'226.8':'1,102.3'
    assert.equal(await page.locator('[data-recap-volume]').innerText(),convertedVolume,'Opposite-unit history converts measured lifting volume')
    assert.equal(await page.locator('.lmf-weight > span').innerText(),unit)
    await page.locator('[data-recap-detail] > summary').click()
    assert.match(await page.locator(`[data-recap-set="unit-conversion-${setId}"]`).innerText(),new RegExp(`5 reps · 100 ${unit==='kg'?'lb':'kg'}`))
    assert.deepEqual(await snapshot(page),beforeConversion,'Unit conversion never relabels or rewrites saved history')
    report.checks.push({width,passed:'native log → review → reload/resume → finish → governed advancement → saved recap → History/reload → opposite-unit archive conversion',sessionVolume:500,unit,convertedVolume})
    await context.close()
  }
  assert.deepEqual(report.errors,[]);report.result='PASS'
} catch(e) {report.result='FAIL';report.error=e.stack;throw e}
finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(JSON.stringify(report,null,2))
