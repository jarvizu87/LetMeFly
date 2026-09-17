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
const out = path.join(app, 'SKIP_DAY_AUDIT')
fs.mkdirSync(out, { recursive: true })
const report = { result: 'RUNNING', passes: [], failures: [], observations: {}, externalRequestsBlocked: 0 }

const qa = path.join(app, '.qa-skip-day')
fs.mkdirSync(qa, { recursive: true })
const entry = path.join(app, '.qa-skip-day-entry.ts')
fs.writeFileSync(entry, `import * as athlete from './src/services/athlete-service';import * as workout from './src/services/workout-service';import * as progression from './src/services/program-progression-service';import * as db from './src/db/local-db';import * as programs from './src/data/programs';\nif(location.hostname!=='127.0.0.1'||!location.search.includes('disposable-qa=1'))throw Error('QA only');(window as any).__SKIP_QA__={athlete,workout,progression,db,programs};`)
await build({ configFile: false, root: app, logLevel: 'warn', build: { outDir: qa, emptyOutDir: true, minify: false, lib: { entry, formats: ['es'], fileName: () => 'services.js' } } })
fs.writeFileSync(path.join(qa, 'index.html'), '<!doctype html><title>Disposable Skip Day QA</title><script type="module" src="services.js"></script>')

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
const eq = (actual, expected, label) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: ${JSON.stringify({ expected, actual }).slice(0, 800)}`) }
let context, page, profile

async function launch() {
  context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_BIN, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true, viewport: { width: 412, height: 915 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    report.externalRequestsBlocked++
    return route.abort('blockedbyclient')
  })
  page = context.pages()[0] || await context.newPage()
  page.setDefaultTimeout(15000)
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
  const active = data.programInstances.filter(row => row.status === 'active' && !row.deleted_at)
  return active.map(row => [row.program_key, Number(row.current_week), row.current_day_key, row.current_phase_key])
}

async function prepareAthlete() {
  await page.goto(origin + '/__qa/index.html?disposable-qa=1')
  await page.waitForFunction(() => Boolean(window.__SKIP_QA__))
  return page.evaluate(async () => {
    const Q = window.__SKIP_QA__
    const athlete = await Q.athlete.createLocalAthlete({ displayName: 'Disposable Skip Day QA', weightUnit: 'lb' })
    const instance = await Q.athlete.getCurrentProgramInstance(athlete.id)
    return { athleteId: athlete.id, instanceId: instance.id }
  })
}

async function currentFixture() {
  return page.evaluate(async () => {
    const Q = window.__SKIP_QA__
    const athlete = (await Q.db.getAllFromIndex('athletes', 'by-updated-at'))[0]
    const instance = await Q.athlete.getCurrentProgramInstance(athlete.id)
    return { athleteId: athlete.id, instanceId: instance.id, program: instance.program_key, week: Number(instance.current_week), day: Number(String(instance.current_day_key).replace('day-', '')) }
  })
}

async function setLast(program) {
  return page.evaluate(async program => {
    const Q = window.__SKIP_QA__
    const athlete = (await Q.db.getAllFromIndex('athletes', 'by-updated-at'))[0]
    const defs = { crownforge: Q.programs.CROWNFORGE, 'crown-maintenance': Q.programs.CROWN_MAINTENANCE, 'black-crown': Q.programs.BLACK_CROWN }
    const week = defs[program].weekData.at(-1)
    const day = week.days.at(-1)
    await Q.progression.setIntentionalProgramPosition(athlete.id, program, week.week, day.day, 'disposable-skip-boundary')
    return { week: week.week, day: day.day }
  }, program)
}

async function skipService() {
  return page.evaluate(async () => {
    const Q = window.__SKIP_QA__
    const athlete = (await Q.db.getAllFromIndex('athletes', 'by-updated-at'))[0]
    const instance = await Q.athlete.getCurrentProgramInstance(athlete.id)
    const week = Number(instance.current_week)
    const day = Number(String(instance.current_day_key).replace('day-', ''))
    return Q.progression.skipCurrentProgramDay(athlete.id, instance.program_key, week, day)
  })
}

async function test(label, fn) {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-skip-day-'))
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
  await test('Service skip advances one governed day without workout history', async () => {
    await prepareAthlete()
    const before = await readDb()
    await skipService()
    const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-2']], 'Next governed position')
    eq(after.workoutSessions, before.workoutSessions, 'No workout session created')
    eq(after.workoutSets, before.workoutSets, 'No workout sets created')
    const events = after.programEvents.filter(event => event.event_type === 'program-day-skipped')
    eq(events.length, 1, 'Exactly one skip event')
    assert(events[0].event_payload?.counts_as_completed_workout === false, 'Skip event must explicitly not count as completion')
  })

  await test('Real Train Skip Day button advances current day', async () => {
    await prepareAthlete()
    await page.goto(origin + '/#/train')
    await page.waitForFunction(applicationBootState, null, { timeout: 20000 })
    const button = page.locator('[data-action="skip-current-day"]')
    await button.waitFor({ state: 'visible' })
    assert(await button.isEnabled(), 'Skip Day button should be enabled before a workout starts')
    page.once('dialog', dialog => dialog.accept())
    await button.click()
    await page.waitForFunction(() => document.body.textContent?.includes('Week 1') && document.body.textContent?.includes('Day 2'))
    const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-2']], 'UI skip next position')
    eq(after.programEvents.filter(event => event.event_type === 'program-day-skipped').length, 1, 'UI skip event count')
    eq(after.workoutSessions.length, 0, 'UI skip creates no workout history')
  })

  await test('Skip Day is blocked once a workout is in progress', async () => {
    await prepareAthlete()
    const fixture = await currentFixture()
    await page.evaluate(async fixture => {
      const Q = window.__SKIP_QA__
      const day = Q.programs.CROWNFORGE.weekData.find(w => w.week === fixture.week).days.find(d => d.day === fixture.day)
      await Q.workout.startWorkout(fixture.athleteId, fixture.instanceId, fixture.program, fixture.week, day, null)
    }, fixture)
    const before = await readDb()
    const result = await page.evaluate(async fixture => {
      try { await window.__SKIP_QA__.progression.skipCurrentProgramDay(fixture.athleteId, fixture.program, fixture.week, fixture.day); return { rejected: false } }
      catch (error) { return { rejected: true, message: String(error?.message || error) } }
    }, fixture)
    assert(result.rejected && /workout in progress/i.test(result.message), 'Active workout must block skip')
    const after = await readDb()
    eq(activePosition(after), activePosition(before), 'Blocked skip must not move position')
    eq(after.programEvents.filter(e => e.event_type === 'program-day-skipped').length, 0, 'Blocked skip must not create event')
  })

  await test('Pending completed workout blocks Skip Day and preserves recovery intent', async () => {
    await prepareAthlete()
    const fixture = await currentFixture()
    const sessionId = await page.evaluate(async fixture => {
      const Q = window.__SKIP_QA__
      const day = Q.programs.CROWNFORGE.weekData.find(w => w.week === fixture.week).days.find(d => d.day === fixture.day)
      const bundle = await Q.workout.startWorkout(fixture.athleteId, fixture.instanceId, fixture.program, fixture.week, day, null)
      await Q.workout.completeWorkout(fixture.athleteId, bundle.session.id)
      return bundle.session.id
    }, fixture)
    const result = await page.evaluate(async fixture => {
      try { await window.__SKIP_QA__.progression.skipCurrentProgramDay(fixture.athleteId, fixture.program, fixture.week, fixture.day); return { rejected: false } }
      catch (error) { return { rejected: true, message: String(error?.message || error) } }
    }, fixture)
    assert(result.rejected && /waiting to advance|recover/i.test(result.message), 'Pending completion must block skip')
    const after = await readDb()
    const active = after.programInstances.find(row => row.status === 'active')
    assert(Boolean(active.progression_state?.pendingWorkoutCompletion), 'Pending completion marker must remain')
    assert(after.workoutSessions.find(row => row.id === sessionId)?.status === 'completed', 'Completed workout remains completed')
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crownforge', 1, 'day-1']], 'Pending completion skip cannot move position')
  })

  await test('Skipping terminal Crownforge day preserves Maintenance handoff', async () => {
    await prepareAthlete(); await setLast('crownforge'); await skipService(); const after = await readDb()
    eq(activePosition(after).map(row => row.slice(0, 3)), [['crown-maintenance', 1, 'day-1']], 'Crownforge terminal handoff')
    assert(after.programEvents.some(e => e.event_type === 'program-day-skipped'), 'Terminal Crownforge skip event exists')
    assert(after.programEvents.some(e => e.event_type === 'crownforge-complete-maintenance-start' && e.event_payload?.terminal_day_skipped === true), 'Maintenance handoff is explicitly tagged')
    eq(after.workoutSessions.length, 0, 'Terminal Crownforge skip creates no workout')
  })

  await test('Skipping terminal Maintenance day opens Black Crown entry gate', async () => {
    await prepareAthlete(); await setLast('crownforge')
    await page.evaluate(async () => { const Q = window.__SKIP_QA__, a = (await Q.db.getAllFromIndex('athletes', 'by-updated-at'))[0], i = await Q.athlete.getCurrentProgramInstance(a.id); const w=Number(i.current_week), d=Number(String(i.current_day_key).replace('day-','')); await Q.progression.skipCurrentProgramDay(a.id,'crownforge',w,d) })
    await setLast('crown-maintenance'); await skipService(); const after = await readDb()
    const active = after.programInstances.find(row => row.status === 'active')
    assert(active?.program_key === 'crown-maintenance' && active.current_phase_key === 'black-crown-entry', 'Maintenance terminal skip opens entry gate')
    assert(after.programEvents.some(e => e.event_type === 'black-crown-entry-gate-opened' && e.event_payload?.terminal_day_skipped === true), 'Entry gate event tagged as terminal skip')
  })

  await test('Skipping terminal Black Crown day completes without inventing a program', async () => {
    await prepareAthlete(); await setLast('crownforge')
    await page.evaluate(async () => { const Q=window.__SKIP_QA__,a=(await Q.db.getAllFromIndex('athletes','by-updated-at'))[0],i=await Q.athlete.getCurrentProgramInstance(a.id);await Q.progression.skipCurrentProgramDay(a.id,'crownforge',Number(i.current_week),Number(String(i.current_day_key).replace('day-',''))) })
    await setLast('crown-maintenance'); await skipService()
    await page.evaluate(async () => {
      const Q=window.__SKIP_QA__,a=(await Q.db.getAllFromIndex('athletes','by-updated-at'))[0]
      const lifts=Object.fromEntries(['front-squat','back-squat','bench-press','deadlift'].map(key=>[key,{verified1RmLb:200,readiness:'green'}]))
      await Q.progression.activateBlackCrownFromEntry(a.id,{lifts,optionalOHP:{verified1RmLb:100,readiness:'green'}})
    })
    await setLast('black-crown'); await skipService(); const after = await readDb()
    eq(activePosition(after), [], 'No invented next program')
    assert(after.programEvents.some(e => e.event_type === 'black-crown-program-complete' && e.event_payload?.terminal_day_skipped === true), 'Black Crown terminal completion tagged as skip')
    eq(after.workoutSessions.length, 0, 'Black Crown terminal skip creates no workout history')
  })

  report.result = report.failures.length ? 'FAIL' : 'PASS'
} finally {
  server.close()
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
if (report.failures.length) process.exit(1)
console.log(`LetMeFly Skip Day browser/runtime audit: PASS (${report.passes.length} scenarios)`)
