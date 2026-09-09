#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'WORKOUT_PERSISTENCE_BROWSER_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result: 'PASS', failures: [], passes: [], observations: {} }
const pass = (label, detail = '') => { report.passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const fail = (label, detail = '') => { report.result = 'FAIL'; report.failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) if (await locator.nth(i).isVisible().catch(() => false)) return locator.nth(i)
  return null
}

async function clickText(page, pattern) {
  const item = await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
  if (!item) throw new Error(`Control not found: ${pattern}`)
  await item.click({ timeout: 5000 })
  await page.waitForTimeout(250)
}

async function dismissInstall(page) {
  const button = await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }))
  if (button) await button.click().catch(() => null)
}

async function bootstrap(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  for (let i = 0; i < 12; i += 1) { await dismissInstall(page); await page.waitForTimeout(120) }
  const create = await firstVisible(page.locator('button').filter({ hasText: /CREATE LOCAL ATHLETE/i }))
  if (create) {
    const input = await firstVisible(page.locator('input[type="text"],input:not([type])'))
    if (!input) throw new Error('Athlete display-name input missing')
    await input.fill('Persistence QA Athlete')
    await create.click()
    await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 })
  }
  await dismissInstall(page)
}

async function fillReadiness(page) {
  const radios = page.locator('.readiness-field input[type="radio"][value="4"]')
  const count = await radios.count()
  if (count < 4) throw new Error(`Expected four readiness groups, found ${count}`)
  for (let i = 0; i < 4; i += 1) await radios.nth(i).check({ force: true })
}

async function readReview(page) {
  const heading = page.locator('.review-panel h2').first()
  const text = (await heading.textContent().catch(() => ''))?.trim() || ''
  const match = text.match(/(\d+)\s*\/\s*(\d+)\s*sets logged/i)
  return match ? { done: Number(match[1]), total: Number(match[2]), text } : { done: null, total: null, text }
}

async function dbSet(page, setId) {
  return page.evaluate(async (id) => {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : []
    const names = databases.map((entry) => entry.name).filter(Boolean)
    for (const name of names) {
      const result = await new Promise((resolve) => {
        const request = indexedDB.open(name)
        request.onerror = () => resolve(null)
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('workoutSets')) { db.close(); resolve(null); return }
          const tx = db.transaction('workoutSets', 'readonly')
          const get = tx.objectStore('workoutSets').get(id)
          get.onerror = () => { db.close(); resolve(null) }
          get.onsuccess = () => { const value = get.result || null; db.close(); resolve(value) }
        }
      })
      if (result) return { database: name, record: result }
    }
    return { database: names.join(','), record: null }
  }, setId)
}

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const page = await context.newPage()

try {
  await bootstrap(page)
  await clickText(page, /^\s*TRAIN\s*$/i)
  await page.waitForTimeout(500)
  await fillReadiness(page)
  const start = await firstVisible(page.locator('[data-action="start-workout"]'))
  if (!start) throw new Error('Start Workout control not found')
  await start.click()
  await page.waitForSelector('.set-row[data-set-id]', { timeout: 10000 })
  await page.waitForTimeout(500)

  const review0 = await readReview(page)
  report.observations.initialReview = review0
  if (review0.done === 0 && Number.isFinite(review0.total) && review0.total > 0) pass('Initial Review count', review0.text)
  else fail('Initial Review count', review0.text || 'unreadable')

  const row = page.locator('.set-row[data-set-id]').first()
  const setId = await row.getAttribute('data-set-id')
  if (!setId) throw new Error('First set ID missing')
  const check = row.locator('.set-check[data-action="toggle-set"]')
  const load = row.locator('.load-input')
  const loadWasBlank = (await load.inputValue()) === ''
  if (loadWasBlank) await load.fill('40')

  await check.click()
  await page.waitForFunction((id) => document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'), setId, { timeout: 8000 })
  await page.waitForTimeout(700)

  const stored1 = await dbSet(page, setId)
  report.observations.savedRecord = stored1
  if (stored1.record?.completed === true) pass('Native IndexedDB set completion', `set ${setId} completed=true`)
  else fail('Native IndexedDB set completion', JSON.stringify(stored1.record))

  const reviewAfterSave = await readReview(page)
  report.observations.reviewAfterSave = reviewAfterSave
  if (reviewAfterSave.done === 1) pass('Review increments after native save', reviewAfterSave.text)
  else fail('Review increments after native save', `expected 1, saw ${reviewAfterSave.text}`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.set-row[data-set-id]', { timeout: 10000 })
  await page.waitForTimeout(700)
  const reviewAfterReload = await readReview(page)
  report.observations.reviewAfterReload = reviewAfterReload
  if (reviewAfterReload.done === 1) pass('Review survives authoritative reload', reviewAfterReload.text)
  else fail('Review survives authoritative reload', `expected 1, saw ${reviewAfterReload.text}`)

  const rowReload = page.locator(`[data-set-id="${setId}"]`)
  const checkReload = rowReload.locator('.set-check[data-action="toggle-set"]')
  if (await checkReload.count()) {
    await checkReload.click()
    await page.waitForFunction((id) => !document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'), setId, { timeout: 8000 })
    await page.waitForTimeout(700)
    const stored2 = await dbSet(page, setId)
    if (stored2.record?.completed === false) pass('Native IndexedDB reopen', `set ${setId} completed=false`)
    else fail('Native IndexedDB reopen', JSON.stringify(stored2.record))
    const reviewAfterReopen = await readReview(page)
    report.observations.reviewAfterReopen = reviewAfterReopen
    if (reviewAfterReopen.done === 0) pass('Review decrements after reopen', reviewAfterReopen.text)
    else fail('Review decrements after reopen', `expected 0, saw ${reviewAfterReopen.text}`)
  } else fail('Reloaded set control', 'original set ID not found after reload')

  // Carry-forward is tested only when the chosen exercise has no program load.
  if (loadWasBlank) {
    // Re-complete Set 1 at 40 so the next set becomes the carry target.
    await rowReload.locator('.load-input').fill('40')
    await rowReload.locator('.set-check[data-action="toggle-set"]').click()
    await page.waitForTimeout(900)
    const card = rowReload.locator('xpath=ancestor::*[contains(@class,"active-exercise")][1]')
    const rows = card.locator('.set-row[data-set-id]')
    if (await rows.count() >= 2) {
      const nextLoad = await rows.nth(1).locator('.load-input').inputValue()
      report.observations.unprescribedCarry = nextLoad
      if (nextLoad === '40') pass('Unprescribed load carries Set 1 → Set 2', '40 lb')
      else fail('Unprescribed load carries Set 1 → Set 2', `expected 40, saw ${nextLoad || 'blank'}`)
    }
  }
} catch (error) {
  fail('Persistence browser audit execution', error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => null)
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (report.failures.length) process.exit(1)
