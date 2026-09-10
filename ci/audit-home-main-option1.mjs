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
  for (let i=0;i<20;i+=1) {
    await dismissOptionalInstall()
    const create = page.getByRole('button', { name:/CREATE LOCAL ATHLETE/i }).first()
    if (await create.isVisible().catch(() => false)) {
      const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
      const input = modal.locator('input[type="text"],input:not([type])').first()
      if (await input.isVisible().catch(() => false)) await input.fill('JP')
      await create.click()
      await page.waitForTimeout(500)
      break
    }
    if (await page.locator('.lmf-home-command-v4').count()) break
    await page.waitForTimeout(180)
  }
}

try {
  await page.goto('http://127.0.0.1:4173/#/home', { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForSelector('body', { timeout:10000 })
  await bootstrapAthlete()
  await page.evaluate(() => { location.hash = '#/home' })
  await page.waitForSelector('.lmf-home-command-v4', { state:'visible', timeout:8000 })
  await page.waitForSelector('.lmf-home-option1-progress', { state:'visible', timeout:8000 })
  await page.waitForSelector('.lmf-home-option1-performance-summary', { state:'visible', timeout:8000 })
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

  check(Boolean(layout.command), 'Cinematic command hero is present')
  check((layout.command?.height || 0) >= 380, 'Command hero has premium mobile depth', `${Math.round(layout.command?.height || 0)}px`)
  check(layout.commandStyle?.backgroundImage?.includes('home-mountain-foundation-v1.svg'), 'Command hero uses approved mountain artwork', layout.commandStyle?.backgroundImage || 'missing')
  check(layout.hasCommandMark, 'Command hero preserves wolf/brand identity layer')
  check((layout.commandMark?.width || 0) >= 285, 'Fenrir mobile stage keeps the face inside the hero', `${Math.round(layout.commandMark?.width || 0)}px`)
  check(layout.fenrirStyle?.backgroundImage?.includes('fenrir.webp'), 'Command hero uses clean Fenrir artwork', layout.fenrirStyle?.backgroundImage || 'missing')
  check(Number(layout.fenrirStyle?.opacity || 0) >= .75, 'Fenrir art remains visibly weighted on mobile', `opacity=${layout.fenrirStyle?.opacity || 'missing'}`)
  check(Boolean(layout.progress), 'Workout progress bar is present')
  check(Boolean(layout.start) && (layout.start?.width || 0) >= 300, 'Start Workout remains a dominant mobile action', `${Math.round(layout.start?.width || 0)}px`)
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