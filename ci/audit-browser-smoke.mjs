#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { applicationBootState } from './browser-boot-contract.mjs'

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
// Cross-origin exercise art/cloud services can legitimately decline a probe in the
// disposable CI browser. Same-origin HTTP failures are tracked separately below.
const externalNoise = /supabase|cloudinary|net::ERR_|Failed to fetch|NetworkError|Failed to load resource/i
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

async function optionalInstallDismiss(page) {
  const candidates = [
    page.locator('.modal-backdrop button,.modal-backdrop a,.modal-backdrop [role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
    page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
  ]
  for (const locator of candidates) {
    const button = await firstVisible(locator)
    if (!button) continue
    const modalText = await button.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]').innerText().catch(() => '')
    if (modalText && !/Install LetMeFly|Install help|install LetMeFly/i.test(modalText)) continue
    const dismissed = await button.click({ timeout: 2500 }).then(() => true).catch(() => false)
    if (dismissed) {
      await page.waitForTimeout(180)
      pass('Optional install prompt', 'dismissed for browser audit')
      return true
    }
  }
  return false
}

async function settleFirstRunPrompts(page, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const dismissed = await optionalInstallDismiss(page)
    if (dismissed) continue
    await page.waitForTimeout(180)
  }
}

async function clickable(page, label) {
  const pattern = new RegExp(`\\b${esc(label)}\\b`, 'i')
  return await firstVisible(page.locator('nav button,nav a,nav [role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
}

async function clickLabel(page, label, required = true) {
  await optionalInstallDismiss(page)
  const item = await clickable(page, label)
  if (!item) {
    if (required) fail(`Browser control ${label}`, 'not found/visible')
    return false
  }
  const clicked = await item.click({ timeout: 5000 }).then(() => true).catch(async (error) => {
    // The optional PWA prompt can arrive a moment after route content. Dismiss it
    // once and retry the actual app control rather than treating the overlay as
    // a route failure.
    if (await optionalInstallDismiss(page)) {
      return await item.click({ timeout: 5000 }).then(() => true).catch(() => false)
    }
    if (required) fail(`Browser control ${label}`, error.message)
    return false
  })
  if (!clicked) {
    if (required && !failures.some((x) => x.label === `Browser control ${label}`)) fail(`Browser control ${label}`, 'click failed after optional-prompt retry')
    return false
  }
  await page.waitForTimeout(260)
  await optionalInstallDismiss(page)
  return true
}

async function bootstrapEphemeralAthlete(page) {
  // First-run UI is intentionally asynchronous: the shell can render before the
  // local-vault modal. Keep polling the real setup control on slower CI runners
  // rather than treating delayed IndexedDB/bootstrap work as an absent app.
  let create = null
  for (let i = 0; i < 80; i += 1) {
    await optionalInstallDismiss(page)
    create = await clickable(page, 'CREATE LOCAL ATHLETE')
    if (create) break
    if (await page.locator('.lmf-home-command-v4').count().catch(() => 0)) break
    await page.waitForTimeout(180)
  }

  if (!create) {
    const body = await page.locator('body').innerText()
    if (/BUILD THE ATHLETE VAULT|CREATE LOCAL ATHLETE/i.test(body)) {
      fail('Browser athlete bootstrap', 'first-run athlete modal is present but Create Local Athlete is not usable')
    } else {
      pass('Browser athlete bootstrap', 'existing/fresh app state does not require setup')
    }
    return
  }

  const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
  let displayInput = null
  for (let i = 0; i < 40; i += 1) {
    displayInput = await firstVisible(modal.locator('input[type="text"],input:not([type])'))
      || await firstVisible(page.locator('input[type="text"],input:not([type])'))
    if (displayInput) break
    await page.waitForTimeout(180)
  }
  if (!displayInput) {
    fail('Browser athlete bootstrap', 'display-name input not found after first-run modal settled')
    return
  }

  await displayInput.fill('QA Athlete')
  await optionalInstallDismiss(page)
  await create.click({ timeout: 5000 })
  await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 12000 }).catch(() => null)
  await page.waitForTimeout(450)
  await settleFirstRunPrompts(page, 5)

  const after = await page.locator('body').innerText()
  if (/CREATE LOCAL ATHLETE/i.test(after)) fail('Browser athlete bootstrap', 'first-run modal remained open')
  else pass('Browser athlete bootstrap', 'isolated local QA athlete created')
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

async function auditProgressTabs(page) {
  if (!(await clickLabel(page, 'PROGRESS'))) return
  const tabs = page.locator('.lmf-pg-tabs')
  const appeared = await tabs.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
  if (!appeared) {
    fail('Progress dashboard runtime', 'Overview / Strength / Body / Conditioning / PRs navigation did not mount')
    await capture(page, 'Progress Missing Dashboard')
    return
  }
  pass('Progress dashboard runtime', 'section navigation mounted')
  for (const tab of ['overview', 'strength', 'body', 'conditioning', 'prs']) {
    const button = page.locator(`[data-pg-tab="${tab}"]`).first()
    if (!(await button.isVisible().catch(() => false))) {
      fail(`Progress ${tab} tab`, 'not found/visible')
      continue
    }
    await button.click({ timeout: 5000 })
    await page.waitForTimeout(350)
    const selected = await button.getAttribute('aria-selected')
    if (selected !== 'true') fail(`Progress ${tab} tab`, `aria-selected=${selected}`)
    else pass(`Progress ${tab} tab`)
    await capture(page, `Progress ${tab}`)
    await assertNoOverflow(page, `Progress ${tab}`)
  }
}

async function findDay2(page) {
  const pattern = /^\s*D2\b/i
  const candidates = [
    page.locator('[data-day],[data-day-key],[data-position],[data-date],button,[role="button"]').filter({ hasText: pattern }),
    page.getByText(pattern),
  ]
  for (const locator of candidates) {
    const item = await firstVisible(locator)
    if (item) return item
  }
  return null
}

async function auditFuturePreview(page) {
  if (!(await clickLabel(page, 'TRAIN'))) return
  await page.waitForTimeout(500)
  await optionalInstallDismiss(page)
  const d2 = await findDay2(page)
  if (!d2) {
    fail('Future-day browser preview', 'D2 selector not visible after Train settled')
    return
  }
  await d2.click({ timeout: 5000 })
  await page.waitForTimeout(650)
  await optionalInstallDismiss(page)
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

  const card = page.locator('.preview-card[data-exercise-art]').first()
  if (!(await card.isVisible().catch(() => false))) {
    fail('Future-day Day 1 exercise card', 'preview exercise card missing')
  } else {
    const visual = await card.evaluate((el) => {
      const pseudo = getComputedStyle(el, '::before')
      return {
        marker: el.getAttribute('data-lmf-preview-day1-style'),
        width: Number.parseFloat(pseudo.width) || 0,
        height: Number.parseFloat(pseudo.height) || 0,
        image: pseudo.backgroundImage || '',
      }
    })
    const details = card.locator(':scope > .prescription-block')
    const detailsVisible = await details.isVisible().catch(() => false)
    const toggleVisible = await firstVisible(card.locator(':scope > .lmf-preview-plan-toggle'))
    const squareEnough = visual.width >= 250 && visual.height >= 250 && Math.abs(visual.width - visual.height) <= 8
    if (visual.marker !== 'true') fail('Future-day Day 1 exercise card', `style marker=${visual.marker}`)
    else if (!squareEnough) fail('Future-day Day 1 exercise card', `hero media ${Math.round(visual.width)}×${Math.round(visual.height)}px`)
    else if (!visual.image || visual.image === 'none') fail('Future-day Day 1 exercise card', 'hero exercise image not applied')
    else if (!detailsVisible) fail('Future-day Day 1 exercise card', 'governed prescription is not visible by default')
    else if (toggleVisible) fail('Future-day Day 1 exercise card', 'legacy VIEW FULL PLAN control is still visible')
    else pass('Future-day Day 1 exercise card', `${Math.round(visual.width)}×${Math.round(visual.height)}px hero; details open`)

    const logger = card.locator('.lmf-preview-readonly-logger').first()
    if (!(await logger.isVisible().catch(() => false))) {
      fail('Future-day set logger parity', 'read-only Day 1-style set logger did not mount')
    } else {
      const metrics = await logger.locator('.lmf-preview-metric').evaluateAll((nodes) => nodes.map((node) => ({
        label: (node.querySelector(':scope > span')?.textContent || '').trim(),
        value: (node.querySelector('.lmf-preview-stepper strong')?.textContent || '').trim(),
      })))
      const labels = metrics.map((x) => x.label.toUpperCase())
      const loadMetric = metrics.find((x) => x.label.toUpperCase() === 'LOAD')
      if (!labels.includes('REPS') || !labels.includes('LOAD') || !labels.includes('RPE / RIR')) {
        fail('Future-day set logger parity', `metric labels=${labels.join(', ')}`)
      } else if (!loadMetric?.value) {
        fail('Future-day prescribed load', 'LOAD field is empty')
      } else {
        pass('Future-day set logger parity', 'REPS / LOAD / RPE-RIR fields mounted')
        pass('Future-day prescribed load', `preview shows ${loadMetric.value}`)
      }

      const steppers = logger.locator('.lmf-preview-stepper button')
      let allDisabled = (await steppers.count()) > 0
      for (let i = 0; i < await steppers.count(); i += 1) {
        if (await steppers.nth(i).isEnabled().catch(() => true)) allDisabled = false
      }
      if (!allDisabled) fail('Future-day set logging lock', 'preview stepper control is enabled')
      else pass('Future-day set logging lock', 'all set steppers are disabled')
    }
  }

  await capture(page, 'Train Future Day Preview')
  await assertNoOverflow(page, 'Train Future Day Preview')
}

// Prove this readiness predicate rejects broken/placeholder UI before using it.
execFileSync(process.execPath, [path.join(root, 'ci/audit-browser-boot-contract.mjs')], { stdio: 'inherit' })

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
  // A PWA install prompt contains the brand before the application is ready.
  // Wait on the actual first-run form or content/navigation, not transient text.
  await optionalInstallDismiss(page)
  try {
    const ready = await page.waitForFunction(applicationBootState, null, { timeout: 20000 })
    pass('Browser app boot', await ready.jsonValue())
    await ready.dispose()
  } catch (error) {
    await capture(page, 'Boot Failure')
    const bootText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 700)
    fail('Browser app boot', `Usable application UI missing after startup window: ${bootText || '(blank)'}; ${error.message}`)
  }

  await bootstrapEphemeralAthlete(page)
  await settleFirstRunPrompts(page, 6)
  await capture(page, 'Home')
  await assertNoOverflow(page, 'Home')

  for (const tab of ['TRAIN', 'PROGRAM', 'PROGRESS', 'MORE', 'HOME']) {
    if (await clickLabel(page, tab)) {
      await capture(page, tab)
      await assertNoOverflow(page, tab)
    }
  }

  await auditProgressTabs(page)

  const secondaryDestinations = [
    ['RESOURCES', 'EXERCISES'],
    ['COACH', 'COACH'],
    ['DATA & BACKUP', 'PROFILE'],
    ['CALENDAR', 'CALENDAR'],
  ]
  for (const [controlLabel, screenName] of secondaryDestinations) {
    if (!(await clickLabel(page, 'MORE'))) continue
    if (await clickLabel(page, controlLabel)) {
      await capture(page, screenName)
      await assertNoOverflow(page, screenName)
    }
  }

  await auditFuturePreview(page)

  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(180)
  await optionalInstallDismiss(page)
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
