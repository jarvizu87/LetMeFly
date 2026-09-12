#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { applicationBootState } from './browser-boot-contract.mjs'
import { FIVE_ATHLETE_FIXTURES, validateFiveAthleteFixtures } from './five-athlete-fixtures.mjs'
import { seedFiveAthleteFixture } from './five-athlete-seed.mjs'

validateFiveAthleteFixtures()
const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const out = path.join(app, 'FIVE_ATHLETE_RELEASE_AUDIT')
fs.mkdirSync(out, { recursive: true })
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href)
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
function treeHash(dir) {
  const parts = []
  const walk = current => {
    if (!fs.existsSync(current)) return
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) parts.push(`${path.relative(dir, full)}:${digest(fs.readFileSync(full))}`)
    }
  }
  walk(dir)
  return digest(parts.join('\n'))
}
const sourceHashBefore = treeHash(path.join(app, 'src'))
const distHashBefore = treeHash(path.join(app, 'dist'))

const runtime = fs.mkdtempSync(path.join(app, '.qa-five-athlete-release-'))
const entry = path.join(runtime, 'entry.ts')
fs.writeFileSync(entry, [
  `import * as athlete from ${JSON.stringify(path.join(app, 'src/services/athlete-service'))}`,
  `import * as profile from ${JSON.stringify(path.join(app, 'src/services/profile-context-service'))}`,
  `import * as readiness from ${JSON.stringify(path.join(app, 'src/services/readiness-service'))}`,
  `import * as db from ${JSON.stringify(path.join(app, 'src/db/local-db'))}`,
  `import * as programs from ${JSON.stringify(path.join(app, 'src/data/programs'))}`,
  `if(location.hostname !== '127.0.0.1' || new URLSearchParams(location.search).get('five-athlete-release-qa') !== '1') throw new Error('Five-athlete release bridge is disposable loopback only')`,
  `window.__LMF_FIVE_ATHLETE_QA__ = Object.freeze({ athlete, profile, readiness, db, programs })`,
].join('\n'))
await build({ configFile: false, root: app, publicDir: false, logLevel: 'warn', build: { outDir: path.join(runtime, 'web'), emptyOutDir: true, minify: false, lib: { entry, formats: ['es'], fileName: () => 'services.js' } } })
fs.writeFileSync(path.join(runtime, 'web', 'index.html'), '<!doctype html><title>Five athlete release QA</title><script type="module" src="./services.js"></script>')

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const qa = url.pathname.startsWith('/__qa/')
  const base = qa ? path.join(runtime, 'web') : path.join(app, 'dist')
  const relative = qa ? url.pathname.slice('/__qa/'.length) : url.pathname.slice(1)
  let file = path.resolve(base, decodeURIComponent(relative || 'index.html'))
  if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end('forbidden'); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(base, 'index.html')
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: chromeBin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const report = { result: 'RUNNING', athletes: [], crossAthleteRecheck: [], failures: [], sourceHashBefore, distHashBefore, origin }
const live = []

async function dismissInstall(page) {
  const candidates = [
    page.getByRole('button', { name: /Dismiss install prompt/i }),
    page.getByRole('button', { name: /^Not now$/i }),
  ]
  for (const candidate of candidates) {
    if (await candidate.first().isVisible().catch(() => false)) {
      await candidate.first().click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(120)
    }
  }
}
async function openApp(page, route) {
  await page.goto(`${origin}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForFunction(applicationBootState, null, { timeout: 20000 })
  await dismissInstall(page)
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try {
      const wanted = ['athletes','athletePreferences','programInstances','programEvents','trainingMaxHistory','readinessEntries','workoutSessions','workoutExercises','workoutSets','syncOutbox']
      const names = wanted.filter(name => db.objectStoreNames.contains(name))
      const tx = db.transaction(names, 'readonly'), data = {}
      await Promise.all(names.map(name => new Promise((resolve, reject) => { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { data[name] = r.result; resolve() }; r.onerror = () => reject(r.error) })))
      return data
    } finally { db.close() }
  })
}
async function programDigest(page) {
  return page.evaluate(async () => {
    const q = window.__LMF_FIVE_ATHLETE_QA__
    const raw = JSON.stringify([q.programs.CROWNFORGE, q.programs.CROWN_MAINTENANCE, q.programs.BLACK_CROWN])
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('')
  })
}
function ownRows(rows, athleteId) { return (rows || []).filter(row => row?.athlete_id === athleteId && !row.deleted_at) }
function prescriptionMap(data, sessionId) {
  const exercises = (data.workoutExercises || []).filter(row => row.workout_session_id === sessionId)
  const sets = (data.workoutSets || []).filter(row => row.workout_session_id === sessionId)
  return {
    exercises: Object.fromEntries(exercises.map(row => [row.id, row.prescription_snapshot ?? null])),
    sets: Object.fromEntries(sets.map(row => [row.id, Object.fromEntries(Object.entries(row).filter(([key]) => /^(set_number|programmed_|prescribed_|target_|source_)/.test(key)))])),
  }
}
async function chooseReadiness(page, fixture) {
  await page.waitForSelector('.readiness-field', { timeout: 10000 })
  const chosen = await page.evaluate(input => {
    const values = { sleep: input.sleepQuality, soreness: input.soreness, stress: input.stress, energy: input.energy }
    const result = []
    for (const field of document.querySelectorAll('.readiness-field')) {
      const text = (field.textContent || '').toLowerCase()
      const key = Object.keys(values).find(name => text.includes(name))
      const desired = key ? values[key] : 4
      const radio = field.querySelector(`input[type="radio"][value="${desired}"]`)
      if (radio instanceof HTMLInputElement) {
        radio.checked = true
        radio.dispatchEvent(new Event('input', { bubbles: true }))
        radio.dispatchEvent(new Event('change', { bubbles: true }))
        result.push({ key: key || 'unknown', value: desired })
      }
    }
    return result
  }, fixture.readiness)
  assert.ok(chosen.length >= 4, `${fixture.key}: readiness UI did not expose four scored fields`)
  return chosen
}
async function openCoachDetails(page) {
  const coach = page.locator('#lmf-athlete-coach')
  await coach.waitFor({ state: 'visible', timeout: 10000 })
  for (const key of ['profile','history','evidence']) {
    const detail = coach.locator(`[data-ai-coach-detail="workspace-${key}"]`)
    if (!(await detail.count())) continue
    if (!(await detail.evaluate(node => node.open))) {
      const summary = detail.locator(':scope > summary')
      await summary.evaluate(el => el.scrollIntoView({ block: 'center' }))
      await summary.focus(); await summary.press('Enter')
    }
  }
  return coach
}
async function assertNoForeignFixtureText(page, fixture, label) {
  const text = await page.locator('body').innerText()
  for (const other of FIVE_ATHLETE_FIXTURES.filter(row => row.key !== fixture.key)) {
    assert.equal(text.includes(other.displayName), false, `${fixture.key}: ${label} leaked ${other.displayName}`)
    assert.equal(text.includes(other.profile.primaryGoal), false, `${fixture.key}: ${label} leaked ${other.key} goal`)
    assert.equal(text.includes(other.profile.coachingNotes), false, `${fixture.key}: ${label} leaked ${other.key} coach marker`)
  }
}
async function waitForCompletedSession(page, sessionId) {
  await page.waitForFunction(async id => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try { const row = await new Promise(resolve => { const r = db.transaction('workoutSessions','readonly').objectStore('workoutSessions').get(id); r.onsuccess = () => resolve(r.result) }); return row?.status === 'completed' } finally { db.close() }
  }, sessionId, { timeout: 12000 })
}

try {
  for (const fixture of FIVE_ATHLETE_FIXTURES) {
    const athleteResult = { key: fixture.key, displayName: fixture.displayName, viewport: fixture.viewport, checks: [], errors: [] }
    let context, page
    try {
      context = await browser.newContext({ viewport: { width: fixture.viewport.width, height: fixture.viewport.height }, isMobile: fixture.viewport.mobile, hasTouch: fixture.viewport.mobile, serviceWorkers: 'block' })
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'))
      page = await context.newPage(); page.setDefaultTimeout(12000)
      page.on('pageerror', error => athleteResult.errors.push(error.message))

      await page.goto(`${origin}/__qa/index.html?five-athlete-release-qa=1`, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__LMF_FIVE_ATHLETE_QA__)
      const seeded = await seedFiveAthleteFixture(page, fixture)
      const athleteId = seeded.athleteId
      athleteResult.athleteId = athleteId
      assert.equal(seeded.foreignAthleteRows, 0)
      assert.equal(seeded.programInstance.program_key, 'crownforge')
      assert.equal(Number(seeded.programInstance.current_week), 1)
      assert.match(String(seeded.programInstance.current_day_key), /day-1/i)
      athleteResult.checks.push('private fixture seeded at governed Crownforge W1D1')
      const canonicalBefore = await programDigest(page)

      await openApp(page, 'home')
      assert.match(await page.locator('body').innerText(), /Crownforge/i)
      await assertNoForeignFixtureText(page, fixture, 'Home')
      athleteResult.checks.push('Home renders own governed program only')

      await openApp(page, 'train')
      const readinessChosen = await chooseReadiness(page, fixture)
      const start = page.locator('.active-page [data-action="start-workout"], [data-action="start-workout"]').first()
      await start.waitFor({ state: 'visible', timeout: 10000 })
      await start.click({ timeout: 5000 })
      await page.locator('.active-exercise [data-set-id]').first().waitFor({ state: 'attached', timeout: 12000 })
      const afterStart = await snapshot(page)
      const session = (afterStart.workoutSessions || []).find(row => row.athlete_id === athleteId && row.status === 'in_progress')
      assert.ok(session, `${fixture.key}: in-progress session missing after native Start Workout`)
      const sessionId = session.id
      athleteResult.sessionId = sessionId
      const beforePrescription = prescriptionMap(afterStart, sessionId)
      assert.ok(Object.keys(beforePrescription.exercises).length > 0)
      athleteResult.checks.push(`Readiness → Start Workout (${readinessChosen.length} readiness fields)`) 

      const front = page.locator('.active-exercise').filter({ has: page.locator('.exercise-title h3', { hasText: /^Front Squat$/ }) }).first()
      await front.waitFor({ state: 'attached', timeout: 10000 })
      const firstRow = front.locator('[data-set-id]').first()
      const setId = await firstRow.getAttribute('data-set-id')
      assert.ok(setId)
      const loadInput = firstRow.locator('.load-input')
      const displayedLoad = (await loadInput.inputValue().catch(() => '')).trim()
      const displayedUnit = (await firstRow.locator('.load-field small').innerText().catch(() => '')).trim()
      assert.ok(displayedLoad, `${fixture.key}: Front Squat prescribed load is blank`)
      assert.match(displayedUnit, new RegExp(fixture.weightUnit, 'i'), `${fixture.key}: workout load unit must follow athlete setting`)
      athleteResult.frontSquatLoad = `${displayedLoad} ${displayedUnit}`

      const barOpen = front.locator('[data-lmf-bar-loader-open="exercise"]').first()
      await barOpen.waitFor({ state: 'visible', timeout: 10000 })
      await barOpen.click({ timeout: 5000 })
      const bar = page.locator('.lmf-bar-loader-root'); await bar.waitFor({ state: 'visible' })
      assert.equal(await bar.locator('#lmf-bar-unit').inputValue(), fixture.weightUnit)
      assert.equal(await bar.locator('#lmf-bar-target').inputValue(), displayedLoad)
      const barWeight = await bar.locator('#lmf-bar-weight').inputValue()
      assert.ok(Number(barWeight) > 0)
      await bar.locator('[data-lmf-bar-close="button"]').click()
      athleteResult.checks.push(`Bar Loader matches workout load (${displayedLoad} ${fixture.weightUnit}; bar ${barWeight})`)

      const reps = firstRow.locator('.reps-input')
      if (await reps.count()) await reps.fill('5')
      await firstRow.locator('[data-action="toggle-set"]').click()
      await page.waitForFunction(id => document.querySelector(`[data-set-id="${id}"] .set-check`)?.classList.contains('done') === true, setId, { timeout: 10000 })
      const afterLog = await snapshot(page)
      const logged = (afterLog.workoutSets || []).find(row => row.id === setId)
      assert.equal(logged?.athlete_id, athleteId)
      assert.equal(logged?.completed, true)
      assert.deepEqual(prescriptionMap(afterLog, sessionId), beforePrescription, `${fixture.key}: logging rewrote programmed prescription fields`)
      athleteResult.checks.push('Native set logging preserves prescription snapshot')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(applicationBootState, null, { timeout: 20000 }); await dismissInstall(page)
      await page.locator(`[data-set-id="${setId}"]`).waitFor({ state: 'attached', timeout: 12000 })
      const afterReload = await snapshot(page)
      const persisted = (afterReload.workoutSets || []).find(row => row.id === setId)
      assert.equal(persisted?.completed, true)
      assert.equal(persisted?.workout_session_id, sessionId)
      assert.deepEqual(prescriptionMap(afterReload, sessionId), beforePrescription, `${fixture.key}: reload/resume rewrote prescription`)
      athleteResult.checks.push('Refresh/reopen resumes exact saved set')

      const reviewIndex = await page.locator('#swipe-viewport > .swipe-page').count() - 1
      assert.ok(reviewIndex >= 0)
      await page.locator(`#session-track [data-session-index="${reviewIndex}"]`).click()
      await page.locator('[data-recap-review]').click()
      const recap = page.locator('.lmf-recap-dialog'); await recap.waitFor({ state: 'visible' })
      assert.match(await recap.innerText(), /Review & finish/i)
      page.once('dialog', dialog => dialog.accept())
      await page.locator('[data-recap-finish]').click()
      await waitForCompletedSession(page, sessionId)
      const afterFinish = await snapshot(page)
      const completed = (afterFinish.workoutSessions || []).find(row => row.id === sessionId)
      assert.equal(completed?.status, 'completed')
      const activeProgram = (afterFinish.programInstances || []).find(row => row.athlete_id === athleteId && row.status === 'active' && !row.deleted_at)
      assert.equal(activeProgram?.program_key, 'crownforge')
      assert.equal(Number(activeProgram?.current_week), 1)
      assert.equal(activeProgram?.current_day_key, 'day-2')
      assert.deepEqual(prescriptionMap(afterFinish, sessionId), beforePrescription, `${fixture.key}: workout completion rewrote prescription`)
      athleteResult.checks.push('Finish saves session and advances governed position exactly to W1D2')

      await page.goto(`${origin}/__qa/index.html?five-athlete-release-qa=1`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__LMF_FIVE_ATHLETE_QA__)
      assert.equal(await programDigest(page), canonicalBefore, `${fixture.key}: canonical program definition mutated during workout flow`)
      athleteResult.checks.push('Canonical Crownforge/Maintenance/Black Crown definitions unchanged')

      await openApp(page, 'progress')
      const nativeTools = page.locator('#lmf-pg-native-tools')
      await nativeTools.waitFor({ state: 'visible', timeout: 10000 })
      if (!(await nativeTools.evaluate(el => el.open))) {
        const summary = nativeTools.locator(':scope > summary'); await summary.focus(); await summary.press('Enter')
      }
      const history = page.locator(`.history-list [data-workout-recap="${sessionId}"]`)
      assert.equal(await history.count(), 1, `${fixture.key}: completed session missing from Progress/History`)
      await assertNoForeignFixtureText(page, fixture, 'Progress')
      athleteResult.checks.push('Completed session appears in Progress/History')

      await openApp(page, 'coach')
      const coach = await openCoachDetails(page)
      const coachText = await coach.innerText()
      assert.ok(coachText.includes(fixture.displayName), `${fixture.key}: Coach missing active athlete name`)
      assert.ok(coachText.includes(fixture.profile.primaryGoal), `${fixture.key}: Coach missing active athlete primary goal`)
      await assertNoForeignFixtureText(page, fixture, 'Coach')
      athleteResult.checks.push('Coach uses only active athlete profile/history context')

      await openApp(page, 'profile')
      const goal = page.locator('[data-profile-key="primaryGoal"]'); await goal.waitFor({ state: 'visible', timeout: 10000 })
      assert.equal(await goal.inputValue(), fixture.profile.primaryGoal)
      assert.equal(await page.locator('[data-profile-key="coachingNotes"]').inputValue(), fixture.profile.coachingNotes)
      await assertNoForeignFixtureText(page, fixture, 'Profile')
      athleteResult.checks.push('Profile preserves own private fields after workout completion')

      const finalData = await snapshot(page)
      assert.equal((finalData.athletes || []).filter(row => !row.deleted_at).length, 1, `${fixture.key}: local vault contains another athlete`)
      for (const store of ['athletePreferences','programInstances','programEvents','trainingMaxHistory','readinessEntries','workoutSessions','workoutExercises','workoutSets']) {
        const foreign = (finalData[store] || []).filter(row => row?.athlete_id && row.athlete_id !== athleteId && !row.deleted_at)
        assert.equal(foreign.length, 0, `${fixture.key}: ${store} contains foreign athlete data`)
      }
      for (const op of finalData.syncOutbox || []) {
        const owner = op.athleteId ?? op.athlete_id
        if (owner) assert.equal(owner, athleteId, `${fixture.key}: outbox operation belongs to another athlete`)
      }
      athleteResult.checks.push('All private DB rows/outbox ownership remain athlete-scoped')
      assert.deepEqual(athleteResult.errors, [], `${fixture.key}: browser page errors`)
      await page.screenshot({ path: path.join(out, `${fixture.key}-profile-final.png`), fullPage: true })
      live.push({ context, page, fixture, athleteId, sessionId })
      context = null
    } catch (error) {
      athleteResult.errors.push(error.stack || String(error))
      report.failures.push({ athlete: fixture.key, error: error.stack || String(error) })
      if (page) await page.screenshot({ path: path.join(out, `${fixture.key}-failure.png`), fullPage: true }).catch(() => {})
    } finally {
      if (context) await context.close().catch(() => {})
      report.athletes.push(athleteResult)
      fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    }
  }

  for (const row of live) {
    await openApp(row.page, 'coach')
    const coach = await openCoachDetails(row.page)
    const text = await coach.innerText()
    assert.ok(text.includes(row.fixture.displayName), `${row.fixture.key}: active identity lost during cross-athlete recheck`)
    for (const other of FIVE_ATHLETE_FIXTURES.filter(f => f.key !== row.fixture.key)) assert.equal(text.includes(other.displayName), false, `${row.fixture.key}: recheck leaked ${other.displayName}`)
    const data = await snapshot(row.page)
    assert.equal((data.athletes || []).filter(x => !x.deleted_at).length, 1)
    assert.equal((data.workoutSessions || []).filter(x => x.athlete_id === row.athleteId && x.id === row.sessionId && x.status === 'completed').length, 1)
    report.crossAthleteRecheck.push({ athlete: row.fixture.displayName, result: 'PASS', completedSession: row.sessionId })
  }

  assert.equal(live.length, FIVE_ATHLETE_FIXTURES.length, `Only ${live.length}/5 athletes completed the full UI flow`)
  assert.equal(treeHash(path.join(app, 'src')), sourceHashBefore, 'QA run changed reconstructed source files')
  assert.equal(treeHash(path.join(app, 'dist')), distHashBefore, 'QA run changed production dist files')
  const shipped = fs.readdirSync(path.join(app, 'dist'), { recursive: true }).filter(name => typeof name === 'string' && /\.(?:html|js|mjs|css|json)$/i.test(name)).map(name => { const file = path.join(app, 'dist', name); return fs.statSync(file).isFile() ? fs.readFileSync(file, 'utf8') : '' }).join('\n')
  for (const fixture of FIVE_ATHLETE_FIXTURES) {
    assert.equal(shipped.includes(fixture.displayName), false, `${fixture.displayName} leaked into production dist`)
    assert.equal(shipped.includes(fixture.profile.coachingNotes), false, `${fixture.key} QA marker leaked into production dist`)
  }
  assert.equal(report.failures.length, 0)
  report.result = 'PASS'
} catch (error) {
  report.result = 'FAIL'
  report.failures.push({ gate: 'aggregate', error: error.stack || String(error) })
  process.exitCode = 1
} finally {
  report.sourceHashAfter = treeHash(path.join(app, 'src'))
  report.distHashAfter = treeHash(path.join(app, 'dist'))
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  for (const row of live) await row.context.close().catch(() => {})
  await browser.close().catch(() => {})
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(runtime, { recursive: true, force: true })
}
console.log(JSON.stringify(report, null, 2))
if (report.result === 'PASS') console.log('LetMeFly five-athlete behavioral + isolation + mutation release gate: PASS')
