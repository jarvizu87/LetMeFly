#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'WORKOUT_MOBILE_SCROLL_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result: 'PASS', failures: [], passes: [], observations: {} }
const pass = (label, detail = '') => { report.passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const fail = (label, detail = '') => { report.result = 'FAIL'; report.failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }

async function visible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function dismissInstall(page) {
  const button = await visible(page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }))
  if (button) await button.click({ timeout: 2500 }).catch(() => null)
}

async function bootstrap(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForFunction(() => /LETMEFLY/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)
  for (let i = 0; i < 8; i += 1) { await dismissInstall(page); await page.waitForTimeout(120) }

  const create = await visible(page.locator('button,[role="button"]').filter({ hasText: /CREATE LOCAL ATHLETE/i }))
  if (create) {
    const input = await visible(page.locator('#onboard-name,input[type="text"],input:not([type])'))
    if (!input) throw new Error('Athlete name input missing')
    await input.fill('Scroll QA Athlete')
    await create.click({ timeout: 5000 })
    await page.waitForTimeout(500)
  }
  for (let i = 0; i < 5; i += 1) { await dismissInstall(page); await page.waitForTimeout(120) }

  const train = await visible(page.locator('nav button,nav a,button,a').filter({ hasText: /^\s*TRAIN\s*$/i }))
  if (!train) throw new Error('Train navigation missing')
  await train.click({ timeout: 5000 })
  await page.waitForSelector('#swipe-viewport .swipe-page', { timeout: 10000 })
  await page.waitForTimeout(500)
}

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const page = await context.newPage()

try {
  await bootstrap(page)

  const styles = await page.evaluate(() => {
    const viewport = document.querySelector('#swipe-viewport')
    const tabs = document.querySelector('.lmf-set-tabs')
    if (!(viewport instanceof HTMLElement)) return null
    const viewportStyle = getComputedStyle(viewport)
    const tabStyle = tabs instanceof HTMLElement ? getComputedStyle(tabs) : null
    return {
      overflowX: viewportStyle.overflowX,
      scrollSnapType: viewportStyle.scrollSnapType,
      meta: document.querySelector('.swipe-meta > span')?.textContent?.trim() || '',
      setTabsOverflowX: tabStyle?.overflowX || null,
      setTabsScrollSnapType: tabStyle?.scrollSnapType || null,
      pageCount: viewport.querySelectorAll(':scope > .swipe-page').length,
      initialLeft: viewport.scrollLeft,
      bodyHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }
  })
  report.observations.styles = styles
  if (!styles) throw new Error('Swipe viewport missing')

  if (styles.overflowX === 'hidden' && styles.scrollSnapType === 'none') {
    pass('Mobile section carousel direct swipe disabled', `overflow-x=${styles.overflowX}; snap=${styles.scrollSnapType}`)
  } else {
    fail('Mobile section carousel direct swipe disabled', `overflow-x=${styles.overflowX}; snap=${styles.scrollSnapType}`)
  }

  if (/Tap a section or use arrows/i.test(styles.meta)) pass('Mobile section navigation copy', styles.meta)
  else fail('Mobile section navigation copy', styles.meta || 'missing')

  const next = page.locator('[data-session-step="1"]').first()
  const before = await page.evaluate(() => ({
    left: document.querySelector('#swipe-viewport')?.scrollLeft || 0,
    active: [...document.querySelectorAll('#swipe-viewport > .swipe-page')].findIndex(node => node.classList.contains('active-page')),
  }))
  await next.click({ timeout: 5000 })
  await page.waitForTimeout(650)
  const after = await page.evaluate(() => ({
    left: document.querySelector('#swipe-viewport')?.scrollLeft || 0,
    active: [...document.querySelectorAll('#swipe-viewport > .swipe-page')].findIndex(node => node.classList.contains('active-page')),
    label: document.querySelector('#session-label')?.textContent?.trim() || '',
  }))
  report.observations.sectionNavigation = { before, after }
  if (after.active === 1 && after.left > before.left) pass('Section arrows retain programmatic navigation', `${after.label}; scrollLeft ${before.left} → ${after.left}`)
  else fail('Section arrows retain programmatic navigation', JSON.stringify({ before, after }))

  const vertical = await page.evaluate(() => {
    const viewport = document.querySelector('#swipe-viewport')
    if (!(viewport instanceof HTMLElement)) return null
    const leftBefore = viewport.scrollLeft
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const target = Math.min(max, Math.max(160, Math.round(max * 0.5)))
    window.scrollTo(0, target)
    return { leftBefore, target, max }
  })
  await page.waitForTimeout(250)
  const verticalAfter = await page.evaluate(() => ({
    y: window.scrollY,
    left: document.querySelector('#swipe-viewport')?.scrollLeft || 0,
  }))
  report.observations.verticalScroll = { ...vertical, ...verticalAfter }
  if (vertical && vertical.max > 0 && verticalAfter.y > 0 && Math.abs(verticalAfter.left - vertical.leftBefore) < 2) {
    pass('Vertical day scroll remains independent', `scrollY=${Math.round(verticalAfter.y)}; section scrollLeft stayed ${Math.round(verticalAfter.left)}`)
  } else {
    fail('Vertical day scroll remains independent', JSON.stringify({ vertical, verticalAfter }))
  }

  const setTabs = await page.evaluate(() => {
    const tabs = document.querySelector('.lmf-set-tabs')
    if (!(tabs instanceof HTMLElement)) return { present: false }
    const style = getComputedStyle(tabs)
    return {
      present: true,
      overflowX: style.overflowX,
      scrollSnapType: style.scrollSnapType,
      scrollWidth: tabs.scrollWidth,
      clientWidth: tabs.clientWidth,
    }
  })
  report.observations.setTabs = setTabs
  if (!setTabs.present || setTabs.overflowX === 'auto' || setTabs.overflowX === 'scroll') {
    pass('Exercise set-tab horizontal scrolling preserved', setTabs.present ? `overflow-x=${setTabs.overflowX}` : 'No multi-set tab strip in preview; CSS contract covered by installer')
  } else {
    fail('Exercise set-tab horizontal scrolling preserved', JSON.stringify(setTabs))
  }
} catch (error) {
  fail('Mobile workout scroll audit execution', error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => null)
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (report.failures.length) process.exit(1)
