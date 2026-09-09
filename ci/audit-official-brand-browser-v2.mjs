import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const chrome=process.env.CHROME_BIN
if (!chrome) throw new Error('CHROME_BIN is required')
const root=path.resolve('.build-src/letmefly_app')
const outDir=path.join(root,'OFFICIAL_BRAND_AUDIT'); fs.mkdirSync(outDir,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1})
const failures=[]
try {
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle',timeout:30000})
  for (const url of ['/brand/letmefly-logo-display-512.png?v=9','/icons/app-icon-192.png?v=9','/icons/app-icon-512.png?v=9','/icons/app-icon-512-maskable.png?v=9','/icons/favicon-32.png?v=9','/icons/apple-touch-icon.png?v=9']) {
    const r=await page.request.get(`http://127.0.0.1:4173${url}`)
    if (!r.ok()) failures.push(`${url} returned ${r.status()}`)
  }
  const geometry=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:window.innerWidth,brand:[...document.images].filter(i=>/letmefly-logo-display|app-icon-v4|letmefly-official-logo/.test(i.src)).map(i=>({src:i.src,nw:i.naturalWidth,nh:i.naturalHeight,w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height}))}))
  if (geometry.body > geometry.viewport + 1) failures.push(`horizontal overflow ${geometry.body}>${geometry.viewport}`)
  if (!geometry.brand.some(i=>i.nw>0 && i.nh>0)) failures.push('no visible loaded LetMeFly brand image found')
  fs.writeFileSync(path.join(outDir,'official-brand-browser-v2.json'),JSON.stringify({result:failures.length?'FAIL':'PASS',geometry,failures},null,2)+'\n')
  if (failures.length) throw new Error(failures.join('; '))
  console.log('LetMeFly official brand v2 mobile browser audit: PASS')
} finally { await browser.close() }
