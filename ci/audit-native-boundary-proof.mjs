#!/usr/bin/env node
// #57-59 proof using an explicitly pinned application and native IndexedDB only.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const out = path.join(app, 'NATIVE_BOUNDARY_PROOF')
fs.mkdirSync(out, { recursive: true })
const provenance = JSON.parse(fs.readFileSync(path.join(app, 'qa-runtime/provenance.json')))
const expectedSha = process.env.QA_EXPECTED_APPLICATION_SHA
if (!/^[0-9a-f]{40}$/.test(expectedSha || '') || provenance.productionSha !== expectedSha) throw new Error('Explicit exact application SHA and matching test kit required')
function verifyHashes() {
  for (const [file, hash] of Object.entries({ ...provenance.sourceHashes, ...(provenance.distHashes || {}) })) {
    if (crypto.createHash('sha256').update(fs.readFileSync(path.join(app, file))).digest('hex') !== hash) throw new Error(`Source/dist mismatch: ${file}`)
  }
}
verifyHashes()
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const catalog = JSON.parse(fs.readFileSync(path.join(app, 'dist/data/exercise-intelligence-v1.json')))
const rule = catalog.substitutionRules.find(r => r.id === 'VS-001')
if (!rule?.alternativeInCurrentApp || /^DO NOT/.test(rule.promotionStatus) || !/^YES/i.test(rule.rolePreserved)) throw new Error('Governed Hip Thrust fixture required')
const report = { result: 'RUNNING', testedApplicationCommit: provenance.productionSha, baselineProductionCommit: provenance.baselineProductionSha || null, candidateOnly: Boolean(provenance.candidateOnly), passes: [], failures: [], externalRequests: [] }
const save = () => fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n')
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname
  res.setHeader('Cache-Control', 'no-store')
  if (pathname === '/services.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(app, 'qa-runtime/services.js'))); return }
  if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Disposable boundary proof</title><script type="module" src="/services.js"></script>'); return }
  res.statusCode = 404; res.end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
async function visit(page) { await page.goto(`${origin}/?disposable-qa=1`); await page.waitForFunction(() => window.__LMF_LIFECYCLE_QA__); }
async function run(name, fn) {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    report.externalRequests.push(route.request().url()); return route.abort()
  })
  const page = await context.newPage()
  try {
    await visit(page)
    const fixture = await page.evaluate(async () => {
      const q = window.__LMF_LIFECYCLE_QA__
      if ((await q.db.getAll('athletes')).length) throw new Error('Fresh disposable database required')
      const a = await q.athlete.createLocalAthlete({ displayName: 'QA boundary proof', weightUnit: 'lb' })
      const p = await q.athlete.getCurrentProgramInstance(a.id)
      const r = await q.readiness.saveReadiness(a.id, { sleepQuality: 4, soreness: 2, stress: 2, energy: 4, sleepHours: 8 })
      return { athleteId: a.id, instanceId: p.id, readinessId: r.id }
    })
    const detail = await fn(page, context, fixture)
    report.passes.push({ name, detail }); console.log('PASS ' + name)
  } catch (e) { report.failures.push({ name, error: e.stack || String(e) }); console.log('FAIL ' + name + ': ' + e.message) }
  finally { await context.close(); save() }
}
async function start(page, fixture) {
  return page.evaluate(async f => {
    const q = window.__LMF_LIFECYCLE_QA__
    const day = q.programs.CROWNFORGE.weekData.find(w => w.week === 1).days.find(d => d.day === 1)
    const b = await q.workout.startWorkout(f.athleteId, f.instanceId, 'crownforge', 1, day, f.readinessId)
    return b.session.id
  }, fixture)
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const q = window.__LMF_LIFECYCLE_QA__
    const names = ['workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox']
    const data = {}
    for (const name of names) data[name] = (await q.db.getAll(name)).sort((a,b) => String(a.id || a.operationId).localeCompare(String(b.id || b.operationId)))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)))
    return { hash: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''), counts: Object.fromEntries(names.map(n => [n, data[n].length])) }
  })
}
async function mutation(page, args) {
  return page.evaluate(async ({ fixture, rule, undo, abortStore, ordinal }) => {
    const q = window.__LMF_LIFECYCLE_QA__
    const b = await q.workout.findWorkoutForDay(fixture.athleteId, 'crownforge', 1, 1)
    const item = b.exercises.find(e => (e.record.prescription_snapshot.prescribedExerciseKey || e.record.exercise_key) === 'hip-thrust')
    if (!item || item.sets.length !== 3) throw new Error('Expected real three-set Hip Thrust slot')
    const input = { alternativeExerciseKey: rule.alternativeExerciseId, alternativeExerciseName: rule.alternativeExercise, ruleId: rule.id, loadingAdjustment: rule.loadingAdjustment, loadMode: 'none', loadStrategy: 'no-load-transfer', reason: 'Equipment unavailable' }
    const invoke = () => undo ? q.workout.revertWorkoutExerciseSubstitution(fixture.athleteId, item.record.id) : q.workout.substituteWorkoutExercise(fixture.athleteId, item.record.id, input)
    const originalPut = IDBObjectStore.prototype.put, originalAdd = IDBObjectStore.prototype.add
    let hits = 0, aborted = false, rejected = false
    function wrap(original) {
      return function(...values) {
        const request = original.apply(this, values)
        if (this.name === abortStore && ++hits === ordinal) {
          request.addEventListener('success', () => { this.transaction.abort(); aborted = true }, { once: true })
        }
        return request
      }
    }
    if (abortStore) { IDBObjectStore.prototype.put = wrap(originalPut); IDBObjectStore.prototype.add = wrap(originalAdd) }
    try { await invoke() } catch (error) { rejected = true; if (!abortStore) throw error }
    finally { IDBObjectStore.prototype.put = originalPut; IDBObjectStore.prototype.add = originalAdd }
    if (abortStore && (!aborted || !rejected)) throw new Error('Native abort must actually fire and reject the service call')
    const updated = (await q.workout.findWorkoutForDay(fixture.athleteId, 'crownforge', 1, 1)).exercises.find(e => e.record.id === item.record.id)
    if (!abortStore && updated.record.exercise_key !== (undo ? 'hip-thrust' : rule.alternativeExerciseId)) throw new Error('Successful retry has wrong exercise identity')
    return { aborted, rejected, exerciseId: item.record.id }
  }, args)
}
try {
  for (let iteration = 1; iteration <= 3; iteration++) {
    await run(`cross-tab concurrent start ${iteration}`, async (page, context, fixture) => {
      const other = await context.newPage(); await visit(other)
      const ids = await Promise.all([start(page, fixture), start(other, fixture)])
      const state = await snapshot(page)
      if (ids[0] !== ids[1] || state.counts.workoutSessions !== 1 || state.counts.workoutExercises !== 16 || state.counts.workoutSets !== 48) throw new Error('Cross-tab start duplicated a governed workout: ' + JSON.stringify(state.counts))
      return state.counts
    })
    await run(`cross-tab concurrent advancement ${iteration}`, async (page, context, fixture) => {
      const id = await start(page, fixture)
      await page.evaluate(async ({ fixture, id }) => { await window.__LMF_LIFECYCLE_QA__.workout.completeWorkout(fixture.athleteId, id) }, { fixture, id })
      const other = await context.newPage(); await visit(other)
      const invoke = p => p.evaluate(f => window.__LMF_LIFECYCLE_QA__.progression.advanceProgramAfterWorkout(f.athleteId, 'crownforge', 1, 1), fixture)
      const settled = await Promise.allSettled([invoke(page), invoke(other)])
      const state = await page.evaluate(async f => {
        const q = window.__LMF_LIFECYCLE_QA__
        return { position: q.progression.positionFromProgramInstance(await q.athlete.getCurrentProgramInstance(f.athleteId)), events: (await q.db.getAll('programEvents')).filter(e => e.event_type === 'program-position-advanced').length }
      }, fixture)
      if (settled.filter(x => x.status === 'fulfilled').length !== 1 || state.events !== 1 || state.position.week !== 1 || state.position.day !== 2) throw new Error('Concurrent advancement did not fail stale request cleanly: ' + JSON.stringify(state))
      return state
    })
  }
  const boundaries = [['workoutExercises', 1], ['workoutSets', 1], ['workoutSets', 2], ['workoutSets', 3], ['syncOutbox', 1], ['syncOutbox', 2], ['syncOutbox', 3], ['syncOutbox', 4]]
  for (const undo of [false, true]) for (const [abortStore, ordinal] of boundaries) {
    await run(`${undo ? 'undo' : 'substitute'} abort ${abortStore} write ${ordinal}`, async (page, context, fixture) => {
      await start(page, fixture)
      if (undo) await mutation(page, { fixture, rule, undo: false })
      const before = await snapshot(page)
      await mutation(page, { fixture, rule, undo, abortStore, ordinal })
      await visit(page)
      const after = await snapshot(page)
      if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('Partial exercise/set/outbox change survived aborted transaction and reload')
      await mutation(page, { fixture, rule, undo })
      return { rolledBackAndReloaded: true, retrySucceeded: true }
    })
  }
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve))
  try { verifyHashes() } catch (error) { report.failures.push({ name: 'Production source/dist immutability', error: String(error) }) }
  report.result = report.failures.length || report.passes.length !== 22 ? 'FAIL' : 'PASS'
  save()
  fs.writeFileSync(path.join(out, 'audit.md'), ['# Native Database Boundary Proof', '', `Result: **${report.result}**`, `Tested application: ${report.testedApplicationCommit}`, '', 'Six independent-page concurrency probes plus sixteen native abort/reload/retry probes covering parent, each of three sets, and all four outbox writes for Substitute and Undo.', '', ...report.passes.map(x => `- PASS ${x.name}`), ...report.failures.map(x => `- FAIL ${x.name}: ${x.error}`), '', 'Disposable QA only. No production deployment, real athlete records, or cloud connections. The no-load input isolates transaction behavior; it does not prescribe a training load.'].join('\n'))
}
if (report.result !== 'PASS') process.exitCode = 1
