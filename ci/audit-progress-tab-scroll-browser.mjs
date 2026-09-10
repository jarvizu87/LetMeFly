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
      await input.waitFor({ state:'visible', timeout:5000 })
      await input.fill('QA Athlete')
      await dismissOptionalInstall()
      await create.click({ timeout:5000 })
      await create.waitFor({ state:'hidden', timeout:8000 })
      await page.waitForTimeout(250)
      return
    }
    await page.waitForTimeout(180)
  }
}

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForSelector('body', { timeout:10000 })
  await bootstrapAthlete()
  await page.evaluate(() => { location.hash = '#/progress' })
  await page.waitForTimeout(900)
  await dismissOptionalInstall()

  const dashboard = page.locator('#lmf-progress-dashboard-v1')
  await dashboard.waitFor({ state:'visible', timeout:5000 })
  await page.locator('[data-pg-tab="conditioning"]').waitFor({ state:'visible', timeout:5000 })

  const result = await page.evaluate(async () => {
    const root = document.getElementById('lmf-progress-dashboard-v1')
    const button = root?.querySelector('[data-pg-tab="conditioning"]')
    if (!root || !button) throw new Error('Progress Conditioning tab is missing')

    const top = Math.max(0, window.scrollY + root.getBoundingClientRect().top - 12)
    window.scrollTo({ top, behavior:'instant' })
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const beforeY = window.scrollY
    button.focus({ preventScroll:true })
    button.click()
    await new Promise(resolve => setTimeout(resolve, 420))

    const current = root.querySelector('[data-pg-tab="conditioning"]')
    const panel = root.querySelector('.lmf-pg-tabbody')
    return {
      beforeY,
      afterY:window.scrollY,
      sameButtonNode:current === button,
      focusPreserved:document.activeElement === button,
      selected:current?.getAttribute('aria-selected'),
      panel:panel?.dataset.pgPanel,
      apiVersion:window.__LMF_PROGRESS_DASHBOARD__?.version ?? null,
    }
  })

  if (!result.sameButtonNode) throw new Error('Conditioning tab click remounted the Progress tab rail; scroll-jump regression is present')
  if (!result.focusPreserved) throw new Error('Conditioning tab focus was lost during the tab switch')
  if (result.selected !== 'true' || result.panel !== 'conditioning') throw new Error(`Conditioning tab did not activate correctly: ${JSON.stringify(result)}`)
  if (Math.abs(result.afterY - result.beforeY) > 2) throw new Error(`Conditioning tab changed vertical scroll position: ${result.beforeY} -> ${result.afterY}`)
  if (result.apiVersion !== 3) throw new Error(`Progress scroll-safe API v3 not active: ${result.apiVersion}`)

  console.log('PASS  Conditioning swaps only the Progress tabpanel')
  console.log('PASS  Progress tab rail node and focus remain mounted')
  console.log(`PASS  Vertical scroll remains stable at ${result.afterY}px`)
  console.log('LetMeFly Progress tab scroll browser audit: PASS')
} finally {
  await browser.close()
}
