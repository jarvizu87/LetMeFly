import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '..'), target = path.join(root, '.build-src/letmefly_app')
const { chromium } = createRequire(path.join(target, 'package.json'))('playwright-core')
const out = path.join(target, 'ATHLETE_INSIGHTS_AUDIT'); fs.mkdirSync(out, { recursive: true })
const report = { result: 'PASS', checks: [] }
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
async function openCoachPanels(coach, keys = ['profile', 'history', 'evidence']) {
  for (const key of keys) {
    const detail = coach.locator(`[data-ai-coach-detail="workspace-${key}"]`)
    if (!(await detail.evaluate(node => node.open))) await detail.locator(':scope > summary').click()
  }
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const stores = ['athletes', 'athletePreferences', 'programInstances', 'readinessEntries', 'workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox']
    const data = await new Promise((resolve, reject) => { const tx = db.transaction(stores, 'readonly'), data = {}; tx.oncomplete = () => resolve(data); tx.onerror = () => reject(tx.error); for (const name of stores) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { data[name] = r.result } } }); db.close(); return data
  })
}
async function seed(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const get = store => new Promise(resolve => { const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => resolve(r.result) })
    const athlete = (await get('athletes')).find(r => !r.deleted_at), preferences = (await get('athletePreferences')).find(r => r.athlete_id === athlete.id)
    const stores = ['athletes', 'athletePreferences', 'workoutSessions', 'workoutExercises', 'workoutSets', 'readinessEntries']
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error)
      tx.objectStore('athletePreferences').put({ ...preferences, weight_unit: 'kg' })
      tx.objectStore('athletes').put({ id: 'zz-foreign', display_name: 'FOREIGN ATHLETE SHOULD NOT APPEAR' })
      for (const [i, days, load] of [[1, 1, 100], [2, 3, 200], [3, 35, 50], [4, 40, 50]]) {
        const date = new Date(Date.now() - days * 86400000).toISOString(), session = `insight-${i}`, exercise = `bench-${i}`
        tx.objectStore('workoutSessions').put({ id: session, athlete_id: athlete.id, completed_at: date, started_at: date, status: 'completed', readiness_id: `ready-${i}`, program_key: 'crownforge', workout_name: `Evidence ${i}` })
        tx.objectStore('workoutExercises').put({ id: exercise, athlete_id: athlete.id, workout_session_id: session, exercise_key: 'bench-press', exercise_name_snapshot: 'Bench Press', prescription_snapshot: { sourceSets: [{ reps: 5 }, { reps: 5 }] } })
        tx.objectStore('workoutSets').put({ id: `set-${i}`, athlete_id: athlete.id, workout_session_id: session, workout_exercise_id: exercise, set_number: 1, completed: true, completed_at: date, load_value: load, load_unit: 'kg', reps: 5, rpe: i === 1 ? 8 : 6 })
        tx.objectStore('workoutSets').put({ id: `pending-${i}`, athlete_id: athlete.id, workout_session_id: session, workout_exercise_id: exercise, set_number: 2, completed: false, completed_at: null, load_value: 99999, load_unit: 'kg', reps: 5 })
        tx.objectStore('readinessEntries').put({ id: `ready-${i}`, athlete_id: athlete.id, recorded_at: new Date(Date.parse(date) - 3600000).toISOString(), energy: 3, sleep_quality: 4, soreness: 2, stress: 3 })
      }
      const date = new Date(Date.now() - 3600000).toISOString()
      tx.objectStore('workoutSets').put({ id: 'foreign-set', athlete_id: 'zz-foreign', workout_session_id: 'insight-1', workout_exercise_id: 'bench-1', completed: true, completed_at: date, load_value: 999999, load_unit: 'kg', reps: 10 })
      tx.objectStore('workoutExercises').put({ id: 'carry', athlete_id: athlete.id, workout_session_id: 'insight-1', exercise_key: 'farmer-carry', exercise_name_snapshot: 'Farmer Carry', prescription_snapshot: { sourceSets: [{ distance: '20 m' }] } })
      tx.objectStore('workoutSets').put({ id: 'carry-set', athlete_id: athlete.id, workout_session_id: 'insight-1', workout_exercise_id: 'carry', set_number: 1, completed: true, completed_at: date, load_value: 50, load_unit: 'kg', reps: 20, performance_data: { actualMetricKind: 'distance', actualMetricValue: 20, actualMetricUnit: 'm' } })
      tx.objectStore('readinessEntries').put({ id: 'readiness-insight', athlete_id: athlete.id, recorded_at: date, energy: 3, sleep_quality: 4, soreness: 2, stress: 3 })
    }); db.close()
  })
}
try {
  for (const width of [412, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' })
    await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4173/') ? route.continue() : route.abort())
    const page = await context.newPage(), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
    const create = page.getByRole('button', { name: /CREATE LOCAL ATHLETE/i })
    await create.waitFor({ state: 'visible', timeout: 15000 })
    const modal = create.locator('xpath=ancestor::*[contains(@class,"modal")][1]')
    await modal.locator('input[type="text"],input:not([type])').first().fill('Priority B QA')
    await create.click(); await create.waitFor({ state: 'hidden' })
    const dismiss = page.getByRole('button', { name: /Not now/i }); if (await dismiss.isVisible()) await dismiss.click()
    await seed(page)
    await page.goto('http://127.0.0.1:4173/#/progress', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-pg-tab="strength"]').click()
    const panel = page.locator('#lmf-advanced-progress'); await panel.waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.querySelector('#lmf-advanced-progress')?.textContent.includes('1,500 kg-reps'))
    const before = await snapshot(page)
    assert.match(await panel.innerText(), /\+200% volume/)
    assert.equal(await panel.locator('svg circle').count(), 2)
    assert.equal(await page.locator('#lmf-advanced-progress').count(), 1)
    assert.match(await panel.innerText(), /60%/)
    assert.match(await panel.innerText(), /3 of 5 saved set slots completed/)
    const groups = panel.locator('[data-ai-detail-key="distribution"]')
    await groups.locator('summary').click()
    await page.waitForFunction(() => document.querySelector('[data-ai-detail-key="distribution"]')?.textContent.includes('Bench / Press Pattern'))
    assert.match(await groups.innerText(), /3 of 3 completed sets/)
    await groups.locator('[data-ai-dimension]').selectOption('muscles')
    await page.waitForFunction(() => document.querySelector('[data-ai-detail-key="distribution"]')?.textContent.includes('Pectoralis Major'))
    assert.equal(await groups.getAttribute('open'), '')
    if (await dismiss.isVisible()) { await dismiss.click(); await dismiss.waitFor({ state: 'hidden' }) }
    await groups.screenshot({ path: path.join(out, `progress-groups-${width}.png`) })
    await groups.locator('summary').click()
    const readiness = panel.locator('[data-ai-detail-key="readiness"]')
    await readiness.locator('summary').click()
    assert.match(await readiness.innerText(), /2 of 2 sessions have a scored check-in/)
    await readiness.locator('summary').click()
    await panel.locator('[data-ai-exercise]').selectOption('farmer-carry')
    await page.waitForFunction(() => document.querySelector('#lmf-advanced-progress .lmf-ai-metric strong')?.textContent.includes('—'))
    await panel.locator('[data-ai-exercise]').selectOption('bench-press')
    const trend = panel.locator('[data-ai-detail-key="trend"]')
    await trend.locator('summary').click()
    assert.equal(await trend.locator('[data-ai-reps]').inputValue(), '5')
    assert.equal(await trend.locator('svg circle').count(), 2)
    assert.match(await trend.innerText(), /Top logged load at 5 reps/)
    assert.match(await panel.innerText(), /2 of 4 saved set slots completed/)
    if (await dismiss.isVisible()) { await dismiss.click(); await dismiss.waitFor({ state: 'hidden' }) }
    await trend.screenshot({ path: path.join(out, `progress-load-trend-${width}.png`) })
    await trend.locator('summary').click()
    assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'Detail views fit the panel')
    const sessionDetails = panel.locator('[data-ai-session-details]')
    const sessionSummary = sessionDetails.locator(':scope > summary')
    await sessionSummary.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await sessionSummary.focus()
    await sessionSummary.press('Enter')
    assert.equal(await sessionDetails.getAttribute('open'), '', 'Session details opens through native keyboard interaction')
    if (await dismiss.isVisible()) await dismiss.click()
    await panel.screenshot({ path: path.join(out, `progress-${width}.png`) })
    const range = page.locator('[data-pg-range]'); await range.selectOption('7d')
    await page.waitForFunction(() => document.querySelector('#lmf-advanced-progress')?.textContent.includes('Needs two sessions'))
    await page.locator('[data-pg-tab="conditioning"]').click(); assert.equal(await page.locator('#lmf-advanced-progress').count(), 0)
    await page.locator('[data-pg-tab="strength"]').click(); await panel.waitFor({ state: 'visible' })
    await page.goto('http://127.0.0.1:4173/#/coach', { waitUntil: 'domcontentloaded' })
    const coach = page.locator('#lmf-athlete-coach'); await coach.waitFor({ state: 'visible' }); await openCoachPanels(coach)
    assert.match(await coach.innerText(), /Priority B QA/); assert.doesNotMatch(await coach.innerText(), /FOREIGN ATHLETE/)
    assert.match(await coach.innerText(), /Your primary goal is not saved yet/)
    assert.match(await coach.innerText(), /0 of 9 coaching details saved/)
    await coach.locator('[data-ai-coach-topic]').selectOption('difficult')
    await page.waitForFunction(() => document.querySelector('#lmf-athlete-coach')?.textContent.includes('Two comparable primary declines'))
    assert.match(await coach.innerText(), /does not confirm their triggers/)
    await coach.locator('summary').filter({ hasText: 'One isolated poor primary session' }).click()
    assert.match(await coach.innerText(), /keep long-term plan unchanged/)
    if (await dismiss.isVisible()) await dismiss.click()
    await coach.screenshot({ path: path.join(out, `coach-${width}.png`) })
    await page.reload(); await coach.waitFor({ state: 'visible' }); await openCoachPanels(coach)
    assert.deepEqual(await snapshot(page), before, 'Read-only views must preserve all source and outbox rows')
    await coach.getByRole('link', { name: 'Add athlete details' }).click()
    const goal = page.locator('[data-profile-key="primaryGoal"]'); await goal.waitFor({ state: 'visible' })
    const goalText = 'Build strength <img src=x onerror=alert(1)>'
    await goal.fill(goalText)
    await page.locator('[data-profile-key="equipment"]').fill('Rack and cables')
    await page.locator('[data-action="save-profile-v2"]').click()
    await page.waitForFunction(() => document.querySelector('[data-profile-save-status]')?.textContent.includes('Saved privately'))
    const savedProfile = await snapshot(page)
    await page.goto('http://127.0.0.1:4173/#/coach', { waitUntil: 'domcontentloaded' })
    await coach.waitFor({ state: 'visible' }); await openCoachPanels(coach)
    assert.match(await coach.innerText(), /2 of 9 coaching details saved/)
    assert.ok((await coach.innerText()).includes(goalText), 'Saved text must be rendered literally')
    assert.equal(await coach.locator('[data-ai-profile] img').count(), 0)
    await coach.locator('[data-ai-profile] summary').click()
    assert.match(await coach.innerText(), /Rack and cables/)
    if (await dismiss.isVisible()) await dismiss.click()
    await coach.locator('[data-ai-profile]').evaluate(el => el.scrollIntoView({ block: 'center' }))
    await coach.locator('[data-ai-profile]').screenshot({ path: path.join(out, `coach-profile-${width}.png`) })
    await page.reload(); await coach.waitFor({ state: 'visible' }); await openCoachPanels(coach)
    assert.ok((await coach.innerText()).includes(goalText), 'Profile context survives reload')
    assert.deepEqual(await snapshot(page), savedProfile, 'Coach must not write profile or outbox rows')
    await page.goto('http://127.0.0.1:4173/#/home', { waitUntil: 'domcontentloaded' })
    assert.equal(await page.locator('#lmf-advanced-progress, #lmf-athlete-coach').count(), 0)
    if (process.env.CHECK_PROGRAM_ORDER === '1') {
      await page.goto('http://127.0.0.1:4173/#/program', { waitUntil: 'domcontentloaded' })
      await page.locator('.black-crown-weeks-compact').waitFor()
      const ordered = await page.evaluate(() => {
        const cf = document.querySelector('[data-program-week-drawer]'), cm = document.querySelector('.maintenance-weeks-compact'), bc = document.querySelector('.black-crown-panel')
        return Boolean(cf && cm && bc && (cf.compareDocumentPosition(cm) & Node.DOCUMENT_POSITION_FOLLOWING) && (cm.compareDocumentPosition(bc) & Node.DOCUMENT_POSITION_FOLLOWING))
      }); assert.equal(ordered, true, 'Crownforge → Crown Maintenance → Black Crown')
    }
    assert.deepEqual(errors, [])
    report.checks.push({ viewport: width, result: 'PASS', coverage: ['saved-slot completion', 'catalog role and muscle groups', 'equal-rep load trend', 'explicit readiness links', 'actual volume', 'period comparison', 'metric exclusion', 'exercise filter', 'chart', 'route cleanup', 'Coach source context', 'athlete isolation', 'reload', 'source/outbox immutability', 'empty profile', 'native profile save and Coach reload', 'literal profile text', ...(process.env.CHECK_PROGRAM_ORDER === '1' ? ['program order'] : [])] })
    await context.close()
  }
} catch (error) { report.result = 'FAIL'; report.error = error.stack; throw error }
finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close() }
console.log(JSON.stringify(report))
