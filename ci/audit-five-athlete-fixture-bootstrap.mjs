#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { FIVE_ATHLETE_FIXTURES, validateFiveAthleteFixtures } from './five-athlete-fixtures.mjs'
import { seedAllFiveAthleteFixtures } from './five-athlete-seed.mjs'

validateFiveAthleteFixtures()
const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const out = path.join(app, 'FIVE_ATHLETE_FIXTURE_BOOTSTRAP')
fs.mkdirSync(out, { recursive: true })
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const runtime = fs.mkdtempSync(path.join(app, '.qa-five-athlete-'))
const entry = path.join(runtime, 'entry.ts')
fs.writeFileSync(entry, [
  `import * as athlete from ${JSON.stringify(path.join(app, 'src/services/athlete-service'))}`,
  `import * as profile from ${JSON.stringify(path.join(app, 'src/services/profile-context-service'))}`,
  `import * as readiness from ${JSON.stringify(path.join(app, 'src/services/readiness-service'))}`,
  `import * as db from ${JSON.stringify(path.join(app, 'src/db/local-db'))}`,
  `if(location.hostname !== '127.0.0.1' || new URLSearchParams(location.search).get('five-athlete-qa') !== '1') throw new Error('Five-athlete QA bridge is disposable loopback only')`,
  `window.__LMF_FIVE_ATHLETE_QA__ = Object.freeze({ athlete, profile, readiness, db })`,
].join('\n'))

const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href)
await build({ configFile: false, root: app, publicDir: false, logLevel: 'warn', build: { outDir: path.join(runtime, 'web'), emptyOutDir: true, minify: false, lib: { entry, formats: ['es'], fileName: () => 'services.js' } } })
const serviceJs = fs.readFileSync(path.join(runtime, 'web/services.js'))
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  res.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/services.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(serviceJs); return }
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Five athlete QA</title><script type="module" src="/services.js"></script>'); return }
  res.statusCode = 404; res.end('QA-only route')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const report = { result: 'RUNNING', fixtureCount: FIVE_ATHLETE_FIXTURES.length, fixtures: [], failures: [] }
try {
  const results = await seedAllFiveAthleteFixtures(async fixture => {
    const context = await browser.newContext({ viewport: { width: fixture.viewport.width, height: fixture.viewport.height }, isMobile: fixture.viewport.mobile, hasTouch: fixture.viewport.mobile, serviceWorkers: 'block' })
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'))
    const page = await context.newPage()
    await page.goto(`${origin}/?five-athlete-qa=1`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__LMF_FIVE_ATHLETE_QA__)
    return { page, close: () => context.close() }
  })

  for (const result of results) {
    const fixture = FIVE_ATHLETE_FIXTURES.find(row => row.key === result.fixtureKey)
    assert.ok(fixture)
    assert.equal(result.displayName, fixture.displayName)
    assert.equal(result.foreignAthleteRows, 0)
    assert.equal(result.programInstance?.program_key, 'crownforge')
    assert.equal(Number(result.programInstance?.current_week ?? 0), 1)
    assert.match(String(result.programInstance?.current_day_key ?? ''), /day-1/i)
    assert.deepEqual(result.tmKeys, Object.keys(fixture.trainingMaxes).sort())
    assert.equal(result.profileContext?.primaryGoal, fixture.profile.primaryGoal)
    assert.equal(result.profileContext?.coachingNotes, fixture.profile.coachingNotes)
    assert.ok(result.readinessId)
    report.fixtures.push({ key: fixture.key, displayName: fixture.displayName, weightUnit: fixture.weightUnit, tmKeys: result.tmKeys, program: result.programInstance?.program_key, week: result.programInstance?.current_week, day: result.programInstance?.current_day_key, ownCounts: result.ownCounts })
  }

  const distText = fs.existsSync(path.join(app, 'dist')) ? fs.readdirSync(path.join(app, 'dist'), { recursive: true }).filter(name => typeof name === 'string').filter(name => /\.(?:html|js|css|json|mjs)$/i.test(name)).map(name => { const p = path.join(app, 'dist', name); return fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : '' }).join('\n') : ''
  for (const fixture of FIVE_ATHLETE_FIXTURES) {
    assert.equal(distText.includes(fixture.displayName), false, `${fixture.displayName} must not ship in production dist`)
    assert.equal(distText.includes(fixture.profile.coachingNotes), false, `${fixture.key} coach marker must not ship in production dist`)
  }
  report.result = 'PASS'
} catch (error) {
  report.result = 'FAIL'
  report.failures.push(error.stack || String(error))
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(runtime, { recursive: true, force: true })
}

console.log(JSON.stringify(report, null, 2))
if (report.result === 'PASS') console.log('Five-athlete reusable fixture bootstrap: PASS')
