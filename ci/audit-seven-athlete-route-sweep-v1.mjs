#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const contract = JSON.parse(fs.readFileSync(path.join(root, 'ci/seven-athlete-release-audit.v2.json'), 'utf8'))
const out = path.join(app, 'SEVEN_ATHLETE_ROUTE_SWEEP_V1')
fs.mkdirSync(out, { recursive: true })

const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href)
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

assert.equal(contract.athletes.length, 7)
assert.equal(contract.dataBoundary.syntheticOnly, true)
assert.equal(contract.dataBoundary.mayOverwriteRealAthlete, false)

const viewports = {
  qa_rook: { width: 360, height: 800, mobile: true },
  qa_forge: { width: 412, height: 915, mobile: true },
  qa_titan: { width: 1440, height: 1000, mobile: false },
  qa_metric: { width: 412, height: 915, mobile: true },
  qa_recovery: { width: 390, height: 844, mobile: true },
  qa_substitution: { width: 412, height: 915, mobile: true },
  qa_history: { width: 1440, height: 1000, mobile: false },
}
const tmAliases = {
  back_squat: 'back-squat',
  front_squat: 'front-squat',
  bench_press: 'bench-press',
  deadlift: 'deadlift',
  overhead_press: 'overhead-press',
  power_clean: 'clean',
}
const fixtures = contract.athletes.map((row, index) => ({
  ...row,
  key: row.internalId,
  weightUnit: row.units.weight,
  viewport: viewports[row.internalId] ?? { width: 412, height: 915, mobile: true },
  trainingMaxes: Object.fromEntries(
    Object.entries(row.trainingMaxes).map(([key, value]) => [tmAliases[key] ?? key, [value, row.units.weight]])
  ),
  readinessUi: {
    sleepQuality: row.readiness.sleep_quality,
    soreness: row.readiness.soreness,
    stress: row.readiness.stress,
    energy: row.readiness.energy,
    sleepHours: row.readiness.sleep_hours,
    notes: row.readiness.notes ?? `Synthetic seven-athlete readiness marker ${row.internalId}`,
  },
  profile: {
    primaryGoal: `QA-${row.internalId.toUpperCase()}-GOAL — ${row.primaryFailureDomain}`,
    trainingHistory: `${row.role} synthetic release-audit athlete; no production identity or data.`,
    developmentPriorities: row.requiredAssertions.slice(0, 3).join('; '),
    equipmentAvailable: row.barbell.unit === 'kg'
      ? 'Metric barbell and metric plate inventory'
      : '45 lb barbell and standard plate inventory',
    coachingNotes: row.internalId === 'qa_substitution'
      ? 'QA-RURIK-SAFETY-MARKER — Reports anterior hip pinching with deep hip flexion and knee pain with loaded/deep knee flexion. Avoid provocative ranges; do not diagnose. Red flags require professional evaluation.'
      : `QA-${row.internalId.toUpperCase()}-COACH-MARKER`,
  },
  index,
}))

const runtime = fs.mkdtempSync(path.join(app, '.qa-route-sweep-'))
const entry = path.join(runtime, 'entry.ts')
const imports = {
  athlete: 'services/athlete-service',
  profile: 'services/profile-context-service',
  readiness: 'services/readiness-service',
  db: 'db/local-db',
}
fs.writeFileSync(
  entry,
  Object.entries(imports)
    .map(([name, file]) => `import * as ${name} from ${JSON.stringify(path.join(app, 'src', file))}`)
    .join('\n') +
    `\nif(location.hostname !== '127.0.0.1' || new URLSearchParams(location.search).get('seven-athlete-route-qa') !== '1') throw new Error('Seven-athlete route bridge is disposable loopback only');\n` +
    `(window as any).__LMF_ROUTE_QA__ = Object.freeze({${Object.keys(imports).join(',')}});\n`
)
await build({
  configFile: false,
  root: app,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: path.join(runtime, 'web'),
    emptyOutDir: true,
    minify: false,
    lib: { entry, formats: ['es'], fileName: () => 'services.js' },
  },
})
fs.writeFileSync(
  path.join(runtime, 'web', 'index.html'),
  '<!doctype html><title>Seven athlete route sweep</title><script type="module" src="./services.js"></script>'
)

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const qa = url.pathname.startsWith('/__qa/')
  const base = qa ? path.join(runtime, 'web') : path.join(app, 'dist')
  const relative = qa ? url.pathname.slice('/__qa/'.length) : url.pathname.slice(1)
  let file = path.resolve(base, decodeURIComponent(relative || 'index.html'))
  if (file !== base && !file.startsWith(base + path.sep)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(base, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  res.writeHead(200, {
    'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(file).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({
  executablePath: chromeBin,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const routes = [
  ['home', /(today|start workout|crownforge|black crown|home)/i],
  ['train', /(readiness|start workout|workout|train)/i],
  ['program', /(program|week|crownforge|black crown)/i],
  ['progress', /(progress|strength|conditioning|prs?)/i],
  ['exercises', /(exercise|library|search)/i],
  ['coach', /(coach|training context|ask)/i],
  ['more', /(more|profile|calendar|settings)/i],
  ['profile', /(profile|athlete|strength max)/i],
  ['calendar', /(calendar|week|training)/i],
  ['settings', /(settings|app updates|bar|install)/i],
]
const report = {
  result: 'RUNNING',
  routes: routes.map(([route]) => route),
  expectedAthletes: fixtures.length,
  expectedRouteMounts: fixtures.length * routes.length,
  athletes: [],
  defects: [],
}
const writeReport = () => fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

async function qaPage(page) {
  await page.goto(`${origin}/__qa/index.html?seven-athlete-route-qa=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__LMF_ROUTE_QA__)
}

async function seedFixture(page, fixture) {
  return page.evaluate(async input => {
    const q = window.__LMF_ROUTE_QA__
    if (await q.athlete.getActiveAthlete()) {
      throw new Error('Seven-athlete route fixture requires a fresh disposable browser context')
    }
    const athlete = await q.athlete.createLocalAthlete({
      displayName: input.displayName,
      weightUnit: input.weightUnit,
    })
    for (const [key, [value, unit]] of Object.entries(input.trainingMaxes)) {
      await q.athlete.setTrainingMax(athlete.id, key, value, unit)
    }
    const expectedBlank = Object.fromEntries(Object.keys(input.profile).map(key => [key, '']))
    await q.profile.saveProfileContext(athlete.id, input.profile, expectedBlank)
    await q.readiness.saveReadiness(athlete.id, input.readinessUi)
    const program = await q.athlete.getCurrentProgramInstance(athlete.id)
    const tms = await q.athlete.getLatestTrainingMaxes(athlete.id)
    return {
      athleteId: athlete.id,
      program,
      tmKeys: Object.keys(tms).sort(),
    }
  }, fixture)
}

async function criticalState(page, athleteId) {
  return page.evaluate(async athleteId => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('letmefly-private')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const names = ['programInstances', 'trainingMaxHistory'].filter(name => db.objectStoreNames.contains(name))
      const tx = db.transaction(names, 'readonly')
      const data = {}
      await Promise.all(names.map(name => new Promise((resolve, reject) => {
        const request = tx.objectStore(name).getAll()
        request.onsuccess = () => {
          data[name] = request.result
          resolve()
        }
        request.onerror = () => reject(request.error)
      })))
      const programs = (data.programInstances || []).filter(
        row => row.athlete_id === athleteId && !row.deleted_at && row.status === 'active'
      )
      const program = programs.length === 1 ? programs[0] : null
      const latest = new Map()
      const history = (data.trainingMaxHistory || [])
        .filter(row => row.athlete_id === athleteId && !row.deleted_at)
        .sort((a, b) => Date.parse(b.effective_at || b.created_at || 0) - Date.parse(a.effective_at || a.created_at || 0))
      for (const row of history) {
        const key = row.exercise_key || row.lift_key
        if (key && !latest.has(key)) latest.set(key, [row.tm_value ?? row.value, row.tm_unit ?? row.unit])
      }
      return {
        programCount: programs.length,
        program: program ? [program.program_key, Number(program.current_week), program.current_day_key] : null,
        tms: [...latest.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      }
    } finally {
      db.close()
    }
  }, athleteId)
}

async function dismissInstall(page) {
  const candidates = [
    page.getByRole('button', { name: /Dismiss install prompt/i }),
    page.getByRole('button', { name: /^Not now$/i }),
  ]
  for (const candidate of candidates) {
    if (await candidate.first().isVisible().catch(() => false)) {
      await candidate.first().click().catch(() => {})
      await page.waitForTimeout(80)
    }
  }
}

async function visitRoute(page, fixture, route, pattern, serial) {
  await page.goto(`${origin}/?route-sweep=${serial}#/${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  })
  await page.waitForFunction(
    () => document.querySelector('main') && !/Loading private athlete vault/i.test(document.body.innerText),
    null,
    { timeout: 20000 }
  )
  await dismissInstall(page)
  assert.equal(await page.evaluate(() => location.hash), `#/${route}`, `${fixture.key}: ${route} redirected unexpectedly`)
  const main = page.locator('main')
  await main.waitFor({ state: 'visible', timeout: 10000 })
  const text = (await main.innerText()).trim()
  assert.ok(text.length > 12, `${fixture.key}: ${route} main content is effectively empty`)
  assert.match(text, pattern, `${fixture.key}: ${route} expected route content did not mount`)
  assert.equal(
    /uncaught|unhandled|application error|something went wrong/i.test(text),
    false,
    `${fixture.key}: ${route} visible runtime error state`
  )
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(
    metrics.scrollWidth <= metrics.width + 3,
    `${fixture.key}: ${route} horizontal overflow ${metrics.scrollWidth}px > ${metrics.width}px`
  )
  const body = await page.locator('body').innerText()
  for (const other of fixtures.filter(row => row.key !== fixture.key && row.key !== 'qa_titan')) {
    assert.equal(body.includes(other.displayName), false, `${fixture.key}: ${route} leaked ${other.displayName}`)
    assert.equal(body.includes(other.profile.primaryGoal), false, `${fixture.key}: ${route} leaked ${other.key} goal`)
    assert.equal(body.includes(other.profile.coachingNotes), false, `${fixture.key}: ${route} leaked ${other.key} coaching notes`)
  }
  return { route, textLength: text.length, width: metrics.width, scrollWidth: metrics.scrollWidth }
}

try {
  let serial = 0
  for (const fixture of fixtures) {
    const row = {
      internalId: fixture.key,
      displayName: fixture.displayName,
      result: 'RUNNING',
      routeChecks: [],
      errors: [],
    }
    let context
    let page
    try {
      context = await browser.newContext({
        viewport: { width: fixture.viewport.width, height: fixture.viewport.height },
        isMobile: fixture.viewport.mobile,
        hasTouch: fixture.viewport.mobile,
        serviceWorkers: 'block',
      })
      await context.route('**/*', requestRoute =>
        new URL(requestRoute.request().url()).origin === origin
          ? requestRoute.continue()
          : requestRoute.abort('blockedbyclient')
      )
      page = await context.newPage()
      page.setDefaultTimeout(12000)
      const pageErrors = []
      page.on('pageerror', error => pageErrors.push(error.message))

      await qaPage(page)
      const seeded = await seedFixture(page, fixture)
      assert.ok(seeded.program && seeded.program.status === 'active', `${fixture.key}: active program missing after seed`)
      assert.equal(seeded.tmKeys.length, 6, `${fixture.key}: expected six active TM keys after seed`)

      await page.goto(`${origin}/?route-sweep-baseline=${++serial}#/home`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(
        () => document.querySelector('main') && !/Loading private athlete vault/i.test(document.body.innerText),
        null,
        { timeout: 20000 }
      )
      await dismissInstall(page)
      const before = await criticalState(page, seeded.athleteId)
      assert.equal(before.programCount, 1, `${fixture.key}: expected one active program before route sweep`)

      for (const [route, pattern] of routes) {
        row.routeChecks.push(await visitRoute(page, fixture, route, pattern, ++serial))
      }

      const after = await criticalState(page, seeded.athleteId)
      assert.deepEqual(after.program, before.program, `${fixture.key}: read-only route sweep changed active program position`)
      assert.deepEqual(after.tms, before.tms, `${fixture.key}: read-only route sweep changed training maxes`)
      assert.equal(pageErrors.length, 0, `${fixture.key}: page errors during route sweep: ${pageErrors.join(' | ')}`)
      assert.equal(row.routeChecks.length, routes.length, `${fixture.key}: incomplete route coverage`)

      row.result = 'PASS'
      report.athletes.push(row)
      await context.close()
      writeReport()
    } catch (error) {
      row.result = 'FAIL'
      row.errors.push(error?.stack || String(error))
      report.defects.push({ athlete: fixture.key, error: error?.message || String(error) })
      report.athletes.push(row)
      if (page) await page.screenshot({ path: path.join(out, `${fixture.key}-failure.png`), fullPage: true }).catch(() => {})
      if (context) await context.close().catch(() => {})
      writeReport()
    }
  }

  const routeMounts = report.athletes.reduce((sum, row) => sum + row.routeChecks.length, 0)
  report.routeMounts = routeMounts
  report.result = (
    report.athletes.length === fixtures.length &&
    report.athletes.every(row => row.result === 'PASS') &&
    routeMounts === report.expectedRouteMounts &&
    report.defects.length === 0
  ) ? 'PASS' : 'FAIL'
  writeReport()
  console.log(JSON.stringify(report, null, 2))
  if (report.result !== 'PASS') process.exitCode = 1
} finally {
  await browser.close().catch(() => {})
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(runtime, { recursive: true, force: true })
}
