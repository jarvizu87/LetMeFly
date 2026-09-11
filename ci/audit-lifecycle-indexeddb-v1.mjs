#!/usr/bin/env node
// Issue #53: real production services + native Chromium IndexedDB; not a UI-click soak.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const mode = process.argv[3] || 'perfect'
if (!['perfect', 'realistic', 'reload', 'metrics', 'boundaries', 'faults'].includes(mode)) throw new Error(`Unknown QA mode: ${mode}`)
const out = path.resolve(process.env.LMF_QA_OUTPUT || path.join(app, `LIFECYCLE_DATABASE_${mode}`))
fs.mkdirSync(out, { recursive: true })
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const sha = process.env.PRODUCTION_SHA || JSON.parse(fs.readFileSync(path.join(app, 'qa-runtime/provenance.json'))).productionSha
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Exact production SHA required')
const digest = s => crypto.createHash('sha256').update(s).digest('hex')
function hashes(dir) {
  const result = {}
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) Object.assign(result, hashes(p))
    else result[path.relative(app, p)] = digest(fs.readFileSync(p))
  }
  return result
}
const sourceBefore = hashes(path.join(app, 'src')), distBefore = hashes(path.join(app, 'dist'))
const report = { result: 'RUNNING', productionSha: sha, mode, scope: 'Native Chromium IndexedDB + real production services; not a full UI-click lifecycle', counts: { positions: 0, sets: 0, exercises: 0, restPositions: 0, metricSets: 0, percentageSets: 0, groupedExercises: 0, performanceEdits: 0, reloads: 0, substitutionUses: 0, historyLookups: 0, resetChecks: 0 }, checkpoints: [], passes: [], failures: [], externalRequestsBlocked: [], sourceHashes: sourceBefore }
const writeReport = () => fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n')
const pass = (label, detail) => { report.passes.push({ label, detail }); console.log(`PASS ${label}${detail ? `: ${JSON.stringify(detail)}` : ''}`); writeReport() }
const fail = (label, error) => { report.failures.push({ label, detail: error?.stack || String(error) }); console.log(`FAIL ${label}: ${error?.message || error}`); writeReport() }

// A disposable bridge outside production dist. Production sources are never patched.
const runtime = fs.mkdtempSync(path.join(app, '.qa-native-db-'))
const entry = path.join(runtime, 'entry.ts')
const imports = { athlete: 'services/athlete-service', workout: 'services/workout-service', progression: 'services/program-progression-service', readiness: 'services/readiness-service', db: 'db/local-db', mutations: 'db/local-mutations', programs: 'data/programs' }
fs.writeFileSync(entry, Object.entries(imports).map(([name, file]) => `import * as ${name} from ${JSON.stringify(path.join(app, 'src', file))}`).join('\n') + `\nif(location.hostname !== '127.0.0.1' || new URLSearchParams(location.search).get('disposable-qa') !== '1') throw new Error('Disposable loopback QA only');\n(window as any).__LMF_LIFECYCLE_QA__ = Object.freeze({${Object.keys(imports).join(',')}});\n`)
const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href)
await build({ configFile: false, root: app, publicDir: false, logLevel: 'warn', build: { outDir: path.join(runtime, 'web'), emptyOutDir: true, minify: false, lib: { entry, formats: ['es'], fileName: () => 'services.js' } } })
const serviceJs = fs.readFileSync(path.join(runtime, 'web/services.js'))
const catalog = JSON.parse(fs.readFileSync(path.join(app, 'dist/data/exercise-intelligence-v1.json')))
report.qaBundleHash = digest(serviceJs)
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  res.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/services.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(serviceJs); return }
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Disposable native DB lifecycle test</title><script type="module" src="/services.js"></script>'); return }
  res.statusCode = 404; res.end('Not available in isolated QA')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
async function load(page) {
  await page.goto(`${origin}/?disposable-qa=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__LMF_LIFECYCLE_QA__)
}
async function makePage() {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 412, height: 915 } })
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    report.externalRequestsBlocked.push(route.request().url()); return route.abort('blockedbyclient')
  })
  const page = await context.newPage(); page.setDefaultTimeout(10000)
  page.on('pageerror', e => console.log(`PAGE ERROR ${e.message}`))
  await load(page); return { context, page }
}
async function call(page, op, args = {}) { return page.evaluate(actions, { op, args }) }

// Domain writes use real services. Fault injection calls native transaction.abort().
async function actions({ op, args }) {
  const q = window.__LMF_LIFECYCLE_QA__
  const assert = (ok, label, detail = '') => { if (!ok) throw new Error(`${label}${detail ? ': ' + detail : ''}`) }
  const same = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), label, JSON.stringify({ expected: b, actual: a }))
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(x => x.toString(16).padStart(2, '0')).join('')
  const definitions = [['crownforge', q.programs.CROWNFORGE], ['crown-maintenance', q.programs.CROWN_MAINTENANCE], ['black-crown', q.programs.BLACK_CROWN]]
  const activeRows = async store => (await q.db.getAll(store)).filter(x => !x.deleted_at)
  const athlete = async () => { const a = await q.athlete.getActiveAthlete(); assert(a && /^QA native lifecycle/.test(a.display_name), 'Only disposable QA athlete may be modified'); return a }
  const position = instance => q.progression.positionFromProgramInstance(instance)
  const ready = a => q.readiness.saveReadiness(a.id, { sleepQuality: 4, soreness: 2, stress: 2, energy: 4, sleepHours: 8, notes: 'Disposable automated QA' })
  const readBundle = async a => {
    const instance = await q.athlete.getCurrentProgramInstance(a.id), pos = position(instance)
    assert(pos, 'Active governed position exists')
    const day = definitions.find(([k]) => k === pos.program)[1].weekData.find(w => w.week === pos.week).days.find(d => d.day === pos.day)
    return { instance, pos, day }
  }
  const counts = async () => {
    const db = await q.db.openLetMeFlyDb()
    try {
      const names = ['athletes', 'programInstances', 'programEvents', 'workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox', 'readinessEntries']
      const tx = db.transaction(names, 'readonly')
      return Object.fromEntries(await Promise.all(names.map(async n => [n, await q.db.requestToPromise(tx.objectStore(n).count())])))
    } finally { db.close() }
  }
  const assessment = color => ({ lifts: Object.fromEntries([['front-squat', 240], ['back-squat', 300], ['bench-press', 220], ['deadlift', 360]].map(([key, verified1RmLb]) => [key, { verified1RmLb, readiness: color }])), optionalOHP: { verified1RmLb: 140, readiness: 'green' } })
  const expectReject = async (fn, text) => { try { await fn() } catch (e) { if (text) assert(text.test(e.message), 'Expected rejection reason', e.message); return e.message } throw new Error('Operation unexpectedly succeeded') }
  const metric = set => {
    if (set.distance) return { kind: 'distance', value: parseFloat(String(set.distance)) || 20, unit: /yd|yard/i.test(set.distance) ? 'yd' : 'm' }
    if (set.duration) return { kind: 'duration', value: parseFloat(String(set.duration)) || 30, unit: /min/i.test(set.duration) ? 'min' : 'sec' }
    const reps = String(set.reps ?? '')
    if (/\b(sec|seconds?|mins?|minutes?)\b/i.test(reps)) return { kind: 'duration', value: parseFloat(reps) || 30, unit: /min/i.test(reps) ? 'min' : 'sec' }
    if (/\d\s*(m|meters?|yd|yards?)\b/i.test(reps)) return { kind: 'distance', value: parseFloat(reps) || 20, unit: /yd|yard/i.test(reps) ? 'yd' : 'm' }
    return null
  }
  const setSignature = set => ({ reps: set.reps, load_value: set.load_value, load_unit: set.load_unit, rpe: set.rpe, rir: set.rir, completed: set.completed, performance_data: set.performance_data })
  const bundleSignature = bundle => ({ session: { id: bundle.session.id, status: bundle.session.status }, exercises: bundle.exercises.map(item => ({ record: item.record, sets: item.sets })) })
  if (op === 'inventory') return { positions: definitions.flatMap(([program, d]) => d.weekData.flatMap(w => w.days.map(day => ({ program, week: w.week, day: day.day, rest: !!day.restDay, exercises: day.sections.flatMap(s => s.exercises).length, sets: day.sections.flatMap(s => s.exercises).reduce((n, e) => n + e.sets.length, 0) })))), programHash: await hash(definitions), exports: Object.keys(q.workout) }
  if (op === 'bootstrap') {
    assert((await indexedDB.databases()).length === 0, 'Fresh isolated browser context')
    const a = await q.athlete.createLocalAthlete({ displayName: `QA native lifecycle ${args.mode}`, weightUnit: 'lb' })
    for (const [key, value] of [['front-squat', 215], ['back-squat', 270], ['bench-press', 200], ['deadlift', 325], ['overhead-press', 125], ['clean', 150]]) await q.athlete.setTrainingMax(a.id, key, value, 'lb')
    await expectReject(() => q.progression.setIntentionalProgramPosition(a.id, 'black-crown', 1, 1), /Cross-program/)
    await expectReject(() => q.progression.activateBlackCrownFromEntry(a.id, assessment('green')), /handoff/)
    return { athleteId: a.id, counts: await counts() }
  }
  if (op === 'begin') {
    const a = await athlete(), { instance, pos, day } = await readBundle(a)
    same(pos, args.position, 'Database position matches next authoritative program position')
    const r = await ready(a), b = await q.workout.startWorkout(a.id, instance.id, pos.program, pos.week, day, r.id)
    const second = await q.workout.startWorkout(a.id, instance.id, pos.program, pos.week, day, r.id)
    assert(second.session.id === b.session.id, 'Repeated start must resume same session')
    assert(b.session.program_instance_id === instance.id && b.session.readiness_id === r.id, 'Session links to real program/readiness')
    const exs = day.sections.flatMap(section => section.exercises.map(exercise => ({ section, exercise })))
    same(b.exercises.length, exs.length, 'No missing/extra workout exercises')
    for (const [i, item] of b.exercises.entries()) {
      const { section, exercise: e } = exs[i]
      same(item.record.exercise_key, e.id, 'Next occurrence resets to programmed identity')
      assert(!item.record.substituted_from_exercise_key, 'No sticky substitution')
      same(item.record.prescription_snapshot.sourceSets, e.sets, 'Original set prescriptions preserved')
      same(item.record.group_key, section.id, 'Workout grouping preserved')
      same(item.sets.length, e.sets.length, 'Every programmed set exists')
    }
    return { sessionId: b.session.id, digest: await hash(bundleSignature(b)), counts: await counts() }
  }
  if (op === 'snapshot') {
    const a = await athlete(), { pos } = await readBundle(a)
    const b = await q.workout.findWorkoutForDay(a.id, pos.program, pos.week, pos.day)
    return { digest: await hash(bundleSignature(b)), counts: await counts(), pos }
  }
  if (op === 'substitute') {
    const a = await athlete(), { pos } = await readBundle(a)
    let b = await q.workout.findWorkoutForDay(a.id, pos.program, pos.week, pos.day)
    const item = b.exercises.find(e => /^(Optional )?(Easy Walk|Walking)$/i.test(e.record.exercise_name_snapshot))
    if (!item) return null
    const r = args.catalog.substitutionRules.find(r => r.id === 'VS-005')
    assert(r?.alternativeInCurrentApp && !/^DO NOT/i.test(r.promotionStatus) && /^YES/i.test(r.rolePreserved), 'Governed VS-005 rule required')
    if (!args.apply) {
      assert(!item.record.substituted_from_exercise_key && item.record.exercise_key === item.record.prescription_snapshot.prescribedExerciseKey, 'Later programmed walk is not sticky')
      return { reset: true }
    }
    const previous = await q.workout.previousExercisePerformance(a.id, r.alternativeExerciseId, b.session.id)
    if (args.previousSessionId) assert(previous?.sessionId === args.previousSessionId && previous.exerciseName === 'Stationary Bike', 'History uses prior performed substitute, not original walk')
    await q.athlete.updateSubstitutionEquipmentProfile(a.id, r.alternativeExerciseId, ['Stationary bike'], 'available')
    const params = { alternativeExerciseKey: r.alternativeExerciseId, alternativeExerciseName: r.alternativeExercise, ruleId: r.id, loadingAdjustment: r.loadingAdjustment, loadMode: 'none', loadStrategy: 'no-load-transfer', reason: 'Equipment unavailable' }
    b = await q.workout.substituteWorkoutExercise(a.id, item.record.id, params)
    const after = b.exercises.find(e => e.record.id === item.record.id)
    same(after.record.prescription_snapshot.sourceSets, item.record.prescription_snapshot.sourceSets, 'Substitution retains dose')
    assert(after.record.substituted_from_exercise_key === item.record.exercise_key, 'Both exercise identities retained')
    if (args.undo) {
      const undo = await q.workout.revertWorkoutExerciseSubstitution(a.id, item.record.id)
      const restored = undo.exercises.find(e => e.record.id === item.record.id)
      same(restored.record.exercise_key, item.record.exercise_key, 'Undo original exercise')
      same(restored.sets.map(setSignature), item.sets.map(setSignature), 'Undo exact values and metadata')
      b = await q.workout.substituteWorkoutExercise(a.id, item.record.id, params)
    }
    return { sessionId: b.session.id, exerciseId: item.record.id, previous: !!previous }
  }
  if (op === 'log') {
    const a = await athlete(), { pos, day } = await readBundle(a)
    const b = await q.workout.findWorkoutForDay(a.id, pos.program, pos.week, pos.day)
    const source = day.sections.flatMap(s => s.exercises), tms = await q.athlete.getLatestTrainingMaxes(a.id)
    const stats = { sets: 0, metricSets: 0, percentageSets: 0, groupedExercises: 0, performanceEdits: 0 }
    const flat = b.exercises.flatMap((e, i) => e.sets.map((set, j) => ({ e, set, prescribed: source[i].sets[j] })))
    const split = Math.ceil(flat.length / 2)
    const selected = args.part === 'first' ? flat.slice(0, split) : args.part === 'second' ? flat.slice(split) : flat
    for (const { e, set, prescribed } of selected) {
      same(e.record.prescription_snapshot.sourceSets, source[b.exercises.indexOf(e)].sets, 'Logging retains immutable source prescription')
      if (typeof prescribed.percentage === 'number' && String(prescribed.loadReference || '').startsWith('black-crown:tm:') && prescribed.loadValue == null && !e.record.substituted_from_exercise_key) {
        stats.percentageSets++
        const key = prescribed.loadReference.slice('black-crown:tm:'.length).replace(/^power-clean$/, 'clean'), tm = tms[key]
        if (tm) {
          const raw = Number(tm.tm_value) * (prescribed.percentage > 1 ? prescribed.percentage / 100 : prescribed.percentage)
          const expected = (prescribed.rounding === 'nearest-5' ? Math.round(raw / 5) : prescribed.rounding === 'down-5' ? Math.floor(raw / 5) : Math.ceil(raw / 5)) * 5
          same(set.load_value, expected, 'Percentage load resolves from saved athlete TM')
        } else same(set.load_value, null, 'Missing TM never fabricates a load')
      }
      const m = metric(prescribed), edit = args.mode === 'realistic' && set.set_number === 1 && set.load_value != null
      const loadValue = set.load_value == null ? null : Number(set.load_value) + (edit ? 5 : 0)
      const reps = m ? null : (typeof prescribed.reps === 'number' ? prescribed.reps : parseFloat(String(prescribed.reps)) || 5)
      const values = { reps, loadValue, loadUnit: set.load_unit, rpe: 7.5, rir: 2, notes: edit ? 'QA intentional actual load variation' : 'QA service log', ...(m ? { metricKind: m.kind, metricValue: m.value + (args.mode === 'metrics' ? 1 : 0), metricUnit: m.unit } : {}) }
      await q.workout.logSet(a.id, set.id, values)
      const saved = await q.db.getById('workoutSets', set.id)
      assert(saved.completed && saved.completed_at, 'Native set completion is persisted')
      same(saved.load_value, loadValue, 'Actual working load persisted')
      if (m) { same(saved.performance_data.actualMetricValue, values.metricValue, 'Actual metric persisted'); stats.metricSets++ }
      else same(saved.reps, reps, 'Actual reps persisted')
      for (const key of ['programmedReps', 'duration', 'distance', 'percentage', 'programmedLoadValue']) same(saved.performance_data[key], set.performance_data[key], `Programmed ${key} preserved`)
      if (e.record.substituted_from_exercise_key && set.set_number === 1) {
        await q.workout.uncompleteSet(a.id, set.id)
        await expectReject(() => q.workout.revertWorkoutExerciseSubstitution(a.id, e.record.id), /cannot be relabeled|locked/)
        await q.workout.logSet(a.id, set.id, values)
        assert((await q.db.getById('workoutSets', set.id)).performance_data.substitutionPerformanceLoggedAt, 'History remains locked after correction')
      }
      stats.sets++; if (edit) stats.performanceEdits++
    }
    if (args.part !== 'second') stats.groupedExercises = b.exercises.filter(e => e.record.group_type === 'round').length
    return stats
  }
  if (op === 'finish') {
    const a = await athlete(), { pos } = await readBundle(a), b = await q.workout.findWorkoutForDay(a.id, pos.program, pos.week, pos.day)
    assert(b.exercises.every(e => e.sets.every(s => s.completed)), 'All planned QA performance persisted before completion')
    await q.workout.completeWorkout(a.id, b.session.id)
    same((await q.db.getById('workoutSessions', b.session.id)).status, 'completed', 'Workout completion persisted')
    const result = await q.progression.advanceProgramAfterWorkout(a.id, pos.program, pos.week, pos.day)
    if (result.action === 'entry-gate') {
      if (args.mode === 'boundaries') {
        same((await q.progression.activateBlackCrownFromEntry(a.id, assessment('red'))).action, 'blocked', 'Red entry blocks real activation')
        same((await q.athlete.getCurrentProgramInstance(a.id)).program_key, 'crown-maintenance', 'Red does not jump programs')
      }
      const activation = await q.progression.activateBlackCrownFromEntry(a.id, assessment(args.mode === 'boundaries' ? 'yellow' : 'green'))
      same(activation.action, 'black-crown-started', 'Governed Black Crown handoff')
      const factor = args.mode === 'boundaries' ? 0.875 : 0.9
      same(activation.approvedTms['back-squat'], Math.round(300 * factor / 5) * 5, 'Gate TM follows verified result and readiness')
    }
    return { action: result.action, pos: position(await q.athlete.getCurrentProgramInstance(a.id)), counts: await counts() }
  }
  if (op === 'integrity') {
    const a = await athlete()
    const sessions = await activeRows('workoutSessions'), exs = await activeRows('workoutExercises'), sets = await activeRows('workoutSets'), events = await activeRows('programEvents'), outbox = await q.db.getAll('syncOutbox')
    const sm = new Map(sessions.map(s => [s.id, s])), em = new Map(exs.map(e => [e.id, e]))
    assert(new Set(sessions.map(s => `${s.program_instance_id}:${s.week_number}:${s.day_key}`)).size === sessions.length, 'No duplicate session at a governed position')
    for (const e of exs) assert(sm.has(e.workout_session_id) && e.athlete_id === a.id, 'No orphan/cross-athlete exercise')
    for (const s of sets) {
      const e = em.get(s.workout_exercise_id)
      assert(e && e.workout_session_id === s.workout_session_id && sm.has(s.workout_session_id) && s.athlete_id === a.id, 'No orphan/cross-session set')
      if (e.substituted_from_exercise_key) assert(s.performance_data.substitutionPerformedExerciseKey === e.exercise_key, 'Substitute set identity matches parent exercise')
    }
    const latestOps = new Map()
    for (const row of outbox) { const k = `${row.entityType}:${row.entityId}`, old = latestOps.get(k); if (!old || old.localVersion < row.localVersion) latestOps.set(k, row) }
    for (const [store, rows] of [['workoutSessions', sessions], ['workoutExercises', exs], ['workoutSets', sets], ['programEvents', events]]) for (const row of rows) {
      const operation = latestOps.get(`${store}:${row.id}`)
      assert(operation && operation.localVersion === row._local.localVersion, 'Persisted mutation has matching outbox operation')
      same(operation.payload, q.mutations.stripLocalMetadata(row), 'Outbox payload matches persisted entity')
    }
    const eventKeys = events.filter(e => e.event_type === 'program-position-advanced').map(e => JSON.stringify(e.event_payload.from))
    assert(new Set(eventKeys).size === eventKeys.length, 'At most one advancement event per completed position')
    same((await q.workout.recentWorkoutSessions(a.id, sessions.length + 1)).length, sessions.length, 'History has every actual session')
    return { counts: await counts(), programHash: await hash(definitions), completedSessions: sessions.filter(s => s.status === 'completed').length, events: events.reduce((m, e) => ((m[e.event_type] = (m[e.event_type] || 0) + 1), m), {}), instances: (await activeRows('programInstances')).map(p => ({ program: p.program_key, status: p.status })) }
  }
  if (op === 'fault') {
    const a = await athlete(), { instance, pos, day } = await readBundle(a), r = await ready(a)
    const start = () => q.workout.startWorkout(a.id, instance.id, pos.program, pos.week, day, r.id)
    const arm = (storeName, trigger) => {
      const original = IDBObjectStore.prototype.put
      let hits = 0, aborted = 0
      IDBObjectStore.prototype.put = function(...values) {
        const req = original.apply(this, values)
        if (this.name === storeName && trigger(values[0], ++hits)) {
          IDBObjectStore.prototype.put = original
          req.addEventListener('success', () => { this.transaction.abort(); aborted++ }, { once: true })
        }
        return req
      }
      return () => { IDBObjectStore.prototype.put = original; return { hits, aborted } }
    }
    if (args.kind === 'concurrent-start') {
      const settled = await Promise.allSettled([start(), start()]), sessions = await activeRows('workoutSessions')
      assert(sessions.length === 1, 'Concurrent start requests must not create duplicate sessions', `${sessions.length} persisted sessions; ${settled.filter(x => x.status === 'fulfilled').length} fulfilled calls`)
      return await counts()
    }
    if (args.kind === 'start-abort') {
      const before = await counts(), disarm = arm('workoutSets', () => true)
      try { await expectReject(start) } finally { assert(disarm().aborted === 1, 'Abort actually injected') }
      const after = await counts()
      for (const k of ['workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox']) same(after[k], before[k], 'Aborted skeleton leaves no partial records/outbox')
      assert((await start()).exercises.length > 0, 'Retry creates a complete workout')
      return await counts()
    }
    const b = await start()
    if (args.kind === 'substitution-abort' || args.kind === 'undo-abort') {
      const rule = args.catalog.substitutionRules.find(r => r.id === 'VS-001'), item = b.exercises.find(e => /^Hip Thrust$/i.test(e.record.exercise_name_snapshot))
      assert(item && rule?.alternativeInCurrentApp && /^YES/.test(rule.rolePreserved), 'Real governed Hip Thrust fixture available')
      const input = { alternativeExerciseKey: rule.alternativeExerciseId, alternativeExerciseName: rule.alternativeExercise, ruleId: rule.id, loadMode: 'none', loadStrategy: 'no-load-transfer', reason: 'Equipment unavailable' }
      if (args.kind === 'undo-abort') await q.workout.substituteWorkoutExercise(a.id, item.record.id, input)
      const before = (await q.workout.findWorkoutForDay(a.id, pos.program, pos.week, pos.day)).exercises.find(e => e.record.id === item.record.id), beforeCounts = await counts()
      const disarm = arm('workoutSets', row => row.workout_exercise_id === item.record.id)
      try { await expectReject(() => args.kind === 'undo-abort' ? q.workout.revertWorkoutExerciseSubstitution(a.id, item.record.id) : q.workout.substituteWorkoutExercise(a.id, item.record.id, input)) } finally { assert(disarm().aborted === 1, 'Abort actually injected') }
      const after = (await q.workout.findWorkoutForDay(a.id, pos.program, pos.week, pos.day)).exercises.find(e => e.record.id === item.record.id)
      same(after, before, 'Interrupted substitution/undo must roll back parent and all sets')
      same((await counts()).syncOutbox, beforeCounts.syncOutbox, 'Aborted exercise mutation leaves no partial outbox')
      return { restored: true }
    }
    if (args.kind === 'concurrent-advance') {
      await q.workout.completeWorkout(a.id, b.session.id)
      const attempts = await Promise.allSettled([q.progression.advanceProgramAfterWorkout(a.id, pos.program, pos.week, pos.day), q.progression.advanceProgramAfterWorkout(a.id, pos.program, pos.week, pos.day)])
      same((await activeRows('programEvents')).filter(e => e.event_type === 'program-position-advanced').length, 1, 'Concurrent completions emit only one advancement event')
      return { attempts: attempts.map(x => x.status), counts: await counts() }
    }
    if (args.kind === 'set-abort') {
      const set = b.exercises[0].sets[0], before = await q.db.getById('workoutSets', set.id), beforeCounts = await counts(), disarm = arm('workoutSets', row => row.id === set.id)
      try { await expectReject(() => q.workout.logSet(a.id, set.id, { reps: 7, loadValue: 75, loadUnit: 'lb' })) } finally { assert(disarm().aborted === 1, 'Abort actually injected') }
      same(await q.db.getById('workoutSets', set.id), before, 'Aborted set save preserves old record')
      same((await counts()).syncOutbox, beforeCounts.syncOutbox, 'Aborted set save preserves outbox')
      await q.workout.logSet(a.id, set.id, { reps: 7, loadValue: 75, loadUnit: 'lb' })
      assert((await q.db.getById('workoutSets', set.id)).completed, 'Set retry succeeds')
      return { restored: true }
    }
    throw new Error(`Unknown fault ${args.kind}`)
  }
  throw new Error(`Unknown operation ${op}`)
}

try {
  if (mode === 'faults') {
    for (const kind of ['start-abort', 'set-abort', 'concurrent-start', 'substitution-abort', 'undo-abort', 'concurrent-advance']) {
      const { context, page } = await makePage()
      try { await call(page, 'bootstrap', { mode: kind }); pass(kind, await call(page, 'fault', { kind, catalog })) }
      catch (error) { fail(kind, error) }
      finally { await context.close() }
    }
  } else {
    const { context, page } = await makePage()
    try {
      const inventory = await call(page, 'inventory'); report.inventory = inventory.positions
      await call(page, 'bootstrap', { mode }); pass('Disposable athlete/TM setup and premature handoff rejection')
      const seen = new Set()
      let previousSubstituteSession = null, walkOccurrences = 0
      for (const [index, slot] of inventory.positions.entries()) {
        const { program, week, day } = slot, pos = { program, week, day }
        const begin = await call(page, 'begin', { position: pos })
        if (seen.has(begin.sessionId)) throw new Error('Repeated session ID across different positions')
        seen.add(begin.sessionId)
        if (begin.counts.workoutSessions !== index + 1 || begin.counts.workoutExercises !== report.counts.exercises + slot.exercises || begin.counts.workoutSets !== report.counts.sets + slot.sets) throw new Error(`Aggregate row-count drift at ${JSON.stringify(pos)}`)
        if (mode === 'boundaries') {
          const sub = await call(page, 'substitute', { catalog, apply: walkOccurrences < 3, previousSessionId: previousSubstituteSession, undo: walkOccurrences === 0 })
          if (sub) {
            walkOccurrences++
            if (sub.reset) report.counts.resetChecks++
            else { report.counts.substitutionUses++; if (sub.previous) report.counts.historyLookups++; previousSubstituteSession = sub.sessionId }
          }
        }
        const interrupt = mode === 'reload' ? index % 7 === 0 : index % 50 === 0
        for (const [partIndex, part] of (interrupt ? ['first', 'second'] : ['all']).entries()) {
          const logged = await call(page, 'log', { mode, part })
          for (const [k, n] of Object.entries(logged)) report.counts[k] += n
          if (interrupt && partIndex === 0) {
            const before = await call(page, 'snapshot'); await load(page); const after = await call(page, 'snapshot')
            if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(`Workout changed across actual reload: ${program} W${week}D${day}`)
            report.counts.reloads++
          }
        }
        const finish = await call(page, 'finish', { mode })
        report.counts.positions++; report.counts.exercises += slot.exercises; if (slot.rest) report.counts.restPositions++
        const next = inventory.positions[index + 1]
        if (JSON.stringify(finish.pos) !== JSON.stringify(next ? { program: next.program, week: next.week, day: next.day } : null)) throw new Error(`Program advancement drift at ${JSON.stringify(pos)}`)
        if (index % 25 === 0 || !next || next.program !== program) {
          const integrity = await call(page, 'integrity')
          if (integrity.programHash !== inventory.programHash) throw new Error('Production program definition mutated')
          if (integrity.completedSessions !== index + 1) throw new Error('Completed-session/history count drift')
          report.checkpoints.push({ position: pos, ordinal: index + 1, ...integrity })
          console.log(`CHECKPOINT ${mode} ${index + 1}/${inventory.positions.length} ${program} W${week}D${day} sets=${report.counts.sets}`); writeReport()
        }
      }
      if (mode === 'boundaries' && (report.counts.substitutionUses < 3 || report.counts.historyLookups < 2 || report.counts.resetChecks < 1)) throw new Error('Substitute/history/non-sticky coverage did not execute')
      const final = await call(page, 'integrity')
      if (final.instances.length !== 3 || final.instances.some(p => p.status !== 'completed')) throw new Error('Must finish all three programs without inventing successor')
      pass('Entire governed lifecycle persisted through native services', report.counts)
      pass('No duplicates, orphans, outbox mismatches, lost history, or program mutation', final)
    } finally { await context.close() }
  }
} catch (error) { fail('Database lifecycle execution', error) }
finally {
  await browser.close(); await new Promise(resolve => server.close(resolve))
  if (JSON.stringify(hashes(path.join(app, 'src'))) !== JSON.stringify(sourceBefore)) fail('Production source immutability', new Error('Source changed'))
  else pass('Production source byte hashes unchanged')
  if (JSON.stringify(hashes(path.join(app, 'dist'))) !== JSON.stringify(distBefore)) fail('Production dist immutability', new Error('Dist changed'))
  else pass('Production deployment files untouched')
  fs.rmSync(runtime, { recursive: true, force: true })
  report.result = report.failures.length ? 'FAIL' : 'PASS'; report.finishedAt = new Date().toISOString(); writeReport()
  fs.writeFileSync(path.join(out, 'audit.md'), [`# Issue 53 Native Database Lifecycle — ${mode}`, '', `Result: **${report.result}**`, `Production SHA: \`${sha}\``, '', report.scope, '', '## Counts', ...Object.entries(report.counts).map(([k, v]) => `- ${k}: ${v}`), '', '## Failures', ...(report.failures.length ? report.failures.map(f => `- ${f.label}: ${f.detail}`) : ['None']), '', '## Scope boundaries', 'Real services and native IndexedDB; not in-memory domain mocks. Does not certify every UI click, real cloud sync, OS power loss, or physiological outcomes.', 'Actual load variation is persisted; workout-card automatic carry remains a separate UI test.', 'No production deployment, real athlete, or cloud account is accessed.', ''].join('\n'))
}
if (report.failures.length) process.exitCode = 1
