#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { applicationBootState } from './browser-boot-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.resolve(process.argv[2] || path.join(root, '.build-src/letmefly_app'))
const require = createRequire(path.join(app, 'package.json'))
const { chromium } = require('playwright-core')
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
const out = path.join(app, 'UNSKIP_DAY_AUDIT')
fs.mkdirSync(out, { recursive: true })
const report = { result: 'RUNNING', passes: [], failures: [], externalRequestsBlocked: 0 }

const qa = path.join(app, '.qa-unskip-day')
fs.mkdirSync(qa, { recursive: true })
const entry = path.join(app, '.qa-unskip-day-entry.ts')
fs.writeFileSync(entry, `import * as athlete from './src/services/athlete-service';import * as workout from './src/services/workout-service';import * as progression from './src/services/program-progression-service';import * as programs from './src/data/programs';\nif(location.hostname!=='127.0.0.1'||!location.search.includes('disposable-qa=1'))throw Error('QA only');(window as any).__UNSKIP_QA__={athlete,workout,progression,programs};`)
await build({ configFile: false, root: app, logLevel: 'warn', build: { outDir: qa, emptyOutDir: true, minify: false, lib: { entry, formats: ['es'], fileName: () => 'services.js' } } })
fs.writeFileSync(path.join(qa, 'index.html'), '<!doctype html><title>Disposable Unskip Day QA</title><script type="module" src="services.js"></script>')

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const isQa = url.pathname.startsWith('/__qa/')
  const base = isQa ? qa : path.join(app, 'dist')
  const relative = isQa ? url.pathname.slice(6) : url.pathname.slice(1)
  let file = path.resolve(base, decodeURIComponent(relative || 'index.html'))
  if (!file.startsWith(base + path.sep) && file !== path.join(base, 'index.html')) { res.writeHead(403); return res.end() }
  if (!fs.existsSync(file)) file = path.join(base, 'index.html')
  if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  res.writeHead(200, { 'Content-Type': ({ '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

const assert = (value, label) => { if (!value) throw new Error(label) }
const eq = (actual, expected, label) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: ${JSON.stringify({ expected, actual }).slice(0, 900)}`) }
let context, page, profile

async function launch() {
  context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_BIN, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true, viewport: { width: 412, height: 915 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    report.externalRequestsBlocked++
    return route.abort('blockedbyclient')
  })
  page = context.pages()[0] || await context.newPage()
  page.setDefaultTimeout(18000)
}

async function readDb() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('letmefly-private'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    const names = ['athletes', 'programInstances', 'programEvents', 'workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox']
    try {
      const tx = db.transaction(names, 'readonly')
      const rows = await Promise.all(names.map(name => new Promise((resolve, reject) => { const req = tx.objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })))
      return Object.fromEntries(names.map((name, index) => [name, rows[index]]))
    } finally { db.close() }
  })
}

function activePosition(data) {
  return data.programInstances
    .filter(row => row.status === 'active' && !row.deleted_at)
    .map(row => [row.program_key, Number(row.current_week), row.current_day_key, row.current_phase_key])
}

async function prepareAthlete() {
  await page.goto(origin + '/__qa/index.html?disposable-qa=1')
  await page.waitForFunction(() => Boolean(window.__UNSKIP_QA__))
  return page.evaluate(async () => {
    const Q = window.__UNSKIP_QA__
    const athlete = await Q.athlete.createLocalAthlete({ displayName: 'Disposable Unskip Day QA', weightUnit: 'lb' })
    const instance = await Q.athlete.getCurrentProgramInstance(athlete.id)
    return { athleteId: athlete.id, instanceId: instance.id }
  })
}

async function currentFixture(athleteId) {
  return page.evaluate(async athleteId => {
    const Q = window.__UNSKIP_QA__
    const instance = await Q.athlete.getCurrentProgramInstance(athleteId)
    return { athleteId, instanceId: instance?.id ?? null, program: instance?.program_key ?? null, week: Number(instance?.current_week ?? 0), day: Number(String(instance?.current_day_key ?? '').replace('day-', '')) }
  }, athleteId)
}

async function setLast(athleteId, program) {
  return page.evaluate(async ({ athleteId, program }) => {
    const Q = window.__UNSKIP_QA__
    const defs = { crownforge: Q.programs.CROWNFORGE, 'crown-maintenance': Q.programs.CROWN_MAINTENANCE, 'black-crown': Q.programs.BLACK_CROWN }
    const week = defs[program].weekData.at(-1)
    const day = week.days.at(-1)
    await Q.progression.setIntentionalProgramPosition(athleteId, program, week.week, day.day, 'disposable-unskip-boundary')
    return { week: week.week, day: day.day }
  }, { athleteId, program })
}

async function skipCurrent(athleteId) {
  return page.evaluate(async athleteId => {
    const Q = window.__UNSKIP_QA__
    const instance = await Q.athlete.getCurrentProgramInstance(athleteId)
    const week = Number(instance.current_week)
    const day = Number(String(instance.current_day_key).replace('day-', ''))
    return Q.progression.skipCurrentProgramDay(athleteId, instance.program_key, week, day)
  }, athleteId)
}

async function unskip(athleteId) {
  return page.evaluate(async athleteId => window.__UNSKIP_QA__.progression.unskipLastProgramDay(athleteId), athleteId)
}

async function advanceCurrent(athleteId) {
  return page.evaluate(async athleteId => {
    const Q = window.__UNSKIP_QA__
    const instance = await Q.athlete.getCurrentProgramInstance(athleteId)
    const week = Number(instance.current_week)
    const day = Number(String(instance.current_day_key).replace('day-', ''))
    return Q.progression.advanceProgramAfterWorkout(athleteId, instance.program_key, week, day)
  }, athleteId)
}

async function activateBlackCrown(athleteId) {
  return page.evaluate(async athleteId => {
    const Q = window.__UNSKIP_QA__
    const lifts = Object.fromEntries(['front-squat', 'back-squat', 'bench-press', 'deadlift'].map(key => [key, { verified1RmLb: 200, readiness: 'green' }]))
    return Q.progression.activateBlackCrownFromEntry(athleteId, { lifts, optionalOHP: { verified1RmLb: 100, readiness: 'green' } })
  }, athleteId)
}

async function expectRejected(fn, pattern, label) {
  let result
  try { await fn(); result = { rejected: false, message: '' } }
  catch (error) { result = { rejected: true, message: String(error?.message || error) } }
  assert(result.rejected && pattern.test(result.message), `${label}: ${result.message || 'did not reject'}`)
}

async function test(label, fn) {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-unskip-day-'))
  try {
    await launch()
    await fn()
    report.passes.push(label)
    console.log('PASS ' + label)
  } catch (error) {
    report.failures.push({ label, message: error.message })
    console.error('FAIL ' + label + ' ' + error.message)
    await page?.screenshot({ path: path.join(out, label.replace(/[^a-z0-9]+/gi, '-') + '.png'), fullPage: true }).catch(() => {})
  } finally {
    await context?.close().catch(() => {})
    fs.rmSync(profile, { recursive: true, force: true })
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  }
}

try {
  await test('Service unskip restores the immediately previous governed day', async () => {
    const { athleteId } = await prepareAthlete()
    await skipCurrent(athleteId)
    await unskip(athleteId)
    const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-1']], 'Restored governed position')
    eq(after.workoutSessions.length, 0, 'Unskip creates no workout history')
    eq(after.workoutSets.length, 0, 'Unskip creates no workout sets')
    const skip = after.programEvents.find(event => event.event_type === 'program-day-skipped')
    const undo = after.programEvents.find(event => event.event_type === 'program-day-unskipped')
    assert(Boolean(skip && undo), 'Skip and unskip audit events must both remain')
    eq(undo.event_payload?.reversed_skip_event_id, skip.id, 'Unskip references exact skip event')
    assert(undo.event_payload?.counts_as_completed_workout === false, 'Unskip does not count as completion')
    assert(undo.event_payload?.counts_as_progression_evidence === false, 'Unskip does not count as progression evidence')
  })

  await test('Real Train Undo Last Skip button restores the day', async () => {
    const { athleteId } = await prepareAthlete()
    await page.goto(origin + '/#/train')
    await page.waitForFunction(applicationBootState, null, { timeout: 22000 })
    const skipButton = page.locator('[data-action="skip-current-day"]')
    await skipButton.waitFor({ state: 'visible' })
    page.once('dialog', dialog => dialog.accept())
    await skipButton.click()
    await page.waitForTimeout(250)
    let data = await readDb()
    eq(activePosition(data).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-2']], 'UI skip reached Day 2')
    const undoButton = page.locator('[data-action="unskip-last-day"]')
    await undoButton.waitFor({ state: 'visible' })
    page.once('dialog', dialog => dialog.accept())
    await undoButton.click()
    await page.waitForTimeout(250)
    data = await readDb()
    eq(activePosition(data).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-1']], 'UI unskip restored Day 1')
    eq(data.workoutSessions.length, 0, 'UI unskip creates no workout history')
    assert(data.programEvents.some(event => event.event_type === 'program-day-unskipped'), 'UI unskip event exists')
    assert(Boolean(athleteId), 'Disposable athlete remains isolated')
  })

  await test('Unskip is blocked after the following workout starts', async () => {
    const { athleteId } = await prepareAthlete()
    await skipCurrent(athleteId)
    const fixture = await currentFixture(athleteId)
    await page.evaluate(async fixture => {
      const Q = window.__UNSKIP_QA__
      const day = Q.programs.CROWNFORGE.weekData.find(w => w.week === fixture.week).days.find(d => d.day === fixture.day)
      await Q.workout.startWorkout(fixture.athleteId, fixture.instanceId, fixture.program, fixture.week, day, null)
    }, fixture)
    await expectRejected(() => unskip(athleteId), /workout history/i, 'Started workout must block Unskip')
    const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-2']], 'Blocked unskip preserves Day 2')
    eq(after.programEvents.filter(event => event.event_type === 'program-day-unskipped').length, 0, 'Blocked unskip creates no undo event')
  })

  await test('Pending completed workout blocks Unskip and preserves recovery', async () => {
    const { athleteId } = await prepareAthlete()
    await skipCurrent(athleteId)
    const fixture = await currentFixture(athleteId)
    await page.evaluate(async fixture => {
      const Q = window.__UNSKIP_QA__
      const day = Q.programs.CROWNFORGE.weekData.find(w => w.week === fixture.week).days.find(d => d.day === fixture.day)
      const bundle = await Q.workout.startWorkout(fixture.athleteId, fixture.instanceId, fixture.program, fixture.week, day, null)
      await Q.workout.completeWorkout(fixture.athleteId, bundle.session.id)
    }, fixture)
    await expectRejected(() => unskip(athleteId), /recovery|workout history/i, 'Pending completion must block Unskip')
    const after = await readDb()
    const active = after.programInstances.find(row => row.status === 'active' && !row.deleted_at)
    assert(Boolean(active?.progression_state?.pendingWorkoutCompletion), 'Pending completion marker remains intact')
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-2']], 'Pending completion preserves Day 2')
  })

  await test('Later program movement blocks Unskip', async () => {
    const { athleteId } = await prepareAthlete()
    await skipCurrent(athleteId)
    await page.evaluate(async athleteId => window.__UNSKIP_QA__.progression.setIntentionalProgramPosition(athleteId, 'crownforge', 1, 3, 'qa-later-movement'), athleteId)
    await expectRejected(() => unskip(athleteId), /activity happened afterward|immediately following/i, 'Later progression must block Unskip')
    const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-3']], 'Later position remains authoritative')
  })

  await test('Terminal Crownforge skip can roll back fresh Maintenance handoff', async () => {
    const { athleteId } = await prepareAthlete()
    const terminal = await setLast(athleteId, 'crownforge')
    await skipCurrent(athleteId)
    let mid = await readDb()
    eq(activePosition(mid).map(row => row.slice(0, 3)), [['crown-maintenance', 1, 'day-1']], 'Maintenance handoff created')
    await unskip(athleteId)
    const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', terminal.week, `day-${terminal.day}`]], 'Crownforge final day restored')
    const maintenance = after.programInstances.find(row => row.program_key === 'crown-maintenance')
    assert(Boolean(maintenance?.deleted_at), 'Fresh Maintenance handoff is soft-retired, not erased')
    eq(after.workoutSessions.length, 0, 'Boundary rollback creates no workout history')
  })

  await test('Terminal Maintenance skip can close an unused Black Crown gate', async () => {
    const { athleteId } = await prepareAthlete()
    await setLast(athleteId, 'crownforge')
    await advanceCurrent(athleteId)
    const terminal = await setLast(athleteId, 'crown-maintenance')
    await skipCurrent(athleteId)
    let mid = await readDb()
    assert(mid.programInstances.find(row => row.status === 'active' && !row.deleted_at)?.current_phase_key === 'black-crown-entry', 'Entry gate opened')
    await unskip(athleteId)
    const after = await readDb()
    const active = after.programInstances.find(row => row.status === 'active' && !row.deleted_at)
    eq([active.program_key, Number(active.current_week), active.current_day_key, active.current_phase_key], ['crown-maintenance', terminal.week, `day-${terminal.day}`, 'maintenance'], 'Maintenance final day restored')
    assert(active.progression_state?.blackCrownEntryStatus === 'not-ready', 'Entry gate state reset safely')
  })

  await test('Terminal Black Crown skip can reopen its final day', async () => {
    const { athleteId } = await prepareAthlete()
    await setLast(athleteId, 'crownforge')
    await advanceCurrent(athleteId)
    await setLast(athleteId, 'crown-maintenance')
    await advanceCurrent(athleteId)
    await activateBlackCrown(athleteId)
    const terminal = await setLast(athleteId, 'black-crown')
    await skipCurrent(athleteId)
    let mid = await readDb()
    eq(activePosition(mid), [], 'Black Crown terminal skip has no invented next program')
    await unskip(athleteId)
    const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['black-crown', terminal.week, `day-${terminal.day}`]], 'Black Crown final day restored')
    const active = after.programInstances.find(row => row.status === 'active' && !row.deleted_at)
    assert(active.current_phase_key !== 'complete' && !active.completed_on, 'Black Crown completion state was reversed')
  })

  await test('A completed Unskip cannot be applied twice', async () => {
    const { athleteId } = await prepareAthlete()
    await skipCurrent(athleteId)
    await unskip(athleteId)
    await expectRejected(() => unskip(athleteId), /no recent Skip Day|activity happened afterward/i, 'Double Unskip must reject')
    const after = await readDb()
    eq(after.programEvents.filter(event => event.event_type === 'program-day-unskipped').length, 1, 'Exactly one Unskip event remains')
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-1']], 'Double Unskip cannot move position')
  })

  report.result = report.failures.length ? 'FAIL' : 'PASS'
} finally {
  server.close()
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
if (report.failures.length) process.exit(1)
console.log(`LetMeFly Unskip Day browser/runtime audit: PASS (${report.passes.length} scenarios)`)
