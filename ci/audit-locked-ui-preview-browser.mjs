import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {applicationBootState} from './browser-boot-contract.mjs'

const app = path.resolve('.build-src/letmefly_app')
const out = path.join(app, 'LOCKED_UI_PREVIEW_AUDIT')
fs.mkdirSync(out, {recursive:true})
const {chromium} = createRequire(path.join(app, 'package.json'))('playwright-core')
const origin = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox']})
const report = {checks:[], errors:[]}
const screens = [
  ['program', '.lmf-reference-program-hero', 'program'],
  ['progress', '.lmf-approved-progress-head-v1', 'progress'],
  ['exercises', '.lmf-approved-exercises-hero-v1', 'exercises'],
  ['coach', '.lmf-coach-workspace .coach-banner', 'coach'],
  ['profile', '.lmf-profile-character-visual-v1', 'profile'],
  ['more', '.lmf-more-brand-v1', 'more'],
]
try {
  for (const width of [412, 1440]) {
    const context = await browser.newContext({viewport:{width,height:950}, locale:'en-US', serviceWorkers:'block'})
    await context.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort())
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    page.on('pageerror', e => report.errors.push(e.message))
    await page.goto(origin+'/#/home')
    await page.waitForFunction(applicationBootState)
    await page.locator('#onboard-name').fill('Disposable locked UI preview')
    await page.locator('#onboard-unit').selectOption('kg')
    await page.locator('[data-action="create-athlete"]').click()
    await page.locator('[data-action="create-athlete"]').waitFor({state:'detached'})
    const dismiss = page.getByRole('button', {name:'Dismiss install prompt',exact:true})
    await dismiss.waitFor({state:'visible',timeout:5000}).catch(()=>{})
    if (await dismiss.isVisible()) await dismiss.click()

    // An SVG may load successfully even when its embedded raster is corrupt.
    // Decode the actual delivered JPEG, not only the outer SVG element.
    const response = await page.request.get(origin+'/ui/raizen-black-crown-ascension-v1.svg?v=2')
    assert.equal(response.status(), 200)
    const payload = (await response.text()).match(/href="(data:image\/jpeg;base64,[^"]+)"/)?.[1]
    assert.ok(payload, 'Preview delivers the self-contained approved original')
    const decoded = await page.evaluate(async src => {
      const image = new Image()
      image.src = src
      await image.decode()
      return [image.naturalWidth,image.naturalHeight]
    }, payload)
    assert.deepEqual(decoded, [1229,1536])

    for (const [route,selector,scene] of screens) {
      await page.goto(origin+'/#/'+route)
      await page.waitForFunction(r => document.documentElement.dataset.lmfApprovedRoute === r, route)
      await page.locator(selector).waitFor({state:'visible'})
      const expectedScene=scene==='progress'&&width<768?'progress-mobile':scene
      await page.waitForFunction(([selector,scene]) => getComputedStyle(document.querySelector(selector)).backgroundImage.includes(`/ui/mockup-scenes/${scene}.svg`), [selector,expectedScene])
      const sceneResponse=await page.request.get(origin+`/ui/mockup-scenes/${expectedScene}.svg`)
      assert.equal(sceneResponse.status(),200)
      const sceneImage=(await sceneResponse.text()).match(/href="(data:image\/png;base64,[^"]+)"/)?.[1]
      assert.ok(sceneImage,'Original scene raster is embedded')
      await page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode()},sceneImage)
      const geometry = await page.evaluate(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect()
        return {width:innerWidth, scrollWidth:document.documentElement.scrollWidth, artWidth:rect.width, artHeight:rect.height}
      },selector)
      assert.ok(geometry.scrollWidth <= width+1, route+' has no page-level horizontal overflow')
      assert.ok(geometry.artWidth > 100 && geometry.artHeight >= (route==='more'&&width<768?125:160), route+' shows its reference scene')
      if(route==='program'){
        const originalDays=await page.locator('.lmf-reference-program-catalog .week-day-card').count()
        assert.ok(originalDays>100,'Original complete program day catalogue is retained')
        await page.locator('.lmf-approved-program-tabs-v1 [data-reference-program-view="weeks"]').click()
        assert.equal(await page.locator('.lmf-reference-program-catalog').isVisible(),true)
        assert.equal(await page.locator('.lmf-reference-program-overview').isVisible(),false)
        await page.locator('.lmf-approved-program-tabs-v1 [data-reference-program-view="overview"]').click()
        assert.equal(await page.locator('.lmf-reference-program-catalog .week-day-card').count(),originalDays)
        await page.locator('.program-page-head').scrollIntoViewIfNeeded()
      }
      if (route === 'progress') {
        await page.locator('#lmf-progress-dashboard-v1[data-loaded="1"] [data-pg-tab="overview"]').waitFor({state:'visible'})
        const layout = await page.evaluate(() => {
          const head = document.querySelector('.lmf-approved-progress-head-v1')
          const dashboard = document.querySelector('#lmf-progress-dashboard-v1')
          const rect = head.getBoundingClientRect()
          return {nested:head.contains(dashboard),height:rect.height,bottom:rect.bottom,dashboardTop:dashboard.getBoundingClientRect().top}
        })
        assert.equal(layout.nested, false, 'Live analytics must render below the cinematic header')
        assert.ok(layout.height <= 300 && layout.dashboardTop >= layout.bottom-1, 'Progress keeps one compact hero above its controls')
        assert.equal(await page.locator('.lmf-reference-overview [data-reference-metric]').count(),6)
        assert.equal(await page.locator('.lmf-reference-analytics-grid > article').count(),6)
        await page.waitForFunction(()=>document.querySelector('[data-reference-metric="days"] strong')?.textContent==='0')
        assert.equal(await page.locator('[data-reference-metric="volume"] strong').innerText(),'—')
      }
      if (route === 'profile') {
        await page.locator('.lmf-profile-character-sheet-v1 .lmf-profile-tm-sheet').waitFor({state:'visible'})
        assert.equal(await page.locator('[data-profile-key="unit"]').inputValue(), 'kg')
        assert.equal(await page.locator('.lmf-profile-v2-avatar').isVisible(), false)
        const nameWidth = await page.locator('.lmf-profile-v2-identity > div:last-child').evaluate(el=>el.getBoundingClientRect().width)
        assert.ok(nameWidth >= 150, 'Athlete identity uses the dossier width after the avatar is removed')
      }
      if(route==='exercises'){
        const card=page.locator('[data-library-card]').nth(1)
        await card.locator('[data-reference-select-exercise]').click()
        if(width>=1101){
          assert.equal(await page.locator('.lmf-reference-exercise-detail h2').innerText(),await card.locator('h3').innerText())
          await page.locator('.lmf-reference-exercise-detail [data-reference-detail-action="info"]').last().click()
        }
        await page.locator('#lmf-exercise-intelligence-modal .lmf-intel-modal').waitFor({state:'visible'})
        await page.keyboard.press('Escape')
        await page.locator('#lmf-exercise-intelligence-modal .lmf-intel-modal').waitFor({state:'hidden'})
        await page.locator(selector).scrollIntoViewIfNeeded()
      }
      if (route === 'more') {
        await page.locator('.lmf-more-utilities-v2 [data-lmf-bar-loader-open="more"]').waitFor({state:'visible'})
        assert.equal(await page.locator('.command-menu-grid > *').count(), 9, 'Native utility is integrated into the nine-card hub')
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
        assert.equal(await page.locator('.lmf-more-utilities-v2').count(), 1, 'Repeated UI refreshes must not nest utility tiles')
        const tileHeight = await page.locator('.lmf-more-utilities-v2').evaluate(el=>el.getBoundingClientRect().height)
        assert.ok(tileHeight < 350, 'Utilities stays within a normal card height')
        const utilityTextWidth=await page.locator('.lmf-more-utilities-link-v2 .lmf-more-card-copy-v1').evaluate(el=>el.getBoundingClientRect().width)
        assert.ok(utilityTextWidth >= 100, 'Utilities text must not inherit the old icon-column width')
        await page.locator('[data-lmf-bar-loader-open="more"]').click()
        await page.locator('.lmf-bar-modal').waitFor({state:'visible'})
        await page.keyboard.press('Escape')
        await page.locator('.lmf-bar-modal').waitFor({state:'hidden'})
      }
      await page.screenshot({path:path.join(out,`${route}-${width}.png`),fullPage:true})
      report.checks.push({route,width,geometry,result:'PASS'})
    }
    await page.goto(origin+'/#/home')
    await page.locator('.lmf-home-reference-final .lmf-reference-home-readiness').waitFor({state:'visible'})
    const homeLayout = await page.evaluate(() => {
      const visible = selector => { const el=document.querySelector(selector);return el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none' }
      const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width}}
      return {overflow:document.documentElement.scrollWidth-innerWidth,hero:rect('.lmf-home-option1-hero'),command:rect('.lmf-home-v4-command'),start:rect('[data-lmf-start]'),readiness:rect('.lmf-home-v4-readiness'),performance:rect('.lmf-home-v4-performance'),milestone:rect('.lmf-home-v4-milestone'),coach:rect('.lmf-home-v4-coach'),miniTiles:visible('.lmf-home-v4-meta'),scoreRing:visible('.lmf-home-v4-score'),fakeSpark:visible('.lmf-home-v4-spark'),shield:visible('.lmf-reference-command-shield')}
    })
    assert.ok(homeLayout.overflow<=1,'Home has no horizontal page overflow')
    assert.equal(homeLayout.miniTiles,false,'Home follows the approved inset workout card without the old summary tiles')
    assert.equal(homeLayout.scoreRing,false,'Readiness uses the approved raw-metric strip')
    assert.equal(homeLayout.fakeSpark,false,'Recent performance never draws a fabricated chart')
    assert.equal(homeLayout.shield,true,'The inset workout includes the mountain shield')
    assert.ok(Math.abs(homeLayout.readiness.y-homeLayout.performance.y)<2 && Math.abs(homeLayout.milestone.y-homeLayout.coach.y)<2,'Both viewports retain the approved two-by-two intelligence grid')
    assert.ok(width<700 ? homeLayout.start.y>=homeLayout.command.bottom-1 : homeLayout.start.x>=homeLayout.command.right,'Start remains below the card on mobile and beside it on desktop')
    assert.equal(await page.locator('.lmf-reference-home-readiness > div').count(),4)
    assert.equal(await page.locator('.lmf-reference-performance-metrics > div').count(),3)
    assert.equal(await page.locator('[data-lmf-start]').count(),1)
    assert.equal(await page.locator('.lmf-home-v4-stats > div').count(),4)
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="stress"]').innerText(),'—','A fresh athlete does not inherit mockup readiness')
    await page.screenshot({path:path.join(out,`home-${width}.png`),fullPage:true})
    report.checks.push({route:'home',width,layout:homeLayout,result:'PASS'})

    await page.locator('[data-lmf-start]').click()
    await page.locator('.lmf-reference-train-hero').waitFor({state:'visible'})
    assert.equal(await page.locator('.lmf-reference-train-readiness > button').count(),4)
    assert.equal(await page.locator('.lmf-reference-train-hero img').evaluate(async img=>{await img.decode();return img.naturalWidth>0}),true)
    assert.equal(await page.locator('.lmf-reference-train-hero h1').innerText(),await page.locator('.train-header h1').innerText(),'The hero uses the current native workout title')
    assert.ok((await page.locator('#session-track [data-session-index]').count())>3,'Native workout section controls remain available')
    await page.screenshot({path:path.join(out,`train-readiness-${width}.png`),fullPage:true})
    for (const [name,value] of [['sleep-quality',4],['energy',3],['soreness',2],['stress',5]]) {
      await page.locator(`.readiness-options label:has(input[name="readiness-${name}"][value="${value}"])`).click()
    }
    await page.locator('.readiness-panel [data-action="start-workout"]').click()
    await page.locator('.active-exercise').first().waitFor({state:'attached'})
    await page.locator('#session-track [data-session-index="2"]').click()
    const activeCard=page.locator('.active-page .active-exercise.lmf-flow-active')
    await activeCard.locator('.lmf-reference-set-history').waitFor({state:'visible'})
    const sourceId=await activeCard.getAttribute('data-exercise-id')
    const card=page.locator(`.active-exercise[data-exercise-id="${sourceId}"]`)
    const originalRows=await card.locator('.set-table .set-row').count()
    assert.equal(await card.locator('[data-reference-set]').count(),originalRows,'Compact history reflects every native set')
    await card.locator('[data-reference-set]').last().click()
    assert.equal(await card.locator('.set-row.lmf-set-active').getAttribute('data-set-id'),await card.locator('[data-reference-set]').last().getAttribute('data-reference-set'),'Reviewing a set forwards to the existing set selector')
    await card.locator('[data-reference-set]').first().click()
    const activeRow=card.locator('.set-row.lmf-set-active')
    const setId=await activeRow.getAttribute('data-set-id')
    await activeRow.locator('.load-input').fill('50')
    await activeRow.locator('.reps-input').fill('5')
    await activeRow.locator('.rpe-input').fill('7')
    await page.waitForFunction(()=>document.querySelector('.active-page .lmf-flow-active [data-reference-load]')?.textContent==='50 kg')
    await card.locator('[data-reference-load-bar]').click()
    await page.locator('.lmf-bar-modal').waitFor({state:'visible'})
    await page.keyboard.press('Escape')
    await page.locator('.lmf-bar-modal').waitFor({state:'hidden'})
    await card.locator('[data-reference-timer-toggle]').click()
    await page.waitForFunction(()=>document.querySelector('.lmf-reference-rest-timer output')?.textContent==='1:59')
    await card.locator('[data-reference-timer-toggle]').click()
    await card.locator('[data-reference-timer-reset]').click()
    assert.equal(await card.locator('.lmf-reference-rest-timer output').innerText(),'2:00')
    assert.equal(await card.locator('.set-table .set-row').count(),originalRows,'The presentation and tools do not replace native set rows')
    const trainOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
    assert.ok(trainOverflow<=1,'Active Train has no horizontal page overflow')
    await page.locator('.lmf-reference-train-heading').scrollIntoViewIfNeeded()
    await page.screenshot({path:path.join(out,`train-${width}.png`),fullPage:true})
    await activeRow.locator('[data-action="toggle-set"]').click()
    await page.waitForFunction(id=>document.querySelector(`.set-row[data-set-id="${id}"] .set-check`)?.classList.contains('done'),setId)
    await page.waitForFunction(id=>document.querySelector(`[data-reference-set="${id}"]`)?.classList.contains('is-logged'),setId)
    assert.ok((await page.locator('.lmf-reference-upcoming [data-reference-section]').count())>0,'Upcoming blocks retain native section navigation')
    report.checks.push({route:'train',width,result:'PASS',checks:['Live workout banner','Four readiness controls','Native workout flow','Every set represented','Original set selection','Load unit follows athlete','Bar loader opens','Rest timer starts, pauses, resets','Native set logging reflected','Upcoming blocks','No overflow']})
    await page.goto(origin+'/#/home')
    await page.waitForFunction(()=>document.querySelector('.lmf-home-reference-final [data-lmf-home-readiness="stress"]')?.textContent==='5/5')
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="sleep_quality"]').innerText(),'4/5')
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="energy"]').innerText(),'3/5')
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="soreness"]').innerText(),'2/5')
    assert.equal(await page.locator('.lmf-reference-train-hero').count(),0,'Train presentation unmounts on Home')
    await page.screenshot({path:path.join(out,`home-saved-readiness-${width}.png`),fullPage:true})
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  console.log(JSON.stringify({result:'PASS',...report}))
} finally {
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
  await browser.close()
}
