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
  if (!mounted) throw new Error('Progress dashboard did not mount on Progress route')
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
