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
let currentPage
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
    currentPage=page
    if(process.env.LMF_AUDIT_TRACE==='1')await page.addInitScript(()=>{
      const entries=[]
      window.__LMF_UI_AUDIT_TRACE=entries
      const record=(type,node,extra={})=>{
        const viewport=document.querySelector('#swipe-viewport')
        entries.push({ms:Math.round(performance.now()),type,node:node?.id||node?.className||node?.nodeName,text:node?.textContent?.trim().slice(0,90),left:viewport?.scrollLeft,top:viewport?.scrollTop,active:document.querySelector('.swipe-page.active-page h2')?.textContent,...extra})
        if(entries.length>500)entries.shift()
      }
      for(const method of ['scrollIntoView','scrollTo']){
        const original=Element.prototype[method]
        Element.prototype[method]=function(...args){record(method,this,{args,stack:new Error().stack});return Reflect.apply(original,this,args)}
      }
      document.addEventListener('click',event=>record('click',event.target.closest?.('button')||event.target),true)
      document.addEventListener('focusin',event=>record('focus',event.target),true)
      document.addEventListener('scroll',event=>{if(event.target.id==='swipe-viewport')record('scroll',event.target)},true)
      new MutationObserver(records=>{
        for(const change of records){
          const node=change.target
          if(node.matches?.('.swipe-page')&&(change.oldValue||'').split(/\s+/).includes('active-page')!==node.classList.contains('active-page'))record('section-class',node)
        }
      }).observe(document,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['class']})
    })
    page.setDefaultTimeout(20000)
    page.on('pageerror', e => report.errors.push(e.message))
    await page.goto(origin+'/#/home')
    await page.waitForFunction(applicationBootState)
    assert.equal(await page.locator('.lmf-app-opening').count(),0,'Native startup replaces its opening logo without a dismissal or delay')
    const welcomeLogo=page.locator('.modal .lmf-official-brand-mark img')
    assert.equal(await welcomeLogo.evaluate(img=>img.complete&&img.naturalWidth>0&&img.getBoundingClientRect().width>=104),true,'The opening form displays the larger original logo')
    await page.screenshot({path:path.join(out,`opening-brand-${width}.png`)})
    await page.locator('#onboard-name').fill('Disposable locked UI preview')
    await page.locator('#onboard-unit').selectOption('kg')
    await page.locator('[data-action="create-athlete"]').click()
    await page.locator('[data-action="create-athlete"]').waitFor({state:'detached'})
    const dismiss = page.getByRole('button', {name:'Dismiss install prompt',exact:true})
    await dismiss.waitFor({state:'visible',timeout:5000}).catch(()=>{})
    if (await dismiss.isVisible()) await dismiss.click()
    const headerLogo=page.locator(width<1100?'.lmf-home-brand-lockup > img':'.navbar .lmf-official-brand-mark img')
    await headerLogo.waitFor({state:'visible'})
    assert.equal(await headerLogo.evaluate(img=>img.complete&&img.naturalWidth===512&&img.getBoundingClientRect().width>=64&&img.getAttribute('src').startsWith('/brand/letmefly-logo-display-512.png')),true,'The visible Home header displays the larger original PNG directly')

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
      const routeLogo=page.locator(width<1100?'.topbar .lmf-official-brand-mark img':'.navbar .lmf-official-brand-mark img')
      assert.equal(await routeLogo.evaluate((img,min)=>img.complete&&img.naturalWidth>0&&img.getBoundingClientRect().width>=min,width<1100?52:64),true,route+' retains the larger header logo')
      assert.equal(await page.locator('.navbar .nav-item.active > span').first().evaluate(el=>getComputedStyle(el).color),'rgb(255, 64, 80)','Navigation uses the approved red selection accent')
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
        // Simulate a late core history render replacing the native container.
        // The loaded dashboard must restore its tools without rereading analytics.
        await page.locator('#lmf-pg-native-tools').waitFor({state:'visible'})
        await page.evaluate(()=>{
          const native=document.querySelector('#progress-content')
          const tools=native.querySelector('#lmf-pg-native-tools')
          for(const child of [...tools.querySelector('.lmf-pg-native-tools-body').children])native.appendChild(child)
          tools.remove()
          native.querySelectorAll('.lmf-pg-native-duplicate').forEach(el=>el.classList.remove('lmf-pg-native-duplicate'))
          const legacy=document.querySelector('#lmf-strength-maxes-progress');if(legacy)legacy.hidden=false
        })
        await page.locator('#lmf-pg-native-tools').waitFor({state:'visible'})
        assert.equal(await page.locator('#lmf-pg-native-tools').count(),1,'Late history renders keep one native tools panel')
        assert.equal(await page.locator('#lmf-strength-maxes-progress').isVisible(),false,'Late renders cannot restore duplicate strength panels')
        await page.locator('#lmf-pg-native-tools > summary').click()
        await page.locator('#lmf-pg-native-tools .tm-board').waitFor({state:'visible'})
        await page.locator('#lmf-pg-native-tools #lmf-strength-maxes').waitFor({state:'visible'})
        await page.locator('#lmf-pg-native-tools > summary').click()
        assert.equal(await page.locator('#lmf-strength-maxes').isVisible(),false,'The full strength editor stays behind native training-data controls')
        await page.locator('.lmf-reference-extra-signals > summary').waitFor({state:'visible'})
        assert.equal(await page.locator('.lmf-reference-extra-signals').evaluate(el=>el.open),false,'Additional signals stay secondary to the six analytics cards')
      }
      if (route === 'profile') {
        await page.locator('.lmf-profile-character-sheet-v1 .lmf-profile-tm-sheet').waitFor({state:'visible'})
        assert.equal(await page.locator('[data-profile-key="unit"]').inputValue(), 'kg')
        assert.equal(await page.locator('.lmf-profile-v2-avatar').isVisible(), false)
        const nameWidth = await page.locator('.lmf-profile-v2-identity > div:last-child').evaluate(el=>el.getBoundingClientRect().width)
        assert.ok(nameWidth >= 150, 'Athlete identity uses the dossier width after the avatar is removed')
        if(width<768){
          const statLayout=await page.locator('.lmf-profile-character-dossier-v1 > .lmf-profile-stat-grid').evaluate(el=>({width:el.getBoundingClientRect().width,last:el.lastElementChild.getBoundingClientRect().width,labels:[...el.querySelectorAll('small')].map(label=>({width:label.clientWidth,scroll:label.scrollWidth}))}))
          assert.ok(statLayout.last>statLayout.width*.85,'Training experience has its own full-width row on phones')
          assert.ok(statLayout.labels.every(label=>label.scroll<=label.width+1),'Profile labels wrap within their own columns')
        }
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
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
      await page.screenshot({path:path.join(out,`${route}-${width}.png`)})
      if(route!=='exercises')await page.screenshot({path:path.join(out,`${route}-${width}-full.png`),fullPage:true})
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
    assert.equal(await page.locator('.navbar .nav-item.active > span').first().evaluate(el=>getComputedStyle(el).color),'rgb(255, 64, 80)','Home shares the approved red selection accent')
    assert.equal(await page.locator('.lmf-home-v4-stats > div').count(),4)
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="stress"]').innerText(),'—','A fresh athlete does not inherit mockup readiness')
    await page.screenshot({path:path.join(out,`home-${width}.png`),fullPage:true})
    report.checks.push({route:'home',width,layout:homeLayout,result:'PASS'})

    await page.locator('[data-lmf-start]').click()
    await page.locator('.lmf-reference-train-hero').waitFor({state:'visible'})
    assert.equal(await page.locator('#swipe-viewport').getAttribute('data-lmf-section-navigation'),'intent-v1','Native section selection distinguishes navigation from focus scrolling')
    assert.equal(await page.locator('.lmf-reference-train-readiness > button').count(),4)
    assert.equal(await page.locator('.lmf-reference-train-hero img').evaluate(async img=>{await img.decode();return img.naturalWidth>0}),true)
    assert.equal(await page.locator('.lmf-reference-train-hero h1').innerText(),await page.locator('.train-header h1').innerText(),'The hero uses the current native workout title')
    assert.ok((await page.locator('#session-track [data-session-index]').count())>3,'Native workout section controls remain available')
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
    const flowCardWidth=await page.evaluate(()=>{const track=document.querySelector('#session-track');return {slot:parseFloat(getComputedStyle(track).gridTemplateColumns),card:track.querySelector('button').getBoundingClientRect().width}})
    assert.ok(Math.abs(flowCardWidth.slot-flowCardWidth.card)<2,'Workout Flow cards fill their grid columns')
    await page.screenshot({path:path.join(out,`train-readiness-${width}.png`)})
    // The recording exposed a real gap: before Start Workout the native app
    // renders preview-card, which the previous live-only layout did not cover.
    await page.locator('#session-track [data-session-index="1"]').click()
    await page.locator('.active-page .lmf-reference-preview-active').waitFor({state:'visible'})
    const beforeStart = page.locator('.active-page .preview-card')
    const prescriptionsBefore = await beforeStart.locator('.prescription-block > .prescription-row').allTextContents()
    assert.ok((await beforeStart.count())>=3,'Warm-up contains its original movements')
    assert.equal(await page.locator('.active-page .lmf-reference-preview-active').count(),1,'One preview movement opens at a time')
    assert.equal(await beforeStart.locator('[data-action="toggle-set"],.set-input').count(),0,'Before-start previews cannot log sets')
    const previewGeometry = await beforeStart.first().evaluate(card=>{
      const media=card.querySelector('.lmf-exercise-media'),style=getComputedStyle(media)
      return {height:card.getBoundingClientRect().height,before:getComputedStyle(card,'::before').display,imagePosition:style.position,imageHeight:media.getBoundingClientRect().height,imageFit:style.backgroundSize}
    })
    assert.equal(previewGeometry.before,'none','The obsolete square panel is removed')
    assert.equal(previewGeometry.imagePosition,'absolute','Preview art shares the exercise heading region')
    assert.equal(previewGeometry.imageFit,'contain','Preview picture proportions are preserved')
    assert.ok(previewGeometry.imageHeight<=210&&previewGeometry.height<450,'A simple warm-up no longer becomes a screen-sized empty card')
    await page.locator('.active-page [data-reference-exercise-step="1"]').click()
    await page.waitForFunction(()=>document.querySelector('.active-page .lmf-reference-preview-active h3')?.textContent==='Backward Sled Drag')
    await page.locator('.active-page [data-reference-preview-exercise="0"]').click()
    await page.waitForFunction(()=>document.querySelector('.active-page .lmf-reference-preview-active h3')?.textContent==='Bike / Incline Walk')
    assert.deepEqual(await beforeStart.locator('.prescription-block > .prescription-row').allTextContents(),prescriptionsBefore,'Preview selection preserves every governed prescription')
    assert.equal(await beforeStart.first().locator('[data-watch]').isVisible(),true,'Native exercise actions remain available')
    const actionBounds = await beforeStart.first().evaluate(card=>{
      const bounds=card.getBoundingClientRect()
      return [...card.querySelectorAll('.exercise-actions > button')].every(button=>{
        const r=button.getBoundingClientRect()
        return r.width>0&&r.height>=40&&r.left>=bounds.left&&r.right<=bounds.right
      })
    })
    assert.equal(actionBounds,true,'Watch, Info and Substitute fit fully inside the preview card')
    if(width>=1100){
      await page.waitForFunction(()=>document.querySelectorAll('.lmf-desktop-flow-item').length===document.querySelectorAll('.active-page .preview-card').length)
      assert.deepEqual(await page.locator('.lmf-desktop-flow-copy b').allTextContents(),await beforeStart.locator('.exercise-title h3').allTextContents(),'Desktop flow shows every preview movement')
      await page.locator('[data-lmf-desktop-exercise-index="2"]').click()
      await page.waitForFunction(()=>document.querySelector('.active-page .lmf-reference-preview-active h3')?.textContent==='Glute Bridge ISO'&&document.querySelector('.lmf-desktop-context-body [data-lmf-desktop-v2-content] strong')?.textContent==='Glute Bridge ISO')
      assert.equal(await page.locator('.lmf-desktop-context-body .lmf-desktop-live-set-grid').count(),0,'Preview context cannot fabricate a live set')
      await page.locator('[data-lmf-desktop-v2-action="info"]').click()
      await page.locator('#lmf-exercise-intelligence-modal .lmf-intel-modal').waitFor({state:'visible'})
      await page.keyboard.press('Escape')
      await page.locator('[data-lmf-desktop-exercise-index="0"]').click()
      await page.waitForFunction(()=>document.querySelector('.active-page .lmf-reference-preview-active h3')?.textContent==='Bike / Incline Walk'&&document.querySelector('.lmf-desktop-context-body [data-lmf-desktop-v2-content] strong')?.textContent==='Bike / Incline Walk')
      assert.deepEqual(await beforeStart.locator('.prescription-block > .prescription-row').allTextContents(),prescriptionsBefore,'Desktop preview tools and selection preserve prescriptions')
    }
    await beforeStart.first().evaluate(el=>window.scrollTo({top:scrollY+el.closest('.workout-panel').getBoundingClientRect().top-84,behavior:'instant'}))
    await page.screenshot({path:path.join(out,`train-before-start-${width}.png`)})
    const drawer=page.locator('body > [data-netlify-deploy-id]:has(iframe[title="Netlify Drawer"])')
    if(await drawer.count())assert.equal(await drawer.isVisible(),false,'The blocked host drawer cannot cover app navigation')
    report.checks.push({route:'train-before-start',width,result:'PASS',layout:previewGeometry,privateImages:'Not verified in disposable signed-out data'})
    await page.locator('.day-strip .day-chip[data-day="2"]').click()
    await page.locator('#session-track [data-session-index="1"]').click()
    await page.locator('.active-page .lmf-reference-preview-active').waitFor({state:'visible'})
    assert.equal(await page.locator('.active-page .preview-card').first().evaluate(el=>getComputedStyle(el,'::before').display),'none','Future days also retire the square art panel')
    assert.equal(await page.locator('.active-page [data-action="toggle-set"],.active-page .set-input').count(),0,'Future-day cards remain read-only')
    assert.ok((await page.locator('.active-page .lmf-reference-preview-active .prescription-block > .prescription-row').count())>0,'Future-day native prescriptions are retained')
    await page.locator('.active-page .lmf-reference-preview-active').evaluate(el=>window.scrollTo({top:scrollY+el.closest('.workout-panel').getBoundingClientRect().top-84,behavior:'instant'}))
    await page.screenshot({path:path.join(out,`train-future-day-${width}.png`)})
    await page.locator('.day-strip .day-chip[data-day="1"]').click()
    await page.locator('#session-track [data-session-index="0"]').click()
    for (const [name,value] of [['sleep-quality',4],['energy',3],['soreness',2],['stress',5]]) {
      await page.locator(`.readiness-options label:has(input[name="readiness-${name}"][value="${value}"])`).click()
    }
    await page.locator('.readiness-panel [data-action="start-workout"]').click()
    await page.locator('.active-exercise').first().waitFor({state:'attached'})
    const card=page.locator('.active-exercise').filter({has:page.locator('.exercise-title h3',{hasText:/^Front Squat$/})}).first()
    const sourceId=await card.getAttribute('data-exercise-id')
    const sectionIndex=await card.evaluate(el=>Array.from(document.querySelectorAll('#swipe-viewport > .swipe-page')).indexOf(el.closest('.swipe-page')))
    await page.locator(`#session-track [data-session-index="${sectionIndex}"]`).click()
    // Native panes are centered within the carousel, with responsive inset
    // spacing. Match the exercised recap contract instead of assuming equal
    // leading edges on phone and desktop layouts.
    await page.waitForFunction(id=>{
      const pane=document.querySelector(`.active-exercise[data-exercise-id="${id}"]`)?.closest('.swipe-page')
      const viewport=document.querySelector('#swipe-viewport')
      if(!pane?.classList.contains('active-page')||!viewport)return false
      const a=pane.getBoundingClientRect(),v=viewport.getBoundingClientRect()
      return a.width>0&&Math.abs(a.left+a.width/2-v.left-v.width/2)<2
    },sourceId)
    if(!await card.evaluate(el=>el.classList.contains('lmf-flow-active')))await card.locator('.lmf-compact-summary').click()
    await card.locator('.lmf-reference-set-history').waitFor({state:'visible'})
    const nativeRowsBeforePaging=await card.locator('.set-table').evaluate(table=>[...table.querySelectorAll('.set-row')].map(row=>({id:row.dataset.setId,prescription:row.querySelector('.set-target-cell')?.textContent,done:row.querySelector('.set-check')?.classList.contains('done')})))
    await page.locator('.active-page [data-reference-exercise-step="1"]').click()
    await page.waitForFunction(()=>document.querySelector('.active-page .lmf-flow-active .exercise-title h3')?.textContent==='Bench Press')
    await page.locator('.active-page [data-reference-exercise-step="-1"]').click()
    await page.waitForFunction(()=>document.querySelector('.active-page .lmf-flow-active .exercise-title h3')?.textContent==='Front Squat')
    assert.deepEqual(await card.locator('.set-table').evaluate(table=>[...table.querySelectorAll('.set-row')].map(row=>({id:row.dataset.setId,prescription:row.querySelector('.set-target-cell')?.textContent,done:row.querySelector('.set-check')?.classList.contains('done')}))),nativeRowsBeforePaging,'Block arrows reuse native exercise selection without changing any sets')
    const originalRows=await card.locator('.set-table .set-row').count()
    const strengthBeforeReview=await page.evaluate(()=>localStorage.getItem('letmefly_private_strength_maxes_v1'))
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
    assert.equal(await card.evaluate(el=>el.closest('.swipe-page').classList.contains('active-page')),true,'Rest timer updates preserve the selected workout section')
    // The legacy estimate listener defers real log events by 80 ms. Navigation
    // and timer clicks must remain read-only after that handler could have run.
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(()=>localStorage.getItem('letmefly_private_strength_maxes_v1')),strengthBeforeReview,'Reviewing sets and controlling rest never records a strength estimate')
    assert.equal(await card.locator('.set-table .set-row').count(),originalRows,'The presentation and tools do not replace native set rows')
    const trainOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
    assert.ok(trainOverflow<=1,'Active Train has no horizontal page overflow')
    const blockLayouts=[]
    for (const size of width===412?[360,412]:[width]) {
      if(size!==page.viewportSize().width)await page.setViewportSize({width:size,height:950})
      await page.locator(`#session-track [data-session-index="${sectionIndex}"]`).click()
      await page.waitForFunction(id=>{
        const pane=document.querySelector(`.active-exercise[data-exercise-id="${id}"]`)?.closest('.swipe-page'),viewport=document.querySelector('#swipe-viewport')
        if(!pane||!viewport)return false
        const a=pane.getBoundingClientRect(),v=viewport.getBoundingClientRect()
        return Math.abs(a.left+a.width/2-v.left-v.width/2)<2
      },sourceId)
      const geometry=await card.evaluate(el=>{
        const rect=selector=>{const r=el.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
        const media=el.querySelector('.lmf-exercise-media'),style=getComputedStyle(media)
        return {title:rect('.exercise-title'),rest:rect('.lmf-reference-rest-timer'),history:rect('.lmf-reference-set-history'),load:rect('.lmf-reference-load-card'),logger:rect('.set-table'),cue:rect('.lmf-reference-coaching-cue'),imagePosition:style.position,imageFit:style.backgroundSize,imageMask:style.maskImage,imagePointerEvents:style.pointerEvents,blockNumber:el.closest('.workout-panel').querySelector('h2').dataset.referenceBlockNumber,overflow:document.documentElement.scrollWidth-innerWidth}
      })
      assert.equal(geometry.blockNumber,String(sectionIndex),'The block heading retains the real section number')
      assert.equal(geometry.imagePosition,'absolute','The original picture blends into the composition')
      assert.equal(geometry.imageFit,'contain','The source picture retains its proportions')
      assert.ok(geometry.imageMask.includes('linear-gradient'),'Picture edges fade into the card')
      assert.equal(geometry.imagePointerEvents,'none','Blended art never intercepts workout controls')
      assert.ok(Math.abs(geometry.rest.y-geometry.title.y)<25,'Rest timer shares the title/art region')
      assert.ok(geometry.history.right<=geometry.load.x+1 && Math.abs(geometry.history.y-geometry.load.y)<2,'Set table and load panel share one row at every phone/desktop size')
      assert.ok(geometry.logger.y>=geometry.cue.bottom-1,'Native logging stays below coaching guidance')
      assert.ok(geometry.overflow<=1,`Block card has no horizontal overflow at ${size}px`)
      await card.evaluate(el=>window.scrollTo({top:scrollY+el.closest('.workout-panel').getBoundingClientRect().top-84,behavior:'instant'}))
      await page.screenshot({path:path.join(out,`train-block-card-${size}.png`)})
      await card.evaluate(el=>window.scrollTo({top:scrollY+el.querySelector('.set-table').getBoundingClientRect().top-95,behavior:'instant'}))
      await page.screenshot({path:path.join(out,`train-block-controls-${size}.png`)})
      blockLayouts.push({width:size,...geometry})
    }
    report.checks.push({route:'train-block-layout',width,result:'PASS',layouts:blockLayouts,privateImages:'Not verified in disposable signed-out data',checks:['Numbered block heading','Art container uses proportional fit and edge masking','Rest timer beside title','Set table beside load panel','Native exercise paging preserves sets']})
    // Full-page/element capture can temporarily resize the native carousel.
    // Capture the real viewport without changing its size or horizontal scroll.
    await card.evaluate(el=>window.scrollTo({top:scrollY+el.getBoundingClientRect().top-90,behavior:'instant'}))
    await page.waitForFunction(id=>{
      const card=document.querySelector(`.active-exercise[data-exercise-id="${id}"]`)
      const pane=card?.closest('.swipe-page'),viewport=document.querySelector('#swipe-viewport')
      if(!pane?.classList.contains('active-page')||!viewport)return false
      const a=pane.getBoundingClientRect(),v=viewport.getBoundingClientRect()
      return Math.abs(a.left+a.width/2-v.left-v.width/2)<2
    },sourceId)
    await page.screenshot({path:path.join(out,`train-active-exercise-${width}.png`)})
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
    await page.screenshot({path:path.join(out,`train-${width}.png`)})
    await activeRow.locator('[data-action="toggle-set"]').click()
    await page.waitForFunction(id=>document.querySelector(`.set-row[data-set-id="${id}"] .set-check`)?.classList.contains('done'),setId)
    await page.waitForFunction(id=>document.querySelector(`[data-reference-set="${id}"]`)?.classList.contains('is-logged'),setId)
    assert.ok((await page.locator('.lmf-reference-upcoming [data-reference-section]').count())>0,'Upcoming blocks retain native section navigation')
    assert.match(await page.locator('.lmf-reference-upcoming [data-reference-section] strong').first().innerText(),/^Block \d+ — /,'Collapsed cards retain real numbered block headings')
    report.checks.push({route:'train',width,result:'PASS',checks:['Live workout banner','Four readiness controls','Native workout flow','Every set represented','Original set selection','Load unit follows athlete','Bar loader opens','Rest timer starts, pauses, resets','Native set logging reflected','Upcoming blocks','No overflow']})
    await page.goto(origin+'/#/home')
    await page.waitForFunction(()=>document.querySelector('.lmf-home-reference-final [data-lmf-home-readiness="stress"]')?.textContent==='5/5')
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="sleep_quality"]').innerText(),'4/5')
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="energy"]').innerText(),'3/5')
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="soreness"]').innerText(),'2/5')
    assert.equal(await page.locator('.lmf-reference-train-hero').count(),0,'Train presentation unmounts on Home')
    await page.screenshot({path:path.join(out,`home-saved-readiness-${width}.png`),fullPage:true})
    // An isolated local fixture exercises the read-only Home summary across
    // units, metric prescriptions, soft deletion and athlete boundaries.
    const summarySnapshot = await page.evaluate(async () => {
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('letmefly-private');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      const all=store=>new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      const athlete=(await all('athletes')).find(row=>!row.deleted_at)
      const session=(await all('workoutSessions')).find(row=>row.athlete_id===athlete.id)
      const exercise=(await all('workoutExercises')).find(row=>row.athlete_id===athlete.id)
      const sample=(await all('workoutSets')).find(row=>row.athlete_id===athlete.id)
      const stores=['workoutSessions','workoutExercises','workoutSets','readinessEntries']
      const tx=db.transaction(stores,'readwrite')
      const sessionId='qa-home-summary-session',exerciseId='qa-home-summary-exercise'
      tx.objectStore('workoutSessions').put({...session,id:sessionId,workout_name:'Summary test workout',status:'completed',completed_at:'2032-03-04T12:00:00Z'})
      tx.objectStore('workoutExercises').put({...exercise,id:exerciseId,workout_session_id:sessionId,exercise_name_snapshot:'Summary test lift'})
      const base={...sample,athlete_id:athlete.id,workout_session_id:sessionId,workout_exercise_id:exerciseId,completed:true,deleted_at:null,performance_data:{},rpe:null}
      const cases=[
        {load_value:100,load_unit:'lb',reps:5,rpe:7},
        {load_value:50,load_unit:'kg',reps:4,rpe:9},
        {load_value:9999,load_unit:'kg',reps:9999,performance_data:{actualMetricKind:'distance',actualMetricValue:30}},
        {load_value:9999,load_unit:'kg',reps:9999,performance_data:{distance:'30m'}},
        {load_value:9999,load_unit:'kg',reps:9999,performance_data:{programmedReps:'30sec'}},
        {load_value:9999,load_unit:'kg',reps:9999,completed:false,rpe:10},
        {load_value:9999,load_unit:'kg',reps:9999,athlete_id:'qa-other-athlete',rpe:10},
        {load_value:9999,load_unit:'kg',reps:9999,deleted_at:'2032-03-04T12:00:00Z',rpe:10},
      ]
      cases.forEach((entry,index)=>tx.objectStore('workoutSets').put({...base,...entry,id:'qa-home-summary-set-'+index}))
      tx.objectStore('readinessEntries').put({id:'qa-other-readiness',athlete_id:'qa-other-athlete',recorded_at:'2033-03-04T12:00:00Z',sleep_quality:1,energy:1,soreness:1,stress:1})
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})
      const snapshot=JSON.stringify(await Promise.all(stores.map(all)))
      db.close()
      return snapshot
    })
    await page.goto(origin+'/#/train')
    await page.locator('.lmf-reference-train-hero').waitFor({state:'visible'})
    await page.goto(origin+'/#/home')
    await page.waitForFunction(()=>document.querySelector('[data-lmf-home-performance="volume"]')?.textContent==='426.8 kg·reps')
    assert.equal(await page.locator('[data-lmf-home-performance="top"]').innerText(),'Summary test lift · 50 kg × 4')
    assert.equal(await page.locator('[data-lmf-home-performance="rpe"]').innerText(),'8')
    assert.equal(await page.locator('.lmf-home-reference-final [data-lmf-home-readiness="stress"]').innerText(),'5/5','A newer foreign readiness record never replaces this athlete’s check-in')
    const afterSummary = await page.evaluate(async () => {
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('letmefly-private');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      const snapshot=JSON.stringify(await Promise.all(['workoutSessions','workoutExercises','workoutSets','readinessEntries'].map(store=>new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)}))))
      db.close();return snapshot
    })
    assert.equal(afterSummary,summarySnapshot,'Rendering the Home summary leaves all source records unchanged')
    await page.screenshot({path:path.join(out,`home-completed-history-${width}.png`),fullPage:true})
    report.checks.push({route:'home-data',width,result:'PASS',checks:['Completed history','Mixed-unit conversion','Distance/time exclusion','Unfinished-set exclusion','Soft-delete exclusion','Athlete isolation','No source writes']})
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  console.log(JSON.stringify({result:'PASS',...report}))
} catch(error) {
  report.failure=String(error)
  if(currentPage&&!currentPage.isClosed()) {
    if(process.env.LMF_AUDIT_TRACE==='1'){
      report.trace=await currentPage.evaluate(()=>window.__LMF_UI_AUDIT_TRACE||[]).catch(()=>[])
      console.log('TRAIN INTERACTION TRACE '+JSON.stringify(report.trace.slice(-100)))
    }
    report.failureContext=await currentPage.evaluate(()=>({route:location.hash,width:innerWidth,section:document.querySelector('.active-page .workout-panel-head h2')?.textContent,panes:[...document.querySelectorAll('#swipe-viewport > .swipe-page')].map(el=>({title:el.querySelector('h2')?.textContent,active:el.classList.contains('active-page'),left:el.getBoundingClientRect().left,width:el.getBoundingClientRect().width})),viewport:document.querySelector('#swipe-viewport')?.getBoundingClientRect().toJSON()})).catch(()=>null)
    await currentPage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})
  }
  throw error
} finally {
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
  await browser.close()
}
