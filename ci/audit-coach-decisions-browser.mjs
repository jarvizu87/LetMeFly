import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '..'), target = path.join(root, '.build-src/letmefly_app')
const { chromium } = createRequire(path.join(target, 'package.json'))('playwright-core')
const base = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Browser audit must use loopback')
const out = path.join(target, 'COACH_DECISIONS_AUDIT'); fs.mkdirSync(out, { recursive: true })
const report = { result: 'PASS', checks: [] }
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
let activePage
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const stores = [...db.objectStoreNames]
    const data = await new Promise((resolve, reject) => { const tx = db.transaction(stores, 'readonly'), data = {}; tx.oncomplete = () => resolve(data); tx.onerror = () => reject(tx.error); for (const name of stores) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { data[name] = r.result } } }); db.close(); return data
  })
}
async function openEvidence(page) {
  const detail = page.locator('[data-ai-coach-detail="workspace-evidence"]')
  await detail.waitFor({ state: 'visible' })
  if (!(await detail.evaluate(node => node.open))) await detail.locator(':scope > summary').click()
}
async function seed(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const get = name => new Promise(resolve => { const r = db.transaction(name, 'readonly').objectStore(name).getAll(); r.onsuccess = () => resolve(r.result) })
    const athlete = (await get('athletes')).find(row => !row.deleted_at)
    const program = (await get('programInstances')).find(row => row.athlete_id === athlete.id && row.status === 'active' && !row.deleted_at)
    if (!program) throw new Error('Native onboarding did not create an active program')
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['athletes', 'workoutSessions', 'workoutExercises', 'workoutSets', 'readinessEntries'], 'readwrite'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error)
      tx.objectStore('athletes').put({ ...athlete, profile_context_v2: { primaryGoal: 'Strength <img src=x onerror=alert(1)>', equipment: 'Old unavailable rack', coachingNotes: 'Old pain and poor technique; two declines' } })
      tx.objectStore('athletes').put({ id: 'zz-foreign-coach', display_name: 'FOREIGN ATHLETE SHOULD NOT APPEAR', profile_context_v2: { primaryGoal: 'FOREIGN GOAL' } })
      for (let i = 0; i < 3; i++) {
        const date = new Date(Date.now() - (i + 1) * 86400000).toISOString(), session = `coach-session-${i}`, exercise = `coach-bench-${i}`
        tx.objectStore('workoutSessions').put({ id: session, athlete_id: athlete.id, completed_at: date, started_at: date, status: 'completed', program_key: program.program_key, workout_name: `Coach evidence ${i}` })
        tx.objectStore('workoutExercises').put({ id: exercise, athlete_id: athlete.id, workout_session_id: session, exercise_key: 'bench-press', exercise_name_snapshot: 'Bench Press', prescription_snapshot: { sourceSets: [{ reps: 5 }] } })
        tx.objectStore('workoutSets').put({ id: `coach-set-${i}`, athlete_id: athlete.id, workout_session_id: session, workout_exercise_id: exercise, set_number: 1, completed: true, completed_at: date, load_value: 100 + i * 10, load_unit: 'kg', reps: 5, rpe: 8 })
      }
      tx.objectStore('readinessEntries').put({ id: 'coach-old-readiness', athlete_id: athlete.id, recorded_at: new Date(Date.now() - 20 * 86400000).toISOString(), energy: 1, soreness: 5, sleep_quality: 1, stress: 5 })
    }); db.close()
    return { athleteId: athlete.id, programId: program.id }
  })
}
try {
  for (const width of [412, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' })
    await context.route('**/*', route => route.request().url().startsWith(`${base}/`) ? route.continue() : route.abort())
    const page = activePage = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    // Keep wall time independent of the virtual timer queue. Playwright 1.55
    // can rewind its running clock while dispatching an overdue timer.
    const auditWallTime = new Date()
    await page.clock.install({ time: auditWallTime })
    await page.clock.setFixedTime(auditWallTime)
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    const create = page.getByRole('button', { name: /CREATE LOCAL ATHLETE/i })
    await create.waitFor({ state: 'visible', timeout: 15000 })
    const modal = create.locator('xpath=ancestor::*[contains(@class,"modal")][1]')
    await modal.locator('input[type="text"],input:not([type])').first().fill('Coach decision QA')
    await create.click(); await create.waitFor({ state: 'hidden' })
    const dismiss = page.getByRole('button', { name: 'Dismiss install prompt' }); if (await dismiss.isVisible()) await dismiss.click()
    const ids = await seed(page)
    await page.goto(`${base}/#/coach`, { waitUntil: 'domcontentloaded' })
    const coach = page.locator('#lmf-athlete-coach'), review = coach.locator('[data-ai-current-review]'), result = review.locator('[data-ai-current-result]')
    await coach.waitFor({ state: 'visible' })
    await page.locator('.lmf-coach-workspace').waitFor({ state: 'visible' })
    assert.equal(await coach.locator(':scope > details').count(), 3)
    assert.equal(await coach.locator(':scope > details[open]').count(), 0, 'Supporting context starts collapsed')
    assert.equal(await page.locator('.lmf-coach-question:visible').count(), 0, 'No invented conversation is seeded')
    assert.equal(await page.locator('[data-coach-prompt]').count(), 6, 'Every original quick action is retained')
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height } }
      return { context:rect('.coach-context'), conversation:rect('.lmf-coach-conversation-heading'), composer:rect('.coach-composer'), nav:rect('.navbar'), viewport:innerWidth, scroll:document.documentElement.scrollWidth }
    })
    assert.ok(layout.scroll <= layout.viewport + 1, 'Coach has no page overflow')
    if (width < 600) {
      assert.ok(layout.context.y < layout.conversation.y, 'Mobile focus precedes the conversation')
      assert.ok(layout.composer.bottom <= layout.nav.y + 1, `Mobile composer clears bottom navigation: ${JSON.stringify(layout)}`)
    } else assert.ok(layout.context.x > layout.conversation.right, 'Desktop context sits beside the conversation')
    await page.screenshot({ path: path.join(out, `coach-workspace-${width}.png`) })
    await openEvidence(page)
    await review.waitFor({ state: 'visible' })
    if (await dismiss.isVisible()) await dismiss.click()
    assert.doesNotMatch(await coach.innerText(), /FOREIGN ATHLETE|FOREIGN GOAL/)
    assert.equal(await coach.locator('[data-ai-profile] img').count(), 0)
    const before = await snapshot(page)
    const storageBefore = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))
    await page.getByRole('button', { name: 'Today’s plan', exact: true }).click()
    assert.equal(await page.locator('.lmf-coach-question p').innerText(), 'What are we doing today?')
    assert.match(await page.locator('#coach-answer').innerText(), /Crownforge|STRENGTH|Session|session|squat|Squat/)
    const question = page.getByRole('textbox', { name: 'Ask your coach', exact: true })
    await question.fill('Can I increase the weight?')
    await page.getByRole('button', { name: 'Send question', exact: true }).click()
    assert.match(await page.locator('#coach-answer').innerText(), /Load decision/)
    await question.fill('What should I focus on? <img src=x onerror=alert(1)>')
    await question.press('Control+Enter')
    assert.equal(await page.locator('.lmf-coach-question img').count(), 0, 'Submitted questions are literal text')
    assert.match(await page.locator('.lmf-coach-question p').innerText(), /<img src=x/)
    assert.match(await page.locator('#coach-answer').innerText(), /Set focus/)
    await review.locator('[data-ai-coach-detail="checkin"] > summary').click()
    assert.match(await result.innerText(), /Start with your current situation/)
    assert.deepEqual(await review.locator('[data-ai-feedback]').evaluateAll(nodes => nodes.map(node => node.value)), Array(12).fill('unknown'))
    await review.locator('[data-ai-feedback="equipment"]').focus()
    await review.locator('[data-ai-feedback="equipment"]').selectOption('unavailable')
    await page.waitForFunction(() => document.activeElement?.dataset.aiFeedback === 'equipment')
    await review.locator('[data-ai-feedback="time"]').selectOption('compressed')
    await review.locator('[data-ai-review-current]').click()
    await page.waitForFunction(() => document.querySelector('[data-ai-current-result]')?.textContent.includes('REVIEW FIRST · DR-014'))
    await review.locator('[data-ai-feedback="pain"]').selectOption('yes')
    await page.waitForFunction(() => !document.querySelector('[data-ai-current-result]')?.textContent.includes('REVIEW FIRST'))
    await review.locator('[data-ai-review-current]').click()
    await page.waitForFunction(() => document.querySelector('[data-ai-current-result]')?.textContent.includes('REVIEW FIRST · DR-019'))
    await result.locator('[data-ai-coach-detail="source-DR-019"] > summary').click()
    assert.match(await result.innerText(), /Evidence Governance GV-10/)
    assert.match(await result.innerText(), /STANDBY/)
    await result.locator('[data-ai-coach-detail="other-signals"] > summary').click()
    assert.deepEqual(await result.locator('[data-ai-secondary-rule]').evaluateAll(nodes => nodes.map(node => node.dataset.aiSecondaryRule)), ['DR-014', 'DR-004'])
    await result.locator('[data-ai-coach-detail="other-signals"] > summary').click()
    await result.locator('[data-ai-coach-detail="source-DR-019"] > summary').click()
    await review.locator('[data-ai-coach-detail="decision-evidence"] > summary').click()
    assert.match(await review.innerText(), /3 of 12 current questions answered/)
    assert.match(await review.innerText(), /3 completed sessions, 3 saved sets and 3 effort ratings/)
    assert.equal(await review.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'Current review fits the panel')
    assert.deepEqual(await snapshot(page), before, 'Current feedback and review must leave every private store unchanged')
    assert.deepEqual(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })), storageBefore, 'Current feedback must remain in memory')
    if (await dismiss.isVisible()) await dismiss.click()
    await result.evaluate(node => node.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(250)
    await page.screenshot({ path: path.join(out, `current-review-viewport-${width}.png`) })
    await result.screenshot({ path: path.join(out, `current-review-${width}.png`) })
    await review.locator('[data-ai-coach-detail="decision-evidence"] > summary').click()
    const expiredWallTime = await page.evaluate(() => Date.now() + 15 * 60 * 1000 + 100)
    await page.clock.setFixedTime(expiredWallTime)
    await page.clock.fastForward(15 * 60 * 1000 + 100)
    await page.waitForFunction(() => document.querySelector('[data-ai-feedback-status]')?.textContent.includes('expired'))
    assert.doesNotMatch(await result.innerText(), /REVIEW FIRST/)
    await review.locator('[data-ai-review-current]').click()
    await page.waitForFunction(() => document.querySelector('[data-ai-current-result]')?.textContent.includes('REVIEW FIRST · DR-019'))
    const exercise = page.locator('#lmf-coach-exercise-context')
    const nextExercise = await exercise.locator('option').evaluateAll(nodes => nodes.map(node => node.value).find(value => value))
    assert.ok(nextExercise, 'Native Coach exercise selector is available')
    await exercise.selectOption(nextExercise)
    await page.waitForFunction(() => document.querySelector('[data-ai-feedback-status]')?.textContent.includes('context changed'))
    assert.deepEqual(await review.locator('[data-ai-feedback]').evaluateAll(nodes => nodes.map(node => node.value)), Array(12).fill('unknown'))
    assert.doesNotMatch(await result.innerText(), /REVIEW FIRST/)
    await review.locator('[data-ai-feedback="equipment"]').selectOption('unavailable')
    await review.locator('[data-ai-review-current]').click()
    await page.waitForFunction(() => document.querySelector('[data-ai-current-result]')?.textContent.includes('REVIEW FIRST · DR-014'))
    await page.evaluate(async ({ programId }) => {
      const db = await new Promise(resolve => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result) })
      await new Promise((resolve, reject) => { const tx = db.transaction('programInstances', 'readwrite'), store = tx.objectStore('programInstances'), request = store.get(programId); request.onsuccess = () => store.put({ ...request.result, current_week: Number(request.result.current_week) + 1 }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
      await window.__LMF_ATHLETE_INSIGHTS__.refresh()
    }, ids)
    await page.waitForFunction(() => document.querySelector('[data-ai-feedback-status]')?.textContent.includes('context changed'))
    assert.doesNotMatch(await result.innerText(), /REVIEW FIRST/)
    const changedProgram = await snapshot(page)
    await review.locator('[data-ai-feedback="equipment"]').selectOption('unavailable')
    await review.locator('[data-ai-review-current]').click()
    await page.waitForFunction(() => document.querySelector('[data-ai-current-result]')?.textContent.includes('REVIEW FIRST · DR-014'))
    const train = result.getByRole('link', { name: 'Review today’s workout' })
    assert.equal(await train.getAttribute('href'), '#/train')
    assert.match(await result.innerText(), /Substitute Today/)
    await train.click()
    await page.waitForFunction(() => location.hash === '#/train' && !document.querySelector('#lmf-athlete-coach'))
    await page.goto(`${base}/#/coach`, { waitUntil: 'domcontentloaded' })
    await openEvidence(page)
    await review.waitFor({ state: 'visible' })
    assert.doesNotMatch(await result.innerText(), /REVIEW FIRST/)
    assert.deepEqual(await snapshot(page), changedProgram, 'Native navigation must not apply a substitution or edit the program')
    await review.locator('[data-ai-coach-detail="checkin"] > summary').click()
    await review.locator('[data-ai-feedback="pain"]').selectOption('yes')
    await review.locator('[data-ai-review-current]').click()
    await page.waitForFunction(() => document.querySelector('[data-ai-current-result]')?.textContent.includes('REVIEW FIRST · DR-019'))
    await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result) })
      await new Promise((resolve, reject) => { const tx = db.transaction('athletes', 'readwrite'); tx.objectStore('athletes').put({ id: '000-new-active', display_name: 'Different athlete QA' }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
      await window.__LMF_ATHLETE_INSIGHTS__.refresh()
    })
    await page.waitForFunction(() => document.querySelector('#lmf-athlete-coach')?.textContent.includes('Different athlete QA'))
    assert.doesNotMatch(await result.innerText(), /REVIEW FIRST/)
    assert.deepEqual(await review.locator('[data-ai-feedback]').evaluateAll(nodes => nodes.map(node => node.value)), Array(12).fill('unknown'))
    assert.doesNotMatch(await coach.innerText(), /Old pain|Old unavailable rack|Coach decision QA/)
    const changedAthlete = await snapshot(page)
    await page.reload(); await openEvidence(page); await review.waitFor({ state: 'visible' })
    assert.doesNotMatch(await result.innerText(), /REVIEW FIRST/)
    assert.deepEqual(await snapshot(page), changedAthlete, 'Reload and changed-athlete review remain read-only')
    assert.deepEqual(errors, [])
    report.checks.push({ viewport: width, result: 'PASS', coverage: ['explicit current feedback', 'no stale profile inference', 'source priority and provenance', 'unknown states and evidence counts', 'edit invalidates reviewed answers', '15-minute expiry', 'exercise/program/athlete invalidation', 'native Train link', 'route and reload reset', 'all-store immutability', 'no web-storage feedback', 'literal profile text', 'mobile fit and focus preservation', 'collapsed supporting panels', 'responsive Coach workspace', 'quick prompts and send/keyboard handlers', 'literal submitted questions'] })
    await context.close()
  }
} catch (error) {
  report.result = 'FAIL'; report.error = error.stack
  if (activePage && !activePage.isClosed()) {
    report.feedbackAtFailure = await activePage.evaluate(() => {
      const signature = JSON.parse(document.querySelector('#lmf-athlete-coach')?.dataset.signature || 'null')?.at(-1)
      return signature && { status: signature[3], capturedAt: signature[2]?.capturedAt, observedAt: new Date().toISOString(),
        sameContext: signature[0] === signature[2]?.contextKey,
        notice: document.querySelector('[data-ai-feedback-status]')?.textContent,
        result: document.querySelector('[data-ai-current-result]')?.textContent }
    }).catch(() => null)
    await activePage.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {})
  }
  throw error
}
finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close() }
console.log(JSON.stringify(report))
