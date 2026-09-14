#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..')
const app=path.resolve(process.argv[2]||'.build-src/letmefly_app')
const contract=JSON.parse(fs.readFileSync(path.join(root,'ci/seven-athlete-release-audit.v2.json'),'utf8'))
const out=path.join(app,'SEVEN_ATHLETE_ROUTE_SWEEP_V1');fs.mkdirSync(out,{recursive:true})
const requireApp=createRequire(path.join(app,'package.json'))
const {chromium}=requireApp('playwright-core')
const {build}=await import(pathToFileURL(requireApp.resolve('vite')).href)
const chromeBin=process.env.CHROME_BIN;if(!chromeBin)throw new Error('CHROME_BIN is required')

const runtime=fs.mkdtempSync(path.join(app,'.qa-route-sweep-')),entry=path.join(runtime,'entry.ts')
const imports={athlete:'services/athlete-service',profile:'services/profile-context-service',readiness:'services/readiness-service',db:'db/local-db'}
fs.writeFileSync(entry,Object.entries(imports).map(([n,f])=>`import * as ${n} from ${JSON.stringify(path.join(app,'src',f))}`).join('\n')+`\nif(location.hostname!=='127.0.0.1')throw new Error('route sweep bridge is loopback only');(window as any).__LMF_ROUTE_QA__=Object.freeze({${Object.keys(imports).join(',')}});\n`)
await build({configFile:false,root:app,publicDir:false,logLevel:'warn',build:{outDir:path.join(runtime,'web'),emptyOutDir:true,minify:false,lib:{entry,formats:['es'],fileName:()=> 'services.js'}}})
fs.writeFileSync(path.join(runtime,'web','index.html'),'<!doctype html><script type="module" src="./services.js"></script>')
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'}
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1'),qa=u.pathname.startsWith('/__qa/'),base=qa?path.join(runtime,'web'):path.join(app,'dist'),rel=qa?u.pathname.slice(6):u.pathname.slice(1);let file=path.resolve(base,decodeURIComponent(rel||'index.html'));if(file!==base&&!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(base,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res)})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({executablePath:chromeBin,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
const viewports={qa_rook:{width:360,height:800},qa_forge:{width:412,height:915},qa_titan:{width:1440,height:1000},qa_metric:{width:412,height:915},qa_recovery:{width:390,height:844},qa_substitution:{width:412,height:915},qa_history:{width:1440,height:1000}}
const tmAliases={back_squat:'back-squat',front_squat:'front-squat',bench_press:'bench-press',deadlift:'deadlift',overhead_press:'overhead-press',power_clean:'clean'}
const routes=[
  ['home',/(today|start workout|crownforge|black crown|home)/i],
  ['train',/(readiness|start workout|workout|train)/i],
  ['program',/(program|week|crownforge|black crown)/i],
  ['progress',/(progress|strength|conditioning|prs?)/i],
  ['exercises',/(exercise|library|search)/i],
  ['coach',/(coach|training context|ask)/i],
  ['more',/(more|profile|calendar|settings)/i],
  ['profile',/(profile|athlete|strength max)/i],
  ['calendar',/(calendar|week|training)/i],
  ['settings',/(settings|app updates|bar|install)/i],
]
const report={result:'RUNNING',routes:routes.map(([r])=>r),athletes:[],defects:[]}
const write=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')

async function qa(page){await page.goto(`${origin}/__qa/index.html`,{waitUntil:'load'});await page.waitForFunction(()=>window.__LMF_ROUTE_QA__)}
async function seed(page,f){return page.evaluate(async input=>{const q=window.__LMF_ROUTE_QA__,a=await q.athlete.createLocalAthlete({displayName:input.displayName,weightUnit:input.units.weight});for(const[k,v]of Object.entries(input.trainingMaxes))await q.athlete.setTrainingMax(a.id,input.tmAliases[k]||k,v,input.units.weight);await q.profile.saveProfileContext(a.id,{primaryGoal:`QA ${input.internalId} route-sweep goal`,trainingHistory:'Synthetic route sweep athlete only',developmentPriorities:'Strength; work capacity; movement quality',equipmentAvailable:input.units.weight==='kg'?'Metric barbell and plates':'Standard barbell and plates',coachingNotes:input.internalId==='qa_substitution'?'Anterior hip pinching with deep hip flexion; knee pain with loaded/deep knee flexion.':''},{primaryGoal:'',trainingHistory:'',developmentPriorities:'',equipmentAvailable:'',coachingNotes:''});await q.readiness.saveReadiness(a.id,{sleepQuality:input.readiness.sleep_quality,soreness:input.readiness.soreness,stress:input.readiness.stress,energy:input.readiness.energy,sleepHours:input.readiness.sleep_hours,notes:'Synthetic route sweep readiness'});return a.id},{...f,tmAliases})}
async function criticalState(page,athleteId){return page.evaluate(async athleteId=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{const names=['programInstances','trainingMaxHistory'].filter(n=>db.objectStoreNames.contains(n)),tx=db.transaction(names,'readonly'),data={};await Promise.all(names.map(n=>new Promise((resolve,reject)=>{const r=tx.objectStore(n).getAll();r.onsuccess=()=>{data[n]=r.result};r.onerror=()=>reject(r.error);r.onsuccess=()=>{data[n]=r.result;resolve()}})));const programs=(data.programInstances||[]).filter(r=>r.athlete_id===athleteId&&!r.deleted_at&&r.status==='active');const p=programs.length===1?programs[0]:null;const latest=new Map();for(const row of (data.trainingMaxHistory||[]).filter(r=>r.athlete_id===athleteId&&!r.deleted_at).sort((a,b)=>Date.parse(b.effective_at||b.created_at||0)-Date.parse(a.effective_at||a.created_at||0))){const key=row.exercise_key||row.lift_key;if(key&&!latest.has(key))latest.set(key,[row.tm_value??row.value,row.tm_unit??row.unit])}return{programCount:programs.length,program:p?[p.program_key,Number(p.current_week),p.current_day_key]:null,tms:[...latest.entries()].sort((a,b)=>a[0].localeCompare(b[0]))}}finally{db.close()}},athleteId)}
async function dismissInstall(page){for(const loc of [page.getByRole('button',{name:/Dismiss install prompt/i}),page.getByRole('button',{name:/^Not now$/i})])if(await loc.first().isVisible().catch(()=>false))await loc.first().click().catch(()=>{})}
async function visit(page,route,pattern,serial,others){await page.goto(`${origin}/?route-sweep=${serial}#/${route}`,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForFunction(()=>document.querySelector('main')&&!/Loading private athlete vault/i.test(document.body.innerText),null,{timeout:20000});await dismissInstall(page);assert.equal(locationHash(await page.evaluate(()=>location.hash)),`#/${route}`,`${route}: route redirected unexpectedly`);const main=page.locator('main');await main.waitFor({state:'visible',timeout:10000});const text=(await main.innerText()).trim();assert.ok(text.length>12,`${route}: main content is effectively empty`);assert.match(text,pattern,`${route}: expected route content did not mount`);assert.equal(/uncaught|unhandled|application error|something went wrong/i.test(text),false,`${route}: visible runtime error state`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${route}: horizontal overflow`);const body=await page.locator('body').innerText();for(const other of others)assert.equal(body.includes(other),false,`${route}: leaked foreign synthetic athlete ${other}`);return{textLength:text.length}}
const locationHash=v=>String(v||'')

try{
  assert.equal(contract.athletes.length,7)
  let serial=0
  for(const f of contract.athletes){const row={internalId:f.internalId,displayName:f.displayName,result:'RUNNING',routeChecks:[],errors:[]};let context,page;try{const vp=viewports[f.internalId]||{width:412,height:915};context=await browser.newContext({viewport:vp,isMobile:vp.width<600,hasTouch:vp.width<600,serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));page=await context.newPage();page.setDefaultTimeout(12000);const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));await qa(page);const athleteId=await seed(page,f);await page.goto(`${origin}/?route-sweep-baseline=${++serial}#/home`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('main')&&!/Loading private athlete vault/i.test(document.body.innerText),null,{timeout:20000});const before=await criticalState(page,athleteId);assert.equal(before.programCount,1,`${f.internalId}: expected one active program before route sweep`);const others=contract.athletes.filter(x=>x.internalId!==f.internalId).map(x=>x.displayName);for(const[route,pattern]of routes){const detail=await visit(page,route,pattern,++serial,others);row.routeChecks.push({route,...detail})}const after=await criticalState(page,athleteId);assert.deepEqual(after.program,before.program,`${f.internalId}: read-only route sweep changed active program position`);assert.deepEqual(after.tms,before.tms,`${f.internalId}: read-only route sweep changed training maxes`);assert.equal(pageErrors.length,0,`${f.internalId}: page errors during route sweep: ${pageErrors.join(' | ')}`);row.result='PASS';report.athletes.push(row);await context.close();write()}catch(error){row.result='FAIL';row.errors.push(error?.stack||String(error));report.defects.push({athlete:f.internalId,error:error?.message||String(error)});report.athletes.push(row);if(page)await page.screenshot({path:path.join(out,`${f.internalId}-failure.png`),fullPage:true}).catch(()=>{});if(context)await context.close().catch(()=>{});write()}}
  report.result=report.athletes.length===7&&report.athletes.every(r=>r.result==='PASS')&&report.defects.length===0?'PASS':'FAIL';write();console.log(JSON.stringify(report,null,2));if(report.result!=='PASS')process.exitCode=1
}finally{await browser.close().catch(()=>{});await new Promise(r=>server.close(r));fs.rmSync(runtime,{recursive:true,force:true})}
