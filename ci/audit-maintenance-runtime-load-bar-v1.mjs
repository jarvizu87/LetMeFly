#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const app = path.resolve(process.argv[2] || path.join(repoRoot, '.build-src/letmefly_app'))
const out = path.join(app, 'MAINTENANCE_RUNTIME_LOAD_BAR_AUDIT.json')
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href)
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const runtime = fs.mkdtempSync(path.join(app, '.qa-maintenance-runtime-'))
const entry = path.join(runtime, 'entry.ts')
const imports = {
  athlete: 'services/athlete-service',
  readiness: 'services/readiness-service',
  db: 'db/local-db',
  mutations: 'db/local-mutations',
}
fs.writeFileSync(entry,
  Object.entries(imports).map(([name, file]) => `import * as ${name} from ${JSON.stringify(path.join(app, 'src', file))}`).join('\n') +
  `\nif(location.hostname !== '127.0.0.1' || new URLSearchParams(location.search).get('maintenance-runtime-qa') !== '1') throw new Error('Maintenance runtime QA bridge is loopback-only');\n` +
  `(window as any).__LMF_MAINTENANCE_RUNTIME_QA__ = Object.freeze({${Object.keys(imports).join(',')}});\n`)
await build({
  configFile: false,
  root: app,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: path.join(runtime, 'web'),
    emptyOutDir: true,
    minify: false,
    lib: { entry, formats: ['es'], fileName: () => 'services.js' },
  },
})
fs.writeFileSync(path.join(runtime, 'web', 'index.html'), '<!doctype html><title>Maintenance runtime QA</title><script type="module" src="./services.js"></script>')

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
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: chromeBin, headless: true, args:['--no-sandbox','--disable-dev-shm-usage'] })

const report = { result:'RUNNING', fixture:'synthetic-maintenance-w1d1', checks:[], frontSquat:null, benchPress:null, defects:[] }
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n')

async function qaPage(page) {
  await page.goto(`${origin}/__qa/index.html?maintenance-runtime-qa=1`, { waitUntil:'load' })
  await page.waitForFunction(() => window.__LMF_MAINTENANCE_RUNTIME_QA__)
}
async function dismissInstall(page) {
  for (const candidate of [page.getByRole('button',{name:/Dismiss install prompt/i}), page.getByRole('button',{name:/^Not now$/i})]) {
    if (await candidate.first().isVisible().catch(()=>false)) await candidate.first().click().catch(()=>{})
  }
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve,reject)=>{ const r=indexedDB.open('letmefly-private'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error) })
    try {
      const names=['workoutSessions','workoutExercises','workoutSets','programInstances'].filter(name=>db.objectStoreNames.contains(name))
      const tx=db.transaction(names,'readonly'), data={}
      await Promise.all(names.map(name=>new Promise((resolve,reject)=>{ const r=tx.objectStore(name).getAll(); r.onsuccess=()=>{data[name]=r.result;resolve()};r.onerror=()=>reject(r.error) })))
      return data
    } finally { db.close() }
  })
}
async function chooseReadiness(page) {
  const fields = page.locator('.readiness-field')
  if (!(await fields.count())) return
  await page.evaluate(() => {
    for (const field of document.querySelectorAll('.readiness-field')) {
      const text=(field.textContent||'').toLowerCase()
      const desired=text.includes('soreness')||text.includes('stress') ? 2 : 4
      const radio=field.querySelector(`input[type="radio"][value="${desired}"]`)
      if(radio instanceof HTMLInputElement){radio.checked=true;radio.dispatchEvent(new Event('input',{bubbles:true}));radio.dispatchEvent(new Event('change',{bubbles:true}))}
    }
  })
}
async function activateExercise(page, name) {
  const already = page.locator('.active-exercise .exercise-title h3').filter({hasText:name})
  if (await already.count()) return
  const clicked = await page.evaluate((needle) => {
    const candidates=[...document.querySelectorAll('button,[role="button"],.lmf-compact-preview,.compact-exercise,.flow-preview')]
    const target=candidates.find(el => (el.textContent||'').includes(needle))
    if (!target) return false
    target.click(); return true
  }, name)
  assert.equal(clicked, true, `Could not activate ${name} from Workout Flow`)
  await page.waitForFunction((needle) => (document.querySelector('.active-exercise .exercise-title h3')?.textContent||'').includes(needle), name, {timeout:10000})
}
async function auditBarLoader(page, name, target, expectedPerSide) {
  await activateExercise(page, name)
  const card = page.locator('.active-exercise')
  const cardText = await card.innerText()
  assert.match(cardText, /65% of verified reference/i, `${name}: programmed percentage text missing in active Workout Mode`)
  const load = card.locator('.set-row:not([aria-hidden="true"]) .load-input').first()
  const visibleLoad = Number(await load.inputValue())
  assert.equal(visibleLoad, target, `${name}: native load input did not receive resolved programmed load`)
  const button = card.locator('[data-lmf-bar-loader-open="exercise"]').first()
  await button.waitFor({state:'visible', timeout:10000})
  await button.click()
  const modal = page.locator('.lmf-bar-loader-root')
  await modal.waitFor({state:'visible',timeout:10000})
  const modalTarget = Number(await modal.locator('#lmf-bar-target').inputValue())
  const barWeight = Number(await modal.locator('#lmf-bar-weight').inputValue())
  const unit = await modal.locator('#lmf-bar-unit').inputValue()
  assert.equal(modalTarget, target, `${name}: Bar Loader target differs from active workout load`)
  assert.equal(barWeight, 45, `${name}: expected default 45 lb bar`)
  assert.equal(unit, 'lb', `${name}: expected lb Bar Loader unit`)
  const left = await modal.locator('.lmf-plate-stack.left [data-lmf-plate-value]').evaluateAll(nodes=>nodes.map(node=>Number(node.getAttribute('data-lmf-plate-value'))))
  const right = await modal.locator('.lmf-plate-stack.right [data-lmf-plate-value]').evaluateAll(nodes=>nodes.map(node=>Number(node.getAttribute('data-lmf-plate-value'))))
  const leftSum=left.reduce((a,b)=>a+b,0), rightSum=right.reduce((a,b)=>a+b,0)
  assert.equal(leftSum, expectedPerSide, `${name}: left plates per side do not make the resolved total`)
  assert.equal(rightSum, expectedPerSide, `${name}: right plates per side do not make the resolved total`)
  assert.equal(barWeight + 2*leftSum, target, `${name}: Bar Loader plate math does not equal target total`)
  const close = modal.locator('[data-lmf-bar-close="button"]')
  await close.click()
  return { cardText, visibleLoad, target:modalTarget, unit, barWeight, platesPerSide:left, platePerSideTotal:leftSum }
}

const context = await browser.newContext({ viewport:{width:412,height:915} })
const page = await context.newPage()
try {
  await qaPage(page)
  const seeded = await page.evaluate(async () => {
    const q=window.__LMF_MAINTENANCE_RUNTIME_QA__
    const athlete=await q.athlete.createLocalAthlete({displayName:'QA Maintenance Runtime',weightUnit:'lb'})
    await q.readiness.saveReadiness(athlete.id,{sleepQuality:4,soreness:2,stress:2,energy:4,sleepHours:8,notes:'Synthetic Maintenance load-resolution audit'})
    const device=await q.db.getOrCreateDeviceState('maintenance-runtime-audit')
    const ctx={athleteId:athlete.id,deviceId:device.deviceId}
    const db=await q.db.openLetMeFlyDb()
    try {
      const tx=db.transaction(['programInstances','workoutSessions','workoutSets'],'readwrite')
      const programs=await q.db.requestToPromise(tx.objectStore('programInstances').index('by-athlete-status').getAll([athlete.id,'active']))
      if(programs.length!==1) throw new Error('Expected one initial active Crownforge program')
      const base=programs[0]
      tx.objectStore('programInstances').put(q.mutations.prepareLocalMutation({...base,status:'completed',completed_on:'2026-01-01'},ctx,base))
      const maintenance=q.mutations.prepareLocalMutation({id:q.db.newId(),athlete_id:athlete.id,program_key:'crown-maintenance',program_name:'Crown Maintenance',program_version:'v2.1',status:'active',started_on:'2026-01-02',completed_on:null,current_phase_key:'maintenance',current_week:1,current_day_key:'day-1',progression_state:{syntheticMaintenanceRuntimeAudit:true}},ctx)
      tx.objectStore('programInstances').put(maintenance)
      const sourceSessionId=q.db.newId()
      const sourceSession=q.mutations.prepareLocalMutation({id:sourceSessionId,athlete_id:athlete.id,program_instance_id:base.id,readiness_id:null,originating_device_id:null,program_key:'crownforge',program_version:'v2.2',phase_key:'testing',week_number:14,day_key:'day-6',workout_name:'Synthetic verified Crownforge references',scheduled_for:null,started_at:'2026-01-01T10:00:00.000Z',completed_at:'2026-01-01T11:00:00.000Z',status:'completed',notes:'Synthetic audit source only'},ctx)
      tx.objectStore('workoutSessions').put(sourceSession)
      for (const [reference,value] of [['verified-front-squat-1rm',203],['verified-bench-press-1rm',187]]) {
        tx.objectStore('workoutSets').put(q.mutations.prepareLocalMutation({id:q.db.newId(),athlete_id:athlete.id,workout_session_id:sourceSessionId,workout_exercise_id:`qa-${reference}`,set_number:1,completed:true,completed_at:'2026-01-01T11:00:00.000Z',load_value:value,load_unit:'lb',reps:1,rpe:8,rir:null,performance_data:{loadReference:reference,syntheticAudit:true},notes:null},ctx))
      }
      await q.db.transactionDone(tx)
      return {athleteId:athlete.id,maintenanceId:maintenance.id}
    } finally { db.close() }
  })
  report.seeded = seeded

  await page.goto(`${origin}/#/train`,{waitUntil:'domcontentloaded',timeout:20000})
  await page.waitForFunction(()=>document.querySelector('main')&&!/Loading private athlete vault/i.test(document.body.innerText),null,{timeout:20000})
  await dismissInstall(page)
  await chooseReadiness(page)
  const start = page.getByRole('button',{name:/START WORKOUT|RESUME WORKOUT/i}).first()
  await start.waitFor({state:'visible',timeout:15000})
  await start.click()
  await page.waitForSelector('.active-exercise',{timeout:15000})

  const state=await snapshot(page)
  const session=(state.workoutSessions||[]).find(row=>row.athlete_id===seeded.athleteId&&row.program_key==='crown-maintenance'&&row.status==='in_progress')
  assert.ok(session,'Maintenance workout session did not start')
  const exercises=(state.workoutExercises||[]).filter(row=>row.workout_session_id===session.id)
  const sets=(state.workoutSets||[]).filter(row=>row.workout_session_id===session.id)
  const inspectPersisted=(name,reference,sourceValue,expectedLoad)=>{
    const ex=exercises.find(row=>row.exercise_name_snapshot===name)
    assert.ok(ex,`Missing ${name} workout exercise`)
    const rows=sets.filter(row=>row.workout_exercise_id===ex.id)
    assert.ok(rows.length>0,`Missing ${name} workout sets`)
    for(const row of rows){
      assert.equal(row.performance_data?.percentage,65,`${name}: percentage provenance missing`)
      assert.equal(row.performance_data?.loadReference,reference,`${name}: verified reference provenance missing`)
      assert.equal(row.performance_data?.resolvedTrainingMaxValue,sourceValue,`${name}: resolved source value mismatch`)
      assert.equal(row.load_value,expectedLoad,`${name}: resolved load did not round up to nearest 5`)
      assert.equal(row.load_unit,'lb',`${name}: resolved load unit mismatch`)
    }
    return rows.map(row=>({load:row.load_value,unit:row.load_unit,percentage:row.performance_data?.percentage,reference:row.performance_data?.loadReference,resolvedReference:row.performance_data?.resolvedTrainingMaxValue}))
  }
  const fsPersisted=inspectPersisted('Front Squat','verified-front-squat-1rm',203,135)
  const bpPersisted=inspectPersisted('Bench Press','verified-bench-press-1rm',187,125)
  report.checks.push('Maintenance 65% loads resolve from completed Crownforge verified references and round UP to nearest 5')

  report.frontSquat={ persisted:fsPersisted, ui:await auditBarLoader(page,'Front Squat',135,45) }
  report.benchPress={ persisted:bpPersisted, ui:await auditBarLoader(page,'Bench Press',125,40) }
  report.checks.push('Native Workout Mode load inputs use resolved programmed loads')
  report.checks.push('Bar Loader inherits current workout load, 45 lb bar, lb unit, and exact plates-per-side math')
  report.result='PASS'
  save()
  console.log('Maintenance runtime resolved-load + Bar Loader audit: PASS')
  console.log(JSON.stringify(report,null,2))
} catch (error) {
  report.result='FAIL';report.defects.push(String(error?.stack||error));save();throw error
} finally {
  await context.close().catch(()=>{})
  await browser.close().catch(()=>{})
  await new Promise(resolve=>server.close(resolve))
  fs.rmSync(runtime,{recursive:true,force:true})
}
