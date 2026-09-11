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
const esc = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
    if (await button.click({ timeout: 2500 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(180)
      return true
    }
  }
  return false
}

async function settleFirstRunPrompts(page, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    if (await optionalInstallDismiss(page)) continue
    await page.waitForTimeout(180)
  }
}

async function clickable(page, label) {
  const pattern = label instanceof RegExp ? label : new RegExp(`\\b${esc(label)}\\b`, 'i')
  return await firstVisible(page.locator('nav button,nav a,nav [role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
}

async function clickLabel(page, label) {
  await optionalInstallDismiss(page)
  let item = await clickable(page, label)
  if (!item) {
    await settleFirstRunPrompts(page, 5)
    item = await clickable(page, label)
  }
  if (!item) throw new Error(`Control not found: ${label}`)
  let clicked = await item.click({ timeout: 5000 }).then(() => true).catch(() => false)
  if (!clicked && await optionalInstallDismiss(page)) {
    item = await clickable(page, label)
    clicked = Boolean(item) && await item.click({ timeout: 5000 }).then(() => true).catch(() => false)
  }
  if (!clicked) throw new Error(`Control click failed: ${label}`)
  await page.waitForTimeout(320)
  await optionalInstallDismiss(page)
}

async function bootstrapEphemeralAthlete(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForFunction(() => /LETMEFLY/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)

  let create = null
  for (let i = 0; i < 16; i += 1) {
    await optionalInstallDismiss(page)
    create = await clickable(page, 'CREATE LOCAL ATHLETE')
    if (create) break
    await page.waitForTimeout(180)
  }

  if (create) {
    const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
    const input = await firstVisible(modal.locator('input[type="text"],input:not([type])'))
      || await firstVisible(page.locator('input[type="text"],input:not([type])'))
    if (!input) throw new Error('Athlete display-name input missing')
    await input.fill('Persistence QA Athlete')
    await create.click({ timeout: 5000 })
    await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 })
    await page.waitForTimeout(450)
  }
  await settleFirstRunPrompts(page, 6)
  pass('Browser athlete bootstrap')
}

async function fillReadiness(page) {
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
}

async function readReview(page) {
  const heading = page.locator('.review-panel h2').first()
  const value = (await heading.textContent().catch(() => ''))?.trim() || ''
  const match = value.match(/(\d+)\s*\/\s*(\d+)\s*sets logged/i)
  return match ? { done: Number(match[1]), total: Number(match[2]), text: value } : { done: null, total: null, text: value }
}

async function dbSet(page, setId) {
  return page.evaluate(async id => {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : []
    const names = databases.map(entry => entry.name).filter(Boolean)
    for (const name of names) {
      const record = await new Promise(resolve => {
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
      if (record) return { database: name, record }
    }
    return { database: names.join(','), record: null }
  }, setId)
}

async function waitDone(page, setId, expected) {
  await page.waitForFunction(({ id, expected }) => {
    const done = document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done') === true
    return done === expected
  }, { id: setId, expected }, { timeout: 8000 })
}

async function triggerNativeReopen(page, setId) {
  return page.evaluate(id => {
    const row = document.querySelector(`[data-set-id="${id}"]`)
    if (!(row instanceof HTMLElement)) return { ok:false, route:'missing-row' }
    const undo = row.querySelector('[data-lmf-saved-set-action="undo"]')
    if (undo instanceof HTMLButtonElement) {
      undo.click()
      return { ok:true, route:'saved-set-undo' }
    }
    const check = row.querySelector('.set-check[data-action="toggle-set"]')
    if (check instanceof HTMLButtonElement) {
      check.click()
      return { ok:true, route:'native-set-toggle' }
    }
    return { ok:false, route:'missing-toggle' }
  }, setId)
}

async function findUnprescribedCarryCard(page) {
  return page.evaluate(() => {
    const prescribed = /(?:\b\d+(?:\.\d+)?\s*%\b|\bpercent(?:age)?\b|\btraining\s*max\b|\bTM\b|\b\d+(?:\.\d+)?\s*(?:lb|lbs|kg|kgs)\b|\bbody\s*weight\b|\bbodyweight\b|\bBW\b)/i
    const cards = [...document.querySelectorAll('.active-exercise')]
    for (const card of cards) {
      const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
      if (rows.length < 2) continue
      const first = rows[0]
      const second = rows[1]
      const firstLoad = first.querySelector('.load-input')
      const secondLoad = second.querySelector('.load-input')
      if (!(firstLoad instanceof HTMLInputElement) || !(secondLoad instanceof HTMLInputElement)) continue
      if (firstLoad.value.trim() || secondLoad.value.trim()) continue
      const source = [
        ...[...first.attributes].map(a => `${a.name}=${a.value}`),
        first.querySelector('.set-target-cell')?.textContent || '',
        first.querySelector('.load-field small')?.textContent || '',
        card.querySelector('.exercise-title')?.textContent || '',
      ].join(' ')
      if (prescribed.test(source)) continue
      const name = (card.querySelector('.exercise-title h3')?.textContent || '').trim()
      return { firstId: first.dataset.setId, secondId: second.dataset.setId, name }
    }
    return null
  })
}

async function saveUnprescribedForty(page, setId) {
  return page.evaluate(id => {
    const row = document.querySelector(`[data-set-id="${id}"]`)
    if (!(row instanceof HTMLElement)) return { ok:false, reason:'row missing' }
    const load = row.querySelector('.load-input')
    const check = row.querySelector('.set-check[data-action="toggle-set"]')
    if (!(load instanceof HTMLInputElement) || !(check instanceof HTMLButtonElement)) return { ok:false, reason:'input/toggle missing' }
    load.value = '40'
    load.dispatchEvent(new Event('input', { bubbles:true }))
    load.dispatchEvent(new Event('change', { bubbles:true }))
    check.click()
    return { ok:true }
  }, setId)
}

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const page = await context.newPage()

try {
  await bootstrapEphemeralAthlete(page)
  await clickLabel(page, 'TRAIN')
  await page.waitForTimeout(500)
  await fillReadiness(page)
  const start = await firstVisible(page.locator('[data-action="start-workout"]'))
  if (!start) throw new Error('Start Workout control not found')
  await start.click({ timeout: 5000 })
  await page.waitForSelector('.set-row[data-set-id]', { timeout: 10000 })
  await page.waitForTimeout(600)

  const review0 = await readReview(page)
  report.observations.initialReview = review0
  if (review0.done === 0 && Number.isFinite(review0.total) && review0.total > 0) pass('Initial Review count', review0.text)
  else fail('Initial Review count', review0.text || 'unreadable')

  const row = page.locator('.set-row[data-set-id]').first()
  const setId = await row.getAttribute('data-set-id')
  if (!setId) throw new Error('First set ID missing')
  const check = row.locator('.set-check[data-action="toggle-set"]')
  await check.click()
  await waitDone(page, setId, true)
  await page.waitForTimeout(900)

  const stored1 = await dbSet(page, setId)
  report.observations.savedRecord = stored1
  if (stored1.record?.completed === true) pass('Native IndexedDB set completion', `set ${setId} completed=true`)
  else fail('Native IndexedDB set completion', JSON.stringify(stored1.record))

  const reviewAfterSave = await readReview(page)
  report.observations.reviewAfterSave = reviewAfterSave
  if (reviewAfterSave.done === 1) pass('Review increments after native save', reviewAfterSave.text)
  else fail('Review increments after native save', `expected 1, saw ${reviewAfterSave.text || 'unreadable'}`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  // A resumed workout may open on Readiness, so its first set can legitimately
  // be in a hidden carousel panel. Require the exact saved row to be mounted,
  // then verify its authoritative database record, not incidental panel focus.
  await page.waitForSelector(`[data-set-id="${setId}"]`, { state: 'attached', timeout: 10000 })
  await settleFirstRunPrompts(page, 3)
  await page.waitForTimeout(700)
  const persistedAfterReload = await dbSet(page, setId)
  report.observations.persistedAfterReload = persistedAfterReload
  if (persistedAfterReload.record?.completed === true
    && persistedAfterReload.record.workout_session_id === stored1.record?.workout_session_id
    && persistedAfterReload.record.workout_exercise_id === stored1.record?.workout_exercise_id) {
    pass('Exact saved set and workout ownership survive reload', setId)
  } else fail('Exact saved set and workout ownership survive reload', JSON.stringify(persistedAfterReload.record))
  const reviewAfterReload = await readReview(page)
  report.observations.reviewAfterReload = reviewAfterReload
  if (reviewAfterReload.done === 1) pass('Review survives authoritative reload', reviewAfterReload.text)
  else fail('Review survives authoritative reload', `expected 1, saw ${reviewAfterReload.text || 'unreadable'}`)

  if (await page.locator(`[data-set-id="${setId}"]`).count()) {
    const reopen = await triggerNativeReopen(page, setId)
    report.observations.reopenRoute = reopen
    if (!reopen.ok) throw new Error(`Unable to trigger native reopen: ${reopen.route}`)
    await waitDone(page, setId, false)
    await page.waitForTimeout(900)
    const stored2 = await dbSet(page, setId)
    if (stored2.record?.completed === false) pass('Native IndexedDB reopen', `set ${setId} completed=false via ${reopen.route}`)
    else fail('Native IndexedDB reopen', JSON.stringify(stored2.record))
    const reviewAfterReopen = await readReview(page)
    report.observations.reviewAfterReopen = reviewAfterReopen
    if (reviewAfterReopen.done === 0) pass('Review decrements after reopen', reviewAfterReopen.text)
    else fail('Review decrements after reopen', `expected 0, saw ${reviewAfterReopen.text || 'unreadable'}`)
  } else fail('Reloaded set control', 'original set ID not found after reload')

  const carry = await findUnprescribedCarryCard(page)
  report.observations.carryTarget = carry
  if (!carry) {
    fail('Unprescribed load carry target', 'no unprescribed multi-set exercise found in current QA workout')
  } else {
    const triggered = await saveUnprescribedForty(page, carry.firstId)
    if (!triggered.ok) throw new Error(`Unable to save 40-lb carry source: ${triggered.reason}`)
    await waitDone(page, carry.firstId, true)
    await page.waitForTimeout(1400)
    const nextLoad = await page.evaluate(id => {
      const input = document.querySelector(`[data-set-id="${id}"] .load-input`)
      return input instanceof HTMLInputElement ? input.value : ''
    }, carry.secondId)
    report.observations.unprescribedCarry = { exercise: carry.name, value: nextLoad }
    if (nextLoad === '40') pass('Unprescribed load carries Set 1 → Set 2', `${carry.name}: 40 lb`)
    else fail('Unprescribed load carries Set 1 → Set 2', `${carry.name}: expected 40, saw ${nextLoad || 'blank'}`)
  }
} catch (error) {
  fail('Persistence browser audit execution', error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => null)
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (report.failures.length) process.exit(1)
