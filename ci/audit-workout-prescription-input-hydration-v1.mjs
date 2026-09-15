#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const out = path.join(app, 'WORKOUT_PRESCRIPTION_INPUT_HYDRATION_V1')
fs.mkdirSync(out, { recursive: true })

const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href)
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const runtimeDir = fs.mkdtempSync(path.join(app, '.qa-prescription-hydration-'))
const entry = path.join(runtimeDir, 'entry.ts')
fs.writeFileSync(entry, `
import * as athlete from ${JSON.stringify(path.join(app, 'src/services/athlete-service'))};
import * as programs from ${JSON.stringify(path.join(app, 'src/data/programs'))};
if (location.hostname !== '127.0.0.1') throw new Error('loopback only');
(window as any).__LMF_PRESCRIPTION_QA__ = Object.freeze({ athlete, programs });
`)
await build({
  configFile: false,
  root: app,
  publicDir: false,
  logLevel: 'warn',
  build: { outDir: path.join(runtimeDir, 'web'), emptyOutDir: true, minify: false, lib: { entry, formats: ['es'], fileName: () => 'services.js' } },
})
fs.writeFileSync(path.join(runtimeDir, 'web', 'index.html'), '<!doctype html><script type="module" src="./services.js"></script>')

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const qa = url.pathname.startsWith('/__qa/')
  const base = qa ? path.join(runtimeDir, 'web') : path.join(app, 'dist')
  const rel = qa ? url.pathname.slice(6) : url.pathname.slice(1)
  let file = path.resolve(base, decodeURIComponent(rel || 'index.html'))
  if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(base, 'index.html')
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: chromeBin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const report = { result: 'RUNNING', programs: {}, totalSets: 0, parseable: { primary: 0, load: 0, rpe: 0 }, hydrated: { primary: 0, load: 0, rpe: 0 }, integrations: [], defects: [] }
const write = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const firstNumber = value => {
  const match = norm(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}
const weightTokens = value => [...norm(value).matchAll(/(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)\b/ig)]
const metricKind = set => {
  const distance = norm(set.distance)
  const duration = norm(set.duration)
  const reps = norm(set.reps)
  const value = distance || duration || reps
  if (distance || /(?:^|\s)\d+(?:\s*[–-]\s*\d+)?\s*(?:m|meter|meters|metre|metres|yd|yard|yards|ft|feet)(?:\b|\/)/i.test(value)) return 'distance'
  if (duration || /\b(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(value)) return 'duration'
  return 'reps'
}
const metricUnit = set => {
  const kind = metricKind(set)
  const value = norm(set.distance || set.duration || set.reps)
  if (kind === 'distance') return /(?:yd|yard)/i.test(value) ? 'yd' : /(?:ft|feet)/i.test(value) ? 'ft' : 'm'
  if (kind === 'duration') return /\b(?:hr|hrs|hour|hours)\b/i.test(value) ? 'hr' : /\b(?:min|mins|minute|minutes)\b/i.test(value) ? 'min' : 'sec'
  return 'reps'
}
const summary = set => {
  const parts = []
  const label = norm(set.label)
  if (/\bsets?\b/i.test(label)) parts.push(label)
  const primary = norm(set.distance || set.duration || set.reps)
  if (primary) parts.push(primary)
  const loadText = norm(set.loadText)
  if (loadText) parts.push(loadText)
  else if (Number.isFinite(Number(set.percentage))) {
    const raw = Number(set.percentage)
    const percent = raw > 0 && raw <= 1 ? raw * 100 : raw
    parts.push(`${percent}%`)
  }
  const rpe = norm(set.rpe)
  if (rpe) parts.push(/^RPE\b/i.test(rpe) ? rpe : `RPE ${rpe}`)
  return [...new Set(parts)].join(' • ')
}

async function loadMatrix(page) {
  await page.goto(`${origin}/__qa/index.html`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__LMF_PRESCRIPTION_QA__)
  return page.evaluate(() => {
    const p = window.__LMF_PRESCRIPTION_QA__.programs
    const defs = [['crownforge', p.CROWNFORGE], ['crown-maintenance', p.CROWN_MAINTENANCE], ['black-crown', p.BLACK_CROWN]]
    const rows = []
    for (const [program, def] of defs) {
      for (const week of def.weekData || []) {
        for (const day of week.days || []) {
          for (const section of day.sections || []) {
            for (const exercise of section.exercises || []) {
              for (const set of exercise.sets || []) {
                rows.push({
                  program,
                  programName: def.metadata?.name || def.name || program,
                  week: Number(week.week), day: Number(day.day), dayTitle: day.title,
                  exercise: exercise.name, label: set.label, reps: set.reps,
                  loadText: set.loadText, loadValue: set.loadValue, loadUnit: set.loadUnit,
                  rpe: set.rpe, distance: set.distance, duration: set.duration,
                  percentage: set.percentage, restDay: Boolean(day.restDay),
                })
              }
            }
          }
        }
      }
    }
    return rows
  })
}

async function syntheticAudit(page, sets) {
  await page.goto(`${origin}/#/home`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__LMF_WORKOUT_PRESCRIPTION_INPUT_HYDRATION_V1__, null, { timeout: 15000 })
  const results = await page.evaluate((sets) => {
    const api = window.__LMF_WORKOUT_PRESCRIPTION_INPUT_HYDRATION_V1__
    const numberFrom = value => /\d+(?:\.\d+)?/.test(String(value ?? ''))
    const weightFrom = value => /(\d+(?:\.\d+)?)\s*(?:kg|kgs|lb|lbs)\b/i.test(String(value ?? ''))
    const out = []
    for (const set of sets) {
      const kind = set.kind
      const unit = set.metricUnit
      const row = document.createElement('div')
      row.className = 'set-row'
      row.dataset.setId = `${set.program}-${set.week}-${set.day}-${out.length}`
      row.dataset.prescriptionKind = kind
      row.dataset.metricUnit = unit
      row.dataset.loadUnit = 'lb'
      row.dataset.programmedLoad = set.loadValue != null ? `${set.loadValue}:${set.loadUnit || ''}` : String(set.loadText || '')
      row.dataset.programmedLoadDefault = set.loadValue == null ? '' : String(set.loadValue)
      row.innerHTML = `<div class="set-target-cell lmf-prescription-cell"><strong>${set.summary}</strong></div><div class="set-field reps-field"><input class="set-input ${kind === 'reps' ? 'reps-input' : 'metric-input'}"></div><div class="set-field load-field"><input class="set-input load-input"></div><div class="set-field rpe-field"><input class="set-input rpe-input"></div><button class="set-check"></button>`
      document.body.appendChild(row)
      api.hydrateRow(row)
      out.push({
        primary: row.querySelector(kind === 'reps' ? '.reps-input' : '.metric-input')?.value || '',
        load: row.querySelector('.load-input')?.value || '',
        rpe: row.querySelector('.rpe-input')?.value || '',
        expectPrimary: numberFrom(kind === 'distance' ? set.distance : kind === 'duration' ? set.duration : set.reps),
        expectLoad: set.loadValue != null || weightFrom(set.loadText),
        expectRpe: numberFrom(set.rpe),
      })
      row.remove()
    }
    return out
  }, sets.map(set => ({ ...set, kind: metricKind(set), metricUnit: metricUnit(set), summary: summary(set) })))

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i]
    const set = sets[i]
    if (result.expectPrimary) {
      report.parseable.primary += 1
      if (result.primary) report.hydrated.primary += 1
      else report.defects.push({ type: 'primary', program: set.program, week: set.week, day: set.day, exercise: set.exercise, prescription: summary(set) })
    }
    if (result.expectLoad) {
      report.parseable.load += 1
      if (result.load) report.hydrated.load += 1
      else report.defects.push({ type: 'load', program: set.program, week: set.week, day: set.day, exercise: set.exercise, prescription: summary(set) })
    }
    if (result.expectRpe) {
      report.parseable.rpe += 1
      if (result.rpe) report.hydrated.rpe += 1
      else report.defects.push({ type: 'rpe', program: set.program, week: set.week, day: set.day, exercise: set.exercise, prescription: summary(set) })
    }
  }
}

async function createAthleteAndSetPosition(page, target, displayName) {
  await page.goto(`${origin}/__qa/index.html`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__LMF_PRESCRIPTION_QA__)
  const athleteId = await page.evaluate(async ({ displayName }) => {
    const qa = window.__LMF_PRESCRIPTION_QA__
    const athlete = await qa.athlete.createLocalAthlete({ displayName, weightUnit: 'lb' })
    return athlete.id
  }, { displayName })
  await page.goto(`${origin}/#/home`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async ({ athleteId, target }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('letmefly-private'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const tx = db.transaction('programInstances', 'readwrite')
      const store = tx.objectStore('programInstances')
      const req = store.index('by-athlete-status').getAll([athleteId, 'active'])
      const rows = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
      if (rows.length !== 1) throw new Error('Expected exactly one active program')
      store.put({ ...rows[0], program_key: target.program, program_name: target.programName, current_week: target.week, current_day_key: `day-${target.day}`, progression_state: {} })
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error) })
    } finally { db.close() }
  }, { athleteId, target })
  await page.goto(`${origin}/?hydrate=${Date.now()}#/train`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.train-shell', { state: 'visible', timeout: 15000 })
  return athleteId
}

async function startWorkout(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.readiness-field input[type="radio"][value="4"]').forEach(input => {
      input.checked = true
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  })
  const start = page.locator('[data-action="start-workout"]:visible').first()
  await start.waitFor({ state: 'visible', timeout: 10000 })
  await start.click()
  await page.waitForSelector('.set-row[data-set-id]', { timeout: 12000 })
  await page.waitForFunction(() => window.__LMF_WORKOUT_PRESCRIPTION_INPUT_HYDRATION_V1__, null, { timeout: 10000 })
  await page.waitForTimeout(350)
}

async function liveIntegration(context, sets, pattern, label) {
  const targetSet = sets.find(set => pattern.test(set.exercise) && !set.restDay)
  assert.ok(targetSet, `${label}: governed target exercise missing`)
  const target = { program: targetSet.program, programName: targetSet.programName, week: targetSet.week, day: targetSet.day }
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  await createAthleteAndSetPosition(page, target, `Prescription QA ${label}`)
  await startWorkout(page)
  const card = page.locator('.active-exercise').filter({ has: page.locator('.exercise-title h3', { hasText: pattern }) }).first()
  await card.waitFor({ state: 'attached', timeout: 10000 })
  const actual = await card.evaluate(node => {
    const row = node.querySelector('.set-row[data-set-id]')
    return {
      reps: row?.querySelector('.reps-input')?.value || '',
      metric: row?.querySelector('.metric-input')?.value || '',
      load: row?.querySelector('.load-input')?.value || '',
      rpe: row?.querySelector('.rpe-input')?.value || '',
      prescription: row?.querySelector('.lmf-prescription-cell strong')?.textContent?.trim() || '',
      loadUnit: row?.dataset.loadUnit || '',
      hydrated: row?.dataset.lmfPrescriptionHydrated || '',
    }
  })
  const expectedPrimary = firstNumber(metricKind(targetSet) === 'distance' ? targetSet.distance : metricKind(targetSet) === 'duration' ? targetSet.duration : targetSet.reps)
  if (expectedPrimary != null) assert.ok(actual.reps || actual.metric, `${label}: live primary logging field stayed blank for ${actual.prescription}`)
  if (targetSet.loadValue != null || weightTokens(targetSet.loadText).length) assert.ok(actual.load, `${label}: live load field stayed blank for ${actual.prescription}`)
  if (firstNumber(targetSet.rpe) != null) assert.ok(actual.rpe, `${label}: live RPE field stayed blank for ${actual.prescription}`)
  assert.equal(actual.hydrated, 'true', `${label}: live row was not marked hydrated`)
  report.integrations.push({ label, exercise: targetSet.exercise, ...target, actual })
  await page.close()
}

try {
  const sourcePage = await browser.newPage()
  const sets = await loadMatrix(sourcePage)
  await sourcePage.close()
  report.totalSets = sets.length
  assert.ok(sets.length > 500, `Governed set matrix unexpectedly small: ${sets.length}`)
  for (const key of ['crownforge', 'crown-maintenance', 'black-crown']) {
    const subset = sets.filter(set => set.program === key)
    assert.ok(subset.length, `${key}: no governed sets found`)
    report.programs[key] = { sets: subset.length, exercises: new Set(subset.map(set => `${set.week}:${set.day}:${set.exercise}`)).size }
  }

  const synthetic = await browser.newPage()
  await syntheticAudit(synthetic, sets)
  await synthetic.close()
  assert.equal(report.defects.length, 0, `Prescription hydration misses: ${JSON.stringify(report.defects.slice(0, 8))}`)
  assert.equal(report.hydrated.primary, report.parseable.primary)
  assert.equal(report.hydrated.load, report.parseable.load)
  assert.equal(report.hydrated.rpe, report.parseable.rpe)

  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'))
  await liveIntegration(context, sets, /^KB Lateral Lunge$/i, 'KB Lateral Lunge exact reps + dual-unit load')
  await liveIntegration(context, sets, /^Hanging Knee Raise$/i, 'Hanging Knee Raise rep range')
  await context.close()

  report.result = 'PASS'
  write()
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.result = 'FAIL'
  report.defects.push({ gate: error?.message || String(error) })
  write()
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close().catch(() => {})
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(runtimeDir, { recursive: true, force: true })
}
