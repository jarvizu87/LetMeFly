import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '..'), app = path.join(root, '.build-src/letmefly_app')
const { chromium } = createRequire(path.join(app, 'package.json'))('playwright-core')
const out = path.join(app, 'EXERCISE_ART_AUDIT'); fs.mkdirSync(out, { recursive: true })
const base = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const report = { result: 'PASS', checks: [] }
const policy = fs.readFileSync(path.join(root,'netlify.toml'),'utf8').match(/Content-Security-Policy = "([^"]+)"/)[1]
async function enforcePolicy(context) {
  await context.route(`${base}/**`,async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}})})
  await context.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push(event.violatedDirective))})
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002'
const rowId = '10000000-0000-4000-8000-000000000001'
const asset = publicId => ({ publicId, format: 'webp', status: 'approved' })
const envelope = (id, overrides) => ({ format:'letmefly-private-exercise-art-map',formatVersion:2,athleteId:id,overrides })
const row = (athleteId,key,parts=1) => ({id:rowId,athlete_id:athleteId,exercise_key:key,status:'approved',is_active:true,deleted_at:null,metadata:{delivery:{kind:'supabase-private',bucket:'athlete-exercise-art',parts:Array.from({length:parts},(_,i)=>({path:`${athleteId}/${String(i+1).repeat(64)}.webp`,label:i?'Bench ramp sets':'Front squat'}))}}})
try {
  if (!process.env.LMF_SKIP_NATIVE_ART_BRIDGE) {
    const context = await browser.newContext({ serviceWorkers:'block' }), page = await context.newPage()
    await enforcePolicy(context)
    await page.goto(base)
    await page.waitForFunction(() => window.LetMeFlyExerciseArt?.version === 2)
    assert.deepEqual(await page.evaluate(() => window.LetMeFlyExerciseArt.context()), { athleteId:null })
    assert.deepEqual(await page.evaluate(() => window.LetMeFlyExerciseArt.readCloud('foreign')), [])
    assert.equal(await page.evaluate(() => window.LetMeFlyExerciseArt.readAsset('foreign','squat','unknown','foreign/file.webp')),null)
    report.checks.push('Compiled native private-byte bridge rejects absent/foreign athlete and unissued assets')
    await context.close()
  }
  for (const width of [412,1440]) {
    const context = await browser.newContext({ viewport:{width,height:900},serviceWorkers:'block' })
    await enforcePolicy(context)
    const page = await context.newPage(), errors = [], external = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if(/^https?:/.test(request.url())&&!request.url().startsWith(base))external.push(request.url()) })
    await context.route('**/art-fixture', route => route.fulfill({contentType:'text/html',headers:{'content-security-policy':policy},body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/private-art-audit.css"><style>body{margin:12px;background:#090b10;color:white}.library-thumb{display:block;width:140px;height:160px}.lmf-exercise-media{position:relative;width:360px;height:360px;max-width:100%;background-image:var(--exercise-art);background-size:contain;background-repeat:no-repeat}.exercise-card{max-width:360px}h3{font-family:system-ui}</style></head><body><h3>Authenticated private artwork</h3><div id="tile" class="library-thumb" data-exercise-art="squat"></div><div class="exercise-stack"><div id="preview" class="exercise-card" data-exercise-art="squat"></div><div class="exercise-card"><div id="media" class="lmf-exercise-media" data-exercise-art="squat"></div></div></div></body></html>'}))
    await context.route('**/ui/private-art-audit.css',route=>route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(root,'overlays/ui-command-v2/batch-n/exercise-art-cloudinary.css'),'utf8')}))
    await page.goto(`${base}/art-fixture`)
    await page.evaluate(async ({ a, b, legacy }) => {
      const db = await new Promise((resolve,reject) => { const r=indexedDB.open('letmefly-private',1);r.onupgradeneeded=()=>{for(const name of ['athletes','meta','workoutSets','outbox'])r.result.createObjectStore(name,{keyPath:name==='meta'?'key':'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error) })
      await new Promise(resolve => {const tx=db.transaction(['athletes','meta','workoutSets','outbox'],'readwrite');tx.objectStore('athletes').put({id:a,display_name:'QA Athlete A'});tx.objectStore('athletes').put({id:b,display_name:'QA Athlete B',deleted_at:'2026-01-01'});tx.objectStore('meta').put({key:`privateExerciseArtMap:${a}`,value:legacy});tx.objectStore('meta').put({key:'privateExerciseArtPrefix',value:'legacy/unscoped'});tx.objectStore('workoutSets').put({id:'saved',actual_reps:5});tx.objectStore('outbox').put({id:'pending',payload:'unchanged'});tx.oncomplete=resolve});db.close()
      window.currentAthlete=a;window.cloudRows=[];window.downloads=[];window.revoked=[];window.created=[];window.waiting=[]
      const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL)
      URL.createObjectURL=blob=>{const url=create(blob);window.created.push(url);return url};URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url)}
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1280;const ctx=canvas.getContext('2d');ctx.fillStyle='#9c1830';ctx.fillRect(0,0,1280,1280)
      window.goodBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp'))
      canvas.width=canvas.height=100;window.lowBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp'))
      window.LetMeFlyExerciseArt={version:2,context:async()=>({athleteId:window.currentAthlete}),readCloud:async()=>window.cloudRows,readAsset:async(id,key,rowId,path)=>{window.downloads.push({id,key,rowId,path});if(window.hold)await new Promise(resolve=>window.waiting.push(resolve));if(window.missingThird&&path.endsWith('3'.repeat(64)+'.webp'))return null;return window.lowQuality?window.lowBlob:window.goodBlob}}
      window.snapshot=async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result)});const data=await new Promise(resolve=>{const names=[...db.objectStoreNames],tx=db.transaction(names,'readonly'),data={};for(const name of names)tx.objectStore(name).getAll().onsuccess=e=>data[name]=e.target.result;tx.oncomplete=()=>resolve(data)});db.close();return data}
    },{a,b,legacy:envelope(a,{squat:asset('qa/legacy/squat')})})
    const before=await page.evaluate(()=>window.snapshot())
    await page.addScriptTag({url:`${base}/ui/exercise-art-auto.js`})
    await page.addScriptTag({url:`${base}/ui/exercise-art-cloudinary.js`})
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(()=>window.downloads.length),0)
    assert.equal(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art')),'')
    const setRows=async(rows,key='squat')=>page.evaluate(({rows,key})=>{window.cloudRows=rows;document.querySelectorAll('[data-exercise-art]').forEach(el=>el.dataset.exerciseArt=key);window.dispatchEvent(new Event('lmf:exercise-art-overrides-updated'))},{rows,key})
    const applied=()=>page.waitForFunction(()=>document.querySelector('#tile').style.getPropertyValue('--exercise-art').includes('blob:'))
    await setRows([row(a,'squat')]);await applied()
    assert.equal(await page.evaluate(()=>window.downloads.length),1,'repeated DOM tiles share the exact asset download')
    await page.evaluate(()=>{window.hold=true;window.dispatchEvent(new Event('lmf:exercise-art-context-changed'))})
    await page.waitForFunction(()=>window.waiting.length===1)
    await page.evaluate(({b})=>{window.currentAthlete=b;window.cloudRows=[];window.dispatchEvent(new Event('lmf:exercise-art-context-changed'));window.waiting.splice(0).forEach(resolve=>resolve());window.hold=false},{b})
    await page.waitForTimeout(100)
    assert.equal(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art')),'')
    assert.equal(await page.evaluate(()=>window.created.every(url=>window.revoked.includes(url))),true)
    await setRows([row(a,'squat'),row(b,'squat'),{...row(b,'squat'),id:a}])
    await page.waitForTimeout(100)
    assert.equal(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art')),'')
    await setRows([row(b,'squat')]);await applied()
    const oldURL=await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art'))
    await page.evaluate(()=>window.lowQuality=true);await setRows([row(b,'bench')],'bench')
    await page.waitForFunction(()=>window.created.every(url=>window.revoked.includes(url)))
    assert.equal(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art')),'')
    await page.evaluate(()=>window.lowQuality=false)
    await setRows([row(b,'front-squat-plus-bench-ramp-sets',2)],'front-squat-plus-bench-ramp-sets')
    await page.locator('#media > .lmf-art-pair').waitFor()
    assert.deepEqual(await page.locator('#media .lmf-art-part > span').allTextContents(),['1. Front squat','2. Bench ramp sets'])
    assert.equal(await page.locator('#media .lmf-art-part-image').count(),2)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    assert.ok(!(await page.locator('#tile').evaluate(el=>el.style.getPropertyValue('--exercise-art'))).includes(oldURL))
    await page.screenshot({path:path.join(out,`private-components-${width}.png`),fullPage:true})
    await page.locator('#preview > .lmf-art-pair').waitFor()
    await page.evaluate(()=>{const parent=document.querySelector('#preview'),media=document.createElement('div');media.className='lmf-exercise-media';media.dataset.exerciseArt=parent.dataset.exerciseArt;parent.prepend(media)})
    await page.locator('#preview > .lmf-exercise-media > .lmf-art-pair').waitFor()
    assert.equal(await page.locator('#preview > .lmf-art-pair').count(),0,'late native media insertion must not duplicate the compound pair')
    for(const [key,labels] of [
      ['bike-row-walk',['Bike','Row','Walk']],
      ['walk-bike-or-elliptical',['Walk','Bike','Elliptical']],
      ['bike-row-or-elliptical',['Bike','Row','Elliptical']],
    ]) {
      const triple=row(b,key,3)
      triple.metadata.delivery.parts.forEach((part,index)=>part.label=labels[index])
      await setRows([triple],key)
      await page.waitForFunction(()=>document.querySelector('#media')?.dataset.exerciseArtParts==='3')
      assert.deepEqual(await page.locator('#media .lmf-art-part > span').allTextContents(),labels)
      assert.deepEqual(await page.locator('#tile .lmf-art-part-image').evaluateAll(images=>images.map(image=>image.getAttribute('aria-label'))),labels)
      assert.equal(await page.locator('#media .lmf-art-part-image').count(),3)
      assert.equal(await page.locator('#preview > .lmf-art-pair').count(),0,'native media owns the entire triple')
      assert.equal(await page.locator('#tile .lmf-art-part > span').evaluateAll(labels=>labels.every(label=>label.scrollWidth<=label.clientWidth&&label.scrollHeight<=label.clientHeight)),true,'all three compact option names fit')
      assert.equal(await page.locator('#media .lmf-art-part-image').evaluateAll(images=>images.every(image=>{const box=image.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(image).backgroundImage.includes('blob:')})),true,'all three images are visible')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.screenshot({path:path.join(out,`${key}-${width}.png`),fullPage:true})
    }
    await page.evaluate(()=>window.missingThird=true)
    await setRows([row(b,'bike-row-walk',3)],'bike-row-walk')
    await page.waitForFunction(()=>window.created.every(url=>window.revoked.includes(url)))
    assert.equal(await page.locator('.lmf-art-pair').count(),0,'one unavailable alternative must not render an incomplete card')
    await page.evaluate(()=>window.missingThird=false)
    await setRows([row(b,'bike-row-walk',3)],'bike-row-walk')
    await page.waitForFunction(()=>document.querySelector('#media')?.dataset.exerciseArtParts==='3')
    await page.evaluate(()=>{window.currentAthlete=null;window.cloudRows=[];window.dispatchEvent(new Event('lmf:exercise-art-context-changed'))})
    await page.waitForTimeout(80)
    assert.equal(await page.locator('.lmf-art-pair').count(),0)
    assert.equal(await page.evaluate(()=>window.created.every(url=>window.revoked.includes(url))),true)
    const after=await page.evaluate(()=>window.snapshot());assert.deepEqual(after,before)
    assert.deepEqual(external,[],'private art must never request public or external image URLs')
    assert.deepEqual(await page.evaluate(()=>window.cspViolations),[],'private image decoding must comply with the production CSP')
    report.checks.push(`${width}px: legacy maps inactive; authenticated blob images; deduped tile reads; stale download/athlete switch; foreign/duplicate rejection; quality fallback; paired components and all three cardio option sets; compact label fit; atomic fallback on missing third image; logout revocation; no public requests or runtime writes`)
    await page.evaluate(async({a,b})=>{const db=await new Promise(resolve=>{const r=indexedDB.open('letmefly-private');r.onsuccess=()=>resolve(r.result)});await new Promise(resolve=>{const tx=db.transaction('athletes','readwrite');tx.objectStore('athletes').put({id:a,display_name:'QA Athlete A',deleted_at:'2026-01-01'});tx.objectStore('athletes').put({id:b,display_name:'QA Athlete B'});tx.oncomplete=resolve});db.close()},{a,b})
    await page.goto(`${base}/exercise-art-import.html`)
    await page.getByRole('heading',{name:'For QA Athlete B'}).waitFor()
    const map=envelope(b,{bench:asset('qa/reviewed/bench')})
    await page.locator('#paste').fill(JSON.stringify(map));await page.locator('#review').click();await page.locator('#preview').waitFor({state:'visible'})
    assert.equal(await page.locator('#save').isDisabled(),true)
    await page.locator('#confirm').check();await page.locator('#save').click();await page.getByText('Legacy map saved for this athlete. Private images require an approved cloud library.',{exact:true}).waitFor()
    await page.locator('#paste').fill(JSON.stringify(envelope(a,{bench:asset('qa/foreign/bench')})));await page.locator('#review').click();await page.getByText('This map belongs to a different athlete.',{exact:true}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    assert.deepEqual(errors,[])
    assert.deepEqual(await page.evaluate(()=>window.cspViolations),[],'legacy import must comply with the production CSP')
    report.checks.push(`${width}px: legacy import explains private delivery; explicit review/confirmation; foreign map rejected`)
    await context.close()
  }
} catch(error) { report.result='FAIL';report.error=error.stack;process.exitCode=1 }
finally { await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2)) }
