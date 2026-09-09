#!/usr/bin/env node
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const browser = await chromium.launch({ headless:true, executablePath:chromeBin, args:['--no-sandbox','--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport:{ width:412, height:915 }, isMobile:true, hasTouch:true })
const page = await context.newPage()

async function dismissOptionalInstall() {
  const button = page.getByRole('button', { name:/^Not now$/i }).first()
  if (await button.isVisible().catch(() => false)) await button.click().catch(() => null)
}

async function bootstrapAthlete() {
  for (let i=0;i<18;i+=1) {
    await dismissOptionalInstall()
    const create = page.getByRole('button', { name:/CREATE LOCAL ATHLETE/i }).first()
    if (await create.isVisible().catch(() => false)) {
      const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
      const input = modal.locator('input[type="text"],input:not([type])').first()
      if (await input.isVisible().catch(() => false)) await input.fill('Home Polish QA Athlete')
      await create.click()
      await page.waitForTimeout(550)
      break
    }
    if (await page.locator('.lmf-home-command-v4').count()) break
    await page.waitForTimeout(180)
  }
  for (let i=0;i<6;i+=1) {
    await dismissOptionalInstall()
    await page.waitForTimeout(160)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  await page.goto('http://127.0.0.1:4173/#/home', { waitUntil:'domcontentloaded', timeout:20000 })
  await page.waitForSelector('body', { timeout:10000 })
  await bootstrapAthlete()
  await page.evaluate(() => { location.hash = '#/home' })
  await page.waitForSelector('.lmf-home-command-v4', { state:'visible', timeout:8000 })
  await page.waitForTimeout(700)
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
    }
  })

  assert(layout.meta && layout.focus, 'Home workout summary or Focus row missing')
  assert(layout.focus.width >= layout.meta.width * .94, `Focus row did not span mobile summary: ${layout.focus.width} vs ${layout.meta.width}`)
  assert(layout.focusText?.whiteSpace !== 'nowrap', `Focus text is still nowrap: ${layout.focusText?.whiteSpace}`)
  console.log(`PASS  Focus expands full width and wraps — ${Math.round(layout.focus.width)}px / ${Math.round(layout.meta.width)}px`)

  assert(layout.performance?.height >= 185, `Recent Performance remains cramped: ${layout.performance?.height}px`)
  if (layout.performanceItem) {
    assert(layout.performanceItem.whiteSpace === 'normal', `Recent Performance text does not wrap: ${layout.performanceItem.whiteSpace}`)
  }
  console.log(`PASS  Recent Performance has readable mobile space — ${Math.round(layout.performance?.height || 0)}px`)

  const boxes = layout.panels.map((entry) => entry.box)
  assert(boxes.every(Boolean), 'One or more Home intelligence panels are missing')
  for (let i=1;i<boxes.length;i+=1) {
    assert(Math.abs(boxes[i].x - boxes[0].x) < 3, `Home intelligence panel ${i} is not in the same mobile column`)
    assert(boxes[i].y > boxes[i-1].y + boxes[i-1].height - 2, `Home intelligence panel order overlaps or is not vertical at index ${i}`)
  }
  console.log('PASS  Home intelligence cards stack readiness → performance → milestone → coach')

  assert(layout.coach?.height >= 175, `Coach Insight remains too compressed: ${layout.coach?.height}px`)
  console.log(`PASS  Coach Insight has expanded mobile hierarchy — ${Math.round(layout.coach?.height || 0)}px`)

  assert(layout.stats.length === 4, `Expected four athlete snapshot cells, found ${layout.stats.length}`)
  const [s1,s2,s3,s4] = layout.stats
  assert(Math.abs(s1.y - s2.y) < 3, 'Athlete snapshot first row is not aligned')
  assert(Math.abs(s3.y - s4.y) < 3, 'Athlete snapshot second row is not aligned')
  assert(s2.x > s1.x + 20, 'Athlete snapshot did not form two columns')
  assert(s3.y > s1.y + 20, 'Athlete snapshot did not form two rows')
  assert(Math.abs(s1.x - s3.x) < 3 && Math.abs(s2.x - s4.x) < 3, 'Athlete snapshot 2x2 columns are misaligned')
  console.log('PASS  Athlete snapshot renders as a legible 2 × 2 mobile rail')

  assert(layout.progressMounts === 0, `Progress dashboard contaminated polished Home: ${layout.progressMounts} mount(s)`)
  console.log('PASS  Home polish preserves Progress route isolation')
  console.log('LetMeFly Home dashboard polish browser audit: PASS')
} finally {
  await browser.close()
}
