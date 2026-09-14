#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'PRODUCTION_DAY3_CIRCUIT_SMOKE')
fs.mkdirSync(outDir, { recursive: true })

const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
const baseUrl = String(process.env.LMF_AUDIT_BASE_URL || 'https://let-me-fly.netlify.app').replace(/\/+$/, '')
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result: 'PASS', baseUrl, failures: [], passes: [], observations: {} }
const pass = (label, detail = '') => { report.passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const fail = (label, detail = '') => { report.result = 'FAIL'; report.failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
const esc = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function dismissInstall(page) {
  const candidates = [
    page.locator('.modal-backdrop button,.modal-backdrop a,.modal-backdrop [role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
    page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
  ]
  for (const locator of candidates) {
    const button = await firstVisible(locator)
    if (!button) continue
    if (await button.click({ timeout: 1500 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(120)
      return true
    }
  }
  return false
}

async function clickable(page, label) {
  const pattern = label instanceof RegExp ? label : new RegExp(`\\b${esc(label)}\\b`, 'i')
  return await firstVisible(page.locator('nav button,nav a,nav [role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
}

async function bootstrap(page) {
  await page.goto(`${baseUrl}/?qa=production-day3-circuit`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForFunction(() => /LETMEFLY/i.test(document.body.innerText), null, { timeout: 8000 })
  await dismissInstall(page)

  let create = await clickable(page, 'CREATE LOCAL ATHLETE')
  if (!create) {
    for (let i = 0; i < 10 && !create; i += 1) {
      await dismissInstall(page)
      await page.waitForTimeout(120)
      create = await clickable(page, 'CREATE LOCAL ATHLETE')
    }
  }
  if (!create) throw new Error('CREATE LOCAL ATHLETE control missing')

  const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
  const input = await firstVisible(modal.locator('input[type="text"],input:not([type])'))
    || await firstVisible(page.locator('input[type="text"],input:not([type])'))
  if (!input) throw new Error('Athlete display-name input missing')
  await input.fill('Production Day 3 Circuit QA')
  await create.click({ timeout: 5000 })
  await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 })
  pass('Disposable local athlete created')
}

async function makeDay3Current(page) {
  const train = await clickable(page, 'TRAIN')
  if (!train) throw new Error('TRAIN control missing')
  await train.click({ timeout: 5000 })
  await page.waitForTimeout(350)
  await dismissInstall(page)

  const day3 = await firstVisible(page.locator('[data-day],[data-day-key],[data-position],[data-date],button,[role="button"]').filter({ hasText: /^\s*D3\b/i }))
    || await firstVisible(page.getByText(/^\s*D3\b/i))
  if (!day3) throw new Error('Day 3 selector missing')
  await day3.click({ timeout: 5000 })
  await page.waitForTimeout(350)

  const before = await page.locator('body').innerText()
  if (!/Preview position|Preview only/i.test(before)) throw new Error('Day 3 did not enter preview state')

  const makeCurrent = await firstVisible(page.locator('[data-action="make-current-position"]'))
    || await clickable(page, 'MAKE CURRENT POSITION')
  if (!makeCurrent) throw new Error('MAKE CURRENT POSITION control missing')

  let dialogSeen = false
  page.once('dialog', async dialog => {
    dialogSeen = true
    await dialog.accept()
  })
  await makeCurrent.click({ timeout: 5000 })
  await page.waitForFunction(() => !/Preview position|Preview only/i.test(document.body.innerText), null, { timeout: 8000 })
  await page.waitForTimeout(300)

  if (!dialogSeen) throw new Error('MAKE CURRENT POSITION confirmation dialog was not observed')
  const readiness = await page.locator('.readiness-field input[type="radio"]').count()
  if (readiness < 4) throw new Error(`Readiness did not unlock after reposition; found ${readiness} inputs`)
  pass('Preview-to-current transition succeeds', 'Confirmation accepted; readiness unlocked')
}

async function startWorkout(page) {
  const selected = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.readiness-field input[type="radio"][value="4"]')]
    for (const node of inputs) {
      if (!(node instanceof HTMLInputElement)) continue
      node.checked = true
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return inputs.length
  })
  if (selected < 4) throw new Error(`Expected four readiness groups, found ${selected}`)

  const start = await firstVisible(page.locator('[data-action="start-workout"]'))
    || await clickable(page, 'START WORKOUT')
  if (!start) throw new Error('START WORKOUT control missing')
  await start.click({ timeout: 5000 })

  await page.waitForSelector('.workout-panel[data-group-type="round"]', { timeout: 10000 })
  await page.waitForFunction(() => {
    const panels = [...document.querySelectorAll('.workout-panel[data-group-type="round"]')]
    return panels.some(panel => panel.querySelectorAll('.exercise-stack > .active-exercise').length > 1)
  }, null, { timeout: 10000 })
  pass('Governed Day 3 round opens in Workout Mode')
}

async function assertCircuitPresentation(page) {
  await page.waitForFunction(() => {
    const panel = [...document.querySelectorAll('.workout-panel[data-group-type="round"]')]
      .find(node => node.querySelectorAll('.exercise-stack > .active-exercise').length > 1)
    if (!panel) return false
    const strip = panel.querySelector(':scope > .lmf-circuit-strip')
    const codes = [...panel.querySelectorAll('.lmf-circuit-movement-code')]
    return strip && codes.length >= 2
  }, null, { timeout: 10000 })

  const state = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.workout-panel[data-group-type="round"]')]
      .find(node => node.querySelectorAll('.exercise-stack > .active-exercise').length > 1)
    if (!(panel instanceof HTMLElement)) return null
    const strip = panel.querySelector(':scope > .lmf-circuit-strip')
    const cards = [...panel.querySelectorAll('.exercise-stack > .active-exercise')]
    const codes = cards.map(card => (card.querySelector('.lmf-circuit-movement-code')?.textContent || '').trim())
    const titles = cards.map(card => (card.querySelector('.exercise-title h3')?.textContent || '').trim())
    return {
      groupType: panel.dataset.groupType || '',
      heading: (panel.querySelector('.workout-panel-head h2')?.textContent || '').trim(),
      stripLabel: (strip?.querySelector('strong')?.textContent || '').trim(),
      stripDetail: (strip?.querySelector('span')?.textContent || '').trim(),
      stripVisible: strip instanceof HTMLElement ? getComputedStyle(strip).display !== 'none' : false,
      cards: cards.length,
      titles,
      codes,
      codeVisible: cards.map(card => {
        const code = card.querySelector('.lmf-circuit-movement-code')
        return code instanceof HTMLElement ? getComputedStyle(code).display !== 'none' : false
      }),
      runtimeLoaded: Boolean(window.__LMF_CIRCUIT_TRAIN_V1__),
      shellClass: Boolean(document.querySelector('.train-shell.lmf-circuit-train-v1')),
    }
  })

  report.observations.circuit = state
  if (!state) throw new Error('Structured round panel disappeared')
  if (state.groupType !== 'round') fail('Governed round metadata', `group=${state.groupType}`)
  else pass('Governed round metadata', state.heading)

  if (state.stripLabel === 'CIRCUIT' && state.stripVisible && /movements?/i.test(state.stripDetail)) {
    pass('Visible CIRCUIT strip', state.stripDetail)
  } else {
    fail('Visible CIRCUIT strip', JSON.stringify(state))
  }

  const codePattern = /^[A-Z]\d+$/
  const codesValid = state.codes.length === state.cards
    && state.codes.every(code => codePattern.test(code))
    && state.codeVisible.every(Boolean)
  if (codesValid) pass('Visible circuit movement-code badges', state.codes.join(' → '))
  else fail('Visible circuit movement-code badges', JSON.stringify({ cards: state.cards, codes: state.codes, codeVisible: state.codeVisible }))

  if (state.runtimeLoaded && state.shellClass) pass('Circuit runtime is active on Train shell')
  else fail('Circuit runtime is active on Train shell', JSON.stringify({ runtimeLoaded: state.runtimeLoaded, shellClass: state.shellClass }))
}

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const page = await context.newPage()

try {
  await bootstrap(page)
  await makeDay3Current(page)
  await startWorkout(page)
  await assertCircuitPresentation(page)
} catch (error) {
  fail('Production Day 3 circuit smoke execution', error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => null)
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(outDir, 'report.md'), [
  '# LetMeFly Production Day 3 Circuit Smoke',
  '',
  `Base URL: ${baseUrl}`,
  `Result: **${report.result}**`,
  '',
  '## Passes',
  ...(report.passes.length ? report.passes.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Failures',
  ...(report.failures.length ? report.failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
].join('\n'))

if (report.failures.length) process.exit(1)
console.log('LetMeFly targeted production Day 3 circuit smoke: PASS')
