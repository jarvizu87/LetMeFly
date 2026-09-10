#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'BROWSER_SMOKE_AUDIT', 'home-dashboard-polish')
fs.mkdirSync(outDir, { recursive:true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result:'PASS', failures:[], passes:[], layout:null, error:null }
const pass = (label, detail='') => {
  report.passes.push({ label, detail })
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}
const check = (condition, label, detail='') => {
  if (condition) { pass(label, detail); return true }
  report.result = 'FAIL'
  report.failures.push({ label, detail })
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  return false
}

const browser = await chromium.launch({ headless:true, executablePath:chromeBin, args:['--no-sandbox','--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport:{ width:412, height:915 }, isMobile:true, hasTouch:true })
const page = await context.newPage()

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i=0;i<count;i+=1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function dismissOptionalInstall() {
  const button = await firstVisible(page.getByRole('button', { name:/^Not now$/i }))
    || await firstVisible(page.locator('button').filter({ hasText:/^\s*Not now\s*$/i }))
  if (!button) return false
  await button.click({ timeout:2500 }).catch(() => null)
  await page.waitForTimeout(120)
  return true
}

async function bootstrapAthlete() {
  for (let i=0;i<24;i+=1) {
    await dismissOptionalInstall()

    if (await page.locator('.lmf-home-command-v4').count()) return

    const create = await firstVisible(page.getByRole('button', { name:/CREATE LOCAL ATHLETE/i }))
      || await firstVisible(page.locator('button').filter({ hasText:/CREATE LOCAL ATHLETE/i }))

    if (create) {
      const input = await firstVisible(page.locator('#onboard-name,input[type="text"],input:not([type])'))
      if (!input) throw new Error('Athlete name input missing while local-athlete modal is visible')
      await input.fill('Home Polish QA Athlete')
      await dismissOptionalInstall()
      await create.click({ timeout:5000 })
      await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout:8000 }).catch(() => null)
      await page.waitForTimeout(450)
      if (await page.locator('.lmf-home-command-v4').count()) return
    }

    await page.waitForTimeout(180)
  }

  throw new Error('Could not bootstrap local athlete before Home dashboard audit')
}

try {
  await page.goto('http://127.0.0.1:4173/#/home', { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForSelector('body', { timeout:10000 })
  await bootstrapAthlete()
  await page.evaluate(() => { location.hash = '#/home' })
  await page.waitForSelector('.lmf-home-command-v4', { state:'visible', timeout:8000 })
  await page.waitForTimeout(700)
  for (let i=0;i<4;i+=1) await dismissOptionalInstall()

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
      return {
        whiteSpace:s.whiteSpace,
        overflow:s.overflow,
        textOverflow:s.textOverflow,
        gridTemplateColumns:s.gridTemplateColumns,
        lineHeight:s.lineHeight,
      }
    }
    const stats = [...document.querySelectorAll('.lmf-home-v4-stats > div')].map((el) => {
      const r = el.getBoundingClientRect()
      return { x:r.x, y:r.y, width:r.width, height:r.height }
    })
    const panels = ['readiness','performance','milestone','coach'].map((name) => ({ name, box:rect(`.lmf-home-v4-${name}`) }))
    return {
      meta:rect('.lmf-home-v4-meta'),
      focus:rect('.lmf-home-v4-meta > div:nth-child(3)'),
      focusText:style('.lmf-home-v4-meta > div:nth-child(3) strong'),
      performance:rect('.lmf-home-v4-performance'),
      performanceItem:style('.lmf-home-v4-performance li'),
      coach:rect('.lmf-home-v4-coach'),
      grid:style('.lmf-home-v4-grid'),
      panels,
      stats,
      progressMounts:document.querySelectorAll('#lmf-progress-dashboard-v1').length,
      bodyWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
    }
  })
  report.layout = layout

  const metaReady = Boolean(layout.meta && layout.focus)
  check(metaReady, 'Home workout summary and Focus row present', JSON.stringify({ meta:layout.meta, focus:layout.focus }))
  if (metaReady) {
    check(layout.focus.width >= layout.meta.width * .94, 'Focus spans the mobile workout summary', `${Math.round(layout.focus.width)}px / ${Math.round(layout.meta.width)}px`)
    check(layout.focusText?.whiteSpace !== 'nowrap', 'Focus text wraps', `white-space=${layout.focusText?.whiteSpace || 'missing'}`)
  }

  check((layout.performance?.height || 0) >= 185, 'Recent Performance has readable mobile space', `${Math.round(layout.performance?.height || 0)}px`)
  if (layout.performanceItem) check(layout.performanceItem.whiteSpace === 'normal', 'Recent Performance text wraps', `white-space=${layout.performanceItem.whiteSpace}`)

  const boxes = layout.panels.map((entry) => entry.box)
  const allPanels = boxes.every(Boolean)
  check(allPanels, 'All Home intelligence panels are present', JSON.stringify(layout.panels))
  if (allPanels) {
    let sameColumn = true
    let verticalOrder = true
    for (let i=1;i<boxes.length;i+=1) {
      if (Math.abs(boxes[i].x - boxes[0].x) >= 3) sameColumn = false
      if (!(boxes[i].y > boxes[i-1].y + boxes[i-1].height - 2)) verticalOrder = false
    }
    check(sameColumn, 'Home intelligence cards share one mobile column', JSON.stringify(layout.panels))
    check(verticalOrder, 'Home cards stack readiness → performance → milestone → coach', JSON.stringify(layout.panels))
  }

  check((layout.coach?.height || 0) >= 175, 'Coach Insight has expanded mobile hierarchy', `${Math.round(layout.coach?.height || 0)}px`)

  const stats = layout.stats || []
  const fourStats = stats.length === 4
  check(fourStats, 'Athlete snapshot has four cells', `count=${stats.length}`)
  if (fourStats) {
    const [s1,s2,s3,s4] = stats
    check(Math.abs(s1.y - s2.y) < 3 && Math.abs(s3.y - s4.y) < 3, 'Athlete snapshot rows align', JSON.stringify(stats))
    check(s2.x > s1.x + 20 && s3.y > s1.y + 20, 'Athlete snapshot forms two columns and two rows', JSON.stringify(stats))
    check(Math.abs(s1.x - s3.x) < 3 && Math.abs(s2.x - s4.x) < 3, 'Athlete snapshot 2 × 2 columns align', JSON.stringify(stats))
  }

  check(layout.progressMounts === 0, 'Home polish preserves Progress route isolation', `progress mounts=${layout.progressMounts}`)
  check(layout.bodyWidth <= layout.viewportWidth + 1, 'Home polish introduces no horizontal page overflow', `${layout.bodyWidth}px / ${layout.viewportWidth}px`)
} catch (error) {
  report.result = 'FAIL'
  report.error = error instanceof Error ? error.message : String(error)
  report.failures.push({ label:'Home polish browser audit execution', detail:report.error })
  console.log(`FAIL  Home polish browser audit execution — ${report.error}`)
} finally {
  await page.screenshot({ path:path.join(outDir, 'home-polish.png'), fullPage:true }).catch(() => null)
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}

if (report.failures.length) process.exit(1)
console.log('LetMeFly Home dashboard polish browser audit: PASS')
