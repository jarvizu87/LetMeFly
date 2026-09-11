#!/usr/bin/env node
// Disposable local browser only. Recovery proof opens the unmodified production entrypoint.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {applicationBootState} from './browser-boot-contract.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const app=path.resolve(process.argv[2]||path.join(root,'.build-src/letmefly_app'))
const baseline=process.argv.includes('--baseline')
const require=createRequire(path.join(app,'package.json'))
const {chromium}=require('playwright-core')
const {build}=await import(pathToFileURL(require.resolve('vite')).href)
const out=path.join(app,'COMPLETION_RECOVERY_AUDIT');fs.mkdirSync(out,{recursive:true})
const report={result:'RUNNING',applicationSha:process.env.APPLICATION_SHA||process.env.GITHUB_SHA||'local',baseline,passes:[],failures:[],observations:{},externalRequestsBlocked:0}
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')
const tree=dir=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).sort().map(f=>[f,hash(fs.readFileSync(path.join(dir,f)))]))
const sourceBefore=tree(path.join(app,'src')),distBefore=tree(path.join(app,'dist'))
const qa=path.join(app,'.qa-completion');fs.mkdirSync(qa,{recursive:true})
const entry=path.join(app,'.qa-completion-entry.ts')
fs.writeFileSync(entry,`import * as athlete from './src/services/athlete-service';import * as workout from './src/services/workout-service';import * as progression from './src/services/program-progression-service';import * as db from './src/db/local-db';import * as mutations from './src/db/local-mutations';import * as programs from './src/data/programs';\nif(location.hostname!=='127.0.0.1'||!location.search.includes('disposable-qa=1'))throw Error('QA only');(window as any).__RECOVERY_QA__={athlete,workout,progression,db,mutations,programs};`)
await build({configFile:false,root:app,logLevel:'warn',build:{outDir:qa,emptyOutDir:true,minify:false,lib:{entry,formats:['es'],fileName:()=> 'services.js'}}})
fs.writeFileSync(path.join(qa,'index.html'),'<!doctype html><title>Disposable completion preparation</title><script type="module" src="services.js"></script>')
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'), isQa=url.pathname.startsWith('/__qa/')
 const base=isQa?qa:path.join(app,'dist'),relative=isQa?url.pathname.slice(6):url.pathname.slice(1)
 let file=path.resolve(base,decodeURIComponent(relative||'index.html'))
 if(!file.startsWith(base+path.sep)){res.writeHead(403);return res.end()}
 if(!fs.existsSync(file)){res.writeHead(404);return res.end()}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html')
 res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'})
 fs.createReadStream(file).pipe(res)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin=`http://127.0.0.1:${server.address().port}`
const eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+': '+JSON.stringify({expected:b,actual:a}).slice(0,500))}
const assert=(v,l)=>{if(!v)throw Error(l)}
let context,page,profile
async function launch(){
 context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true,viewport:{width:412,height:915},serviceWorkers:'block'})
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();report.externalRequestsBlocked++;return r.abort('blockedbyclient')})
 page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(12000)
}
async function read(p=page){return p.evaluate(async()=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
 try{const names=['athletes','programInstances','programEvents','workoutSessions','workoutExercises','workoutSets','syncOutbox'],tx=db.transaction(names,'readonly')
 const rows=await Promise.all(names.map(n=>new Promise((resolve,reject)=>{const r=tx.objectStore(n).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})))
 return Object.fromEntries(names.map((n,i)=>[n,rows[i]]))}finally{db.close()}
})}
function position(data){const active=data.programInstances.filter(i=>i.status==='active'&&!i.deleted_at);return active.map(i=>[i.program_key,i.current_week,i.current_day_key,i.current_phase_key])}
function assertOutbox(data){for(const name of ['programInstances','programEvents','workoutSessions','workoutExercises','workoutSets'])for(const row of data[name]){
 const op=data.syncOutbox.find(x=>x.entityType===name&&x.entityId===row.id&&x.localVersion===row._local.localVersion)
 assert(op,'Missing outbox partner '+name);const {_local,...stripped}=row;eq(op.payload,stripped,'Outbox payload '+name)
}}
async function prepare(stage='normal'){
 await page.goto(origin+'/__qa/index.html?disposable-qa=1');await page.waitForFunction(()=>Boolean(window.__RECOVERY_QA__))
 return page.evaluate(async stage=>{
  const Q=window.__RECOVERY_QA__,a=await Q.athlete.createLocalAthlete({displayName:'Disposable Recovery QA',weightUnit:'lb'})
  const defs={'crownforge':Q.programs.CROWNFORGE,'crown-maintenance':Q.programs.CROWN_MAINTENANCE,'black-crown':Q.programs.BLACK_CROWN}
  async function last(program){const w=defs[program].weekData.at(-1),d=w.days.at(-1);await Q.progression.setIntentionalProgramPosition(a.id,program,w.week,d.day,'disposable-boundary-fixture');return {w,d}}
  if(['maintenance-end','black-crown-end'].includes(stage)){
   const {w,d}=await last('crownforge');await Q.progression.advanceProgramAfterWorkout(a.id,'crownforge',w.week,d.day)
  }
  if(stage==='black-crown-end'){
   const {w,d}=await last('crown-maintenance');await Q.progression.advanceProgramAfterWorkout(a.id,'crown-maintenance',w.week,d.day)
   const lifts=Object.fromEntries(['front-squat','back-squat','bench-press','deadlift'].map(k=>[k,{verified1RmLb:200,readiness:'green'}]))
   await Q.progression.activateBlackCrownFromEntry(a.id,{lifts,optionalOHP:{verified1RmLb:100,readiness:'green'}})
  }
  const program=stage==='maintenance-end'?'crown-maintenance':stage==='black-crown-end'?'black-crown':'crownforge'
  if(stage.endsWith('-end'))await last(program)
  const i=await Q.athlete.getCurrentProgramInstance(a.id),week=Number(i.current_week),day=Number(String(i.current_day_key).replace('day-',''))
  const definition=defs[program].weekData.find(w=>w.week===week).days.find(d=>d.day===day)
  const bundle=await Q.workout.startWorkout(a.id,i.id,program,week,definition,null)
  // Actual committed performance; skipped sets remain skipped, never fabricated by recovery.
  const first=bundle.exercises.flatMap(e=>e.sets)[0]
  if(first)await Q.workout.logSet(a.id,first.id,{reps:5,rpe:7,notes:'Disposable recovery performance'})
  window.__RECOVERY_FIXTURE__={athleteId:a.id,sessionId:bundle.session.id,instanceId:i.id,program,week,day}
  return window.__RECOVERY_FIXTURE__
 },stage)
}
async function complete(){await page.evaluate(async()=>{const f=window.__RECOVERY_FIXTURE__;await window.__RECOVERY_QA__.workout.completeWorkout(f.athleteId,f.sessionId)})}
async function boot(tabs=1){
 await context.close();await launch()
 const pages=[page];for(let n=1;n<tabs;n++)pages.push(await context.newPage())
 await Promise.all(pages.map(p=>p.goto(origin+'/#/train')))
 await Promise.all(pages.map(p=>p.waitForFunction(applicationBootState,null,{timeout:20000})))
 // This is only a readiness wait; it never calls recovery or advancement.
 await page.waitForTimeout(300)
 return read()
}
async function retryBootStable(label){const before=await read();await page.reload();await page.waitForFunction(applicationBootState);eq(await read(),before,label+' duplicate boot must not write again')}
async function test(label,fn){
 profile=fs.mkdtempSync(path.join(os.tmpdir(),'lmf-recovery-'))
 try{await launch();await fn();report.passes.push(label);console.log('PASS '+label)}
 catch(e){report.failures.push({label,message:e.message});console.error('FAIL '+label+' '+e.message);await page?.screenshot({path:path.join(out,label.replace(/[^a-z0-9]+/gi,'-')+'.png'),fullPage:true}).catch(()=>{})}
 finally{await context?.close().catch(()=>{});fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')}
}
try{
 await test('Normal app boot finishes interrupted completion exactly once',async()=>{
  const f=await prepare();await complete();const before=await read();const after=await boot()
  if(baseline){eq(position(after),position(before),'Baseline unexpectedly recovered');report.observations.baselineMissingRecovery=true;return}
  eq(position(after).map(x=>x.slice(0,3)),[['crownforge',1,'day-2']],'Recovered next position')
  eq(after.programEvents.filter(e=>e.event_type==='program-position-advanced').length,1,'One advancement')
  eq(after.workoutSessions,before.workoutSessions,'Completion timestamp/history unchanged');eq(after.workoutSets,before.workoutSets,'Saved sets unchanged')
  assert(!after.programInstances[0].progression_state.pendingWorkoutCompletion,'Pending intent consumed')
  assertOutbox(after);await retryBootStable('Recovered workout');report.observations.normal={sessionId:f.sessionId,position:position(after)}
 })
 if(!baseline){
  for(const [stage,expected,event]of [
   ['crownforge-end',['crown-maintenance',1,'day-1'],'crownforge-complete-maintenance-start'],
   ['maintenance-end',['crown-maintenance',3,'day-5'],'black-crown-entry-gate-opened'],
   ['black-crown-end',null,'black-crown-program-complete']]){
   await test(stage+' recovers only its governed transition',async()=>{
    await prepare(stage);await complete();const before=await read(),after=await boot()
    eq(position(after).map(x=>x.slice(0,3)),expected?[expected]:[],'Governed boundary position')
    eq(after.programEvents.filter(e=>e.event_type===event).length,before.programEvents.filter(e=>e.event_type===event).length+1,'Single boundary event')
    eq(after.workoutSessions,before.workoutSessions,'Boundary workout history unchanged');eq(after.workoutSets,before.workoutSets,'Boundary sets unchanged')
    assert(after.programInstances.every(i=>!i.progression_state.pendingWorkoutCompletion),'Boundary intent consumed')
    if(stage==='maintenance-end')assert(after.programInstances.some(i=>i.current_phase_key==='black-crown-entry'),'Explicit entry gate preserved')
    assertOutbox(after);await retryBootStable(stage)
   })
  }
  await test('Four simultaneous app boots consume one intent',async()=>{await prepare();await complete();const after=await boot(4);eq(after.programEvents.filter(e=>e.event_type==='program-position-advanced').length,1,'Cross-tab event count');eq(position(after)[0].slice(0,3),['crownforge',1,'day-2'],'Cross-tab position');assertOutbox(after)})
  await test('Unfinished workout stays on its current day',async()=>{await prepare();const before=await read();const after=await boot();eq(after,before,'Unfinished workout must not advance')})
  await test('Intentional reposition cancels recovery without rewriting performance',async()=>{
   await prepare();await complete();await page.evaluate(async()=>{const f=window.__RECOVERY_FIXTURE__;await window.__RECOVERY_QA__.progression.setIntentionalProgramPosition(f.athleteId,'crownforge',1,4,'athlete-intentional-reposition')})
   const before=await read();eq(await boot(),before,'Cancelled completion intent must not advance')
  })
  await test('Legacy completed history without intent is not replayed',async()=>{
   await prepare();await complete();await page.evaluate(async()=>{const Q=window.__RECOVERY_QA__,f=window.__RECOVERY_FIXTURE__,i=await Q.db.getById('programInstances',f.instanceId);const state={...i.progression_state};delete state.pendingWorkoutCompletion;const d=await Q.db.getOrCreateDeviceState('qa');await Q.mutations.putEntityWithOutbox('programInstances',{...i,progression_state:state},{athleteId:f.athleteId,deviceId:d.deviceId})})
   const before=await read();eq(await boot(),before,'Unjournaled history is not automatic authorization')
  })
  await test('Malformed completion marker fails closed without deleting saved work',async()=>{
   await prepare();await complete();await page.evaluate(async()=>{const Q=window.__RECOVERY_QA__,f=window.__RECOVERY_FIXTURE__,i=await Q.db.getById('programInstances',f.instanceId);i.progression_state.pendingWorkoutCompletion.sessionId='missing-disposable-session';i.progression_state.pendingWorkoutCompletion.positionVersion=i._local.localVersion+1;const d=await Q.db.getOrCreateDeviceState('qa');await Q.mutations.putEntityWithOutbox('programInstances',i,{athleteId:f.athleteId,deviceId:d.deviceId})})
   const before=await read();eq(await boot(),before,'Invalid marker may not advance or change records')
  })
  for(let write=1;write<=4;write++)await test('Completion transaction rollback at write '+write,async()=>{
   await prepare();const before=await read()
   const proof=await page.evaluate(async write=>{
    const Q=window.__RECOVERY_QA__,f=window.__RECOVERY_FIXTURE__,p=IDBObjectStore.prototype,put=p.put,add=p.add;let seen=0,aborted=false
    function hook(original){return function(...args){if(['programInstances','workoutSessions','syncOutbox'].includes(this.name)&&this.transaction.objectStoreNames.contains('programInstances')&&this.transaction.objectStoreNames.contains('workoutSessions')){seen++;if(seen===write){aborted=true;this.transaction.abort();throw new DOMException('Disposable fault','AbortError')}}return original.apply(this,args)}}
    p.put=hook(put);p.add=hook(add);let rejected=false
    try{await Q.workout.completeWorkout(f.athleteId,f.sessionId)}catch(_){rejected=true}finally{p.put=put;p.add=add}
    return {seen,aborted,rejected}
   },write)
   assert(proof.aborted&&proof.rejected,'Completion fault was not exercised');eq(await read(),before,'Failed completion writes all roll back')
   await complete();const after=await boot();eq(position(after)[0].slice(0,3),['crownforge',1,'day-2'],'Retry and reboot recover once');assertOutbox(after)
  })
  await test('Interrupted advancement keeps intent for automatic retry',async()=>{
   await prepare();await complete();const before=await read()
   const proof=await page.evaluate(async()=>{
    const Q=window.__RECOVERY_QA__,f=window.__RECOVERY_FIXTURE__,p=IDBObjectStore.prototype,put=p.put;let hit=false,rejected=false
    p.put=function(...args){if(this.name==='programEvents'){hit=true;this.transaction.abort();throw new DOMException('Disposable fault','AbortError')}return put.apply(this,args)}
    try{await Q.progression.advanceProgramAfterWorkout(f.athleteId,f.program,f.week,f.day)}catch(_){rejected=true}finally{p.put=put}
    return {hit,rejected}
   })
   assert(proof.hit&&proof.rejected,'Advancement fault not exercised');eq(await read(),before,'Advance abort preserves intent and outbox')
   const after=await boot();eq(position(after)[0].slice(0,3),['crownforge',1,'day-2'],'Boot retries aborted advance');assertOutbox(after)
  })
  await test('Repeated completion does not create another intent',async()=>{await prepare();await complete();const before=await read();await complete();eq(await read(),before,'Completed session retry is idempotent');await boot();await retryBootStable('Repeated completion')})
 }
 eq(tree(path.join(app,'src')),sourceBefore,'Production source changed during test');eq(tree(path.join(app,'dist')),distBefore,'Production dist changed during test')
 report.observations.sourceHashes=sourceBefore;report.observations.distHashes=distBefore
 report.result=report.failures.length?'FAIL':baseline?'BASELINE_REPRODUCED':'PASS'
}finally{await new Promise(r=>server.close(r));fs.rmSync(entry,{force:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')}
if(report.result==='FAIL')process.exitCode=1
