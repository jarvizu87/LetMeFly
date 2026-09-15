#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const app=path.resolve(process.argv[2] || path.join(root,'.build-src/letmefly_app'))
const dist=path.join(app,'dist')
const origin=process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const chrome=process.env.CHROME_BIN
if(!chrome) throw new Error('CHROME_BIN is required')
const {chromium}=createRequire(path.join(app,'package.json'))('playwright-core')
const out=path.join(app,'DESKTOP_SHELL_NAV_AUDIT')
fs.mkdirSync(out,{recursive:true})
const report={result:'RUNNING',passes:[],failures:[],observations:{}}
const pass=(label,detail='')=>{report.passes.push({label,detail});console.log(`PASS ${label}${detail?` — ${detail}`:''}`)}
const check=(value,label,detail='')=>{assert.ok(value,`${label}${detail?`: ${detail}`:''}`);pass(label,detail)}

const index=fs.readFileSync(path.join(dist,'index.html'),'utf8')
const cssPath=path.join(dist,'ui','desktop-shell-nav-v1.css')
check(fs.existsSync(cssPath),'Corrective desktop shell stylesheet exists')
const css=fs.readFileSync(cssPath,'utf8')
check(index.includes('/ui/desktop-shell-nav-v1.css?v=1'),'Corrective desktop shell stylesheet is installed')
check(index.indexOf('/ui/desktop-shell-nav-v1.css?v=1')>index.indexOf('/ui/locked-art-fidelity-v1.css'),'Corrective desktop shell loads after locked-art fidelity')
check(css.includes('display: flex !important'),'Desktop shell explicitly owns navbar display mode')
check(css.includes('inset: 0 auto 0 0 !important'),'Desktop shell explicitly owns left-rail placement')
check(!css.includes('data-lmf-desktop-workspace'),'Corrective shell does not restore retired desktop workspace')

const expected=[
  ['#/home','Home'],['#/train','Train'],['#/program','Program'],['#/progress','Progress'],
  ['#/exercises','Exercises'],['#/coach','Coach'],['#/profile','Profile'],['#/more','More'],
]

async function dismiss(page){
  const banner=page.locator('#lmf-install-banner')
  if(await banner.isVisible().catch(()=>false)){
    await banner.evaluate(node=>{
      const button=node.querySelector('button.lmf-install-dismiss,[aria-label="Dismiss install prompt"]')
      if(button instanceof HTMLElement)button.click();else node.remove()
    }).catch(()=>{})
  }
}

async function boot(page,name){
  await page.goto(`${origin}/#/home`,{waitUntil:'domcontentloaded',timeout:30000})
  await page.waitForFunction(()=>Boolean(document.querySelector('.navbar')),{timeout:20000})
  await dismiss(page)
  const create=page.locator('[data-action="create-athlete"]')
  if(await create.count()){
    await page.locator('#onboard-name').fill(name)
    await create.click({timeout:5000})
    await create.waitFor({state:'detached',timeout:12000})
  }
  for(let i=0;i<4;i++){await dismiss(page);await page.waitForTimeout(100)}
  await page.waitForFunction(()=>Boolean(document.querySelector('.navbar')),{timeout:10000})
}

const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
try{
  const desktopContext=await browser.newContext({viewport:{width:1536,height:960},deviceScaleFactor:1,serviceWorkers:'block'})
  const desktop=await desktopContext.newPage()
  desktop.on('pageerror',e=>report.failures.push({label:'desktop runtime error',detail:e.message}))
  await boot(desktop,'Desktop Shell QA')
  await desktop.waitForFunction(()=>document.documentElement.dataset.lmfDesktopUi==='true',{timeout:10000})
  await desktop.waitForFunction(()=>document.documentElement.dataset.lmfApprovedRoute==='home',{timeout:10000})

  const layout=await desktop.evaluate((expected)=>{
    const nav=document.querySelector('.navbar')
    const main=document.querySelector('main')
    const topbar=document.querySelector('.topbar')
    const nr=nav?.getBoundingClientRect(), mr=main?.getBoundingClientRect()
    const ns=nav?getComputedStyle(nav):null
    const bs=getComputedStyle(document.body)
    const links=expected.map(([href,label])=>{
      const node=document.querySelector(`.navbar a[href="${href}"]`)
      if(!(node instanceof HTMLElement)) return {href,label,present:false}
      const rect=node.getBoundingClientRect(), style=getComputedStyle(node)
      return {href,label,present:true,display:style.display,visibility:style.visibility,opacity:style.opacity,
        rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom}}
    })
    return {
      htmlDesktop:document.documentElement.dataset.lmfDesktopUi,
      nav: nr&&ns?{x:nr.x,y:nr.y,width:nr.width,height:nr.height,right:nr.right,bottom:nr.bottom,position:ns.position,display:ns.display,flexDirection:ns.flexDirection,overflowX:ns.overflowX,overflowY:ns.overflowY}:null,
      bodyPaddingLeft:parseFloat(bs.paddingLeft)||0,
      main:mr?{x:mr.x,width:mr.width,right:mr.right}:null,
      topbarDisplay:topbar?getComputedStyle(topbar).display:null,
      links,
      legacyWorkspace:document.querySelectorAll('[data-lmf-desktop-workspace],.lmf-desktop-flow-panel,.lmf-desktop-context-panel').length,
      overflow:document.documentElement.scrollWidth-innerWidth,
    }
  },expected)
  report.observations.desktop=layout
  check(layout.htmlDesktop==='true','Desktop state marker is active')
  check(layout.nav?.position==='fixed','Desktop navigation is fixed',layout.nav?.position||'missing')
  check(layout.nav?.display==='flex','Desktop navigation is flex, not the clipped grid',layout.nav?.display||'missing')
  check(layout.nav?.flexDirection==='column','Desktop navigation is a vertical rail',layout.nav?.flexDirection||'missing')
  check(layout.nav?.width>=64 && layout.nav?.width<=96,'Desktop rail remains compact',`${Math.round(layout.nav?.width||0)}px`)
  check(layout.nav?.height>=900,'Desktop rail uses the available window height',`${Math.round(layout.nav?.height||0)}px`)
  check(layout.bodyPaddingLeft>=64 && layout.bodyPaddingLeft<=96,'Desktop content clears the fixed rail',`${layout.bodyPaddingLeft}px`)
  check(layout.topbarDisplay==='none','Duplicate desktop topbar stays hidden')
  check(layout.legacyWorkspace===0,'Retired three-column desktop workspace remains absent')
  check(layout.overflow<=2,'Desktop page has no horizontal overflow',String(layout.overflow))
  check(layout.main && layout.nav && layout.main.x>=layout.nav.right-1,'Main content begins clear of the left rail',JSON.stringify({mainX:layout.main?.x,navRight:layout.nav?.right}))

  let previousBottom=-1
  for(const link of layout.links){
    check(link.present,`${link.label} navigation exists`,link.href)
    check(link.display!=='none' && link.visibility!=='hidden' && Number(link.opacity)>0,`${link.label} navigation is visible`)
    check((link.rect?.width||0)>=60 && (link.rect?.height||0)>=48,`${link.label} navigation has a real desktop target`,`${Math.round(link.rect?.width||0)}×${Math.round(link.rect?.height||0)}`)
    check((link.rect?.x||0)>=-1 && (link.rect?.right||0)<=layout.nav.right+1,`${link.label} stays inside the compact rail`)
    check((link.rect?.y||0)>=previousBottom-1,`${link.label} is not stacked underneath another route`)
    previousBottom=link.rect?.bottom||previousBottom
  }
  check(previousBottom<=layout.nav.bottom+1,'All eight primary routes fit inside the desktop rail')

  for(const [href,label] of expected){
    await desktop.locator(`.navbar a[href="${href}"]`).click()
    const route=href.replace('#/','')
    await desktop.waitForFunction(r=>document.documentElement.dataset.lmfApprovedRoute===r,route,{timeout:10000})
    const active=await desktop.evaluate(href=>{
      const node=document.querySelector(`.navbar a[href="${href}"]`)
      const span=node?.querySelector('span')
      return {active:node?.classList.contains('active')||node?.getAttribute('aria-current')==='page',color:span?getComputedStyle(span).color:''}
    },href)
    check(active.active,`${label} becomes the active desktop route`)
    check(active.color==='rgb(255, 64, 80)',`${label} uses the approved red active accent`,active.color)
  }
  await desktop.goto(`${origin}/#/home`)
  await desktop.waitForFunction(()=>document.documentElement.dataset.lmfApprovedRoute==='home')
  await desktop.screenshot({path:path.join(out,'desktop-home-nav.png'),fullPage:false})
  await desktopContext.close()

  const mobileContext=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'})
  const mobile=await mobileContext.newPage()
  mobile.on('pageerror',e=>report.failures.push({label:'mobile runtime error',detail:e.message}))
  await boot(mobile,'Mobile Shell Isolation QA')
  await mobile.waitForFunction(()=>document.documentElement.dataset.lmfApprovedRoute==='home',{timeout:10000})
  const mobileState=await mobile.evaluate(()=>{
    const nav=document.querySelector('.navbar'), rect=nav?.getBoundingClientRect(), style=nav?getComputedStyle(nav):null
    return {desktop:document.documentElement.dataset.lmfDesktopUi||'',bodyPaddingLeft:parseFloat(getComputedStyle(document.body).paddingLeft)||0,
      nav:rect&&style?{x:rect.x,y:rect.y,width:rect.width,height:rect.height,position:style.position,display:style.display,flexDirection:style.flexDirection}:null,
      overflow:document.documentElement.scrollWidth-innerWidth}
  })
  report.observations.mobile=mobileState
  check(mobileState.desktop!=='true','Phone does not enter desktop shell mode')
  check(mobileState.bodyPaddingLeft<20,'Phone does not inherit desktop left-rail spacing',`${mobileState.bodyPaddingLeft}px`)
  check(mobileState.nav?.width>=390,'Phone navigation keeps mobile-width ownership',`${Math.round(mobileState.nav?.width||0)}px`)
  check(mobileState.overflow<=2,'Phone retains no horizontal overflow',String(mobileState.overflow))
  await mobile.screenshot({path:path.join(out,'mobile-home-isolation.png'),fullPage:false})
  await mobileContext.close()

  check(report.failures.length===0,'No browser runtime errors were observed')
  report.result='PASS'
}catch(error){
  report.result='FAIL'
  report.failures.push({label:'audit execution',detail:error instanceof Error?error.stack:String(error)})
  console.error(error)
  process.exitCode=1
}finally{
  await browser.close().catch(()=>{})
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
}
if(report.result==='PASS') console.log('LetMeFly corrective desktop shell navigation browser audit: PASS')
