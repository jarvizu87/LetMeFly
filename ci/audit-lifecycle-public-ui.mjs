#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {applicationBootState} from './browser-boot-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(root, '.build-src/letmefly_app')
const out = path.join(app, 'LIFECYCLE_PUBLIC_UI_AUDIT')
fs.mkdirSync(out, {recursive:true})
const {chromium} = createRequire(path.join(app, 'package.json'))('playwright-core')
const report = {result:'RUNNING', passes:[], failures:[], observations:{}, scope:'Real governed Crownforge W1D1 and W1D3 through visible native UI; complements five full service/IndexedDB lifecycles'}
const pass = (label, detail) => {report.passes.push({label,detail}); console.log('PASS '+label)}
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox','--disable-dev-shm-usage']})
let page, context

async function domain() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve,reject) => {
      const r=indexedDB.open('letmefly-private'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error)
    })
    try {
      const names=['athletes','workoutSessions','workoutExercises','workoutSets']
      const tx=db.transaction(names,'readonly')
      return Object.fromEntries(await Promise.all(names.map(async name => [name,await new Promise((resolve,reject)=>{
        const r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)
      })])))
    } finally {db.close()}
  })
}
async function dismiss() {
  const button=page.getByRole('button',{name:/^(Not now|Dismiss install prompt)$/i})
  if(await button.isVisible().catch(()=>false))await button.click()
}
async function boot(day) {
  context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'})
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4173'?route.continue():route.abort())
  page=await context.newPage();page.setDefaultTimeout(10000)
  await page.addLocatorHandler(page.locator('#lmf-install-banner'),async()=>{
    await page.getByRole('button',{name:'Dismiss install prompt',exact:true}).click()
  })
  page.on('pageerror',error=>report.failures.push({label:'Runtime error',message:error.message}))
  await page.goto('http://127.0.0.1:4173/#/train')
  await page.waitForFunction(applicationBootState)
  await dismiss()
  const name=`Disposable LMF53 UI Day ${day}`
  await page.locator('#onboard-name').fill(name)
  await page.locator('[data-action="create-athlete"]').click()
  await page.locator('[data-action="create-athlete"]').waitFor({state:'detached'})
  await page.locator('#swipe-viewport').waitFor()
  assert.deepEqual((await domain()).athletes.map(x=>x.display_name),[name])
  if(day!==1) {
    await page.locator(`[data-day="${day}"]`).click()
    const reposition=page.locator('[data-action="make-current-position"]')
    await reposition.waitFor()
    page.once('dialog',dialog=>dialog.accept())
    await reposition.click()
    await reposition.waitFor({state:'detached'})
  }
  await dismiss()
  const inputs=page.locator('.swipe-page.active-page .readiness-field input[value="4"]')
  assert.equal(await inputs.count(),4)
  for(const input of await inputs.all()) {await input.locator('..').click();assert.equal(await input.isChecked(),true)}
  await page.locator('.swipe-page.active-page [data-action="start-workout"]').click()
  await page.locator('.set-row[data-set-id]').first().waitFor({state:'attached'})
  await page.locator('.active-exercise.lmf-sequence-active').first().waitFor({state:'attached'})
  pass(`Day ${day}: native onboarding, intentional position and workout creation`)
}
async function section(heading) {
  const index=await page.locator('#swipe-viewport > .swipe-page').evaluateAll((pages,title)=>pages.findIndex(p=>p.querySelector('h2')?.textContent.trim()===title),heading)
  assert.ok(index>=0,`Missing governed section ${heading}`)
  await page.locator(`#session-track [data-session-index="${index}"]`).click()
  await page.waitForFunction(title=>document.querySelector('.swipe-page.active-page h2')?.textContent.trim()===title,heading)
  // Native smooth scrolling temporarily crosses other sections. Assert the
  // settled native selection, then keep a stable locator for that same section.
  await page.waitForTimeout(650)
  const panel=page.locator('#swipe-viewport > .swipe-page').nth(index)
  assert.equal(await panel.evaluate(n=>n.classList.contains('active-page')),true)
  return panel
}
async function active(panel) {
  const card=panel.locator('.exercise-stack > .active-exercise.lmf-sequence-active')
  await card.waitFor({state:'visible'})
  const row=card.locator('.set-row.lmf-set-active')
  await row.waitFor({state:'visible'})
  const identity=await row.evaluate(row=>({id:row.dataset.setId,exerciseId:row.closest('.active-exercise').dataset.exerciseId,title:row.closest('.active-exercise').querySelector('.exercise-title h3').textContent}))
  return {card:page.locator(`[data-exercise-id="${identity.exerciseId}"]`),row:page.locator(`[data-set-id="${identity.id}"]`),...identity}
}
async function save(row, values={}) {
  const id=await row.getAttribute('data-set-id')
  row=page.locator(`[data-set-id="${id}"]`)
  report.observations.actions??=[]
  report.observations.actions.push({id,values})
  assert.equal(await row.locator('.set-check').evaluate(n=>n.classList.contains('done')),false,'A native save must not accidentally reopen a completed set')
  for(const [field,value] of Object.entries(values)) {
    const input=row.locator(`.${field}-input`)
    const box=await input.boundingBox()
    assert.ok(box&&box.width>=32&&box.height>=40,`${field} must have usable visible input dimensions: ${JSON.stringify(box)}`)
    await input.fill(String(value))
  }
  await row.locator('.set-check[data-action="toggle-set"]').click()
  await page.waitForFunction(id=>document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'),id)
  const saved=(await domain()).workoutSets.find(s=>s.id===id)
  assert.equal(saved?.completed,true,'Native set click must persist completion')
  return saved
}
async function advance(panel, previousId) {
  const rest=panel.locator('[data-lmf-rest-continue]')
  if(await rest.isVisible().catch(()=>false))await rest.click()
  await page.waitForFunction(id=>{
    const panel=document.querySelector('.swipe-page.active-page')
    return Boolean(panel?.querySelector('[data-lmf-rest-continue]')) || panel?.querySelector('.lmf-sequence-active .lmf-set-active')?.getAttribute('data-set-id')!==id
  },previousId)
  if(await rest.isVisible().catch(()=>false))await rest.click()
}
const snapshots=data=>data.workoutExercises.map(e=>({id:e.id,snapshot:e.prescription_snapshot})).sort((a,b)=>a.id.localeCompare(b.id))
async function loadAndCircuit() {
  await boot(1)
  const baseline=await domain(), prescribed=snapshots(baseline)
  const panel=await section('Main Strength Circuit')
  const expected=await panel.locator('.exercise-stack > .active-exercise .exercise-title h3').allTextContents()
  assert.ok(expected.length>=2)
  const seen=[]; let changed, same
  for(const title of expected) {
    const item=await active(panel);assert.equal(item.title,title);seen.push(item.title)
    const exerciseId=await item.card.getAttribute('data-exercise-id')
    const sets=baseline.workoutSets.filter(s=>s.workout_exercise_id===exerciseId).sort((a,b)=>a.set_number-b.set_number)
    const values={}
    if(title==='Front Squat') {assert.notEqual(sets[0].load_value,sets[1].load_value);values.load=115;changed=sets[1]}
    if(title==='Chest-Supported Row') {assert.equal(sets[0].load_value,sets[1].load_value);values.load=45;same=sets[1]}
    await save(item.row,values)
    await advance(panel,item.id)
  }
  assert.deepEqual(seen,expected);assert.ok(changed&&same)
  pass('Main circuit advances exercise by exercise through the first round',seen)
  let next=await active(panel)
  assert.equal(next.title,expected[0]);assert.equal(next.id,changed.id)
  assert.equal(Number(await next.row.locator('.load-input').inputValue()),changed.load_value)
  pass('An intentional next-set prescription change overrides prior athlete load',{priorActual:115,nextPrescribed:changed.load_value})
  for(let i=0;next.id!==same.id&&i<expected.length;i++) {await save(next.row);await advance(panel,next.id);next=await active(panel)}
  assert.equal(next.id,same.id)
  assert.equal(Number(await next.row.locator('.load-input').inputValue()),45)
  await next.row.scrollIntoViewIfNeeded()
  await page.screenshot({path:path.join(out,'mobile-load-controls.png')})
  const saved=await save(next.row,{reps:10,rpe:7})
  assert.equal(saved.load_value,45)
  pass('Same-prescription load carries to the next round and persists through native save',45)
  await page.reload();await page.waitForFunction(applicationBootState)
  const reloaded=await domain()
  assert.deepEqual(reloaded.workoutSets.find(s=>s.id===same.id),saved)
  assert.deepEqual(snapshots(reloaded),prescribed)
  assert.equal(reloaded.workoutSessions.length,1)
  assert.equal(reloaded.workoutSets.length,baseline.workoutSets.length)
  pass('Reload preserves actual load, reps and RPE without rewriting prescriptions or duplicating records')
  await context.close()
}
async function roundsAndMetrics() {
  await boot(3)
  const baseline=await domain(), prescribed=snapshots(baseline)
  const heading=await page.locator('.workout-panel[data-group-type="round"]').first().locator('h2').textContent()
  const panel=await section(heading.trim())
  const expected=await panel.locator('.exercise-stack > .active-exercise .exercise-title h3').allTextContents()
  assert.ok(expected.length>=2)
  let perSide=false
  for(const title of expected) {
    const item=await active(panel);assert.equal(item.title,title)
    const target=item.row.locator('.lmf-prescription-cell strong')
    const sideTarget=/1\s*\/\s*side/i.test(await target.textContent())
    if(sideTarget) {assert.equal(await target.isVisible(),true);perSide=true}
    const saved=await save(item.row,sideTarget?{reps:1}:{})
    if(sideTarget)assert.equal(saved.reps,1)
    await advance(panel,item.id)
  }
  const second=await active(panel)
  assert.equal(second.title,expected[0]);assert.equal((await domain()).workoutSets.find(s=>s.id===second.id).set_number,2)
  assert.equal(perSide,true)
  pass('Recovery rounds traverse every exercise before round two; side-based targets remain visible',expected)
  const savedMetrics=[];let textOnly=0
  for(const fixture of [{name:'Backward Sled Drag',kind:'distance',unit:'m',value:20,load:25},{name:'Walk or Bike',kind:'duration',unit:'min',value:25}]) {
    const card=page.locator('.exercise-stack > .active-exercise').filter({has:page.locator('.exercise-title h3').filter({hasText:new RegExp(`^${fixture.name}$`)})}).first()
    const cardHeading=await card.locator('xpath=ancestor::*[contains(@class,"workout-panel")][1]').locator('h2').textContent()
    await section(cardHeading.trim())
    const summary=card.locator(':scope > .lmf-compact-summary')
    if(await summary.isVisible().catch(()=>false))await summary.click()
    const row=card.locator('.set-row.lmf-set-active')
    await row.waitFor({state:'visible'})
    assert.equal(await row.getAttribute('data-prescription-kind'),fixture.kind)
    assert.equal(await row.getAttribute('data-metric-unit'),fixture.unit)
    const values={metric:fixture.value};if(fixture.load!=null)values.load=fixture.load
    if(fixture.load==null)assert.equal(await row.locator('.load-input').isVisible(),false)
    const saved=await save(row,values),perf=saved.performance_data
    assert.equal(perf.actualMetricKind,fixture.kind);assert.equal(perf.actualMetricUnit,fixture.unit);assert.equal(perf.actualMetricValue,fixture.value)
    assert.equal(saved.load_value,fixture.load??null)
    if(!perf.distance&&!perf.duration&&typeof perf.programmedReps==='string')textOnly++
    savedMetrics.push(saved)
    pass(`${fixture.name}: visible metric input saves actual ${fixture.unit}`,{value:fixture.value,load:saved.load_value,target:perf.programmedReps})
  }
  assert.ok(textOnly>0,'Must exercise a real text-only metric prescription')
  await page.reload();await page.waitForFunction(applicationBootState)
  const reloaded=await domain()
  for(const saved of savedMetrics)assert.deepEqual(reloaded.workoutSets.find(s=>s.id===saved.id),saved)
  assert.deepEqual(snapshots(reloaded),prescribed)
  assert.equal(reloaded.workoutSets.length,baseline.workoutSets.length)
  pass('Text-only metric targets remain distinct from saved actuals through reload',{textOnly})
  await context.close()
}
try {
  await loadAndCircuit()
  await roundsAndMetrics()
  assert.equal(report.failures.length,0)
  report.result='PASS'
} catch(error) {
  report.result='FAIL';report.failures.push({message:error.message,stack:error.stack});console.error(error)
  if(page&&!page.isClosed()) {
    report.observations.failure=await page.locator('body').innerText().catch(()=>null)
    report.observations.saved=await domain().catch(()=>null)
    report.observations.inputs=await page.locator('.swipe-page.active-page .lmf-sequence-active .lmf-set-active input').evaluateAll(inputs=>inputs.map(input=>({class:input.className,parents:[input,...(function*(n){while(n.parentElement){n=n.parentElement;yield n}})(input)].map(n=>({class:n.className,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))}))).catch(()=>null)
    await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})
  }
} finally {await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')}
if(report.result!=='PASS')process.exitCode=1
