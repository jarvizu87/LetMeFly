#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'BROWSER_SMOKE_AUDIT', 'home-option1')
fs.mkdirSync(outDir, { recursive:true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result:'PASS', passes:[], failures:[], layout:null, error:null }
const check = (condition, label, detail='') => {
  const row = { label, detail }
  if (condition) {
    report.passes.push(row)
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
    return
  }
  report.result = 'FAIL'
  report.failures.push(row)
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless:true, executablePath:chromeBin, args:['--no-sandbox','--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport:{ width:412, height:915 }, isMobile:true, hasTouch:true })
const page = await context.newPage()

async function dismissOptionalInstall() {
  const button = page.getByRole('button', { name:/^Not now$/i }).first()
  if (await button.isVisible().catch(() => false)) {
    await button.click().catch(() => null)
    await page.waitForTimeout(180).catch(() => null)
  }
}

async function settleOptionalInstallForScreenshot() {
  // The app's global PWA helper can schedule its banner after page boot. Keep
  // QA screenshots deterministic by clearing any delayed prompt after that
  // timer has had a chance to fire; this does not alter production behavior.
  for (const delay of [500, 500, 500, 250]) {
    await page.waitForTimeout(delay).catch(() => null)
    await dismissOptionalInstall().catch(() => null)
  }
  // A later browser installability event can legally re-render the global
  // prompt. Suppress only the QA capture surface so the Home screenshot audits
  // Home instead of unrelated PWA chrome.
  await page.addStyleTag({ content:'#lmf-install-banner{display:none!important}' }).catch(() => null)
  await page.locator('#lmf-install-banner').evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => null)
  await page.waitForTimeout(120).catch(() => null)
}

async function bootstrapAthlete() {
  // First-run local-vault initialization can trail DOMContentLoaded on CI.
  // Do not click Create until the real display-name field is visible, filled,
  // and the setup action is enabled; otherwise the modal simply remains open.
  for (let i=0;i<80;i+=1) {
    await dismissOptionalInstall()
    if (await page.locator('.lmf-home-command-v4').count()) return

    const create = page.getByRole('button', { name:/CREATE LOCAL ATHLETE/i }).first()
    if (!(await create.isVisible().catch(() => false))) {
      await page.waitForTimeout(180)
      continue
    }

    const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
    let input = null
    for (let attempt=0;attempt<40;attempt+=1) {
      const modalInput = modal.locator('input[placeholder="Athlete name"],input[type="text"],input:not([type])').first()
      const pageInput = page.locator('input[placeholder="Athlete name"],input[type="text"],input:not([type])').first()
      if (await modalInput.isVisible().catch(() => false)) input = modalInput
      else if (await pageInput.isVisible().catch(() => false)) input = pageInput
      if (input) break
      await page.waitForTimeout(180)
    }
    if (!input) throw new Error('First-run Athlete Vault rendered but Display Name input never became usable')

    await input.fill('QA Athlete')
    const filled = await input.inputValue().catch(() => '')
    if (filled !== 'QA Athlete') throw new Error(`First-run Athlete Vault Display Name did not retain QA value: ${filled || 'empty'}`)

    await create.waitFor({ state:'visible', timeout:5000 })
    for (let attempt=0;attempt<20 && !(await create.isEnabled().catch(() => false));attempt+=1) {
      await page.waitForTimeout(120)
    }
    if (!(await create.isEnabled().catch(() => false))) throw new Error('First-run Athlete Vault Create Local Athlete remained disabled after valid Display Name')

    await create.click({ timeout:5000 })
    const completed = await page.waitForFunction(() => (
      Boolean(document.querySelector('.lmf-home-command-v4')) ||
      !/CREATE LOCAL ATHLETE/i.test(document.body.innerText)
    ), null, { timeout:12000 }).then(() => true).catch(() => false)
    if (!completed) throw new Error('First-run Athlete Vault did not complete after valid QA athlete creation')
    await page.waitForTimeout(500)
    return
  }
  throw new Error('First-run Athlete Vault or Home did not become available during bootstrap window')
}

try {
  await page.goto('http://127.0.0.1:4173/#/home', { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForSelector('body', { timeout:10000 })
  await bootstrapAthlete()
  await page.evaluate(() => { location.hash = '#/home' })
  await page.waitForSelector('.lmf-home-command-v4', { state:'visible', timeout:15000 })
  await page.waitForSelector('.lmf-home-option1-progress', { state:'visible', timeout:15000 })
  await page.waitForSelector('.lmf-home-option1-performance-summary', { state:'visible', timeout:15000 })
  await page.waitForTimeout(600)
  await dismissOptionalInstall()

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector)
      if (!(el instanceof HTMLElement)) return null
      const r = el.getBoundingClientRect()
      return { x:r.x, y:r.y, width:r.width, height:r.height }
    }
    const style = (selector) => {
      const el = document.querySelector(selector)
      if (!(el instanceof HTMLElement)) return null
      const s = getComputedStyle(el)
      return { backgroundImage:s.backgroundImage, gridTemplateColumns:s.gridTemplateColumns, display:s.display }
    }
    const pseudoStyle = (selector, pseudo) => {
      const el = document.querySelector(selector)
      if (!(el instanceof HTMLElement)) return null
      const s = getComputedStyle(el, pseudo)
      return { backgroundImage:s.backgroundImage, opacity:s.opacity, filter:s.filter }
    }
    const performanceSummaryEl = document.querySelector('.lmf-home-option1-performance-summary')
    const performanceSourceEl = document.querySelector('[data-lmf-performance]')
    return {
      hero:rect('.lmf-home-option1-hero'),
      greeting:rect('.lmf-home-v4-greeting'),
      heroStyle:style('.lmf-home-option1-hero'),
      greetingStyle:style('.lmf-home-v4-greeting'),
      sharedHero:Boolean(document.querySelector('.lmf-home-option1-hero .lmf-home-v4-greeting') && document.querySelector('.lmf-home-option1-hero .lmf-home-v4-command')),
      startCount:document.querySelectorAll('.lmf-home-option1-hero [data-lmf-start]').length,
      command:rect('.lmf-home-v4-command'),
      commandMark:rect('.lmf-home-v4-command-mark'),
      commandStyle:style('.lmf-home-v4-command'),
      fenrirStyle:pseudoStyle('.lmf-home-v4-command-mark','::before'),
      start:rect('.lmf-home-v4-start'),
      progress:rect('.lmf-home-option1-progress'),
      alert:rect('.lmf-home-option1-alert'),
      readiness:rect('.lmf-home-v4-readiness'),
      performance:rect('.lmf-home-v4-performance'),
      performanceSummary:rect('.lmf-home-option1-performance-summary'),
      performanceSummaryText:performanceSummaryEl?.textContent?.replace(/\s+/g,' ').trim() || '',
      performanceSourceDisplay:performanceSourceEl instanceof HTMLElement ? getComputedStyle(performanceSourceEl).display : null,
      milestone:rect('.lmf-home-v4-milestone'),
      coach:rect('.lmf-home-v4-coach'),
      gridStyle:style('.lmf-home-v4-grid'),
      progressMounts:document.querySelectorAll('#lmf-progress-dashboard-v1').length,
      bodyWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      hasCommandMark:Boolean(document.querySelector('.lmf-home-v4-command-mark')),
      hasStats:document.querySelectorAll('.lmf-home-v4-stats > div').length,
    }
  })
  report.layout = layout

  check(Boolean(layout.hero) && layout.sharedHero, 'Greeting and workout share one cinematic hero')
  check((layout.hero?.height || 0) >= 380, 'Combined hero has room for the greeting and workout', `${Math.round(layout.hero?.height || 0)}px`)
  check(layout.heroStyle?.backgroundImage?.includes('home-mountain-cinematic-v2.webp') && layout.greetingStyle?.backgroundImage === 'none' && !layout.commandStyle?.backgroundImage?.includes('home-mountain'), 'One continuous mountain backdrop replaces the separate banners', layout.heroStyle?.backgroundImage || 'missing')
  check(layout.hasCommandMark, 'Command hero preserves wolf/brand identity layer')
  check((layout.commandMark?.width || 0) >= 285, 'Fenrir mobile stage keeps the face inside the hero', `${Math.round(layout.commandMark?.width || 0)}px`)
  check(layout.fenrirStyle?.backgroundImage?.includes('fenrir.webp'), 'Command hero uses clean Fenrir artwork', layout.fenrirStyle?.backgroundImage || 'missing')
  check(Number(layout.fenrirStyle?.opacity || 0) >= .75, 'Fenrir art remains visibly weighted on mobile', `opacity=${layout.fenrirStyle?.opacity || 'missing'}`)
  check(Boolean(layout.progress), 'Workout progress bar is present')
  check(Boolean(layout.start) && (layout.start?.width || 0) >= 300, 'Start Workout remains a dominant mobile action', `${Math.round(layout.start?.width || 0)}px`)
  check(layout.startCount === 1 && layout.start?.y >= (layout.command?.y || 0) + (layout.command?.height || 0) && layout.start?.y + layout.start?.height <= layout.hero?.y + layout.hero?.height, 'Single mobile Start control sits below workout details inside the combined hero')
  check(Boolean(layout.alert), 'Compact header utility control is present')

  const { readiness, performance, milestone, coach } = layout
  const four = [readiness,performance,milestone,coach].every(Boolean)
  check(four, 'Four coaching-intelligence cards are present')
  if (four) {
    check(Math.abs(readiness.y - performance.y) < 4, 'Readiness and Recent Performance share row one')
    check(performance.x > readiness.x + 20, 'Row one is two columns')
    check(Math.abs(milestone.y - coach.y) < 4, 'Next Milestone and Coach Insight share row two')
    check(coach.x > milestone.x + 20, 'Row two is two columns')
    check(milestone.y > readiness.y + readiness.height - 2, 'Intelligence grid has two stacked rows')
  }
  check(Boolean(layout.performanceSummary), 'Recent Performance uses compact presentation')
  check(layout.performanceSourceDisplay === 'none', 'Raw Recent Performance source is presentation-hidden', `display=${layout.performanceSourceDisplay || 'missing'}`)
  check(Boolean(layout.performanceSummaryText) && !/(ProgramCrownforge|PositionW\d|WorkoutNot)/i.test(layout.performanceSummaryText), 'Recent Performance avoids raw field collisions', layout.performanceSummaryText || 'missing')
  check(layout.hasStats === 4, 'Athlete metrics rail keeps four metrics', `count=${layout.hasStats}`)
  check(layout.progressMounts === 0, 'Home remains isolated from Progress dashboard', `progress mounts=${layout.progressMounts}`)
  check(layout.bodyWidth <= layout.viewportWidth + 1, 'Option 1 Home has no horizontal overflow', `${layout.bodyWidth}px / ${layout.viewportWidth}px`)

  // A ready, unstarted current session must not erase completed history. Seed
  // only this disposable CI athlete; the production account is never touched.
  await page.waitForFunction(() => document.querySelector('[data-stat="workouts"]')?.textContent === '0' && document.querySelector('.lmf-home-option1-performance-summary')?.textContent.includes('No completed workout yet'))
  check((await page.locator('.lmf-home-option1-performance-summary').innerText()).includes('No completed workout yet'), 'Empty history has a genuine empty state')
  const historyBefore = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('letmefly-private')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const athlete = await new Promise((resolve, reject) => {
        const request = db.transaction('athletes', 'readonly').objectStore('athletes').getAll()
        request.onsuccess = () => resolve(request.result.find(row => !row.deleted_at))
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('workoutSessions', 'readwrite')
        tx.oncomplete = resolve
        tx.onerror = tx.onabort = () => reject(tx.error)
        for (const [id, name, date, extra] of [
          ['home-history-1', 'Earlier completed session', '2026-08-01T12:00:00Z', {}],
          ['home-history-2', 'Middle completed session', '2026-08-02T12:00:00Z', {}],
          ['home-history-3', 'Latest completed strength', '2026-08-03T12:00:00Z', {}],
          ['home-history-deleted', 'DELETED MUST NOT APPEAR', '2026-08-04T12:00:00Z', { deleted_at:'2026-08-04T13:00:00Z' }],
          ['home-history-foreign', 'FOREIGN MUST NOT APPEAR', '2026-08-05T12:00:00Z', { athlete_id:'another-athlete' }],
        ]) {
          tx.objectStore('workoutSessions').put({ id, athlete_id:athlete.id, program_key:'crownforge', week_number:1, day_key:'day-3', workout_name:name, status:'completed', completed_at:date, started_at:date, ...extra })
        }
      })
      return await new Promise((resolve, reject) => {
        const request = db.transaction('workoutSessions', 'readonly').objectStore('workoutSessions').getAll()
        request.onsuccess = () => resolve(JSON.stringify(request.result))
        request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  })
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('.lmf-home-option1-performance-summary')?.textContent.includes('Latest completed strength'))
  const historyText = await page.locator('.lmf-home-option1-performance-summary').innerText()
  check(await page.locator('[data-stat="workouts"]').innerText() === '3', 'Workout count excludes deleted and foreign sessions')
  check(historyText.includes('Latest completed strength') && !/not started|no completed|DELETED|FOREIGN/i.test(historyText), 'Recent Performance shows the latest owned completed workout', historyText)
  check(/Aug\s+3|3\s+Aug|08[\/-]03|03[\/-]08/.test(historyText), 'Recent Performance includes the completion date', historyText)
  check(/Week 1.*Day 3/.test(historyText), 'Recent Performance includes the saved program position', historyText)
  const historyAfter = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('letmefly-private'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      return await new Promise((resolve, reject) => { const request = db.transaction('workoutSessions', 'readonly').objectStore('workoutSessions').getAll(); request.onsuccess = () => resolve(JSON.stringify(request.result)); request.onerror = () => reject(request.error) })
    } finally { db.close() }
  })
  check(historyAfter === historyBefore, 'Home history presentation leaves saved workout rows unchanged')
  report.completedHistory = { text:historyText, workouts:3 }
  // The unified hero reparents the existing button. Verify its delegated
  // action still opens Train, then return Home to check remounting and capture.
  await dismissOptionalInstall()
  await page.locator('.lmf-home-option1-hero [data-lmf-start]').click()
  await page.waitForFunction(() => location.hash.startsWith('#/train'))
  check(true, 'Repositioned Start Workout preserves the Train action')
  await page.evaluate(() => { location.hash = '#/home' })
  await page.waitForSelector('.lmf-home-option1-hero', { state:'visible' })
  check(await page.locator('.lmf-home-option1-hero').count() === 1 && await page.locator('.lmf-home-option1-hero [data-lmf-start]').count() === 1, 'Home remount keeps one combined hero and one Start control')
} catch (error) {
  report.result = 'FAIL'
  report.error = error instanceof Error ? error.message : String(error)
  report.failures.push({ label:'Option 1 Home browser audit execution', detail:report.error })
  console.log(`FAIL  Option 1 Home browser audit execution — ${report.error}`)
} finally {
  await settleOptionalInstallForScreenshot().catch(() => null)
  await page.screenshot({ path:path.join(outDir, 'home-option1.png'), fullPage:true }).catch(() => null)
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}

if (report.failures.length) process.exit(1)
console.log('LetMeFly approved Option 1 Home browser audit: PASS')
