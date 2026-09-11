import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '..'), app = path.join(root, '.build-src/letmefly_app')
const { chromium } = createRequire(path.join(app, 'package.json'))('playwright-core')
const out = path.join(app, 'EXERCISE_ART_AUDIT'); fs.mkdirSync(out, { recursive: true })
const base = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const report = { result: 'PASS', checks: [] }
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const asset = publicId => ({ publicId, format: 'webp', status: 'approved' })
const envelope = (id, overrides) => ({ format: 'letmefly-private-exercise-art-map', formatVersion: 2, athleteId: id, overrides })
try {
  if (!process.env.LMF_SKIP_NATIVE_ART_BRIDGE) {
    const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage()
    await page.goto(base)
    await page.waitForFunction(() => window.LetMeFlyExerciseArt?.version === 1)
    assert.deepEqual(await page.evaluate(() => window.LetMeFlyExerciseArt.context()), { athleteId: null })
    assert.deepEqual(await page.evaluate(() => window.LetMeFlyExerciseArt.readCloud('foreign')), [])
    report.checks.push('Compiled native bridge uses no athlete fallback when no active athlete exists')
    await context.close()
  }
  for (const width of [412,1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' })
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message))
    await context.route('**/art-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="tile" data-exercise-art="squat"></div></body></html>' }))
    await page.goto(`${base}/art-fixture`)
    await page.evaluate(async ({ a, b }) => {
      const db = await new Promise((resolve,reject) => { const r=indexedDB.open('letmefly-private',1);r.onupgradeneeded=()=>{for(const name of ['athletes','meta','workoutSets','outbox'])r.result.createObjectStore(name,{keyPath:name==='meta'?'key':'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error) })
      await new Promise(resolve => { const tx=db.transaction(['athletes','meta','workoutSets','outbox'],'readwrite');tx.objectStore('athletes').put({id:'qa-a',display_name:'QA Athlete A'});tx.objectStore('athletes').put({id:'qa-b',display_name:'QA Athlete B',deleted_at:'2026-01-01'});tx.objectStore('meta').put({key:'privateExerciseArtMap:qa-a',value:a});tx.objectStore('meta').put({key:'privateExerciseArtMap:qa-b',value:b});tx.objectStore('meta').put({key:'privateExerciseArtPrefix',value:'legacy/unscoped'});tx.objectStore('workoutSets').put({id:'saved',actual_reps:5});tx.objectStore('outbox').put({id:'pending',payload:'unchanged'});tx.oncomplete=resolve });db.close()
      window.currentAthlete='qa-a';window.cloudRows=[];window.probes=[]
      window.Image=class {naturalWidth=1254;naturalHeight=1254;set src(value){this.url=value;if(value)window.probes.push({image:this,url:value,load:this.onload,error:this.onerror})}}
      window.LetMeFlyExerciseArt={version:1,context:async()=>({athleteId:window.currentAthlete}),readCloud:async()=>window.cloudRows}
      window.snapshot = async () => { const db=await new Promise(resolve=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result)});const data=await new Promise(resolve=>{const names=[...db.objectStoreNames],tx=db.transaction(names,'readonly'),data={};for(const name of names)tx.objectStore(name).getAll().onsuccess=e=>data[name]=e.target.result;tx.oncomplete=()=>resolve(data)});db.close();return data }
    }, {a:envelope('qa-a',{squat:asset('qa/a/squat')}),b:envelope('qa-b',{squat:asset('qa/b/squat')})})
    const before=await page.evaluate(()=>window.snapshot())
    await page.addScriptTag({url:`${base}/ui/exercise-art-auto.js`})
    await page.addScriptTag({url:`${base}/ui/exercise-art-cloudinary.js`})
    await page.waitForFunction(()=>window.probes.length>=1)
    await page.evaluate(()=>window.probes.at(-1).load())
    await page.waitForFunction(()=>document.querySelector('#tile').style.getPropertyValue('--exercise-art').includes('qa/a/squat'))
    // Hold a callback from the old athlete, then change the actual local selection.
    await page.evaluate(async()=>{
      window.oldProbe=window.probes.at(-1)
      const db=await new Promise(resolve=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result)})
      await new Promise(resolve=>{const tx=db.transaction('athletes','readwrite');tx.objectStore('athletes').put({id:'qa-a',display_name:'QA Athlete A',deleted_at:'2026-01-01'});tx.objectStore('athletes').put({id:'qa-b',display_name:'QA Athlete B'});tx.oncomplete=resolve});db.close()
      window.currentAthlete='qa-b';window.dispatchEvent(new Event('lmf:exercise-art-context-changed'));window.oldProbe.load()
    })
    assert.equal(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art')),'')
    await page.waitForFunction(()=>window.probes.at(-1).url.includes('qa/b/squat'))
    await page.waitForTimeout(120)
    await page.evaluate(()=>window.probes.at(-1).load())
    await page.waitForFunction(()=>document.querySelector('#tile').style.getPropertyValue('--exercise-art').includes('qa/b/squat'))
    await page.locator('#tile').evaluate(el=>el.dataset.exerciseArt='front-squat-plus-bench-ramp-sets')
    await page.waitForFunction(()=>!document.querySelector('#tile').style.getPropertyValue('--exercise-art'))
    assert.ok(!(await page.evaluate(()=>window.probes.map(p=>p.url))).some(url=>url.includes('legacy')||url.includes('/jp/')))
    // An approved cloud row must match athlete, active status, and unique exact key.
    await page.evaluate(()=>{window.cloudRows=[{athlete_id:'qa-other',exercise_key:'bench',cloudinary_public_id:'qa/foreign',status:'approved',is_active:true,asset_format:'webp'},...['one','two'].map(x=>({athlete_id:'qa-b',exercise_key:'bench',cloudinary_public_id:`qa/${x}`,status:'approved',is_active:true,asset_format:'webp'}))];document.querySelector('#tile').dataset.exerciseArt='bench';window.dispatchEvent(new Event('lmf:exercise-art-overrides-updated'))})
    await page.waitForTimeout(200)
    assert.equal(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art')),'')
    await page.evaluate(()=>{window.cloudRows=[{athlete_id:'qa-b',exercise_key:'bench',cloudinary_public_id:'qa/cloud/bench',status:'approved',is_active:true,asset_format:'webp'}];window.dispatchEvent(new Event('lmf:exercise-art-overrides-updated'))})
    await page.waitForFunction(()=>window.probes.at(-1).url.includes('qa/cloud/bench'))
    await page.evaluate(()=>window.probes.at(-1).load())
    await page.waitForFunction(()=>document.querySelector('#tile').style.getPropertyValue('--exercise-art').includes('qa/cloud/bench'))
    await page.evaluate(()=>{window.oldProbe=window.probes.at(-1);window.cloudRows=[];window.dispatchEvent(new Event('lmf:exercise-art-context-changed'));window.oldProbe.load()})
    await page.waitForTimeout(150)
    assert.equal(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art')),'')
    const after=await page.evaluate(()=>window.snapshot())
    for(const key of ['meta','workoutSets','outbox'])assert.deepEqual(after[key],before[key])
    report.checks.push(`${width}px: scoped local art; athlete switch and stale callbacks; reused/compound key fallback; no global convention; foreign/duplicate cloud rows; logout cleanup; no runtime writes`)
    await page.goto(`${base}/exercise-art-import.html`)
    await page.getByRole('heading',{name:'For QA Athlete B'}).waitFor()
    const map=envelope('qa-b',{bench:asset('qa/reviewed/bench')})
    await page.locator('#paste').fill(JSON.stringify(map));await page.locator('#review').click();await page.locator('#preview').waitFor({state:'visible'})
    assert.equal(await page.locator('#save').isDisabled(),true)
    await page.locator('#confirm').check();await page.locator('#save').click();await page.getByText('Exercise art saved for this athlete. Return to LetMeFly to see it.',{exact:true}).waitFor()
    const dbState=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result)});const value=await new Promise(resolve=>{const r=db.transaction('meta','readonly').objectStore('meta').get('privateExerciseArtMap:qa-b');r.onsuccess=()=>resolve(r.result.value)});db.close();return value})
    assert.deepEqual(dbState,map)
    await page.locator('#paste').fill(JSON.stringify(envelope('qa-a',{bench:asset('qa/foreign/bench')})));await page.locator('#review').click();await page.getByText('This map belongs to a different athlete.',{exact:true}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.screenshot({path:path.join(out,`import-${width}.png`),fullPage:true})
    assert.deepEqual(errors,[])
    report.checks.push(`${width}px: review and explicit confirmation; athlete-bound atomic import; foreign map rejection; no horizontal overflow`)
    await context.close()
  }
} catch(error) { report.result='FAIL';report.error=error.stack;process.exitCode=1 }
finally { await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2)) }
