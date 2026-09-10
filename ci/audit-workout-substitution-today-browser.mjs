#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'WORKOUT_SUBSTITUTION_TODAY_BROWSER_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result: 'PASS', passes: [], failures: [], observations: {} }
const pass = (label, detail = '') => { report.passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const fail = (label, detail = '') => { report.result = 'FAIL'; report.failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function dismissInstall(page) {
  const button = await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }))
  if (!button) return false
  return button.click({ timeout: 2000 }).then(() => true).catch(() => false)
}

async function settle(page, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    if (await dismissInstall(page)) continue
    await page.waitForTimeout(160)
  }
}

async function clickable(page, text) {
  const pattern = text instanceof RegExp ? text : new RegExp(String(text), 'i')
  return await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
}

async function bootstrapAthlete(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await settle(page, 4)
  let create = await clickable(page, /^\s*CREATE LOCAL ATHLETE\s*$/i)
  if (create) {
    const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
    const input = await firstVisible(modal.locator('input[type="text"],input:not([type])'))
      || await firstVisible(page.locator('input[type="text"],input:not([type])'))
    if (!input) throw new Error('Athlete display-name input missing')
    await input.fill('Issue 54 Substitute QA')
    if ((await input.inputValue()) !== 'Issue 54 Substitute QA') throw new Error('Athlete display-name did not persist before create')
    await create.click({ timeout: 5000 })
    await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 })
  }
  await settle(page)
  pass('Disposable athlete bootstrap')
}

async function openTrain(page) {
  const train = await clickable(page, /^\s*TRAIN\s*$/i)
  if (!train) throw new Error('Train navigation control missing')
  await train.click({ timeout: 5000 })
  await page.waitForTimeout(450)
  await settle(page, 3)
}

async function selectDay7(page) {
  await openTrain(page)
  const day7 = await firstVisible(page.locator('[data-day],[data-day-key],[data-position],button,[role="button"]').filter({ hasText: /^\s*D7\b/i }))
    || await firstVisible(page.getByText(/^\s*D7\b/i))
  if (!day7) throw new Error('Crownforge Day 7 selector not visible')
  await day7.click({ timeout: 5000 })
  await page.waitForTimeout(450)

  const body = await page.locator('body').innerText()
  if (/Preview position|Preview only/i.test(body)) {
    const makeCurrent = await firstVisible(page.locator('[data-action="make-current-position"]')) || await clickable(page, /MAKE CURRENT POSITION/i)
    if (!makeCurrent) throw new Error('Make Current Position control missing for Day 7')
    page.once('dialog', dialog => dialog.accept())
    await makeCurrent.click({ timeout: 5000 })
    await page.waitForTimeout(600)
  }
  const after = await page.locator('body').innerText()
  if (!/Day\s*7|D7|Easy Walk/i.test(after)) throw new Error('Crownforge W1D7 was not retained as current position')
  pass('Crownforge W1D7 selected as governed current position')
}

async function setReadiness(page) {
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

async function startWorkout(page) {
  await setReadiness(page)
  const start = await firstVisible(page.locator('[data-action="start-workout"]')) || await clickable(page, /^\s*START WORKOUT\s*$/i)
  if (!start) throw new Error('Start Workout control missing on Crownforge W1D7')
  await start.click({ timeout: 5000 })
  await page.waitForSelector('.exercise-card.active-exercise', { timeout: 10000 })
  await page.waitForFunction(() => window.LetMeFlyExerciseIntelligence && window.LetMeFlyWorkoutSubstitutionBridge, null, { timeout: 10000 })
  pass('Workout Mode starts with governed substitution bridge')
}

async function findWalkingCard(page) {
  const info = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.exercise-card.active-exercise')]
    const card = cards.find(node => /Optional Easy Walk|Easy Walk|Walking/i.test(node.querySelector('.exercise-title h3')?.textContent || ''))
    if (!(card instanceof HTMLElement)) return null
    const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
    return {
      exerciseId: card.dataset.exerciseId || '',
      name: (card.querySelector('.exercise-title h3')?.textContent || '').trim(),
      setCount: rows.length,
      prescriptions: rows.map(row => (row.querySelector('.lmf-prescription-cell strong')?.textContent || '').trim()),
      substituteText: (card.querySelector('[data-substitute]')?.textContent || '').trim(),
    }
  })
  return info
}

async function applyStationaryBike(page) {
  const before = await findWalkingCard(page)
  if (!before) throw new Error('Optional Easy Walk workout card not found')
  report.observations.before = before
  if (!/SUBSTITUTE/i.test(before.substituteText)) throw new Error(`Walking card has no substitute action: ${before.substituteText}`)

  const card = page.locator(`.exercise-card.active-exercise[data-exercise-id="${before.exerciseId}"]`)
  const substitute = card.locator('[data-substitute]').first()
  await substitute.click({ timeout: 5000 })
  await page.waitForSelector('#lmf-exercise-substitution-modal', { timeout: 5000 })
  const modalText = await page.locator('#lmf-exercise-substitution-modal').innerText()
  if (!/WORKOUT INSTANCE ONLY/i.test(modalText)) fail('Substitution guide is workout-scoped', modalText.slice(0, 160))
  else pass('Substitution guide is workout-scoped')
  if (!/Stationary Bike/i.test(modalText)) throw new Error('Stationary Bike governed option missing from Walking substitution guide')

  const stationCard = page.locator('#lmf-exercise-substitution-modal .lmf-sub-rule').filter({ hasText: /Stationary Bike/i }).first()
  const use = stationCard.locator('[data-lmf-use-substitute]').first()
  if (!(await use.count())) throw new Error('Stationary Bike has no USE THIS SUBSTITUTE FOR TODAY action')
  await use.click({ timeout: 5000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => /Stationary Bike/i.test(node.textContent || '')), null, { timeout: 8000 })
  await page.waitForTimeout(350)

  const after = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.exercise-card.active-exercise')]
    const card = cards.find(node => /Stationary Bike/i.test(node.querySelector('.exercise-title h3')?.textContent || ''))
    if (!(card instanceof HTMLElement)) return null
    const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
    return {
      exerciseId: card.dataset.exerciseId || '',
      name: (card.querySelector('.exercise-title h3')?.textContent || '').trim(),
      setCount: rows.length,
      prescriptions: rows.map(row => (row.querySelector('.lmf-prescription-cell strong')?.textContent || '').trim()),
      banner: (card.querySelector('.lmf-substitution-active')?.textContent || '').replace(/\s+/g, ' ').trim(),
      undo: Boolean(card.querySelector('[data-revert-substitution]')),
    }
  })
  report.observations.afterApply = after
  if (!after) throw new Error('Stationary Bike card disappeared after apply')
  if (!/TODAY'S SUBSTITUTE/i.test(after.banner) || !/Programmed:\s*Optional Easy Walk/i.test(after.banner)) fail('Card preserves prescribed-vs-performed provenance', after.banner)
  else pass('Card preserves prescribed-vs-performed provenance', after.banner)
  if (after.setCount !== before.setCount || JSON.stringify(after.prescriptions) !== JSON.stringify(before.prescriptions)) fail('Substitution preserves programmed set structure', `${before.setCount} → ${after.setCount}`)
  else pass('Substitution preserves programmed set structure', `${after.setCount} set(s)`) 
  if (!after.undo) fail('Applied substitute exposes undo control')
  else pass('Applied substitute exposes undo control')
  return after.exerciseId
}

async function reloadAndResume(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  await page.waitForTimeout(500)
  const resumed = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.exercise-card.active-exercise')].find(node => /Stationary Bike/i.test(node.querySelector('.exercise-title h3')?.textContent || ''))
    if (!(card instanceof HTMLElement)) return null
    return {
      name: (card.querySelector('.exercise-title h3')?.textContent || '').trim(),
      banner: (card.querySelector('.lmf-substitution-active')?.textContent || '').replace(/\s+/g, ' ').trim(),
      exerciseId: card.dataset.exerciseId || '',
    }
  })
  report.observations.afterReload = resumed
  if (!resumed || !/Programmed:\s*Optional Easy Walk/i.test(resumed.banner)) fail('Substitution survives full page reload', JSON.stringify(resumed))
  else pass('Substitution survives full page reload', resumed.banner)
  return resumed?.exerciseId || ''
}

async function logThenProtectHistory(page, exerciseId) {
  const result = await page.evaluate(id => {
    const card = document.querySelector(`.exercise-card.active-exercise[data-exercise-id="${id}"]`)
    if (!(card instanceof HTMLElement)) return { ok: false, reason: 'card missing' }
    const row = card.querySelector('.set-row[data-set-id]')
    if (!(row instanceof HTMLElement)) return { ok: false, reason: 'set row missing' }
    const metric = row.querySelector('.metric-input')
    const reps = row.querySelector('.reps-input')
    if (metric instanceof HTMLInputElement) {
      metric.value = '25'
      metric.dispatchEvent(new Event('input', { bubbles: true }))
      metric.dispatchEvent(new Event('change', { bubbles: true }))
    } else if (reps instanceof HTMLInputElement && !reps.value) {
      reps.value = '1'
      reps.dispatchEvent(new Event('input', { bubbles: true }))
      reps.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const check = row.querySelector('.set-check[data-action="toggle-set"]')
    if (!(check instanceof HTMLButtonElement)) return { ok: false, reason: 'set check missing' }
    check.click()
    return { ok: true, setId: row.dataset.setId || '' }
  }, exerciseId)
  if (!result.ok) throw new Error(`Could not log substitute set: ${result.reason}`)
  await page.waitForFunction(id => document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'), result.setId, { timeout: 8000 })
  pass('Substitute set logs through native Workout Mode persistence')

  let dialogText = ''
  page.once('dialog', async dialog => { dialogText = dialog.message(); await dialog.accept() })
  const undo = page.locator(`.exercise-card.active-exercise[data-exercise-id="${exerciseId}"] [data-revert-substitution]`).first()
  await undo.click({ timeout: 5000 })
  await page.waitForTimeout(450)
  if (!/Reopen completed substitute sets before reverting|history stays accurate/i.test(dialogText)) fail('Logged substitute set blocks history relabeling', dialogText || 'No protection dialog')
  else pass('Logged substitute set blocks history relabeling', dialogText)
  const stillSub = await page.locator(`.exercise-card.active-exercise[data-exercise-id="${exerciseId}"] .exercise-title h3`).innerText().catch(() => '')
  if (!/Stationary Bike/i.test(stillSub)) fail('Blocked undo leaves performed exercise unchanged', stillSub)
  else pass('Blocked undo leaves performed exercise unchanged')

  // Reopen the set, then undo is safe because no completed performance remains under the substitute identity.
  await page.evaluate(id => {
    const row = document.querySelector(`[data-set-id="${id}"]`)
    const check = row?.querySelector('.set-check[data-action="toggle-set"]')
    if (check instanceof HTMLButtonElement) check.click()
  }, result.setId)
  await page.waitForFunction(id => !document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'), result.setId, { timeout: 8000 })
  await page.locator(`.exercise-card.active-exercise[data-exercise-id="${exerciseId}"] [data-revert-substitution]`).first().click({ timeout: 5000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => /Optional Easy Walk/i.test(node.textContent || '')), null, { timeout: 8000 })
  pass('Reopened substitute sets allow exact undo to programmed exercise')
}

async function verifyUndoSurvivesReload(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  const state = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.exercise-card.active-exercise')].find(node => /Optional Easy Walk/i.test(node.querySelector('.exercise-title h3')?.textContent || ''))
    if (!(card instanceof HTMLElement)) return null
    return {
      name: (card.querySelector('.exercise-title h3')?.textContent || '').trim(),
      substituteBanner: Boolean(card.querySelector('.lmf-substitution-active')),
      undo: Boolean(card.querySelector('[data-revert-substitution]')),
    }
  })
  report.observations.afterUndoReload = state
  if (!state || state.substituteBanner || state.undo) fail('Undo persists and restores original workout identity', JSON.stringify(state))
  else pass('Undo persists and restores original workout identity', state.name)
}

const browser = await chromium.launch({ executablePath: chromeBin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', message => { if (message.type() === 'error') console.log(`BROWSER ERROR ${message.text()}`) })

try {
  await bootstrapAthlete(page)
  await selectDay7(page)
  await startWorkout(page)
  const exerciseId = await applyStationaryBike(page)
  const resumedId = await reloadAndResume(page)
  await logThenProtectHistory(page, resumedId || exerciseId)
  await verifyUndoSurvivesReload(page)
} catch (error) {
  fail('Browser substitution scenario completes', error instanceof Error ? error.stack || error.message : String(error))
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: true }).catch(() => null)
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(outDir, 'audit.md'), [
  '# Issue #54 Workout Substitution Browser Audit',
  '',
  `Result: **${report.result}**`,
  '',
  'Fixture: Crownforge W1D7 Optional Easy Walk → Stationary Bike.',
  '',
  '## Passes',
  ...(report.passes.length ? report.passes.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Failures',
  ...(report.failures.length ? report.failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
].join('\n'))

if (report.failures.length) process.exit(1)
console.log(`Issue #54 workout substitution browser audit: PASS (${report.passes.length} checks)`)
