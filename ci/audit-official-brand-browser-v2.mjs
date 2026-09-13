import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const chrome=process.env.CHROME_BIN
if (!chrome) throw new Error('CHROME_BIN is required')
const root=path.resolve('.build-src/letmefly_app')
const pw=path.join(root,'node_modules','playwright-core','index.mjs')
if (!fs.existsSync(pw)) throw new Error('reconstructed playwright-core is required')
const { chromium } = await import(pathToFileURL(pw).href)
const outDir=path.join(root,'OFFICIAL_BRAND_AUDIT'); fs.mkdirSync(outDir,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1})
const failures=[]
try {
  // Hold only the native entry during this check, so the real initial HTML can
  // be inspected before the app's normal first render replaces it.
  let continueNative
  const nativeReady=new Promise(resolve=>{continueNative=resolve})
  await page.route('**/assets/index-*.js',async route=>{await nativeReady;await route.continue()})
  const navigation=page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:30000})
  let opening
  try {
    await page.locator('.lmf-app-opening > img').waitFor({state:'visible'})
    await page.waitForFunction(()=>{const img=document.querySelector('.lmf-app-opening > img');return img?.complete&&img.naturalWidth>0})
    opening=await page.locator('.lmf-app-opening > img').evaluate(img=>({width:img.getBoundingClientRect().width,natural:img.naturalWidth,overflow:document.documentElement.scrollWidth>innerWidth}))
    if(opening.width<160||opening.overflow) failures.push('opening logo is too small or overflows the phone viewport')
    await page.screenshot({path:path.join(outDir,'phone-opening-logo.png')})
  } finally {continueNative()}
  await navigation
  await page.locator('.lmf-app-opening').waitFor({state:'detached'})
  await page.waitForTimeout(1000)
  for (const url of ['/brand/letmefly-logo-display-512.png?v=9','/icons/app-icon-192.png?v=9','/icons/app-icon-512.png?v=9','/icons/app-icon-512-maskable.png?v=9','/icons/favicon-32.png?v=9','/icons/apple-touch-icon.png?v=9']) {
    const r=await page.request.get(`http://127.0.0.1:4173${url}`)
    if (!r.ok()) failures.push(`${url} returned ${r.status()}`)
  }
  const geometry=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:window.innerWidth,brand:[...document.images].filter(i=>/letmefly-logo-display|app-icon-v4|letmefly-official-logo/.test(i.src)).map(i=>({src:i.src,nw:i.naturalWidth,nh:i.naturalHeight,w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height}))}))
  if (geometry.body > geometry.viewport + 1) failures.push(`horizontal overflow ${geometry.body}>${geometry.viewport}`)
  if (!geometry.brand.some(i=>i.nw>0 && i.nh>0)) failures.push('no visible loaded LetMeFly brand image found')
  fs.writeFileSync(path.join(outDir,'official-brand-browser-v2.json'),JSON.stringify({result:failures.length?'FAIL':'PASS',opening,geometry,failures},null,2)+'\n')
  if (failures.length) throw new Error(failures.join('; '))
  console.log('LetMeFly official brand v2 mobile browser audit: PASS')
} finally { await browser.close() }
