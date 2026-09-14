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
const out=path.join(app,'COACH_SEVEN_ATHLETE_SCENARIOS_V1');fs.mkdirSync(out,{recursive:true})
const requireApp=createRequire(path.join(app,'package.json'))
const {chromium}=requireApp('playwright-core')
const {build}=await import(pathToFileURL(requireApp.resolve('vite')).href)
const chromeBin=process.env.CHROME_BIN;if(!chromeBin)throw new Error('CHROME_BIN is required')

const runtime=fs.mkdtempSync(path.join(app,'.qa-coach-seven-'))
const entry=path.join(runtime,'entry.ts')
const imports={athlete:'services/athlete-service',profile:'services/profile-context-service',readiness:'services/readiness-service',db:'db/local-db'}
fs.writeFileSync(entry,Object.entries(imports).map(([n,f])=>`import * as ${n} from ${JSON.stringify(path.join(app,'src',f))}`).join('\n')+`\nif(location.hostname!=='127.0.0.1')throw new Error('QA bridge loopback only');(window as any).__LMF_COACH_QA__=Object.freeze({${Object.keys(imports).join(',')}});\n`)
await build({configFile:false,root:app,publicDir:false,logLevel:'warn',build:{outDir:path.join(runtime,'web'),emptyOutDir:true,minify:false,lib:{entry,formats:['es'],fileName:()=> 'services.js'}}})
fs.writeFileSync(path.join(runtime,'web','index.html'),'<!doctype html><script type="module" src="./services.js"></script>')
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'}
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1'),qa=u.pathname.startsWith('/__qa/'),base=qa?path.join(runtime,'web'):path.join(app,'dist'),rel=qa?u.pathname.slice(6):u.pathname.slice(1);let file=path.resolve(base,decodeURIComponent(rel||'index.html'));if(file!==base&&!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(base,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res)})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({executablePath:chromeBin,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
const report={result:'RUNNING',athletes:[],defects:[]}
const write=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
const viewports={qa_rook:{width:360,height:800},qa_forge:{width:412,height:915},qa_titan:{width:1440,height:1000},qa_metric:{width:412,height:915},qa_recovery:{width:390,height:844},qa_substitution:{width:412,height:915},qa_history:{width:1440,height:1000}}
const tmAliases={back_squat:'back-squat',front_squat:'front-squat',bench_press:'bench-press',deadlift:'deadlift',overhead_press:'overhead-press',power_clean:'clean'}

async function qaPage(page){await page.goto(`${origin}/__qa/index.html`,{waitUntil:'load'});await page.waitForFunction(()=>window.__LMF_COACH_QA__)}
async function seed(page,fixture){return page.evaluate(async input=>{const q=window.__LMF_COACH_QA__,athlete=await q.athlete.createLocalAthlete({displayName:input.displayName,weightUnit:input.units.weight});for(const [key,value] of Object.entries(input.trainingMaxes))await q.athlete.setTrainingMax(athlete.id,input.tmAliases[key]||key,value,input.units.weight);await q.profile.saveProfileContext(athlete.id,{primaryGoal:`QA ${input.internalId} strength goal`,trainingHistory:'Synthetic Coach release audit only',developmentPriorities:'Strength; work capacity; movement quality',equipment:input.internalId==='qa_forge'?'No belt squat available':'Full synthetic audit equipment',coachingNotes:input.internalId==='qa_substitution'?'Anterior hip pinching in deep hip flexion; avoid provocative range.':''},{primaryGoal:'',trainingHistory:'',developmentPriorities:'',equipment:'',coachingNotes:''});await q.readiness.saveReadiness(athlete.id,{sleepQuality:input.readiness.sleep_quality,soreness:input.readiness.soreness,stress:input.readiness.stress,energy:input.readiness.energy,sleepHours:input.readiness.sleep_hours,notes:'Synthetic Coach audit readiness'});const db=await q.db.openLetMeFlyDb();try{const names=[...db.objectStoreNames],stores=['workoutSessions','workoutExercises','workoutSets'].filter(n=>names.includes(n));if(input.internalId!=='qa_rook'&&stores.length===3){const tx=db.transaction(stores,'readwrite'),now=Date.now();for(let i=0;i<(input.internalId==='qa_history'?24:3);i++){const sid=`coach-${input.internalId}-s-${i}`,eid=`coach-${input.internalId}-e-${i}`,date=new Date(now-(i+1)*86400000).toISOString();tx.objectStore('workoutSessions').put({id:sid,athlete_id:athlete.id,status:'completed',program_key:'crownforge',week_number:1,day_key:'day-1',workout_name:`Coach History ${i+1}`,started_at:date,completed_at:date});tx.objectStore('workoutExercises').put({id:eid,athlete_id:athlete.id,workout_session_id:sid,exercise_key:'bench-press',exercise_name_snapshot:'Bench Press',prescription_snapshot:{sourceSets:[{reps:5}]}});tx.objectStore('workoutSets').put({id:`coach-${input.internalId}-set-${i}`,athlete_id:athlete.id,workout_session_id:sid,workout_exercise_id:eid,set_number:1,completed:true,completed_at:date,load_value:input.units.weight==='kg'?70+i:155+i*5,load_unit:input.units.weight,reps:5,rpe:7.5+(i%2)*.5})}await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error)})}}finally{db.close()}return athlete.id},{...fixture,tmAliases})}
async function setDay(page,athleteId,day){await qaPage(page);await page.evaluate(async({athleteId,day})=>{const q=window.__LMF_COACH_QA__,db=await q.db.openLetMeFlyDb();try{const tx=db.transaction('programInstances','readwrite'),store=tx.objectStore('programInstances'),rows=await q.db.requestToPromise(store.index('by-athlete-status').getAll([athleteId,'active']));if(rows.length!==1)throw new Error('Expected one active program');store.put({...rows[0],current_week:1,current_day_key:`day-${day}`});await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error)})}finally{db.close()}},{athleteId,day})}
async function openCoach(page){await page.goto(`${origin}/#/coach`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#coach-answer',{state:'visible',timeout:15000});await page.waitForSelector('.lmf-coach-workspace',{state:'visible',timeout:15000})}
async function ask(page,question,pattern,label){const input=page.locator('#coach-question'),answer=page.locator('#coach-answer');const before=(await answer.innerText()).trim();await input.fill(question);await page.locator('[data-action="ask-coach"]').click();await page.waitForFunction(({before,source})=>{const text=document.querySelector('#coach-answer')?.textContent?.trim()||'';return text!==before&&new RegExp(source,'i').test(text)},{before,source:pattern.source},{timeout:10000});const text=(await answer.innerText()).trim();assert.match(text,pattern,label);return text}

try{
  assert.equal(contract.athletes.length,7)
  for(const fixture of contract.athletes){const row={internalId:fixture.internalId,displayName:fixture.displayName,result:'RUNNING',checks:[],errors:[]};let context,page;try{const vp=viewports[fixture.internalId]||{width:412,height:915};context=await browser.newContext({viewport:vp,isMobile:vp.width<600,hasTouch:vp.width<600,serviceWorkers:'block'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));page=await context.newPage();page.setDefaultTimeout(12000);await qaPage(page);const athleteId=await seed(page,fixture);await openCoach(page);
    const common=[
      ['What are we doing today?',/Crownforge|lower|push|strength/i,'today'],
      ['Why am I doing this session?',/session|priority|adaptation|strength/i,'why'],
      ['Can I increase the weight?',/programmed load|training max|TM|authority/i,'load'],
      ['What should I focus on?',/focus|technique|front.?squat|bench|clean/i,'focus'],
      ['Give me a substitute.',/substitut|programmed role|movement pattern|stimulus/i,'substitute'],
      ['How am I progressing?',/Progress check|completed session|training evidence/i,'progress'],
      ['Should we change my training max?',/Training-max decision|TM GOVERNANCE|calibration|testing gate/i,'tm'],
      ['How does my readiness look today?',/Readiness check|sleep|energy|soreness|stress/i,'readiness'],
      ['I am short on time today. What should I do?',/Short-on-time decision|optional|primary/i,'time'],
      ["I don't have the equipment for this exercise.",/Equipment decision|governed substitute|movement role/i,'equipment'],
      ['I had one bad session. Should we change the program?',/Performance review|one poor|one bad|rewrite/i,'poor-session'],
      ['How is my specialization work progressing?',/Specialization review|primary performance|weak point/i,'specialization'],
    ];
    for(const [q,p,l] of common){await ask(page,q,p,`${fixture.internalId}: ${l}`);row.checks.push(l)}
    if(fixture.internalId==='qa_rook'){await ask(page,'What did I do last time?',/no previous workout|no.*history|there is no previous/i,'rook missing history');await ask(page,'How am I progressing?',/no completed sessions|not enough completed training evidence/i,'rook progress evidence gap');row.checks.push('missing-history')}
    else{await ask(page,'What did I do last time?',/Coach History|most recent recorded session|Previous training/i,'history answer');row.checks.push('history')}

    const select=page.locator('#lmf-coach-exercise-context');await select.waitFor({state:'visible'});const front=await select.locator('option').evaluateAll(opts=>opts.find(o=>/Front Squat/i.test(o.textContent||''))?.value||'');assert.ok(front,`${fixture.internalId}: Front Squat Coach context missing`);await select.selectOption(front);
    await ask(page,'What should I focus on during this set?',/Set Focus|FOCUS ON/i,'exercise focus');
    await ask(page,'Why am I doing this exercise?',/Why Front Squat|EXERCISE ROLE|PROGRAM CONTEXT/i,'exercise why');
    await ask(page,'What muscles does this exercise work?',/Muscle Emphasis|PRIMARY|SECONDARY/i,'exercise muscles');
    await ask(page,'What can I substitute for Front Squat?',/Substitution Guidance|AVAILABLE TO CONSIDER|PROGRAM PRESCRIPTION LOCKED/i,'exercise substitution');row.checks.push('exercise-intelligence')

    await ask(page,'I have anterior hip pinching in deep squats. What should I do?',/AVOID PROVOCATIVE DEEP HIP FLEXION|NOT A DIAGNOSIS/i,'hip safety');
    await ask(page,'My knee pain gets worse with loaded deep knee flexion. What should I do?',/AVOID PAINFUL LOADED OR DEEP KNEE FLEXION|NOT A DIAGNOSIS/i,'knee safety');
    await ask(page,'I have severe pain after acute trauma and cannot bear weight. Should I train?',/STOP ROUTINE TRAINING ADVICE|medical professional|cannot diagnose/i,'red flag');row.checks.push('safety-three')

    if(fixture.internalId==='qa_recovery'){await setDay(page,athleteId,7);await openCoach(page);await ask(page,'What are we doing today?',/Rest|recovery|walk|no make-up|Full Rest/i,'rest-day Coach context');row.checks.push('rest-day')}
    if(fixture.internalId==='qa_metric'){const tm=await ask(page,'Should we change my training max?',/kg/i,'metric TM units');assert.match(tm,/kg/i);row.checks.push('metric-units')}
    if(fixture.internalId==='qa_substitution'){await ask(page,'This hurts. What can I substitute?',/AVOID PROVOCATIVE DEEP HIP FLEXION|NOT A DIAGNOSIS/i,'profile safety context');row.checks.push('profile-safety')}

    assert.equal(await page.locator('.lmf-coach-question img').count(),0);await ask(page,'What should I focus on? <img src=x onerror=alert(1)>',/Set Focus|focus|technique/i,'literal input safety');assert.equal(await page.locator('.lmf-coach-question img').count(),0);row.checks.push('literal-input-safe')
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);assert.equal(overflow,true,`${fixture.internalId}: Coach horizontal overflow`);row.checks.push('responsive-no-overflow')
    row.result='PASS';report.athletes.push(row);await context.close();write()
  }catch(error){row.result='FAIL';row.errors.push(error?.stack||String(error));report.defects.push({athlete:fixture.internalId,error:error?.message||String(error)});report.athletes.push(row);if(page)await page.screenshot({path:path.join(out,`${fixture.internalId}-failure.png`),fullPage:true}).catch(()=>{});if(context)await context.close().catch(()=>{});write()}}
  report.result=report.athletes.length===7&&report.athletes.every(r=>r.result==='PASS')&&report.defects.length===0?'PASS':'FAIL';write();console.log(JSON.stringify(report,null,2));if(report.result!=='PASS')process.exitCode=1
}finally{await browser.close().catch(()=>{});await new Promise(r=>server.close(r));fs.rmSync(runtime,{recursive:true,force:true})}
