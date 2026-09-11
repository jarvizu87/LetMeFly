#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {applicationBootState} from './browser-boot-contract.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(root,'.build-src/letmefly_app')
const {chromium} = createRequire(path.join(app,'package.json'))('playwright-core')
const out = path.join(app,'DESKTOP_POLISH_AUDIT'); fs.mkdirSync(out,{recursive:true})
const report = {result:'RUNNING',passes:[],failures:[],observations:{}}
const check = (ok,label,detail) => {if(!ok)throw new Error(label+': '+JSON.stringify(detail)); report.passes.push({label,detail}); console.log('PASS '+label)}
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true})
const context = await browser.newContext({viewport:{width:1536,height:960},serviceWorkers:'block'})
await context.route('**/*',r=> new URL(r.request().url()).origin==='http://127.0.0.1:4173'?r.continue():r.abort('blockedbyclient'))
const page = await context.newPage(); page.setDefaultTimeout(10000)
async function dismiss() {
 for(let i=0;i<3;i++) {
  const b=page.locator('button').filter({hasText:/^\s*Not now\s*$/i}).first()
  if(await b.isVisible().catch(()=>false))await b.click()
  await page.waitForTimeout(120)
 }
}
async function domain() {
 return page.evaluate(async()=>{
  const names=(await indexedDB.databases()).map(x=>x.name).filter(Boolean)
  for(const name of names){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
   if(!db.objectStoreNames.contains('workoutSets')){db.close();continue}
   const stores=['workoutSessions','workoutExercises','workoutSets','syncOutbox']
   const tx=db.transaction(stores,'readonly')
   const data=await Promise.all(stores.map(s=>new Promise((resolve,reject)=>{const r=tx.objectStore(s).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})))
   db.close();return JSON.stringify(data)
  }throw new Error('Disposable workout DB absent')
 })
}
try {
 await page.goto('http://127.0.0.1:4173/')
 await page.waitForFunction(applicationBootState)
 await dismiss()
 await page.locator('#onboard-name').fill('Disposable Desktop Polish QA')
 await page.locator('[data-action="create-athlete"]').click()
 await page.waitForSelector('[data-action="create-athlete"]',{state:'detached'})
 await dismiss()
 await page.locator('nav [href="#/train"]').first().click()
 await page.waitForSelector('#swipe-viewport')
 await page.evaluate(()=>document.querySelectorAll('.readiness-field input[type="radio"][value="3"]').forEach(n=>{n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}))}))
 await dismiss()
 // Review has a second CTA in an inactive carousel page. Select the real active one.
 await page.locator('.swipe-page.active-page [data-action="start-workout"]').click()
 await page.waitForSelector('.active-exercise',{state:'attached'})
 for(const button of await page.locator('[data-session-step]').all()) {
  if(await page.locator('[data-lmf-desktop-v2-action="info"]').isVisible().catch(()=>false))break
  if(await button.isVisible())await button.click()
  await page.waitForTimeout(250)
 }
 await page.waitForSelector('[data-lmf-desktop-v2-action="info"]')
 await page.waitForTimeout(400)
 const view=await page.evaluate(()=>{
  const panel=document.querySelector('.lmf-desktop-context-panel-v2')
  const id=panel.querySelector('[data-source-exercise]').dataset.sourceExercise
  const card=[...document.querySelectorAll('.active-exercise')].find(c=>c.dataset.exerciseId===id)
  const art=card.querySelector('.lmf-exercise-media')
  return {id,name:card.querySelector('.exercise-title h3').textContent,artHeight:art?.getBoundingClientRect().height,tools:[...panel.querySelectorAll('[data-lmf-desktop-v2-action]')].map(b=>b.textContent),fixed:getComputedStyle(document.querySelector('.navbar')).position,overflow:document.documentElement.scrollWidth-innerWidth}
 })
 report.observations.view=view
 check(view.fixed==='fixed','Preserves current fixed desktop navigation',view.fixed)
 check(view.artHeight>=120 && view.artHeight<=195,'Compact existing artwork',view.artHeight)
 check(view.overflow<=3,'No desktop overflow',view.overflow)
 check(['WATCH EXERCISE','EXERCISE INFO','SUBSTITUTE','ASK COACH'].every(s=>view.tools.some(t=>t.includes(s))),'All four governed tools visible',view.tools)
 const card=page.locator(`[data-exercise-id="${view.id}"]`)
 const row=card.locator('.set-row.lmf-set-active').first()
 await row.locator('.load-input').fill('115')
 await page.waitForFunction(()=>document.querySelector('[data-lmf-desktop-v2-load]')?.textContent==='115 lb')
 check(true,'Rail follows native working-load input without a second editor')
 const before=await domain()
 await card.locator('[data-exercise-info]').evaluate(n=>n.addEventListener('click',()=>{window.__QA_INFO_FORWARDS=(window.__QA_INFO_FORWARDS||0)+1}))
 await page.locator('[data-lmf-desktop-v2-action="info"]').click()
 await page.waitForFunction(()=>window.__QA_INFO_FORWARDS===1)
 check(true,'Info action forwards exactly once to native exercise control')
 await page.locator('[data-lmf-intel-close]').first().click()
 await page.waitForSelector('#lmf-exercise-intelligence-modal',{state:'detached'})
 // Disabled native controls must be mirrored, not bypassed by a second enabled button.
 await card.locator('[data-substitute]').evaluate(n=>{n.disabled=true;n.setAttribute('aria-disabled','true')})
 await page.waitForFunction(()=>document.querySelector('[data-lmf-desktop-v2-action="substitute"]')?.disabled===true)
 check(true,'Rail mirrors native disabled substitution controls')
 await card.locator('[data-substitute]').evaluate(n=>{n.disabled=false;n.removeAttribute('aria-disabled')})
 await page.setViewportSize({width:412,height:915})
 await page.waitForFunction(()=>!document.querySelector('.lmf-desktop-context-panel-v2') && !document.querySelector('[data-lmf-desktop-workspace]'))
 check(true,'Same-session resize fully restores mobile workspace')
 await page.setViewportSize({width:1536,height:960})
 await page.waitForSelector('[data-lmf-desktop-v2-action="info"]')
 check(await domain()===before,'Presentation/tools/resize do not alter saved workout or outbox')
 await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true})
 report.result='PASS'
} catch(error) {report.result='FAIL'; report.failures.push({message:error.message,stack:error.stack});console.error(error)}
finally {await page.screenshot({path:path.join(out,'final.png'),fullPage:true}).catch(()=>{});await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')}
if(report.result!=='PASS')process.exitCode=1
