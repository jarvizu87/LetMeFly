#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

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
const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(?:m?js)$/i.test(entry.name)) out.push(full)
  }
  return out
}

function isBarbellExercise(exercise) {
  if (!exercise) return false
  const equipment = Array.isArray(exercise.equipment) ? exercise.equipment.join(' ') : ''
  const name = String(exercise.canonicalName || '')
  if (/\bbarbell\b/i.test(equipment)) return true
  return /\b(?:front squat|back squat|box squat|bench press|deadlift|rdl|romanian deadlift|overhead press|strict press|push press|good morning|hip thrust|rack pull|clean|snatch|high pull|jerk|barbell row)\b/i.test(name)
    && !/\b(?:dumbbell|db|kettlebell|kb|machine|band|cable)\b/i.test(name)
}

async function discoverBarbellFixtures() {
  const payload = JSON.parse(fs.readFileSync(path.join(target, 'dist', 'data', 'exercise-intelligence-v1.json'), 'utf8'))
  const exerciseById = new Map((payload.exercises || []).map(exercise => [exercise.id, exercise]))
  const rules = (payload.substitutionRules || []).filter(rule =>
    rule.alternativeInCurrentApp
    && !String(rule.promotionStatus || '').startsWith('DO NOT')
    && isBarbellExercise(exerciseById.get(rule.alternativeExerciseId))
  )

  const viteBin = path.join(target, 'node_modules', '.bin', 'vite')
  if (!fs.existsSync(viteBin)) throw new Error('Vite executable missing for governed barbell fixture discovery')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-issue54-fixture-'))
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n')
  const built = spawnSync(viteBin, [
    'build',
    '--ssr', 'src/data/programs.ts',
    '--outDir', temp,
    '--emptyOutDir',
  ], { cwd: target, encoding: 'utf8' })
  if (built.status !== 0) throw new Error((built.stderr || built.stdout || 'Vite SSR program build failed').trim())
  const candidates = walk(temp)
  const entry = candidates.find(file => /programs.*\.js$/i.test(path.basename(file))) || candidates[0]
  if (!entry) throw new Error('No importable governed program facade was produced')
  const exported = await import(`${pathToFileURL(entry).href}?issue54=${Date.now()}`)

  const programs = [
    { key: 'crownforge', definition: exported.CROWNFORGE },
    { key: 'crown-maintenance', definition: exported.CROWN_MAINTENANCE },
    { key: 'black-crown', definition: exported.BLACK_CROWN },
  ].filter(row => row.definition?.weekData)

  const fixtures = []
  for (const rule of rules) {
    const primary = exerciseById.get(rule.primaryExerciseId)
    const alternative = exerciseById.get(rule.alternativeExerciseId)
    const primaryTokens = new Set([rule.primaryExerciseId, primary?.id, primary?.canonicalName, rule.primaryExercise].filter(Boolean).map(normalize))
    for (const program of programs) {
      for (const week of program.definition.weekData || []) {
        for (const day of week.days || []) {
          for (const section of day.sections || []) {
            for (const exercise of section.exercises || []) {
              const tokens = [exercise.id, exercise.exerciseKey, exercise.name].filter(Boolean).map(normalize)
              if (!tokens.some(token => primaryTokens.has(token))) continue
              fixtures.push({
                ruleId: rule.id || null,
                program: program.key,
                programVersion: String(program.definition.version || ''),
                week: Number(week.week),
                day: Number(day.day),
                dayTitle: String(day.title || ''),
                phaseKey: String(day.phaseKey || day.phase || week.phaseKey || week.phase || ''),
                primaryExerciseKey: rule.primaryExerciseId,
                primaryExercise: primary?.canonicalName || rule.primaryExercise || String(exercise.name || ''),
                alternativeExerciseKey: rule.alternativeExerciseId,
                alternativeExercise: alternative?.canonicalName || rule.alternativeExercise || '',
              })
            }
          }
        }
      }
    }
  }
  return fixtures
}

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
    await create.click({ timeout: 5000 })
    await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 })
  }
  await settle(page)
  pass('Disposable athlete bootstrap')
}

async function openTrain(page) {
  if (/\/train(?:$|[?#])/i.test(page.url()) || /#\/train/i.test(page.url())) {
    await page.waitForTimeout(250)
    return
  }
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
  if (!start) {
    const existing = await firstVisible(page.locator('.exercise-card.active-exercise'))
    if (existing) return
    throw new Error('Start Workout control missing')
  }
  await start.click({ timeout: 5000 })
  await page.waitForSelector('.exercise-card.active-exercise', { timeout: 10000 })
  await page.waitForFunction(() => window.LetMeFlyExerciseIntelligence && window.LetMeFlyWorkoutSubstitutionBridge, null, { timeout: 10000 })
}

async function findCard(page, pattern) {
  return await page.evaluate(source => {
    const re = new RegExp(source, 'i')
    const cards = [...document.querySelectorAll('.exercise-card.active-exercise')]
    const card = cards.find(node => re.test(node.querySelector('.exercise-title h3')?.textContent || ''))
    if (!(card instanceof HTMLElement)) return null
    const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
    return {
      exerciseId: card.dataset.exerciseId || '',
      name: (card.querySelector('.exercise-title h3')?.textContent || '').trim(),
      setCount: rows.length,
      prescriptions: rows.map(row => (row.querySelector('.lmf-prescription-cell strong')?.textContent || '').trim()),
      substituteText: (card.querySelector('[data-substitute]')?.textContent || '').trim(),
      banner: (card.querySelector('.lmf-substitution-active')?.textContent || '').replace(/\s+/g, ' ').trim(),
      hasUndo: Boolean(card.querySelector('[data-revert-substitution]')),
      load: (() => {
        const input = card.querySelector('.set-row.lmf-set-active .load-input, .set-row .load-input')
        return input instanceof HTMLInputElement ? input.value : ''
      })(),
    }
  }, pattern.source)
}

async function openRule(page, exerciseId, alternativePattern) {
  const card = page.locator(`.exercise-card.active-exercise[data-exercise-id="${exerciseId}"]`)
  await card.locator('[data-substitute]').first().click({ timeout: 5000 })
  await page.waitForSelector('#lmf-exercise-substitution-modal', { timeout: 5000 })
  const rule = page.locator('#lmf-exercise-substitution-modal .lmf-sub-rule').filter({ hasText: alternativePattern }).first()
  if (!(await rule.count())) throw new Error(`Governed substitution rule missing for ${alternativePattern}`)
  return rule
}

async function makeEquipmentAvailable(rule, persist) {
  const available = rule.locator('[data-lmf-equipment-answer="available"]')
  if (!(await available.count())) return false
  const button = persist
    ? rule.locator('[data-lmf-equipment-answer="available"][data-lmf-equipment-persist="true"]').first()
    : rule.locator('[data-lmf-equipment-answer="available"][data-lmf-equipment-persist="false"]').first()
  if (!(await button.count())) return false
  await button.click({ timeout: 5000 })
  return true
}

async function applyWalkingScenario(page) {
  const before = await findCard(page, /Optional Easy Walk|Easy Walk|Walking/i)
  if (!before) throw new Error('Optional Easy Walk workout card not found')
  report.observations.before = before

  let rule = await openRule(page, before.exerciseId, /Stationary Bike/i)
  const modalText = await page.locator('#lmf-exercise-substitution-modal').innerText()
  if (/WORKOUT INSTANCE ONLY/i.test(modalText)) pass('Substitution guide is workout-scoped')
  else fail('Substitution guide is workout-scoped', modalText.slice(0, 180))

  if (await rule.locator('.lmf-sub-equipment.is-unknown,.lmf-sub-equipment.is-unavailable').count()) {
    const answered = await makeEquipmentAvailable(rule, true)
    if (!answered) throw new Error('First-use equipment question could not be answered/persisted')
    await page.waitForTimeout(300)
    rule = page.locator('#lmf-exercise-substitution-modal .lmf-sub-rule').filter({ hasText: /Stationary Bike/i }).first()
    pass('First-use substitute equipment can be saved to private athlete profile')
  }

  const historyText = await rule.locator('[data-lmf-sub-history] span').innerText().catch(() => '')
  if (/No previous completed performance|Checking your private workout history|Previous performance/i.test(historyText)) {
    pass('Substitute card exposes substitute-specific previous performance state', historyText)
  } else {
    fail('Substitute card exposes substitute-specific previous performance state', historyText)
  }

  const reason = rule.locator('[data-lmf-sub-reason]')
  if (await reason.count()) await reason.selectOption({ label: 'Preference' })
  const use = rule.locator('[data-lmf-use-substitute]').first()
  if (!(await use.count())) throw new Error('Stationary Bike apply action missing after equipment confirmation')
  await use.click({ timeout: 5000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => /Stationary Bike/i.test(node.textContent || '')), null, { timeout: 8000 })

  const after = await findCard(page, /Stationary Bike/i)
  report.observations.afterFirstApply = after
  if (!after || !/PROGRAM SLOT:\s*Optional Easy Walk/i.test(after.banner)) fail('Card preserves prescribed-vs-performed provenance', after?.banner || 'missing')
  else pass('Card preserves prescribed-vs-performed provenance', after.banner)
  if (after?.setCount !== before.setCount || JSON.stringify(after?.prescriptions) !== JSON.stringify(before.prescriptions)) fail('Substitution preserves programmed set structure')
  else pass('Substitution preserves programmed set structure', `${after.setCount} set(s)`)

  const undo = page.locator(`.exercise-card.active-exercise[data-exercise-id="${after.exerciseId}"] [data-revert-substitution]`).first()
  if (!(await undo.count())) throw new Error('Pre-performance undo control missing')
  await undo.click({ timeout: 5000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => /Optional Easy Walk/i.test(node.textContent || '')), null, { timeout: 8000 })
  pass('Pre-performance Undo restores programmed exercise exactly')

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  const restored = await findCard(page, /Optional Easy Walk/i)
  if (!restored || restored.banner || restored.hasUndo) fail('Pre-performance Undo survives reload', JSON.stringify(restored))
  else pass('Pre-performance Undo survives reload')

  rule = await openRule(page, restored.exerciseId, /Stationary Bike/i)
  if (await rule.locator('.lmf-sub-equipment.is-unknown').count()) {
    fail('Persisted equipment answer prevents repeat first-use question')
    throw new Error('Stationary Bike equipment answer was not remembered')
  }
  pass('Persisted equipment answer prevents repeat first-use question')

  const discomfort = rule.locator('[data-lmf-sub-reason]')
  if (await discomfort.count()) {
    await discomfort.selectOption({ label: 'Discomfort / possible strain' })
    const useAgain = rule.locator('[data-lmf-use-substitute]').first()
    await useAgain.click({ timeout: 5000 })
    const error = await page.locator('#lmf-exercise-substitution-modal [data-lmf-sub-error]').innerText().catch(() => '')
    if (/safety note|confirm/i.test(error)) pass('Discomfort substitution requires safety acknowledgement', error)
    else fail('Discomfort substitution requires safety acknowledgement', error || 'no safety error')
    const ack = rule.locator('[data-lmf-sub-safety-ack]')
    if (!(await ack.count())) throw new Error('Discomfort safety acknowledgement control missing')
    await ack.check()
  }
  await rule.locator('[data-lmf-use-substitute]').first().click({ timeout: 5000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => /Stationary Bike/i.test(node.textContent || '')), null, { timeout: 8000 })
  pass('Governed substitute applies after safety/equipment gates')

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  const resumed = await findCard(page, /Stationary Bike/i)
  if (!resumed || !/PROGRAM SLOT:\s*Optional Easy Walk/i.test(resumed.banner)) fail('Substitution survives full page reload', JSON.stringify(resumed))
  else pass('Substitution survives full page reload', resumed.banner)

  const logged = await page.evaluate(id => {
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
  }, resumed.exerciseId)
  if (!logged.ok) throw new Error(`Could not log substitute set: ${logged.reason}`)
  await page.waitForFunction(id => document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'), logged.setId, { timeout: 8000 })
  pass('Substitute set logs through native Workout Mode persistence')

  let locked = await findCard(page, /Stationary Bike/i)
  if (!/SUBSTITUTE LOCKED/i.test(locked?.substituteText || '') || locked?.hasUndo) {
    fail('Logged substitute work immediately locks exercise identity', JSON.stringify(locked))
  } else {
    pass('Logged substitute work immediately locks exercise identity')
  }

  await page.evaluate(id => {
    const row = document.querySelector(`[data-set-id="${id}"]`)
    const check = row?.querySelector('.set-check[data-action="toggle-set"]')
    if (check instanceof HTMLButtonElement) check.click()
  }, logged.setId)
  await page.waitForFunction(id => !document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done'), logged.setId, { timeout: 8000 })
  await page.waitForTimeout(250)
  locked = await findCard(page, /Stationary Bike/i)
  if (!/SUBSTITUTE LOCKED/i.test(locked?.substituteText || '') || locked?.hasUndo) {
    fail('Reopening a logged set cannot relabel substitute history', JSON.stringify(locked))
  } else {
    pass('Reopening a logged set cannot relabel substitute history')
  }

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await settle(page, 5)
  await openTrain(page)
  locked = await findCard(page, /Stationary Bike/i)
  if (!locked || !/PROGRAM SLOT:\s*Optional Easy Walk/i.test(locked.banner) || !/SUBSTITUTE LOCKED/i.test(locked.substituteText)) {
    fail('Immutable substitute history survives reload', JSON.stringify(locked))
  } else {
    pass('Immutable substitute history survives reload', locked.banner)
  }
}

async function setProgramFixture(page, fixture) {
  const result = await page.evaluate(async fixture => {
    const request = indexedDB.open('letmefly-private')
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('programInstances', 'readonly')
      const req = tx.objectStore('programInstances').getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
    const active = rows.find(row => row.status === 'active') || rows[0]
    if (!active) throw new Error('No program instance exists for QA fixture')
    const priorDay = String(active.current_day_key || '')
    const dayKey = /day/i.test(priorDay) ? `day-${fixture.day}` : String(fixture.day)
    const now = new Date().toISOString()
    const phaseForBlackCrown = fixture.week <= 12 ? 'foundation' : fixture.week <= 24 ? 'volume' : fixture.week <= 36 ? 'intensification' : 'realization'
    const next = {
      ...active,
      program_key: fixture.program,
      program_version: fixture.programVersion || active.program_version,
      current_week: fixture.week,
      current_day_key: dayKey,
      current_phase_key: fixture.phaseKey || (fixture.program === 'black-crown' ? phaseForBlackCrown : active.current_phase_key),
      status: 'active',
      completed_at: null,
      updated_at: now,
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction('programInstances', 'readwrite')
      tx.objectStore('programInstances').put(next)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
    return { id: next.id, dayKey, program: next.program_key, week: next.current_week }
  }, fixture)
  report.observations.barbellProgramFixture = result
}

async function barLoaderGovernedScenario(page, fixtures) {
  report.observations.reachableBarbellSubstitutionCases = fixtures.length
  if (!fixtures.length) {
    pass('No reachable governed program barbell-substitution fixture exists; no synthetic relationship invented')
    return
  }

  let lastError = null
  for (const fixture of fixtures) {
    try {
      await setProgramFixture(page, fixture)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
      await settle(page, 5)
      await openTrain(page)
      await page.waitForTimeout(500)

      await startWorkout(page)
      const card = await findCard(page, new RegExp(fixture.primaryExercise.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      if (!card?.exerciseId) {
        const body = await page.locator('body').innerText()
        throw new Error(`Program fixture did not render active ${fixture.primaryExercise}; current screen: ${body.slice(0, 260)}`)
      }

      let rule = await openRule(page, card.exerciseId, new RegExp(fixture.alternativeExercise.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      if (await rule.locator('.lmf-sub-equipment.is-unknown,.lmf-sub-equipment.is-unavailable').count()) {
        await makeEquipmentAvailable(rule, false)
        await page.waitForTimeout(300)
        rule = page.locator('#lmf-exercise-substitution-modal .lmf-sub-rule').filter({ hasText: new RegExp(fixture.alternativeExercise.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first()
      }
      const manual = rule.locator('[data-lmf-sub-manual-load]')
      if (await manual.count()) await manual.fill('95')
      const use = rule.locator('[data-lmf-use-substitute]').first()
      if (!(await use.count())) throw new Error(`Apply action unavailable for governed ${fixture.ruleId}`)
      await use.click({ timeout: 5000 })
      await page.waitForFunction(name => [...document.querySelectorAll('.exercise-card.active-exercise .exercise-title h3')].some(node => (node.textContent || '').trim() === name), fixture.alternativeExercise, { timeout: 8000 })
      await page.waitForTimeout(500)

      const performed = await findCard(page, new RegExp(fixture.alternativeExercise.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      if (!performed?.exerciseId) throw new Error('Performed barbell substitute card missing')
      const performedCard = page.locator(`.exercise-card.active-exercise[data-exercise-id="${performed.exerciseId}"]`)
      const loader = performedCard.locator('[data-lmf-bar-loader-open="exercise"]').first()
      if (!(await loader.count())) throw new Error(`Bar Loader did not attach to performed substitute ${fixture.alternativeExercise}`)
      await loader.click({ timeout: 5000 })
      await page.waitForSelector('.lmf-bar-modal', { timeout: 5000 })
      const loaderExercise = (await page.locator('.lmf-bar-modal .lmf-bar-context strong').first().innerText()).trim()
      const modalText = await page.locator('.lmf-bar-modal').innerText()
      if (loaderExercise !== fixture.alternativeExercise) throw new Error(`Bar Loader context mismatch: ${loaderExercise}`)
      const currentLoad = performed.load || ''
      if (currentLoad && !modalText.includes(currentLoad)) {
        throw new Error(`Bar Loader did not surface current substitute load ${currentLoad}`)
      }
      report.observations.barLoaderGovernedProof = {
        passed: true,
        ruleId: fixture.ruleId,
        program: fixture.program,
        week: fixture.week,
        day: fixture.day,
        programmedExercise: fixture.primaryExercise,
        performedExercise: fixture.alternativeExercise,
        barLoaderExercise: loaderExercise,
        currentLoad,
      }
      pass('Governed barbell substitute drives Bar Loader from performed exercise and current load',
        `${fixture.ruleId}: ${fixture.primaryExercise} → ${fixture.alternativeExercise}${currentLoad ? ` @ ${currentLoad}` : ''}`)
      return
    } catch (error) {
      lastError = error
      await page.locator('[data-lmf-bar-close]').first().click().catch(() => null)
      await page.locator('[data-lmf-sub-close]').first().click().catch(() => null)
    }
  }
  throw lastError || new Error('No reachable governed barbell substitution fixture completed')
}

const fixtures = await discoverBarbellFixtures()
report.observations.reachableBarbellSubstitutionCases = fixtures.length
report.observations.barbellFixtures = fixtures

const browser = await chromium.launch({ executablePath: chromeBin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', message => { if (message.type() === 'error') console.log(`BROWSER ERROR ${message.text()}`) })

try {
  await bootstrapAthlete(page)
  await selectDay7(page)
  await startWorkout(page)
  pass('Workout Mode starts with governed substitution bridge')
  await applyWalkingScenario(page)
  await barLoaderGovernedScenario(page, fixtures)
} catch (error) {
  fail('Browser substitution scenario completes', error instanceof Error ? error.stack || error.message : String(error))
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: true }).catch(() => null)
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(outDir, 'audit.md'), [
  '# Issue #54 Workout Substitution Browser Audit v2',
  '',
  `Result: **${report.result}**`,
  '',
  'Covers equipment-first use, substitute-specific history surface, safety acknowledgement, exact pre-performance Undo, immutable logged substitute provenance, reload/resume, and governed Bar Loader integration when a real current-program fixture exists.',
  '',
  '## Passes',
  ...(report.passes.length ? report.passes.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Failures',
  ...(report.failures.length ? report.failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
].join('\n'))

if (report.failures.length) process.exit(1)
console.log(`Issue #54 workout substitution browser audit v2: PASS (${report.passes.length} checks)`)
