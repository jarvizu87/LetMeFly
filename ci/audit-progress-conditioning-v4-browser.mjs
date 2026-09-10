#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'PROGRESS_CONDITIONING_V4_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result:'PASS', passes:[], failures:[], observations:{} }
const pass = (label,detail='') => { report.passes.push({label,detail}); console.log(`PASS  ${label}${detail?` — ${detail}`:''}`) }
const fail = (label,detail='') => { report.result='FAIL'; report.failures.push({label,detail}); console.log(`FAIL  ${label}${detail?` — ${detail}`:''}`) }

async function firstVisible(locator) {
  const count=await locator.count()
  for(let i=0;i<count;i+=1){const item=locator.nth(i);if(await item.isVisible().catch(()=>false))return item}
  return null
}
async function dismissInstall(page) {
  const button=await firstVisible(page.locator('button,a,[role="button"]').filter({hasText:/^\s*Not now\s*$/i}))
  if(button)await button.click({timeout:1500}).catch(()=>null)
}
async function bootstrap(page) {
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:20000})
  await page.waitForSelector('body',{timeout:10000})
  for(let i=0;i<12;i+=1){await dismissInstall(page);const create=await firstVisible(page.locator('button,a,[role="button"]').filter({hasText:/CREATE LOCAL ATHLETE/i}));if(create){const modal=create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]');const input=await firstVisible(modal.locator('input[type="text"],input:not([type])'))||await firstVisible(page.locator('input[type="text"],input:not([type])'));if(!input)throw new Error('Athlete display-name input missing');await input.fill('Conditioning QA Athlete');await create.click({timeout:4000});await page.waitForTimeout(500);break}await page.waitForTimeout(160)}
  for(let i=0;i<5;i+=1){await dismissInstall(page);await page.waitForTimeout(100)}
}
async function seedConditioning(page) {
  return page.evaluate(async () => {
    const open=()=>new Promise((resolve,reject)=>{const req=indexedDB.open('letmefly-private');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})
    const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})
    const db=await open()
    const athletes=await request(db.transaction('athletes','readonly').objectStore('athletes').getAll())
    const athlete=athletes[0];if(!athlete)throw new Error('No local athlete available')
    const now=new Date().toISOString(), sessionId='qa-conditioning-session-v4', exerciseId='qa-conditioning-exercise-v4'
    const put=async(storeName,value)=>{const tx=db.transaction(storeName,'readwrite');const req=tx.objectStore(storeName).put(value);await request(req);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
    await put('workoutSessions',{id:sessionId,athlete_id:athlete.id,status:'completed',workout_name:'Conditioning QA',started_at:now,completed_at:now,created_at:now,updated_at:now})
    await put('workoutExercises',{id:exerciseId,athlete_id:athlete.id,workout_session_id:sessionId,exercise_key:'farmer-carry',exercise_name_snapshot:'Farmer Carry',prescription_snapshot:{category:'conditioning',distance:50,distance_unit:'yd'},created_at:now,updated_at:now})
    await put('workoutSets',{id:'qa-conditioning-set-v4-1',athlete_id:athlete.id,workout_session_id:sessionId,workout_exercise_id:exerciseId,set_number:1,completed:true,load_value:80,load_unit:'lb',reps:2,rpe:7,performance_data:{distance:40,distance_unit:'yd',duration_seconds:30,rounds:2},completed_at:now,created_at:now,updated_at:now})
    await put('workoutSets',{id:'qa-conditioning-set-v4-2',athlete_id:athlete.id,workout_session_id:sessionId,workout_exercise_id:exerciseId,set_number:2,completed:true,load_value:90,load_unit:'lb',reps:2,rpe:8,performance_data:{distance:40,distance_unit:'yd',duration_seconds:35,rounds:2},completed_at:now,created_at:now,updated_at:now})
    if(db.objectStoreNames.contains('personalRecords'))await put('personalRecords',{id:'qa-conditioning-pr-v4',athlete_id:athlete.id,exercise_key:'farmer-carry',pr_type:'carry_distance',performance:{distance:60,distance_unit:'yd'},achieved_at:now,created_at:now,updated_at:now})
    db.close();return {athleteId:athlete.id,sessionId,exerciseId}
  })
}

const browser=await chromium.launch({headless:true,executablePath:chromeBin,args:['--no-sandbox','--disable-dev-shm-usage']})
const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true})
const page=await context.newPage()
try{
  await bootstrap(page)
  report.observations.seed=await seedConditioning(page)
  await page.evaluate(()=>{localStorage.setItem('letmefly_progress_dashboard_range_v1','30d');location.hash='#/progress'})
  await page.waitForSelector('#lmf-progress-dashboard-v1',{timeout:12000})
  const tab=page.locator('[data-pg-tab="conditioning"]').first();await tab.waitFor({state:'visible',timeout:8000});await tab.focus();await tab.click();
  await page.waitForSelector('[data-conditioning-v4="4"]',{timeout:10000})
  await page.waitForTimeout(350)

  const snapshot=await page.evaluate(()=>{
    const body=document.querySelector('[data-pg-panel="conditioning"]')
    const metrics={};body?.querySelectorAll('.lmf-pg-conditioning-v4-metrics article').forEach(card=>{metrics[(card.querySelector('span')?.textContent||'').trim()]=(card.querySelector('strong')?.textContent||'').trim()})
    return {metrics,text:body?.innerText||'',api:window.__LMF_PROGRESS_CONDITIONING__||null,panel:body?.getAttribute('data-pg-panel')||'',tabSelected:document.querySelector('[data-pg-tab="conditioning"]')?.getAttribute('aria-selected')||''}
  })
  report.observations.snapshot=snapshot
  if(snapshot.api?.version===4)pass('Conditioning analytics runtime','version 4')
  else fail('Conditioning analytics runtime',JSON.stringify(snapshot.api))
  if(snapshot.panel==='conditioning'&&snapshot.tabSelected==='true')pass('Conditioning panel selection')
  else fail('Conditioning panel selection',`${snapshot.panel}/${snapshot.tabSelected}`)
  if(snapshot.metrics['CONDITIONING SESSIONS']==='1')pass('Unique conditioning session metric','1')
  else fail('Unique conditioning session metric',JSON.stringify(snapshot.metrics))
  if(snapshot.metrics['COMPLETED SETS']==='2')pass('Completed set metric','2')
  else fail('Completed set metric',JSON.stringify(snapshot.metrics))
  if(/top 90 lb/i.test(snapshot.text)&&/avg RPE 7\.5/i.test(snapshot.text))pass('Authoritative workload metrics','top 90 lb · avg RPE 7.5')
  else fail('Authoritative workload metrics',snapshot.text.slice(0,1200))
  if(/80 yd/i.test(snapshot.text)&&/1m 5s/i.test(snapshot.text)&&/4 rounds/i.test(snapshot.text))pass('Measured achieved performance','80 yd · 1m 5s · 4 rounds')
  else fail('Measured achieved performance',snapshot.text.slice(0,1200))
  if(/Program target:\s*50 yd/i.test(snapshot.text)&&/80 yd/i.test(snapshot.text))pass('Prescription separated from achieved result','target 50 yd vs achieved 80 yd')
  else fail('Prescription separated from achieved result',snapshot.text.slice(0,1200))
  if(/Conditioning PR Evidence/i.test(snapshot.text)&&/60 yd/i.test(snapshot.text))pass('Stored conditioning PR evidence','60 yd')
  else fail('Stored conditioning PR evidence',snapshot.text.slice(0,1400))
  if(/NEXT MEASURABLE MILESTONE/i.test(snapshot.text)&&/Workload vs\. Performance/i.test(snapshot.text))pass('Coach context and milestone guardrails')
  else fail('Coach context and milestone guardrails',snapshot.text.slice(0,1400))
} catch(error){fail('Conditioning browser audit execution',error instanceof Error?error.message:String(error))}
finally{
  await page.screenshot({path:path.join(outDir,'final.png'),fullPage:true}).catch(()=>null)
  await browser.close()
}
fs.writeFileSync(path.join(outDir,'report.json'),`${JSON.stringify(report,null,2)}\n`)
if(report.failures.length){console.error(`LetMeFly Progress Conditioning v4 browser audit: FAIL (${report.failures.length})`);process.exit(1)}
console.log(`LetMeFly Progress Conditioning v4 browser audit: PASS (${report.passes.length})`)
