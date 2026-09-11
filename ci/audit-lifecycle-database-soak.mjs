#!/usr/bin/env node
/** Issue #53: real production services + Chromium IndexedDB; no model writes. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ciDir = path.dirname(fileURLToPath(import.meta.url))
const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const scenario = process.argv[3] || 'perfect'
const scenarios = ['perfect', 'variable', 'restart', 'grouped-metrics', 'substitution', 'adversarial']
if (!scenarios.includes(scenario)) throw new Error(`Invalid QA scenario: ${scenario}`)
const limit = Number(process.env.QA_MAX_POSITIONS || 0)
if (!Number.isInteger(limit) || limit < 0) throw new Error('Invalid QA_MAX_POSITIONS')
const require = createRequire(path.join(target, 'package.json'))
const { chromium } = require('playwright-core')
const provenance = JSON.parse(fs.readFileSync(path.join(target, 'qa-runtime/provenance.json'), 'utf8'))
const out = path.join(target, 'DATABASE_LIFECYCLE_AUDIT', scenario)
fs.mkdirSync(out, { recursive: true })
const report = { result: 'RUNNING', scenario, productionSha: provenance.productionSha, startedAt: new Date().toISOString(),
  scope: 'Actual unmodified production services compiled into a separate loopback-only QA bundle; actual Chromium IndexedDB. Not a full UI-click simulation.',
  counts: { positions: 0, sets: 0, exercises: 0, reloads: 0, browserRestarts: 0, substitutions: 0, historyLookups: 0, metricSets: 0, resolvedPercentages: 0, unresolvedPercentages: 0, roundSets: 0, betweenCompletionAndProgressionRestarts: 0 },
  checkpoints: [], failures: [], observations: {}, externalRequestsBlocked: 0 }
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
function writeReport() {
  fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n')
  fs.writeFileSync(path.join(out, 'audit.md'), [
    '# LetMeFly database-backed lifecycle — ' + scenario, '', '**Result: ' + report.result + '**', '',
    'Production source: `' + report.productionSha + '`', '', report.scope, '',
    '## Coverage', ...Object.entries(report.counts).map(([key,value]) => '- ' + key + ': ' + value), '',
    '## Failures', ...(report.failures.length ? report.failures.map(x=>'- ' + x.message) : ['- None']), '',
    'This harness invokes the unmodified production services, uses actual on-disk Chromium IndexedDB, and blocks all external browser requests. It does not claim every screen was clicked or that cloud sync was exercised.', '',
  ].join('\n'))
}
function sourcesUnchanged() {
  for (const [file, hash] of Object.entries(provenance.sourceHashes)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(target, file))).digest('hex')
    assert(actual === hash, `Production source changed: ${file}`)
  }
}
sourcesUnchanged()
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const qa = url.pathname.startsWith('/qa-runtime/')
  const base = qa ? target : path.join(target, 'dist')
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  const file = path.resolve(base, relative)
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return }
  const resolved = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file
  if (!fs.existsSync(resolved)) { res.writeHead(404); res.end('missing'); return }
  const ext = path.extname(resolved)
  res.writeHead(200, { 'Content-Type': ({'.js':'application/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(resolved).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf53-disposable-'))
let context, page
async function openBrowser() {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'], viewport: { width: 412, height: 915 }, serviceWorkers: 'block'
  })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    report.externalRequestsBlocked += 1
    return route.abort('blockedbyclient')
  })
  page = context.pages()[0] || await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('console', message => { if (message.type() === 'error') console.error(`QA_BROWSER ${message.text()}`) })
  await page.goto(`${origin}/qa-runtime/index.html?disposable-qa=1`)
  await page.waitForFunction(() => Boolean(window.__LMF_LIFECYCLE_QA__))
  await attachDriver()
}
async function attachDriver() {
  await page.addScriptTag({url: origin + '/ui/exercise-intelligence-runtime-v1.js'})
  await page.waitForFunction(() => Boolean(window.LetMeFlyExerciseIntelligence))
  await page.addScriptTag({path:path.join(ciDir,'lifecycle-database-scenarios.js')})
  await page.waitForFunction(() => Boolean(window.__LMF53TEST__))
}
async function call(method, input = null) {
  return page.evaluate(async ({method,input}) => window.__LMF53TEST__[method](input), {method,input})
}
async function checkpoint(label, restart = false) {
  const before=await call('snapshot')
  if(restart) await restartBrowser(); else await reloadBrowser()
  const after=await call('snapshot')
  assert(before.hash===after.hash,'IndexedDB state changed across ' + label)
  report.checkpoints.push({label,restartedBrowser:restart,...after})
  writeReport()
}
async function restartBrowser() { await context.close(); await openBrowser(); report.counts.browserRestarts += 1 }
async function reloadBrowser() { await page.reload(); await page.waitForFunction(() => Boolean(window.__LMF_LIFECYCLE_QA__)); await attachDriver(); report.counts.reloads += 1 }

try {
  await openBrowser()
  const inventory=await call('inventory')
  report.observations.inventory=inventory
  report.observations.bootstrap=await call('bootstrap',scenario)
  if(scenario==='adversarial') {
    const result=await call('adversarial')
    report.observations.adversarial=result
    for(const finding of result.findings) report.failures.push({message:finding.type,...finding})
    report.result=report.failures.length?'FAIL':'PASS'
  } else {
    const plan=inventory.positions
    const last=limit?Math.min(limit,plan.length):plan.length
    let expectedSets=0,expectedExercises=0
    for(let index=0;index<last;index++) {
      const pos=plan[index]
      report.observations.current={index,...pos}
      const begun=await call('begin',{index,mode:scenario})
      expectedSets+=pos.sets; expectedExercises+=pos.exercises
      assert(begun.counts.workoutSessions===index+1,'Global session count drift at ' + index)
      assert(begun.counts.workoutExercises===expectedExercises,'Global exercise count drift at ' + index)
      assert(begun.counts.workoutSets===expectedSets,'Global set count drift at ' + index)
      assert(begun.sets===pos.sets,'Source/created set count mismatch')
      let substitution=null
      const sub=scenario==='substitution'?inventory.substitutionPlan.find(x=>x.index===index):null
      if(sub) {
        substitution=await call('substitute',sub)
        report.observations.substitutionEvents??=[]
        report.observations.substitutionEvents.push({index,...sub,...substitution})
        if(sub.apply)report.counts.substitutions++
        await checkpoint('substitution-or-return-' + index,true)
      }
      if((scenario==='restart' && index%19===0) || index===0) {
        const halfway=Math.max(1,Math.floor(pos.sets/2))
        if(pos.sets)await call('log',{index,mode:scenario,to:halfway})
        await checkpoint('mid-session-' + index,scenario==='restart')
        if(pos.sets)await call('log',{index,mode:scenario,from:halfway})
      } else await call('log',{index,mode:scenario})
      if(sub?.apply) await call('assertLocked',{index,exerciseRecordId:substitution.exerciseRecordId})
      await call('finish',{index})
      if(sub?.apply) {
        const previous=await call('previous',{exerciseKey:substitution.alternative,expectedSession:begun.sessionId})
        report.counts.historyLookups++
        report.observations.substitutionEvents.at(-1).historySetCount=previous.sets.length
      }
      if(scenario==='restart' && index%71===0) {
        await checkpoint('completed-before-advancement-' + index,true)
        report.counts.betweenCompletionAndProgressionRestarts++
      }
      const advanced=await call('advance',{index})
      report.counts.positions=index+1
      report.counts.sets=expectedSets
      report.counts.exercises=expectedExercises
      report.counts.metricSets+=begun.metrics
      report.counts.resolvedPercentages+=begun.percentages
      report.counts.unresolvedPercentages+=begun.unresolvedPercentages
      report.counts.roundSets+=begun.roundSets
      if(advanced.action!=='advanced') {
        report.observations.transitions??=[]
        report.observations.transitions.push({index,action:advanced.action,next:advanced.position})
        await checkpoint('program-boundary-' + index,true)
      } else if(index%47===46) await checkpoint('long-horizon-' + index,false)
      if(index%20===0 || index+1===last) {
        console.log(`DATABASE_LIFECYCLE ${scenario} ${index+1}/${plan.length} positions; ${expectedSets} sets committed`)
        writeReport()
      }
    }
    const final=await call('snapshot')
    report.observations.final=final
    const rechecked=await call('inventory')
    assert(rechecked.programHash===inventory.programHash,'Governed programs changed in runtime')
    assert(final.completedSessions===last,'Not every QA workout completed')
    assert(final.completedSets===expectedSets,'Not every QA set committed')
    if(last===plan.length) {
      assert(final.programInstances.length===3 && final.programInstances.every(x=>x.status==='completed'),'Final program ownership/completion drift')
      assert(final.eventTypes['crownforge-complete-maintenance-start']===1,'Crownforge transition duplicated/missing')
      assert(final.eventTypes['black-crown-entry-gate-opened']===1,'Entry gate duplicated/missing')
      assert(final.eventTypes['black-crown-entry-activated']===1,'Entry activation duplicated/missing')
      assert(final.eventTypes['black-crown-program-complete']===1,'Final completion duplicated/missing')
      assert(final.eventTypes['program-position-advanced']===plan.length-3,'Per-position advancement event count drift')
      if(scenario==='substitution') assert(report.counts.substitutions===3 && report.observations.substitutionEvents.some(x=>x.returnedToProgram),'Repeated substitution/return coverage missing')
      report.result='PASS'
    } else report.result='INCOMPLETE'
  }
} catch (error) {
  report.result = 'FAIL'
  report.failures.push({ message: error.message, stack: error.stack })
  console.error(error)
} finally {
  try { sourcesUnchanged() } catch (error) { report.result = 'FAIL'; report.failures.push({ message: error.message }) }
  await context?.close().catch(() => {})
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(profile, { recursive: true, force: true })
  report.finishedAt = new Date().toISOString()
  writeReport()
}
if (report.result !== 'PASS') process.exitCode = 1
