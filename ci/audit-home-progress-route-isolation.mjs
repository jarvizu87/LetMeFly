#!/usr/bin/env node
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const browser = await chromium.launch({ headless:true, executablePath:chromeBin, args:['--no-sandbox','--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport:{ width:412, height:915 }, isMobile:true, hasTouch:true })
const page = await context.newPage()
const runtimeErrors = []
page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error?.stack || error?.message || error}`))
page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') runtimeErrors.push(`console.${message.type()}: ${message.text()}`)
})

async function dismissOptionalInstall() {
  const button = page.getByRole('button', { name:/^Not now$/i }).first()
  if (await button.isVisible().catch(() => false)) await button.click().catch(() => null)
}

async function bootstrapAthlete() {
  for (let i=0;i<16;i+=1) {
    await dismissOptionalInstall()
    const create = page.getByRole('button', { name:/CREATE LOCAL ATHLETE/i }).first()
    if (await create.isVisible().catch(() => false)) {
      const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
      const input = modal.locator('input[type="text"],input:not([type])').first()
      if (await input.isVisible().catch(() => false)) await input.fill('QA Athlete')
      await create.click()
      await page.waitForTimeout(500)
      return
    }
    await page.waitForTimeout(180)
  }
}

async function setRoute(hash) {
  await page.evaluate((next) => { location.hash = next }, hash)
  await page.waitForTimeout(900)
  await dismissOptionalInstall()
}

async function progressMountCount() {
  return await page.locator('#lmf-progress-dashboard-v1').count()
}

async function progressDiagnostics() {
  return await page.evaluate(() => {
    const dashboard = document.getElementById('lmf-progress-dashboard-v1')
    const heading = [...document.querySelectorAll('h1,h2,h3')].find(el => /^progress$/i.test((el.textContent || '').trim()))
    const nav = [...document.querySelectorAll('nav a[href],nav button,nav [role="button"]')].find(el => /^progress$/i.test((el.textContent || '').trim()))
    return {
      hash: location.hash,
      readyState: document.readyState,
      dashboard: dashboard ? {
        connected: dashboard.isConnected,
        loaded: dashboard.dataset.loaded || null,
        bootstrap: dashboard.hasAttribute('data-lmf-progress-bootstrap'),
        display: getComputedStyle(dashboard).display,
        visibility: getComputedStyle(dashboard).visibility,
        rects: dashboard.getClientRects().length,
        parent: dashboard.parentElement?.tagName || null,
      } : null,
      heading: heading ? { text: heading.textContent?.trim(), connected: heading.isConnected, display:getComputedStyle(heading).display, rects:heading.getClientRects().length } : null,
      nav: nav ? { active:nav.classList.contains('active'), ariaCurrent:nav.getAttribute('aria-current'), ariaSelected:nav.getAttribute('aria-selected'), href:nav.getAttribute('href') } : null,
      apiVersion: window.__LMF_PROGRESS_DASHBOARD__?.version || null,
      bootVersion: window.__LMF_PROGRESS_BOOT__?.version || null,
      polishVersion: window.__LMF_PROGRESS_POLISH__?.version || null,
      scripts: [...document.scripts].map(script => script.getAttribute('src')).filter(src => src?.includes('progress-dashboard')),
      progressContent: Boolean(document.querySelector('#progress-content')),
      progressTextPresent: /\bprogress\b/i.test(document.body.innerText || ''),
    }
  })
}

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForSelector('body', { timeout:10000 })
  await bootstrapAthlete()

  await setRoute('#/home')
  const firstHome = await progressMountCount()
  if (firstHome !== 0) throw new Error(`Progress dashboard contaminated initial Home route: ${firstHome} mount(s)`)
  console.log('PASS  Initial Home contains zero Progress dashboard mounts')

  await setRoute('#/progress')
  const mounted = await page.locator('#lmf-progress-dashboard-v1').waitFor({ state:'visible', timeout:5000 }).then(() => true).catch(() => false)
  if (!mounted) {
    console.error('Progress route diagnostics:', JSON.stringify(await progressDiagnostics(), null, 2))
    if (runtimeErrors.length) console.error('Progress runtime diagnostics:\n' + runtimeErrors.join('\n'))
    throw new Error('Progress dashboard did not mount on Progress route')
  }
  console.log('PASS  Progress dashboard mounts on Progress route')

  await setRoute('#/home')
  const returnedHome = await progressMountCount()
  if (returnedHome !== 0) throw new Error(`Progress dashboard persisted after Progress → Home: ${returnedHome} mount(s)`)
  console.log('PASS  Progress dashboard unmounts after Progress → Home')

  await setRoute('#/train')
  const trainCount = await progressMountCount()
  if (trainCount !== 0) throw new Error(`Progress dashboard contaminated Train route: ${trainCount} mount(s)`)
  console.log('PASS  Train contains zero Progress dashboard mounts')

  console.log('LetMeFly Home/Progress route isolation browser audit: PASS')
} finally {
  await browser.close()
}
