#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'BROWSER_SMOKE_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required for browser smoke audit')

const failures = []
const warnings = []
const screens = []
const errors = []
const externalNoise = /supabase|cloudinary|net::ERR_|Failed to fetch|NetworkError/i
const pass = (label, detail = '') => console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
const fail = (label, detail = '') => { failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
const warn = (label, detail = '') => { warnings.push({ label, detail }); console.log(`WARN  ${label}${detail ? ` — ${detail}` : ''}`) }
const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}
async function clickable(page, label) {
  const exact = new RegExp(`^\\s*${esc(label)}\\s*$`, 'i')
  return await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: exact }))
    || await firstVisible(page.getByText(exact))
}
async function clickLabel(page, label, required = true) {
  const item = await clickable(page, label)
  if (!item) {
    if (required) fail(`Browser control ${label}`, 'not found/visible')
    return false
  }
  await item.click({ timeout: 5000 }).catch((error) => fail(`Browser control ${label}`, error.message))
  await page.waitForTimeout(180)
  return true
}
async function assertNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
  if (metrics.scroll > metrics.width + 3) fail(`${label} horizontal overflow`, `${metrics.scroll}px > ${metrics.width}px`)
  else pass(`${label} no page-level horizontal overflow`, `${metrics.scroll}px/${metrics.width}px`)
}
async function capture(page, name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const file = path.join(outDir, `${safe}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 700)
  screens.push({ name, file: path.basename(file), text })
}

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error' && !externalNoise.test(message.text())) errors.push(`console: ${message.text()}`)
})
page.on('response', (response) => {
  if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`)
})

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForTimeout(900)
  const bodyText = await page.locator('body').innerText()
  if (!/LETMEFLY/i.test(bodyText)) fail('Browser app boot', 'LetMeFly shell text not found')
  else pass('Browser app boot')
  await capture(page, 'Home')
  await assertNoOverflow(page, 'Home')

  // Bottom navigation: every primary tab must be reachable on the production DOM.
  for (const tab of ['TRAIN', 'PROGRAM', 'PROGRESS', 'MORE', 'HOME']) {
    if (await clickLabel(page, tab)) {
      await capture(page, tab)
      await assertNoOverflow(page, tab)
    }
  }

  // Progress sub-tabs.
  if (await clickLabel(page, 'PROGRESS')) {
    for (const tab of ['OVERVIEW', 'STRENGTH', 'BODY', 'CONDITIONING', 'PRS']) {
      if (await clickLabel(page, tab)) {
        await capture(page, `Progress ${tab}`)
        await assertNoOverflow(page, `Progress ${tab}`)
      }
    }
  }

  // More destinations. Return to More before each selection so the same path is exercised repeatedly.
  for (const destination of ['EXERCISES', 'COACH', 'PROFILE', 'CALENDAR']) {
    if (!(await clickLabel(page, 'MORE'))) continue
    if (await clickLabel(page, destination)) {
      await capture(page, destination)
      await assertNoOverflow(page, destination)
    }
  }

  // Train future-day state: selecting D2 must be a preview and must not expose an enabled write/start action.
  if (await clickLabel(page, 'TRAIN')) {
    const d2 = await firstVisible(page.locator('button,[role="button"]').filter({ hasText: /^\s*D2\b/i }))
    if (!d2) warn('Future-day browser preview', 'D2 selector not visible in fresh local state')
    else {
      await d2.click()
      await page.waitForTimeout(300)
      const previewText = await page.locator('body').innerText()
      if (/Preview position|Preview only/i.test(previewText) && /MAKE CURRENT POSITION/i.test(previewText)) pass('Future-day preview labeling')
      else fail('Future-day preview labeling', 'preview warning/current-position control missing')

      const forbidden = page.locator('[data-action="start-workout"],[data-action="save-readiness"]')
      let exposedEnabled = false
      for (let i = 0; i < await forbidden.count(); i += 1) {
        const item = forbidden.nth(i)
        if (await item.isVisible().catch(() => false) && await item.isEnabled().catch(() => false)) exposedEnabled = true
      }
      if (exposedEnabled) fail('Future-day write lock', 'enabled start/readiness action is visible')
      else pass('Future-day write lock')
      await capture(page, 'Train Future Day Preview')
      await assertNoOverflow(page, 'Train Future Day Preview')
    }
  }

  // Narrow Galaxy/older-phone width sanity pass.
  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(100)
  await assertNoOverflow(page, '360px mobile shell')
  await capture(page, 'Train 360px')
} finally {
  await browser.close()
}

const uniqueErrors = [...new Set(errors)]
for (const error of uniqueErrors) fail('Browser runtime error', error)
const report = { generatedAt: new Date().toISOString(), result: failures.length ? 'FAIL' : 'PASS', failures, warnings, screens, errors: uniqueErrors }
fs.writeFileSync(path.join(outDir, 'browser-smoke-audit.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(outDir, 'browser-smoke-audit.md'), [
  '# LetMeFly Mobile Browser Smoke Audit', '', `Result: **${report.result}**`, `Screens captured: ${screens.length}`, `Failures: ${failures.length}`, `Warnings: ${warnings.length}`, '',
  '## Failures', ...(failures.length ? failures.map((x) => `- ${x.label}${x.detail ? ` — ${x.detail}` : ''}`) : ['- None']), '',
  '## Warnings', ...(warnings.length ? warnings.map((x) => `- ${x.label}${x.detail ? ` — ${x.detail}` : ''}`) : ['- None']), '',
].join('\n'))
console.log(`Browser screens captured: ${screens.length}`)
console.log(`Browser failures: ${failures.length}`)
console.log(`Browser warnings: ${warnings.length}`)
if (failures.length) process.exit(1)
console.log('LetMeFly mobile browser screen/tab smoke audit: PASS')
