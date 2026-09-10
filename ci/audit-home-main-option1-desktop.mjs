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

const reportPath = path.join(outDir, 'desktop-report.json')
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
const context = await browser.newContext({ viewport:{ width:1536, height:960 }, deviceScaleFactor:1 })
const page = await context.newPage()

async function dismissInstall() {
  const button = page.getByRole('button', { name:/^Not now$/i }).first()
  if (await button.isVisible().catch(() => false)) {
    await button.click().catch(() => null)
    await page.waitForTimeout(140).catch(() => null)
  }
}

async function bootstrapAthlete() {
  // The desktop shell shares the same asynchronous local-vault bootstrap as
  // mobile. Give the real first-run control a deterministic CI window.
  for (let i=0;i<80;i+=1) {
    await dismissInstall()
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
    await page.waitForTimeout(160)
  }
}

try {
  await page.goto('http://127.0.0.1:4173/#/home', { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForSelector('body', { timeout:10000 })
  await bootstrapAthlete()
  await page.evaluate(() => { location.hash = '#/home' })
  await page.waitForFunction(() => document.documentElement.getAttribute('data-lmf-desktop-ui') === 'true', null, { timeout:15000 })
  await page.waitForSelector('.lmf-home-command-v4', { state:'visible', timeout:15000 })
  await page.waitForSelector('.lmf-home-option1-performance-summary', { state:'visible', timeout:15000 })
  await page.waitForTimeout(700)
  await dismissInstall()

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector)
      if (!(el instanceof HTMLElement)) return null
      const r = el.getBoundingClientRect()
      return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }
    }
    const display = (selector) => {
      const el = document.querySelector(selector)
      return el instanceof HTMLElement ? getComputedStyle(el).display : null
    }
    const position = (selector) => {
      const el = document.querySelector(selector)
      return el instanceof HTMLElement ? getComputedStyle(el).position : null
    }
    const readiness = rect('.lmf-home-v4-readiness')
    const performance = rect('.lmf-home-v4-performance')
    const milestone = rect('.lmf-home-v4-milestone')
    const coach = rect('.lmf-home-v4-coach')
    const source = document.querySelector('[data-lmf-performance]')
    const summary = document.querySelector('.lmf-home-option1-performance-summary')
    return {
      desktopFlag:document.documentElement.getAttribute('data-lmf-desktop-ui'),
      rail:rect('.navbar'),
      railPosition:position('.navbar'),
      desktopBrand:rect('.lmf-desktop-brand'),
      desktopBrandDisplay:display('.lmf-desktop-brand'),
      homeTopBrandDisplay:display('.lmf-home-brand-lockup'),
      home:rect('.lmf-home-reference-v3'),
      command:rect('.lmf-home-v4-command'),
      commandMark:rect('.lmf-home-v4-command-mark'),
      tools:rect('.lmf-home-option1-tools'),
      readiness,
      performance,
      milestone,
      coach,
      performanceSummary:rect('.lmf-home-option1-performance-summary'),
      performanceSummaryText:summary?.textContent?.replace(/\s+/g,' ').trim() || '',
      performanceSourceDisplay:source instanceof HTMLElement ? getComputedStyle(source).display : null,
      stats:document.querySelectorAll('.lmf-home-v4-stats > div').length,
      progressMounts:document.querySelectorAll('#lmf-progress-dashboard-v1').length,
      bodyWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
    }
  })
  report.layout = layout

  check(layout.desktopFlag === 'true', 'Option 3 desktop shell is active on Home')
  check(layout.railPosition === 'fixed' && (layout.rail?.width || 0) >= 175 && (layout.rail?.width || 0) <= 200, 'Desktop navigation remains the fixed Option 3 rail', `${Math.round(layout.rail?.width || 0)}px`)
  check(layout.desktopBrandDisplay !== 'none' && Boolean(layout.desktopBrand), 'Desktop rail keeps the LetMeFly brand')
  check(layout.homeTopBrandDisplay === 'none', 'Home avoids duplicate desktop wordmark', `top Home brand display=${layout.homeTopBrandDisplay || 'missing'}`)
  check(Boolean(layout.home) && (layout.home?.width || 0) >= 1080 && (layout.home?.width || 0) <= 1245, 'Home expands into the desktop work area', `${Math.round(layout.home?.width || 0)}px`)
  check(Boolean(layout.rail) && Boolean(layout.home) && layout.home.x >= layout.rail.right, 'Home content stays clear of the desktop rail', `${Math.round(layout.home?.x || 0)}px after rail ${Math.round(layout.rail?.right || 0)}px`)
  check(Boolean(layout.command) && (layout.command?.width || 0) >= 1000 && (layout.command?.height || 0) >= 420, 'Command hero scales as a desktop command surface', `${Math.round(layout.command?.width || 0)}×${Math.round(layout.command?.height || 0)}px`)
  check(Boolean(layout.commandMark) && (layout.commandMark?.width || 0) >= 430, 'Fenrir stage keeps desktop visual weight', `${Math.round(layout.commandMark?.width || 0)}px`)
  check(Boolean(layout.tools) && layout.tools.right >= layout.viewportWidth - 60, 'Home utilities align to the desktop header edge', `right=${Math.round(layout.tools?.right || 0)}px`)

  const four = [layout.readiness,layout.performance,layout.milestone,layout.coach].every(Boolean)
  check(four, 'Desktop Home keeps all four intelligence cards')
  if (four) {
    check(Math.abs(layout.readiness.y - layout.performance.y) < 4 && layout.performance.x > layout.readiness.x, 'Desktop Home preserves intelligence row one')
    check(Math.abs(layout.milestone.y - layout.coach.y) < 4 && layout.coach.x > layout.milestone.x, 'Desktop Home preserves intelligence row two')
  }
  check(Boolean(layout.performanceSummary) && layout.performanceSourceDisplay === 'none', 'Polished Recent Performance survives desktop integration', layout.performanceSummaryText || 'missing')
  check(layout.stats === 4, 'Desktop Home keeps four athlete metrics', `count=${layout.stats}`)
  check(layout.progressMounts === 0, 'Desktop Home remains isolated from Progress dashboard', `progress mounts=${layout.progressMounts}`)
  check(layout.bodyWidth <= layout.viewportWidth + 2, 'Desktop Home has no horizontal overflow', `${layout.bodyWidth}px / ${layout.viewportWidth}px`)
} catch (error) {
  report.result = 'FAIL'
  report.error = error instanceof Error ? error.message : String(error)
  report.failures.push({ label:'Desktop Option 1 Home audit execution', detail:report.error })
  console.log(`FAIL  Desktop Option 1 Home audit execution — ${report.error}`)
} finally {
  await page.addStyleTag({ content:'#lmf-install-banner{display:none!important}' }).catch(() => null)
  await page.locator('#lmf-install-banner').evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => null)
  await page.waitForTimeout(120).catch(() => null)
  await page.screenshot({ path:path.join(outDir, 'home-option1-desktop.png'), fullPage:true }).catch(() => null)
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}

if (report.failures.length) process.exit(1)
console.log('LetMeFly approved Option 1 Home desktop bridge audit: PASS')
