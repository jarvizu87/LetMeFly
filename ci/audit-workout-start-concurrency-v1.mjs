#!/usr/bin/env node
/** Issue #60: real Chromium IndexedDB, original reconstructed services, no mocked writes. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const require = createRequire(path.join(target, 'package.json'))
const { chromium } = require('playwright-core')
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
const out = path.join(target, 'WORKOUT_START_CONCURRENCY_AUDIT')
fs.mkdirSync(out, { recursive: true })
const report = { result: 'RUNNING', sourceCommit: process.env.GITHUB_SHA || null, cases: [], failures: [], blockedRequests: 0,
  scope: 'Actual reconstructed workout services and Chromium IndexedDB. Four same-origin tabs are separate JS contexts. No production data, cloud requests, or public QA bridge.' }
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const sha = data => crypto.createHash('sha256').update(data).digest('hex')
function hashes(dir) {
  const rows = []
  function visit(p) { for (const item of fs.readdirSync(p, {withFileTypes:true})) { const full=path.join(p,item.name);if(item.isDirectory())visit(full);else rows.push([path.relative(dir,full),sha(fs.readFileSync(full))]) } }
  visit(dir); return JSON.stringify(rows.sort(([a],[b])=>a.localeCompare(b)))
}
const sourceBefore = hashes(path.join(target,'src'))
const distBefore = hashes(path.join(target,'dist'))
const entry = path.join(target,'.qa-start-entry.ts')
const runtime = path.join(target,'.qa-start-runtime')
let server, context
const profiles = []

async function load(page, origin) {
  await page.goto(origin + '/?disposable-qa=1')
  await page.waitForFunction(() => Boolean(window.__LMF_START_QA__),null,{timeout:15000})
}
async function start(page, count, fixture) {
  return page.evaluate(async ({count,fixture}) => {
    const Q=window.__LMF_START_QA__
    const day=Q.programs.getProgramDay('crownforge',1,1)
    return await Promise.all(Array.from({length:count},()=>Q.workout.startWorkout(fixture.athleteId,fixture.instanceId,'crownforge',1,day,fixture.readinessId).then(b=>b.session.id)))
  },{count,fixture})
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const Q=window.__LMF_START_QA__, names=[...Q.db.DOMAIN_STORES,'syncOutbox']
    const db=await Q.db.openLetMeFlyDb()
    try {
      const tx=db.transaction(names,'readonly')
      const values=await Promise.all(names.map(name=>Q.db.requestToPromise(tx.objectStore(name).getAll())))
      const data=Object.fromEntries(names.map((name,i)=>[name,values[i]]))
      const partner=new Map(data.syncOutbox.map(op=>[`${op.entityType}:${op.entityId}:${op.localVersion}`,op]))
      let outboxVerified=0
      for(const name of Q.db.DOMAIN_STORES) for(const row of data[name]) if(row._local?.dirty) {
        const op=partner.get(`${name}:${row.id}:${row._local.localVersion}`)
        if(!op || JSON.stringify(op.payload)!==JSON.stringify(Q.mutations.stripLocalMetadata(row)))throw new Error('Outbox partner mismatch: '+name+'/'+row.id)
        outboxVerified++
      }
      const bytes=new TextEncoder().encode(JSON.stringify(data))
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')
      return {hash:digest,counts:Object.fromEntries(names.map(name=>[name,data[name].length])),outboxVerified,
        sessionIds:data.workoutSessions.map(s=>s.id),exerciseSessionIds:[...new Set(data.workoutExercises.map(e=>e.workout_session_id))],
        setSessionIds:[...new Set(data.workoutSets.map(s=>s.workout_session_id))],completedSets:data.workoutSets.filter(s=>s.completed).length}
    } finally {db.close()}
  })
}

try {
  fs.writeFileSync(entry, `import * as athlete from './src/services/athlete-service'\nimport * as workout from './src/services/workout-service'\nimport * as readiness from './src/services/readiness-service'\nimport * as db from './src/db/local-db'\nimport * as mutations from './src/db/local-mutations'\nimport * as programs from './src/data/programs'\nif(location.hostname!=='127.0.0.1'||!location.search.includes('disposable-qa=1'))throw new Error('Disposable loopback QA required')\n;(window as any).__LMF_START_QA__=Object.freeze({athlete,workout,readiness,db,mutations,programs})\n`)
  await build({root:target,configFile:false,build:{outDir:runtime,emptyOutDir:true,minify:false,
    lib:{entry,name:'StartQA',formats:['es'],fileName:()=> 'services.js'}}})
  fs.writeFileSync(path.join(runtime,'index.html'),'<!doctype html><title>Disposable workout-start QA</title><script type="module" src="/services.js"></script>')
  server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname
    const file=pathname==='/'?'index.html':pathname==='/services.js'?'services.js':null
    if(!file){res.writeHead(404);res.end();return}
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript':'text/html','Cache-Control':'no-store'})
    res.end(fs.readFileSync(path.join(runtime,file)))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${server.address().port}`
  for(const test of [{name:'two-overlapping-starts',tabs:1,calls:2},{name:'eight-rapid-starts',tabs:1,calls:8},{name:'four-tabs-sixteen-starts',tabs:4,calls:4}]) {
    const profile=fs.mkdtempSync(path.join(os.tmpdir(),'lmf60-qa-'));profiles.push(profile)
    const launch=async()=>{
      const c=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_BIN,headless:true,serviceWorkers:'block',args:['--no-sandbox','--disable-dev-shm-usage']})
      await c.route('**/*',route=>{
        if(new URL(route.request().url()).origin===origin)return route.continue()
        report.blockedRequests++;return route.abort('blockedbyclient')
      });return c
    }
    context=await launch()
    const pages=[context.pages()[0] || await context.newPage()]
    await load(pages[0],origin)
    const fixture=await pages[0].evaluate(async name=>{
      const Q=window.__LMF_START_QA__
      if((await Q.db.getAll('athletes')).length)throw new Error('Database must be empty')
      const athlete=await Q.athlete.createLocalAthlete({displayName:'Disposable LMF60 '+name,weightUnit:'lb'})
      const instance=await Q.athlete.getCurrentProgramInstance(athlete.id)
      const ready=await Q.readiness.saveReadiness(athlete.id,{sleepQuality:4,soreness:2,stress:2,energy:4})
      const day=Q.programs.getProgramDay('crownforge',1,1)
      return {athleteId:athlete.id,instanceId:instance.id,readinessId:ready.id,
        expectedExercises:day.sections.reduce((n,s)=>n+s.exercises.length,0),expectedSets:day.sections.reduce((n,s)=>n+s.exercises.reduce((m,e)=>m+e.sets.length,0),0)}
    },test.name)
    while(pages.length<test.tabs){const p=await context.newPage();await load(p,origin);pages.push(p)}
    const returned=(await Promise.all(pages.map(p=>start(p,test.calls,fixture)))).flat()
    assert(new Set(returned).size===1,test.name+': callers received different sessions')
    const saved=await snapshot(pages[0])
    assert(saved.counts.workoutSessions===1,test.name+': duplicate persisted sessions')
    assert(saved.counts.workoutExercises===fixture.expectedExercises,test.name+': duplicate/missing exercises')
    assert(saved.counts.workoutSets===fixture.expectedSets,test.name+': duplicate/missing sets')
    assert(JSON.stringify(saved.exerciseSessionIds)===JSON.stringify(saved.sessionIds) && JSON.stringify(saved.setSessionIds)===JSON.stringify(saved.sessionIds),'Orphan workout records')
    await start(pages[0],1,fixture)
    assert((await snapshot(pages[0])).hash===saved.hash,'Retry changed stored state')
    await pages[0].evaluate(async athleteId=>{
      const Q=window.__LMF_START_QA__,sets=await Q.db.getAll('workoutSets')
      await Q.workout.logSet(athleteId,sets[0].id,{reps:8,rpe:7,rir:2})
    },fixture.athleteId)
    const logged=await snapshot(pages[0]);assert(logged.completedSets===1,'Native set save did not persist')
    await context.close();context=await launch()
    const resumed=context.pages()[0]||await context.newPage();await load(resumed,origin)
    assert((await snapshot(resumed)).hash===logged.hash,'Browser restart changed persisted records')
    const reopened=await start(resumed,1,fixture)
    assert(reopened[0]===returned[0],'Restart/resume selected a different session')
    assert((await snapshot(resumed)).hash===logged.hash,'Restart/resume created or changed records')
    report.cases.push({...test,result:'PASS',requestCount:returned.length,expectedExercises:fixture.expectedExercises,expectedSets:fixture.expectedSets,stored:saved.counts,outboxVerified:saved.outboxVerified,browserRestartPreservedState:true})
    console.log('PASS '+test.name+': '+returned.length+' requests -> one session, '+fixture.expectedSets+' sets, intact outbox and restart')
    await context.close();context=null
  }
  report.result='PASS'
} catch(error) {
  report.result='FAIL';report.failures.push({message:error.message,stack:error.stack});console.error(error)
} finally {
  if(hashes(path.join(target,'src'))!==sourceBefore || hashes(path.join(target,'dist'))!==distBefore){report.result='FAIL';report.failures.push({message:'Production src/dist mutated by QA'})}
  await context?.close().catch(()=>{})
  if(server)await new Promise(resolve=>server.close(resolve))
  for(const profile of profiles)fs.rmSync(profile,{recursive:true,force:true})
  fs.rmSync(entry,{force:true});fs.rmSync(runtime,{recursive:true,force:true})
  fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2)+'\n')
}
if(report.result!=='PASS')process.exitCode=1
