#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const auditRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const contract = JSON.parse(fs.readFileSync(path.join(auditRoot, 'ci/seven-athlete-release-audit.v2.json'), 'utf8'))
const app = path.resolve(process.argv[2] || 'release-candidate/.build-src/letmefly_app')
const candidateSha = process.env.RELEASE_CANDIDATE_SHA || 'unknown'
const out = path.resolve(process.env.LMF_SEVEN_ATHLETE_OUTPUT || path.join(app, 'SEVEN_ATHLETE_RELEASE_AUDIT'))
fs.mkdirSync(out, { recursive: true })
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href)
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

assert.equal(contract.dataBoundary.syntheticOnly, true)
assert.equal(contract.dataBoundary.mayOverwriteRealAthlete, false)
assert.equal(contract.athletes.length, 7)
assert.equal(new Set(contract.athletes.map(a => a.internalId)).size, 7)
assert.equal(new Set(contract.athletes.map(a => a.displayName)).size, 7)

const tmAliases = {
  back_squat: 'back-squat',
  front_squat: 'front-squat',
  bench_press: 'bench-press',
  deadlift: 'deadlift',
  overhead_press: 'overhead-press',
  power_clean: 'clean',
}
const viewports = {
  qa_rook: { width: 360, height: 800, mobile: true },
  qa_forge: { width: 412, height: 915, mobile: true },
  qa_titan: { width: 1440, height: 1000, mobile: false },
  qa_metric: { width: 412, height: 915, mobile: true },
  qa_recovery: { width: 390, height: 844, mobile: true },
  qa_substitution: { width: 412, height: 915, mobile: true },
  qa_history: { width: 1440, height: 1000, mobile: false },
}
const fixtures = contract.athletes.map((row, index) => ({
  ...row,
  key: row.internalId,
  weightUnit: row.units.weight,
  viewport: viewports[row.internalId] ?? { width: 412, height: 915, mobile: true },
  trainingMaxes: Object.fromEntries(Object.entries(row.trainingMaxes).map(([key, value]) => [tmAliases[key] ?? key, [value, row.units.weight]])),
  readinessUi: {
    sleepQuality: row.readiness.sleep_quality,
    soreness: row.readiness.soreness,
    stress: row.readiness.stress,
    energy: row.readiness.energy,
    sleepHours: row.readiness.sleep_hours,
    notes: row.readiness.notes ?? `Synthetic seven-athlete readiness marker ${row.internalId}`,
  },
  profile: {
    primaryGoal: `QA-${row.internalId.toUpperCase()}-GOAL — ${row.primaryFailureDomain}`,
    trainingHistory: `${row.role} synthetic release-audit athlete; no production identity or data.`,
    developmentPriorities: row.requiredAssertions.slice(0, 3).join('; '),
    equipmentAvailable: row.barbell.unit === 'kg' ? 'Metric barbell and metric plate inventory' : '45 lb barbell and standard plate inventory',
    coachingNotes: row.internalId === 'qa_substitution'
      ? 'QA-RURIK-SAFETY-MARKER — Reports anterior hip pinching with deep hip flexion and knee pain with loaded/deep knee flexion. Avoid provocative ranges; do not diagnose. Red flags require professional evaluation.'
      : `QA-${row.internalId.toUpperCase()}-COACH-MARKER`,
  },
  index,
}))

const runtime = fs.mkdtempSync(path.join(app, '.qa-seven-athlete-release-'))
const entry = path.join(runtime, 'entry.ts')
const imports = {
  athlete: 'services/athlete-service',
  profile: 'services/profile-context-service',
  readiness: 'services/readiness-service',
  progression: 'services/program-progression-service',
  workout: 'services/workout-service',
  db: 'db/local-db',
  mutations: 'db/local-mutations',
  programs: 'data/programs',
}
fs.writeFileSync(entry,
  Object.entries(imports).map(([name, file]) => `import * as ${name} from ${JSON.stringify(path.join(app, 'src', file))}`).join('\n') +
  `\nif(location.hostname !== '127.0.0.1' || new URLSearchParams(location.search).get('seven-athlete-release-qa') !== '1') throw new Error('Seven-athlete release bridge is disposable loopback only');\n` +
  `(window as any).__LMF_SEVEN_ATHLETE_QA__ = Object.freeze({${Object.keys(imports).join(',')}});\n`)
await build({ configFile: false, root: app, publicDir: false, logLevel: 'warn', build: { outDir: path.join(runtime, 'web'), emptyOutDir: true, minify: false, lib: { entry, formats: ['es'], fileName: () => 'services.js' } } })
fs.writeFileSync(path.join(runtime, 'web', 'index.html'), '<!doctype html><title>Seven athlete release QA</title><script type="module" src="./services.js"></script>')

const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.webmanifest':'application/manifest+json' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const qa = url.pathname.startsWith('/__qa/')
  const base = qa ? path.join(runtime, 'web') : path.join(app, 'dist')
  const relative = qa ? url.pathname.slice('/__qa/'.length) : url.pathname.slice(1)
  let file = path.resolve(base, decodeURIComponent(relative || 'index.html'))
  if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end('forbidden'); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(base, 'index.html')
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: chromeBin, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] })

const report = {
  result: 'RUNNING',
  commitSha: candidateSha,
  environment: 'isolated-loopback-real-release-candidate-ui',
  environmentUrl: origin,
  auditDate: new Date().toISOString(),
  fixtureVersion: contract.fixtureVersion,
  operator: 'automated-ci',
  athleteResults: [],
  rurikScenarioResults: [],
  hadrinScaleResult: null,
  defects: [],
  programIntegrityResult: 'NOT RUN',
  releaseDecision: 'FAIL',
}
const writeReport = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
function treeHash(dir) {
  const parts = []
  const walk = current => {
    if (!fs.existsSync(current)) return
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) parts.push(`${path.relative(dir, full)}:${digest(fs.readFileSync(full))}`)
    }
  }
  walk(dir); return digest(parts.join('\n'))
}
const sourceBefore = treeHash(path.join(app, 'src'))
const distBefore = treeHash(path.join(app, 'dist'))

async function qaPage(page) {
  await page.goto(`${origin}/__qa/index.html?seven-athlete-release-qa=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__LMF_SEVEN_ATHLETE_QA__)
}
async function dismissInstall(page) {
  for (const candidate of [page.getByRole('button', { name:/Dismiss install prompt/i }), page.getByRole('button', { name:/^Not now$/i })]) {
    if (await candidate.first().isVisible().catch(()=>false)) { await candidate.first().click().catch(()=>{}); await page.waitForTimeout(100) }
  }
}
async function openApp(page, route) {
  await page.goto(`${origin}/#/${route}`, { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForFunction(() => document.querySelector('main') && !/Loading private athlete vault/i.test(document.body.innerText), null, { timeout:20000 })
  await dismissInstall(page)
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve,reject)=>{ const r=indexedDB.open('letmefly-private'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error) })
    try {
      const preferred = ['athletes','athletePreferences','programInstances','programEvents','trainingMaxHistory','readinessEntries','workoutSessions','workoutExercises','workoutSets','bodyweightEntries','bodyweightHistory','personalRecords','prRecords','syncOutbox']
      const names = preferred.filter(name => db.objectStoreNames.contains(name))
      const tx = db.transaction(names,'readonly'), data = { __stores:names }
      await Promise.all(names.map(name => new Promise((resolve,reject)=>{ const r=tx.objectStore(name).getAll(); r.onsuccess=()=>{data[name]=r.result;resolve()};r.onerror=()=>reject(r.error) })))
      return data
    } finally { db.close() }
  })
}
async function programDigest(page) {
  return page.evaluate(async () => {
    const q=window.__LMF_SEVEN_ATHLETE_QA__, raw=JSON.stringify([q.programs.CROWNFORGE,q.programs.CROWN_MAINTENANCE,q.programs.BLACK_CROWN])
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))
    return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')
  })
}
function own(rows,id){ return (rows||[]).filter(row=>row?.athlete_id===id&&!row.deleted_at) }
async function assertNoForeignText(page, fixture, label) {
  const text=await page.locator('body').innerText()
  for (const other of fixtures.filter(row=>row.key!==fixture.key)) {
    assert.equal(text.includes(other.displayName),false,`${fixture.key}: ${label} leaked ${other.displayName}`)
    assert.equal(text.includes(other.profile.primaryGoal),false,`${fixture.key}: ${label} leaked ${other.key} goal`)
    assert.equal(text.includes(other.profile.coachingNotes),false,`${fixture.key}: ${label} leaked ${other.key} coaching notes`)
  }
}
async function chooseReadiness(page, fixture) {
  await page.waitForSelector('.readiness-field',{timeout:10000})
  const chosen=await page.evaluate(input=>{
    const values={sleep:input.sleepQuality,soreness:input.soreness,stress:input.stress,energy:input.energy};let count=0
    for(const field of document.querySelectorAll('.readiness-field')){
      const text=(field.textContent||'').toLowerCase(),key=Object.keys(values).find(name=>text.includes(name)),desired=key?values[key]:4
      const radio=field.querySelector(`input[type="radio"][value="${desired}"]`)
      if(radio instanceof HTMLInputElement){radio.checked=true;radio.dispatchEvent(new Event('input',{bubbles:true}));radio.dispatchEvent(new Event('change',{bubbles:true}));count++}
    }
    return count
  },fixture.readinessUi)
  assert.ok(chosen>=4,`${fixture.key}: readiness UI missing scored fields`)
  return chosen
}
async function waitForCompletionAndAdvance(page, sessionId, prior) {
  await page.waitForFunction(async ({sessionId,prior})=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    try{
      const tx=db.transaction(['workoutSessions','programInstances'],'readonly')
      const sr=tx.objectStore('workoutSessions').get(sessionId),pr=tx.objectStore('programInstances').getAll()
      const [session,programs]=await Promise.all([new Promise((res,rej)=>{sr.onsuccess=()=>res(sr.result);sr.onerror=()=>rej(sr.error)}),new Promise((res,rej)=>{pr.onsuccess=()=>res(pr.result);pr.onerror=()=>rej(pr.error)})])
      const active=programs.find(row=>!row.deleted_at&&row.status==='active'&&row.athlete_id===session?.athlete_id)
      return session?.status==='completed' && active && (active.program_key!==prior.program || Number(active.current_week)!==prior.week || active.current_day_key!==prior.dayKey)
    }finally{db.close()}
  },{sessionId,prior},{timeout:15000})
}
async function openCoach(page) {
  const coach=page.locator('#lmf-athlete-coach'); await coach.waitFor({state:'visible',timeout:10000})
  for(const key of ['profile','history','evidence']){
    const detail=coach.locator(`[data-ai-coach-detail="workspace-${key}"]`)
    if(await detail.count() && !(await detail.evaluate(node=>node.open))){const summary=detail.locator(':scope > summary');await summary.focus();await summary.press('Enter')}
  }
  return coach
}

async function seedFixture(page, fixture) {
  return page.evaluate(async input => {
    const q=window.__LMF_SEVEN_ATHLETE_QA__
    if(await q.athlete.getActiveAthlete()) throw new Error('Seven-athlete fixture requires a fresh disposable browser context')
    const athlete=await q.athlete.createLocalAthlete({displayName:input.displayName,weightUnit:input.weightUnit})
    for(const [key,[value,unit]] of Object.entries(input.trainingMaxes)) await q.athlete.setTrainingMax(athlete.id,key,value,unit)
    const expectedBlank=Object.fromEntries(Object.keys(input.profile).map(key=>[key,'']))
    await q.profile.saveProfileContext(athlete.id,input.profile,expectedBlank)
    await q.readiness.saveReadiness(athlete.id,input.readinessUi)

    if(input.key==='qa_history'){
      const device=await q.db.getOrCreateDeviceState('7-athlete-audit')
      const context={athleteId:athlete.id,deviceId:device.deviceId}
      const db=await q.db.openLetMeFlyDb()
      try{
        const names=[...db.objectStoreNames]
        const required=['programInstances','workoutSessions','workoutExercises','workoutSets','readinessEntries','trainingMaxHistory']
        for(const name of required) if(!names.includes(name)) throw new Error(`Hadrin required store missing: ${name}`)
        const bodyStore=['bodyweightEntries','bodyweightHistory'].find(name=>names.includes(name))
        const prStore=['personalRecords','prRecords'].find(name=>names.includes(name))
        const tx=db.transaction([...new Set([...required,bodyStore,prStore].filter(Boolean))],'readwrite')
        const programs=await q.db.requestToPromise(tx.objectStore('programInstances').index('by-athlete-status').getAll([athlete.id,'active']))
        if(programs.length!==1) throw new Error('Hadrin requires exactly one initial active program')
        const base=programs[0]
        const completedCf=q.mutations.prepareLocalMutation({...base,status:'completed',completed_on:'2024-01-01'},context,base)
        tx.objectStore('programInstances').put(completedCf)
        const maintenance=q.mutations.prepareLocalMutation({id:q.db.newId(),athlete_id:athlete.id,program_key:'crown-maintenance',program_name:'Crown Maintenance',program_version:'qa-history',status:'completed',started_on:'2024-01-02',completed_on:'2024-02-01',current_phase_key:'maintenance',current_week:3,current_day_key:'day-5',progression_state:{syntheticHistoryFixture:true}},context)
        const black=q.mutations.prepareLocalMutation({id:q.db.newId(),athlete_id:athlete.id,program_key:'black-crown',program_name:'Black Crown Revised',program_version:'qa-history',status:'active',started_on:'2024-02-02',current_phase_key:'block-2',current_week:8,current_day_key:'day-1',progression_state:{syntheticHistoryFixture:true}},context)
        tx.objectStore('programInstances').put(maintenance);tx.objectStore('programInstances').put(black)

        const sessionStore=tx.objectStore('workoutSessions'),exerciseStore=tx.objectStore('workoutExercises'),setStore=tx.objectStore('workoutSets')
        const now=Date.now(),dayMs=86400000,workoutCount=420,setsPerWorkout=13
        const phases=['crownforge','crown-maintenance','black-crown-foundation','black-crown-volume','black-crown-intensification','black-crown-realization']
        for(let i=0;i<workoutCount;i++){
          const finish=new Date(now-(workoutCount-i)*2.55*dayMs),start=new Date(finish.getTime()-60*60000)
          const exposure=i<80?phases[0]:i<100?phases[1]:i<200?phases[2]:i<280?phases[3]:i<350?phases[4]:phases[5]
          const programKey=exposure.startsWith('black-crown')?'black-crown':exposure
          const phaseKey=exposure.replace('black-crown-','')
          const sid=`hadrin-session-${String(i).padStart(4,'0')}`,eid=`hadrin-exercise-${String(i).padStart(4,'0')}`
          sessionStore.put({id:sid,athlete_id:athlete.id,program_instance_id:programKey==='black-crown'?black.id:programKey==='crown-maintenance'?maintenance.id:base.id,program_key:programKey,program_version:'synthetic-history-v1',phase_key:phaseKey,week_number:(i%12)+1,day_key:`day-${(i%5)+1}`,workout_name:`Hadrin historical ${exposure} ${i+1}`,status:'completed',started_at:start.toISOString(),completed_at:finish.toISOString(),notes:i%17===0?'Synthetic moved/skipped/deload history marker':null,audit_exposure:exposure})
          exerciseStore.put({id:eid,athlete_id:athlete.id,workout_session_id:sid,exercise_key:i%3===0?'deadlift':i%3===1?'bench-press':'front-squat',exercise_name_snapshot:i%3===0?'Deadlift':i%3===1?'Bench Press':'Front Squat',order_index:0,group_key:'A',group_type:'straight',prescription_snapshot:{priority:'mandatory',prescribedExerciseName:i%3===0?'Deadlift':i%3===1?'Bench Press':'Front Squat',sourceSets:Array.from({length:setsPerWorkout},()=>({reps:'5',loadText:'135 lb'}))}})
          for(let s=1;s<=setsPerWorkout;s++) setStore.put({id:`hadrin-set-${i}-${s}`,athlete_id:athlete.id,workout_session_id:sid,workout_exercise_id:eid,set_number:s,completed:true,completion_state:'completed',completed_at:new Date(start.getTime()+(s+2)*3*60000).toISOString(),reps:5,load_value:135+(i%20)*5,load_unit:'lb',rpe:7+(s%3)*0.5,rir:s%3,performance_data:{actualMetricKind:'reps',programmedReps:'5',programmedLoadText:'135 lb'}})
        }
        const readinessStore=tx.objectStore('readinessEntries')
        for(let i=0;i<320;i++) readinessStore.put({id:`hadrin-readiness-${i}`,athlete_id:athlete.id,created_at:new Date(now-(i+1)*3*dayMs).toISOString(),sleep_quality:i%10===0?2:4,soreness:i%12===0?4:2,stress:i%13===0?4:2,energy:i%11===0?2:4,sleep_hours:i%10===0?5:7.5,notes:'Synthetic longitudinal readiness'})
        const tmStore=tx.objectStore('trainingMaxHistory')
        const currentTms=await q.db.requestToPromise(tmStore.index('by-athlete').getAll(athlete.id))
        const template=currentTms[0]
        for(let i=0;i<36;i++) tmStore.put({...template,id:`hadrin-tm-${i}`,athlete_id:athlete.id,exercise_key:['back-squat','bench-press','deadlift','overhead-press'][i%4],tm_value:185+i*5,tm_unit:'lb',effective_at:new Date(now-(i+1)*28*dayMs).toISOString(),source:i%7===0?'synthetic-deload':'synthetic-progression',_local:{...(template?._local||{}),localVersion:1}})
        if(bodyStore){const store=tx.objectStore(bodyStore);for(let i=0;i<220;i++) store.put({id:`hadrin-bw-${i}`,athlete_id:athlete.id,weight_value:220-(i*.08),weight_unit:'lb',recorded_at:new Date(now-(i+1)*5*dayMs).toISOString()})}
        if(prStore){const store=tx.objectStore(prStore);for(let i=0;i<45;i++) store.put({id:`hadrin-pr-${i}`,athlete_id:athlete.id,exercise_key:['back-squat','bench-press','deadlift'][i%3],pr_type:i%2?'rep':'estimated-1rm',value:200+i*5,unit:'lb',achieved_at:new Date(now-(i+1)*20*dayMs).toISOString(),source:'synthetic-audit'})}
        await new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Hadrin history seed failed'))})
      }finally{db.close()}
    }

    const program=await q.athlete.getCurrentProgramInstance(athlete.id)
    const tms=await q.athlete.getLatestTrainingMaxes(athlete.id)
    return {athleteId:athlete.id,displayName:athlete.display_name,program,tmKeys:Object.keys(tms).sort()}
  },fixture)
}

try {
  const live=[]
  const canonicalDigests=[]
  for(const fixture of fixtures){
    const result={internalId:fixture.key,displayName:fixture.displayName,result:'RUNNING',checks:[],errors:[]}
    let context,page
    try{
      context=await browser.newContext({viewport:{width:fixture.viewport.width,height:fixture.viewport.height},isMobile:fixture.viewport.mobile,hasTouch:fixture.viewport.mobile,serviceWorkers:'block'})
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'))
      page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>result.errors.push(e.message))
      await qaPage(page)
      const seeded=await seedFixture(page,fixture),athleteId=seeded.athleteId
      result.athleteId=athleteId
      assert.ok(seeded.program&&seeded.program.status==='active',`${fixture.key}: active program missing`)
      assert.equal(seeded.tmKeys.length,6,`${fixture.key}: expected six active TM keys`)
      result.checks.push('Synthetic private fixture seeded with active governed program and six TMs')
      const canonicalBefore=await programDigest(page);canonicalDigests.push(canonicalBefore)

      const homeStart=Date.now();await openApp(page,'home');result.homeMs=Date.now()-homeStart
      await assertNoForeignText(page,fixture,'Home');result.checks.push('Home isolated to active athlete')

      await openApp(page,'train');await chooseReadiness(page,fixture)
      const beforeStart=await snapshot(page)
      const activeBefore=own(beforeStart.programInstances,athleteId).find(r=>r.status==='active')
      const prior={program:activeBefore.program_key,week:Number(activeBefore.current_week),dayKey:activeBefore.current_day_key}
      const start=page.locator('[data-action="start-workout"]').filter({visible:true}).first()
      await start.waitFor({state:'visible',timeout:10000});await start.click()
      await page.locator('.active-exercise [data-set-id]').first().waitFor({state:'attached',timeout:12000})
      const afterStart=await snapshot(page),session=own(afterStart.workoutSessions,athleteId).find(r=>r.status==='in_progress')
      assert.ok(session,`${fixture.key}: in-progress workout missing`);const sessionId=session.id;result.sessionId=sessionId
      result.checks.push('Readiness → Start Workout created athlete-owned session')

      const rows=page.locator('.active-exercise [data-set-id]'),rowCount=await rows.count();let chosenRow=null,chosenCard=null
      for(let i=0;i<rowCount;i++){
        const row=rows.nth(i),load=row.locator('.load-input')
        if(await load.count() && (await load.inputValue().catch(()=>'' )).trim()){chosenRow=row;chosenCard=row.locator('xpath=ancestor::*[contains(@class,"exercise-card")][1]');break}
      }
      if(!chosenRow){chosenRow=rows.first();chosenCard=chosenRow.locator('xpath=ancestor::*[contains(@class,"exercise-card")][1]')}
      const setId=await chosenRow.getAttribute('data-set-id');assert.ok(setId)
      const loadInput=chosenRow.locator('.load-input'),displayedLoad=(await loadInput.inputValue().catch(()=>'' )).trim()
      const displayedUnit=(await chosenRow.locator('.load-field small').innerText().catch(()=>'' )).trim()
      if(displayedLoad) assert.match(displayedUnit,new RegExp(fixture.weightUnit,'i'),`${fixture.key}: workout unit does not match athlete`)
      const barOpen=chosenCard.locator('[data-lmf-bar-loader-open="exercise"]').first()
      if(displayedLoad && await barOpen.isVisible().catch(()=>false)){
        await barOpen.click();const bar=page.locator('.lmf-bar-loader-root');await bar.waitFor({state:'visible'})
        assert.equal(await bar.locator('#lmf-bar-unit').inputValue(),fixture.weightUnit)
        assert.equal(await bar.locator('#lmf-bar-target').inputValue(),displayedLoad)
        result.barLoader={target:displayedLoad,unit:fixture.weightUnit,bar:await bar.locator('#lmf-bar-weight').inputValue()}
        await bar.locator('[data-lmf-bar-close="button"]').click();result.checks.push('Bar Loader follows athlete unit and current workout load')
      }
      const reps=chosenRow.locator('.reps-input');if(await reps.count()) await reps.fill('5')
      await chosenRow.locator('[data-action="toggle-set"]').click()
      await page.waitForFunction(id=>document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done')===true,setId,{timeout:10000})
      const afterLog=await snapshot(page),logged=afterLog.workoutSets.find(r=>r.id===setId)
      assert.equal(logged?.athlete_id,athleteId);assert.equal(logged?.completed,true)
      if(displayedLoad) assert.equal(logged?.load_unit,fixture.weightUnit)
      result.checks.push('Set logging persists athlete ownership and unit semantics')

      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('main')&&!/Loading private athlete vault/i.test(document.body.innerText),null,{timeout:20000});await dismissInstall(page)
      await page.locator(`[data-set-id="${setId}"]`).waitFor({state:'attached',timeout:12000})
      const afterReload=await snapshot(page);assert.equal(afterReload.workoutSets.find(r=>r.id===setId)?.completed,true)
      result.checks.push('Refresh/reopen resumes saved set')

      const reviewIndex=await page.locator('#swipe-viewport > .swipe-page').count()-1
      await page.locator(`#session-track [data-session-index="${reviewIndex}"]`).click();await page.locator('[data-recap-review]').click()
      const recap=page.locator('.lmf-recap-dialog');await recap.waitFor({state:'visible'});assert.match(await recap.innerText(),/Review & finish/i)
      page.once('dialog',dialog=>dialog.accept());await page.locator('[data-recap-finish]').click();await waitForCompletionAndAdvance(page,sessionId,prior)
      const afterFinish=await snapshot(page),completed=afterFinish.workoutSessions.find(r=>r.id===sessionId),activeAfter=own(afterFinish.programInstances,athleteId).filter(r=>r.status==='active')
      assert.equal(completed?.status,'completed');assert.equal(activeAfter.length,1,`${fixture.key}: expected one active program after completion`)
      result.programAfter={program:activeAfter[0].program_key,week:activeAfter[0].current_week,day:activeAfter[0].current_day_key}
      result.checks.push('Finish workout advances governed private position once')

      await qaPage(page);assert.equal(await programDigest(page),canonicalBefore,`${fixture.key}: public program definitions mutated`);result.checks.push('Canonical public program definitions unchanged')

      const progressStart=Date.now();await openApp(page,'progress');result.progressMs=Date.now()-progressStart
      const tools=page.locator('#lmf-pg-native-tools');await tools.waitFor({state:'visible',timeout:10000})
      if(!(await tools.evaluate(el=>el.open))){const summary=tools.locator(':scope > summary');await summary.focus();await summary.press('Enter')}
      assert.equal(await page.locator(`.history-list [data-workout-recap="${sessionId}"]`).count(),1,`${fixture.key}: completed session absent from history`)
      await assertNoForeignText(page,fixture,'Progress');result.checks.push('History/Progress includes completed athlete-owned session')

      const coachStart=Date.now();await openApp(page,'coach');const coach=await openCoach(page);result.coachMs=Date.now()-coachStart
      const coachText=await coach.innerText();assert.ok(coachText.includes(fixture.displayName),`${fixture.key}: Coach missing athlete name`);assert.ok(coachText.includes(fixture.profile.primaryGoal),`${fixture.key}: Coach missing athlete goal`)
      await assertNoForeignText(page,fixture,'Coach');result.checks.push('Coach is athlete-aware and isolated')

      if(fixture.key==='qa_substitution'){
        assert.match(coachText,/hip|knee|limitation|pinching|pain/i,'Rurik: Coach/profile workspace must surface limitation context')
        const safety={scenarioId:'rurik-profile-safety-context',result:'PASS',evidence:['limitation context visible to Coach','no diagnosis inserted by fixture','public program digest unchanged']}
        report.rurikScenarioResults.push(safety);result.checks.push('Rurik limitation/safety context reaches Coach without mutating source program')
      }

      if(fixture.key==='qa_history'){
        const final=await snapshot(page),bodyName=['bodyweightEntries','bodyweightHistory'].find(n=>final.__stores.includes(n)),prName=['personalRecords','prRecords'].find(n=>final.__stores.includes(n))
        const scale={
          completedWorkouts:own(final.workoutSessions,athleteId).filter(r=>r.status==='completed').length,
          workoutSets:own(final.workoutSets,athleteId).length,
          readinessEntries:own(final.readinessEntries,athleteId).length,
          trainingMaxEvents:own(final.trainingMaxHistory,athleteId).length,
          bodyweightEntries:bodyName?own(final[bodyName],athleteId).length:0,
          personalRecords:prName?own(final[prName],athleteId).length:0,
          bodyweightStore:bodyName??null,prStore:prName??null,homeMs:result.homeMs,progressMs:result.progressMs,coachMs:result.coachMs,
        }
        const h=fixture.historyScale
        assert.ok(scale.completedWorkouts>=h.minCompletedWorkouts,`Hadrin workouts ${scale.completedWorkouts}/${h.minCompletedWorkouts}`)
        assert.ok(scale.workoutSets>=h.minWorkoutSets,`Hadrin sets ${scale.workoutSets}/${h.minWorkoutSets}`)
        assert.ok(scale.readinessEntries>=h.minReadinessEntries,`Hadrin readiness ${scale.readinessEntries}/${h.minReadinessEntries}`)
        assert.ok(scale.trainingMaxEvents>=h.minTrainingMaxEvents,`Hadrin TM events ${scale.trainingMaxEvents}/${h.minTrainingMaxEvents}`)
        assert.ok(scale.bodyweightEntries>=h.minBodyweightEntries,`Hadrin bodyweight ${scale.bodyweightEntries}/${h.minBodyweightEntries}; store=${bodyName}`)
        assert.ok(scale.personalRecords>=h.minPersonalRecords,`Hadrin PRs ${scale.personalRecords}/${h.minPersonalRecords}; store=${prName}`)
        assert.ok(Math.max(scale.homeMs,scale.progressMs,scale.coachMs)<10000,'Hadrin major surfaces exceeded 10s responsiveness threshold')
        report.hadrinScaleResult={result:'PASS',...scale};result.checks.push('Hadrin multi-year scale thresholds and responsiveness pass')
      }

      await openApp(page,'profile');const goal=page.locator('[data-profile-key="primaryGoal"]');await goal.waitFor({state:'visible',timeout:10000});assert.equal(await goal.inputValue(),fixture.profile.primaryGoal);await assertNoForeignText(page,fixture,'Profile')
      const final=await snapshot(page);assert.equal((final.athletes||[]).filter(r=>!r.deleted_at).length,1,`${fixture.key}: disposable vault contains another athlete`)
      for(const name of ['athletePreferences','programInstances','programEvents','trainingMaxHistory','readinessEntries','workoutSessions','workoutExercises','workoutSets']) for(const row of final[name]||[]) if(row?.athlete_id&&!row.deleted_at) assert.equal(row.athlete_id,athleteId,`${fixture.key}: ${name} contains foreign athlete row`)
      result.checks.push('Private DB rows remain athlete-scoped')
      result.result='PASS';live.push({context,page,fixture,athleteId,result});report.athleteResults.push(result);writeReport()
    }catch(error){result.result='FAIL';result.errors.push(error?.stack||String(error));report.athleteResults.push(result);report.defects.push({athlete:fixture.key,error:error?.message||String(error)});if(page)await page.screenshot({path:path.join(out,`${fixture.key}-failure.png`),fullPage:true}).catch(()=>{});if(context)await context.close().catch(()=>{});writeReport()}
  }

  // Revisit every successful context after all seven have run. This catches late
  // cache/global-state leakage that a one-pass fixture check can miss.
  for(const item of live){
    await openApp(item.page,'coach');await assertNoForeignText(item.page,item.fixture,'late Coach recheck')
    await openApp(item.page,'profile');await assertNoForeignText(item.page,item.fixture,'late Profile recheck')
    item.result.checks.push('Late cross-athlete Coach/Profile recheck remains isolated')
  }
  for(const item of live) await item.context.close()

  const sourceAfter=treeHash(path.join(app,'src')),distAfter=treeHash(path.join(app,'dist'))
  assert.equal(sourceAfter,sourceBefore,'Seven-athlete audit mutated reconstructed source tree')
  assert.equal(distAfter,distBefore,'Seven-athlete audit mutated production dist')
  assert.ok(canonicalDigests.length===7&&new Set(canonicalDigests).size===1,'Canonical program digest mismatch across athlete contexts')
  report.programIntegrityResult='PASS'
  if(report.athleteResults.length===7 && report.athleteResults.every(r=>r.result==='PASS') && report.rurikScenarioResults.some(r=>r.result==='PASS') && report.hadrinScaleResult?.result==='PASS' && report.defects.length===0){report.result='PASS';report.releaseDecision='PASS'}else{report.result='FAIL';report.releaseDecision='FAIL'}
  writeReport()
  console.log(JSON.stringify(report,null,2))
  if(report.result!=='PASS') process.exitCode=1
}catch(error){report.result='FAIL';report.releaseDecision='FAIL';report.defects.push({athlete:'gate',error:error?.stack||String(error)});writeReport();console.error(error);process.exitCode=1}
finally{await browser.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));fs.rmSync(runtime,{recursive:true,force:true})}
