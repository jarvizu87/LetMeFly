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
  const create = await clickable(page, /^\s*CREATE LOCAL ATHLETE\s*$/i)
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

async function cardSnapshot(page, matcher = /Optional Easy Walk|Easy Walk|Walking|Stationary Bike/i) {
  return page.evaluate(source => {
    const re = new RegExp(source, 'i')
    const cards = [...document.querySelectorAll('.exercise-card.active-exercise')]
    const card = cards.find(node => re.test(node.querySelector('.exercise-title h3')?.textContent || ''))
    if (!(card instanceof HTMLElement)) return null
    const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
    const subButton = card.querySelector('[data-substitute]')
    return {
      exerciseId: card.dataset.exerciseId || '',
      name: (card.querySelector('.exercise-title h3')?.textContent || '').trim(),
      setCount: rows.length,
      setIds: rows.map(row => row.dataset.setId || ''),
      prescriptions: rows.map(row => (row.querySelector('.lmf-prescription-cell strong')?.textContent || '').trim()),
      banner: (card.querySelector('.lmf-substitution-active')?.textContent || '').replace(/\s+/g, ' ').trim(),
      substituteText: (subButton?.textContent || '').replace(/\s+/g, ' ').trim(),
      substituteDisabled: subButton instanceof HTMLButtonElement ? subButton.disabled : false,
      undo: Boolean(card.querySelector('[data-revert-substitution]')),
    }
  }, matcher.source)
}

async function openStationaryBikeGuide(page, exerciseId) {
  const card = page.locator(`.exercise-card.active-exercise[data-exercise-id="${exerciseId}"]`)
  const substitute = card.locator('[data-substitute]').first()
  if (!(await substitute.count())) throw new Error('Walking card has no substitute action')
  await substitute.click({ timeout: 5000 })
  await page.waitForSelector('#lmf-exercise-substitution-modal', { timeout: 5000 })
  const modalText = await page.locator('#lmf-exercise-substitution-modal').innerText()
  if (!/WORKOUT INSTANCE ONLY/i.test(modalText)) fail('Substitution guide is workout-scoped', modalText.slice(0, 160))
  else pass('Substitution guide is workout-scoped')
  if (!/Stationary Bike/i.test(modalText)) throw new Error('Stationary Bike governed option missing from Walking substitution guide')
  const stationCard = page.locator('#lmf-exercise-substitution-modal .lmf-sub-rule').filter({ hasText: /Stationary Bike/i }).first()
  const alternativeKey = await stationCard.getAttribute('data-lmf-rule-alt')
  if (!alternativeKey) throw new Error('Stationary Bike canonical key missing from governed substitution card')
  return { stationCard, alternativeKey }
}

async function getStoreRows(page, storeName) {
  return page.evaluate(async store => {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open('letmefly-private')
      request.onerror = () => reject(request.error || new Error('private DB open failed'))
      request.onsuccess = () => {
        const db = request.result
        try {
          const tx = db.transaction(store, 'readonly')
          const read = tx.objectStore(store).getAll()
          read.onsuccess = () => { const rows = read.result; db.close(); resolve(rows) }
          read.onerror = () => { const error = read.error; db.close(); reject(error || new Error('store read failed')) }
        } catch (error) { db.close(); reject(error) }
      }
    })
  }, storeName)
}

async function confirmEquipmentAndProfile(page, alternativeKey) {
  let { stationCard } = await openStationaryBikeGuide(page, (await cardSnapshot(page, /Optional Easy Walk|Easy Walk|Walking/i))?.exerciseId || '')
  const text = await stationCard.innerText()
  if (!/DO YOU HAVE THIS EQUIPMENT/i.test(text)) throw new Error(`First-use equipment question missing: ${text.slice(0, 220)}`)
  pass('Unknown equipment triggers first-use availability question')
  if (await stationCard.locator('[data-lmf-use-substitute]').count()) fail('Unknown equipment cannot be applied before athlete answers')
  else pass('Unknown equipment blocks substitution apply')

  const saveAvailable = stationCard.locator('[data-lmf-equipment-answer="available"][data-lmf-equipment-persist="true"]').first()
  if (!(await saveAvailable.count())) throw new Error('YES • SAVE TO PROFILE equipment action missing')
  await saveAvailable.click({ timeout: 5000 })
  await page.waitForFunction(key => {
    const card = [...document.querySelectorAll('#lmf-exercise-substitution-modal .lmf-sub-rule')]
      .find(node => node.getAttribute('data-lmf-rule-alt') === key)
    return Boolean(card?.querySelector('[data-lmf-use-substitute]')) && /Available from athlete profile/i.test(card?.textContent || '')
  }, alternativeKey, { timeout: 8000 })
  stationCard = page.locator(`#lmf-exercise-substitution-modal .lmf-sub-rule[data-lmf-rule-alt="${alternativeKey}"]`).first()
  pass('Equipment answer immediately unlocks eligible substitute')

  const athletes = await getStoreRows(page, 'athletes')
  const athlete = [...athletes].filter(row => !row.deleted_at).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0]
  const equipmentAccess = athlete?.profile_context_v2?.equipmentAccess?.[alternativeKey]
  report.observations.equipmentProfile = equipmentAccess || null
  if (equipmentAccess?.availability !== 'available') fail('First-use equipment answer persists into athlete profile', JSON.stringify(equipmentAccess || null))
  else pass('First-use equipment answer persists into athlete profile', alternativeKey)

  await page.waitForFunction(key => {
    const panel = document.querySelector(`[data-lmf-sub-history="${key}"] span`)
    return panel && !/Checking your private workout history/i.test(panel.textContent || '')
  }, alternativeKey, { timeout: 5000 }).catch(() => null)
  const history = (await stationCard.locator(`[data-lmf-sub-history="${alternativeKey}"] span`).textContent().catch(() => '')) || ''
  report.observations.firstPreviousPerformance = history.trim()
  if (/No previous completed performance/i.test(history)) pass('Substitute previous-performance lookup starts from performed-exercise history')

  return stationCard
}

async function applyWithReason(page, stationCard, reason, expectSafety = false) {
  const select = stationCard.locator('[data-lmf-sub-reason]').first()
  if (!(await select.count())) throw new Error('Substitution reason control missing')
  await select.selectOption({ label: reason })
  if (expectSafety) {
    const safety = stationCard.locator('[data-lmf-sub-discomfort]').first()
    if (!(await safety.isVisible())) throw new Error('Discomfort safety boundary did not appear')
    pass('Discomfort / possible strain reveals safety boundary')
    const use = stationCard.locator('[data-lmf-use-substitute]').first()
    await use.click({ timeout: 5000 })
    const error = page.locator('[data-lmf-sub-error]')
    await error.waitFor({ state: 'visible', timeout: 3000 })
    const message = await error.innerText()
    if (!/confirm|safety note/i.test(message)) fail('Discomfort substitution requires safety acknowledgement', message)
    else pass('Discomfort substitution requires safety acknowledgement')
    const ack = stationCard.locator('[data-lmf-sub-safety-ack]').first()
    await ack.check()
  }
  const use = stationCard.locator('[data-lmf-use-substitute]').first()
  await use.click({ timeout: 5000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => /Stationary Bike/i.test(node.textContent || '')), null, { timeout: 8000 })
  await page.waitForTimeout(300)
}

async function verifyApplied(page, before, reason) {
  const after = await cardSnapshot(page, /Stationary Bike/i)
  if (!after) throw new Error('Stationary Bike card disappeared after apply')
  report.observations[`after-${reason}`] = after
  if (!/PERFORMING TODAY:\s*Stationary Bike/i.test(after.banner) || !/PROGRAM SLOT:\s*Optional Easy Walk/i.test(after.banner)) {
    fail('Card preserves programmed-vs-performed identity', after.banner)
  } else pass('Card preserves programmed-vs-performed identity', after.banner)
  if (after.setCount !== before.setCount || JSON.stringify(after.prescriptions) !== JSON.stringify(before.prescriptions)) {
    fail('Substitution preserves programmed set structure', `${before.setCount} → ${after.setCount}`)
  } else pass('Substitution preserves programmed set structure', `${after.setCount} set(s)`)
  if (!after.undo) fail('Pre-performance substitute exposes Undo Substitute')
  else pass('Pre-performance substitute exposes Undo Substitute')

  const exercises = await getStoreRows(page, 'workoutExercises')
  const row = exercises.find(item => String(item.id) === after.exerciseId)
  const persistedReason = row?.prescription_snapshot?.substitution?.reason
  if (persistedReason !== reason) fail('Optional substitution reason persists with workout provenance', String(persistedReason || 'missing'))
  else pass('Optional substitution reason persists with workout provenance', reason)
  return after
}

async function reloadAndVerifySubstitute(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  await page.waitForTimeout(450)
  const resumed = await cardSnapshot(page, /Stationary Bike/i)
  if (!resumed || !/PROGRAM SLOT:\s*Optional Easy Walk/i.test(resumed.banner)) fail('Substitution survives full page reload', JSON.stringify(resumed))
  else pass('Substitution survives full page reload', resumed.banner)
  return resumed
}

async function undoBeforePerformance(page, exerciseId) {
  const undo = page.locator(`.exercise-card.active-exercise[data-exercise-id="${exerciseId}"] [data-revert-substitution]`).first()
  if (!(await undo.count())) throw new Error('Pre-performance Undo Substitute control missing')
  await undo.click({ timeout: 5000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => /Optional Easy Walk/i.test(node.textContent || '')), null, { timeout: 8000 })
  const restored = await cardSnapshot(page, /Optional Easy Walk|Easy Walk|Walking/i)
  if (!restored || restored.banner || restored.undo) fail('Pre-performance undo restores original active-workout identity', JSON.stringify(restored))
  else pass('Pre-performance undo restores original active-workout identity')

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  const afterReload = await cardSnapshot(page, /Optional Easy Walk|Easy Walk|Walking/i)
  if (!afterReload || afterReload.banner || afterReload.undo) fail('Pre-performance undo survives reload', JSON.stringify(afterReload))
  else pass('Pre-performance undo survives reload')
  return afterReload
}

async function reopenGuideWithKnownEquipment(page, exerciseId, alternativeKey) {
  const { stationCard } = await openStationaryBikeGuide(page, exerciseId)
  const text = await stationCard.innerText()
  if (/DO YOU HAVE THIS EQUIPMENT/i.test(text)) fail('Persisted equipment profile avoids repeat first-use question', text.slice(0, 180))
  else pass('Persisted equipment profile avoids repeat first-use question')
  if (!/Available from athlete profile/i.test(text)) fail('Persisted equipment availability is used by substitution ranking/filtering', text.slice(0, 180))
  else pass('Persisted equipment availability is used by substitution ranking/filtering')
  const key = await stationCard.getAttribute('data-lmf-rule-alt')
  if (key !== alternativeKey) throw new Error(`Stationary Bike key drifted: ${key} !== ${alternativeKey}`)
  return stationCard
}

async function logSubstituteSet(page, exerciseId) {
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

  const sets = await getStoreRows(page, 'workoutSets')
  const persisted = sets.find(row => String(row.id) === result.setId)
  const stamp = persisted?.performance_data?.substitutionPerformanceLoggedAt
  if (!stamp) fail('Logged substitute set receives immutable performed-exercise history marker')
  else pass('Logged substitute set receives immutable performed-exercise history marker', String(stamp))
  return result.setId
}

async function expectBridgeRevertBlocked(page, exerciseId, label) {
  const result = await page.evaluate(async id => {
    try {
      await window.LetMeFlyWorkoutSubstitutionBridge.revert(id)
      return { blocked: false, message: 'revert unexpectedly succeeded' }
    } catch (error) {
      return { blocked: true, message: String(error?.message || error) }
    }
  }, exerciseId)
  if (!result.blocked || !/cannot be relabeled|locked|actually performed/i.test(result.message)) fail(label, result.message)
  else pass(label, result.message)
}

async function reopenLoggedSet(page, setId) {
  await page.evaluate(id => {
    const row = document.querySelector(`[data-set-id="${id}"]`)
    const check = row?.querySelector('.set-check[data-action="toggle-set"]')
    if (check instanceof HTMLButtonElement) check.click()
  }, setId)
  await page.waitForFunction(id => !document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'), setId, { timeout: 8000 })
  pass('Logged substitute set can be reopened for performance correction')
}

async function verifyLoggedHistoryLockAfterReload(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  const state = await cardSnapshot(page, /Stationary Bike/i)
  report.observations.afterLoggedHistoryReload = state
  if (!state) throw new Error('Stationary Bike did not survive reload after substitute performance')
  if (!/Logged substitute work is locked/i.test(state.banner)) fail('Workout card explains immutable substitute history', state.banner)
  else pass('Workout card explains immutable substitute history')
  if (!state.substituteDisabled || !/SUBSTITUTE LOCKED/i.test(state.substituteText) || state.undo) {
    fail('Logged substitute history disables change/undo relabeling', JSON.stringify(state))
  } else pass('Logged substitute history disables change/undo relabeling')
}

const browser = await chromium.launch({ executablePath: chromeBin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', message => { if (message.type() === 'error') console.log(`BROWSER ERROR ${message.text()}`) })

try {
  await bootstrapAthlete(page)
  await selectDay7(page)
  await startWorkout(page)

  const before = await cardSnapshot(page, /Optional Easy Walk|Easy Walk|Walking/i)
  if (!before) throw new Error('Optional Easy Walk workout card not found')
  report.observations.before = before

  // First use: unknown equipment becomes a profile-enrichment opportunity.
  let { alternativeKey } = await openStationaryBikeGuide(page, before.exerciseId)
  await page.locator('#lmf-exercise-substitution-modal [data-lmf-sub-close]').first().click()
  const stationCardFirst = await confirmEquipmentAndProfile(page, alternativeKey)
  await applyWithReason(page, stationCardFirst, 'Preference')
  let applied = await verifyApplied(page, before, 'Preference')
  applied = await reloadAndVerifySubstitute(page) || applied

  // A true undo is allowed before any substitute performance is recorded.
  const restored = await undoBeforePerformance(page, applied.exerciseId)

  // Second use: persisted equipment is reused, and discomfort requires safety acknowledgement.
  const stationCardSecond = await reopenGuideWithKnownEquipment(page, restored.exerciseId, alternativeKey)
  await applyWithReason(page, stationCardSecond, 'Discomfort / possible strain', true)
  const injured = await verifyApplied(page, restored, 'Discomfort / possible strain')

  // Once work is logged, its performed identity is historical truth even if the set is reopened.
  const setId = await logSubstituteSet(page, injured.exerciseId)
  await expectBridgeRevertBlocked(page, injured.exerciseId, 'Logged substitute performance blocks exercise relabeling')
  await reopenLoggedSet(page, setId)
  await expectBridgeRevertBlocked(page, injured.exerciseId, 'Reopening logged set does not erase performed-exercise provenance')
  await verifyLoggedHistoryLockAfterReload(page)
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
  'Covers first-use equipment/profile enrichment, workout-only substitution, reason/safety context, reload persistence, pre-performance undo, native set logging, and immutable performed-exercise history after logging.',
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
