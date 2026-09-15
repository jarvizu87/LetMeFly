import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {applicationBootState} from './browser-boot-contract.mjs'

const app = path.resolve('.build-src/letmefly_app')
const out = path.join(app, 'TRAIN_HERO_DAY4_BROWSER_AUDIT')
fs.mkdirSync(out, {recursive:true})
const {chromium} = createRequire(path.join(app, 'package.json'))('playwright-core')
const origin = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox']})
const report = {checks:[], errors:[]}

const snapshotHero = page => page.evaluate(() => {
  const shell = document.querySelector('.train-shell')
  const art = shell?.querySelector('.lmf-reference-train-art')
  const image = art?.querySelector('img')
  const selectedDay = shell?.querySelector('.day-strip .day-chip.active, .day-strip .day-chip[aria-current="true"], .day-strip .day-chip[aria-selected="true"], .day-strip .day-chip.is-active, .day-strip .day-chip[data-active="true"]')
  const clean = value => String(value ?? '').replace(/\s+/g,' ').trim()
  const texts = nodes => [...nodes].map(node => clean(node.textContent)).filter(Boolean)
  const header = shell?.querySelector('.train-header')
  const descriptor = {
    titles:[clean(selectedDay?.textContent),clean(header?.querySelector('.page-kicker')?.textContent),clean(header?.querySelector('h1')?.textContent),clean(header?.querySelector('h2')?.textContent)].filter(Boolean),
    blocks:texts(shell?.querySelectorAll('#swipe-viewport .workout-panel-head h2, #swipe-viewport .workout-panel-head .muted') || []),
    exercises:texts(shell?.querySelectorAll('#swipe-viewport .exercise-title h3, #swipe-viewport .preview-card h3, #swipe-viewport .active-exercise h3') || []),
  }
  const api = window.__LMF_TRAIN_HERO_V1__
  return {
    selectedDay: selectedDay?.getAttribute('data-day') || null,
    actualKey: shell?.dataset.lmfTrainHeroKey || art?.dataset.lmfTrainHeroKey || null,
    pack: shell?.dataset.lmfTrainHeroPack || art?.dataset.lmfTrainHeroPack || null,
    src: image?.getAttribute('src') || null,
    naturalWidth:image?.naturalWidth || 0,
    naturalHeight:image?.naturalHeight || 0,
    expectedKey:api?.selectKey?.(descriptor) || null,
    descriptor,
    apiKeys:api ? Object.keys(api.heroes) : [],
  }
})

try {
  for (const width of [412,1440]) {
    const context = await browser.newContext({viewport:{width,height:950},locale:'en-US',serviceWorkers:'block'})
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const page = await context.newPage()
    page.setDefaultTimeout(25000)
    page.on('pageerror', error => report.errors.push({width,error:error.message}))

    await page.goto(origin+'/#/home')
    await page.waitForFunction(applicationBootState)
    await page.locator('#onboard-name').fill(`Disposable Train Hero ${width}`)
    await page.locator('#onboard-unit').selectOption('kg')
    await page.locator('[data-action="create-athlete"]').click()
    await page.locator('[data-action="create-athlete"]').waitFor({state:'detached'})
    const dismiss = page.getByRole('button',{name:'Dismiss install prompt',exact:true})
    try {
      await dismiss.waitFor({state:'visible',timeout:2500})
      await dismiss.evaluate(button => button.click())
    } catch {}

    await page.locator('[data-lmf-start]').waitFor({state:'visible'})
    await page.locator('[data-lmf-start]').click()
    await page.locator('.lmf-reference-train-hero').waitFor({state:'visible'})
    await page.waitForFunction(() => window.__LMF_TRAIN_HERO_V1__?.packId === 'train-heroes-v1' && document.querySelector('.train-shell')?.dataset.lmfTrainHeroKey)
    await page.waitForFunction(() => document.querySelector('.lmf-reference-train-art img')?.naturalWidth > 0)

    const day1 = await snapshotHero(page)
    assert.equal(day1.pack,'train-heroes-v1','Day 1 uses locked Train Hero Pack V1')
    assert.equal(day1.actualKey,day1.expectedKey,'Day 1 hero matches deterministic workout emphasis')
    assert.equal(day1.apiKeys.length,9,'Runtime exposes exactly nine locked hero keys')
    assert.ok(day1.src?.startsWith('/ui/train-heroes-v1/train-hero-v1-'),'Day 1 hero is served from locked local pack')
    assert.equal(day1.src?.includes('/ui/train-lifter.webp'),false,'Day 1 never falls back to retired single squat hero')
    assert.ok(day1.naturalWidth>0 && day1.naturalHeight>0,'Day 1 hero decodes')

    const day4Chip = page.locator('.day-strip .day-chip[data-day="4"]')
    assert.equal(await day4Chip.count(),1,'Day 4 is present in governed day strip')
    await day4Chip.click()
    await page.waitForFunction(() => {
      const chip=document.querySelector('.day-strip .day-chip[data-day="4"]')
      return chip && (chip.classList.contains('active') || chip.classList.contains('is-active') || chip.getAttribute('aria-current')==='true' || chip.getAttribute('aria-selected')==='true' || chip.dataset.active==='true')
    })
    await page.waitForFunction(() => {
      const shell=document.querySelector('.train-shell')
      const img=document.querySelector('.lmf-reference-train-art img')
      return shell?.dataset.lmfTrainHeroKey && img?.getAttribute('src')?.startsWith('/ui/train-heroes-v1/') && img.naturalWidth>0
    })

    const day4 = await snapshotHero(page)
    assert.equal(day4.selectedDay,'4','Hero descriptor follows selected Day 4')
    assert.equal(day4.pack,'train-heroes-v1','Day 4 uses locked Train Hero Pack V1')
    assert.equal(day4.actualKey,day4.expectedKey,'Day 4 hero recomputes from the actual rendered workout emphasis')
    assert.ok(day4.apiKeys.includes(day4.actualKey),'Day 4 hero key belongs to locked nine-image set')
    assert.ok(day4.src?.startsWith('/ui/train-heroes-v1/train-hero-v1-'),'Day 4 hero is served from locked local pack')
    assert.equal(day4.src?.includes('/ui/train-lifter.webp'),false,'Day 4 never uses retired single squat hero')
    assert.ok(day4.naturalWidth>0 && day4.naturalHeight>0,'Day 4 hero decodes')
    if (day1.expectedKey !== day4.expectedKey) {
      assert.notEqual(day1.actualKey,day4.actualKey,'Different Day 1/Day 4 emphasis changes hero key')
      assert.notEqual(day1.src,day4.src,'Different Day 1/Day 4 emphasis changes hero image')
    }

    await page.locator('#session-track [data-session-index="1"]').click()
    await page.locator('.active-page .lmf-reference-preview-active').waitFor({state:'visible'})
    const day4Cards = page.locator('.active-page .preview-card')
    assert.ok(await day4Cards.count()>=1,'Day 4 renders full future-preview cards')
    assert.equal(await page.locator('.active-page [data-action="toggle-set"], .active-page .set-input').count(),0,'Day 4 future preview remains read-only')
    assert.ok(await page.locator('.active-page .lmf-reference-preview-active .prescription-block > .prescription-row').count()>0,'Day 4 preserves governed prescriptions')
    assert.equal(await day4Cards.first().evaluate(card => getComputedStyle(card,'::before').display),'none','Day 4 uses approved card treatment without retired square art panel')

    if(width>=1100) {
      assert.equal(await page.locator('[data-lmf-desktop-workspace], .lmf-desktop-flow-panel, .lmf-desktop-context-panel, [data-lmf-desktop-exercise-index], [data-lmf-desktop-v2-action]').count(),0,'Retired three-column desktop Train workspace remains absent on Day 4')
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),'Train has no page-level horizontal overflow')

    await page.screenshot({path:path.join(out,`day4-${width}.png`),fullPage:true})
    report.checks.push({width,result:'PASS',day1,day4})
    await context.close()
  }

  assert.deepEqual(report.errors,[],'No browser page errors occurred')
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2))
  console.log('TRAIN_HERO_DAY4_BROWSER_V1_PASS')
  for (const check of report.checks) console.log(`width=${check.width} day1=${check.day1.actualKey} day4=${check.day4.actualKey}`)
} catch (error) {
  report.failure={message:error.message,stack:error.stack}
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2))
  throw error
} finally {
  await browser.close()
}
