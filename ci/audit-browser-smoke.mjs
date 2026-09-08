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

async function clickable(page, label) {
  const pattern = new RegExp(`\\b${esc(label)}\\b`, 'i')
  return await firstVisible(page.locator('nav button,nav a,nav [role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
}

async function clickLabel(page, label, required = true) {
  const item = await clickable(page, label)
  if (!item) {
    if (required) fail(`Browser control ${label}`, 'not found/visible')
    return false
  }
  const clicked = await item.click({ timeout: 5000 }).then(() => true).catch((error) => {
    if (required) fail(`Browser control ${label}`, error.message)
    return false
  })
  if (!clicked) return false
  await page.waitForTimeout(260)
  return true
}

async function bootstrapEphemeralAthlete(page) {
  const body = await page.locator('body').innerText()
  if (!/BUILD THE ATHLETE VAULT|CREATE LOCAL ATHLETE/i.test(body)) {
    pass('Browser athlete bootstrap', 'existing/fresh app state does not require setup')
    return
  }

  const create = await clickable(page, 'CREATE LOCAL ATHLETE')
  if (!create) {
    fail('Browser athlete bootstrap', 'Create Local Athlete control not found')
    return
  }
  const displayInput = await firstVisible(page.locator('input[type="text"],input:not([type])'))
  if (!displayInput) {
    fail('Browser athlete bootstrap', 'display-name input not found')
    return
  }
  await displayInput.fill('QA Athlete')
  await create.click({ timeout: 5000 })
  await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)
  await page.waitForTimeout(700)

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
  const d2 = await findDay2(page)
  if (!d2) {
    fail('Future-day browser preview', 'D2 selector not visible after Train settled')
    return
  }
  await d2.click({ timeout: 5000 })
  await page.waitForTimeout(650)
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
  const toggle = page.locator('.lmf-preview-plan-toggle').first()
  if (!(await card.isVisible().catch(() => false)) || !(await toggle.isVisible().catch(() => false))) {
    fail('Future-day compact exercise card', 'compact preview card / VIEW FULL PLAN control missing')
  } else {
    const collapsed = await card.getAttribute('data-lmf-preview-collapsed')
    const box = await card.boundingBox()
    if (collapsed !== 'true') fail('Future-day compact exercise card', `default collapsed state=${collapsed}`)
    else if (box && box.height > 190) fail('Future-day compact exercise card', `collapsed card height ${Math.round(box.height)}px is too tall`)
    else pass('Future-day compact exercise card', box ? `${Math.round(box.height)}px tall` : 'collapsed')

    await toggle.click({ timeout: 5000 })
    await page.waitForTimeout(220)
    const expanded = await toggle.getAttribute('aria-expanded')
    const details = card.locator(':scope > .prescription-block')
    if (expanded === 'true' && await details.isVisible().catch(() => false)) pass('Future-day full-plan expansion')
    else fail('Future-day full-plan expansion', `aria-expanded=${expanded}`)
    await toggle.click({ timeout: 5000 })
    await page.waitForTimeout(120)
  }

  await capture(page, 'Train Future Day Preview')
  await assertNoOverflow(page, 'Train Future Day Preview')
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

  await bootstrapEphemeralAthlete(page)
  await capture(page, 'Home')
  await assertNoOverflow(page, 'Home')

  for (const tab of ['TRAIN', 'PROGRAM', 'PROGRESS', 'MORE', 'HOME']) {
    if (await clickLabel(page, tab)) {
      await capture(page, tab)
      await assertNoOverflow(page, tab)
    }
  }

  await auditProgressTabs(page)

  for (const destination of ['EXERCISES', 'COACH', 'PROFILE', 'CALENDAR']) {
    if (!(await clickLabel(page, 'MORE'))) continue
    if (await clickLabel(page, destination)) {
      await capture(page, destination)
      await assertNoOverflow(page, destination)
    }
  }

  await auditFuturePreview(page)

  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(180)
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
