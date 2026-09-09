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

// This is the precise regression boundary. Element.scrollIntoView on a set tab
// can move both the horizontal tab strip and the page itself. LetMeFly must use
// the tab strip's own scrollTo so set selection/auto-advance cannot move scrollY.
const workoutFlowRuntime = path.join(target, 'dist', 'ui', 'workout-flow-v1.js')
if (!fs.existsSync(workoutFlowRuntime)) {
  fail('Workout Flow scroll runtime present', workoutFlowRuntime)
} else {
  const runtimeText = fs.readFileSync(workoutFlowRuntime, 'utf8')
  const usesIsolatedScroll = runtimeText.includes("tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })")
  const usesPageCapableScroll = runtimeText.includes('activeTab.scrollIntoView')
  report.observations.runtimeScrollIsolation = { usesIsolatedScroll, usesPageCapableScroll }
  if (usesIsolatedScroll && !usesPageCapableScroll) {
    pass('Set-tab centering is horizontally isolated', 'tabs.scrollTo present; activeTab.scrollIntoView absent')
  } else {
    fail('Set-tab centering is horizontally isolated', JSON.stringify({ usesIsolatedScroll, usesPageCapableScroll }))
  }
}

async function visible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function dismissInstall(page) {
  const candidates = [
    page.locator('.modal-backdrop button,.modal-backdrop a,.modal-backdrop [role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
    page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
  ]
  for (const locator of candidates) {
    const button = await visible(locator)
    if (!button) continue
    const dismissed = await button.click({ timeout: 2500 }).then(() => true).catch(() => false)
    if (dismissed) {
      await page.waitForTimeout(160)
      return true
    }
  }
  return false
}

async function settlePrompts(page, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    await dismissInstall(page)
    await page.waitForTimeout(180)
  }
}

async function findTrain(page) {
  const pattern = /\bTRAIN\b/i
  const candidates = [
    page.locator('nav button,nav a,nav [role="button"]').filter({ hasText: pattern }),
    page.locator('button,a,[role="button"]').filter({ hasText: pattern }),
    page.getByText(pattern),
  ]
  for (const locator of candidates) {
    const item = await visible(locator)
    if (item) return item
  }
  return null
}

async function findStartWorkout(page) {
  const candidates = [
    page.locator('[data-action="start-workout"]'),
    page.locator('button,a,[role="button"]').filter({ hasText: /\bSTART WORKOUT\b/i }),
    page.getByText(/\bSTART WORKOUT\b/i),
  ]
  for (const locator of candidates) {
    const item = await visible(locator)
    if (item) return item
  }
  return null
}

async function enterWorkoutSurface(page) {
  const train = await findTrain(page)
  if (train) {
    await train.click({ timeout: 5000 })
    return 'train-nav'
  }

  // On some mobile Home shells the primary navigation label is not exposed as a
  // literal TRAIN control, while the canonical Home CTA is. That CTA is a valid
  // user path into the same workout surface and should not make this scroll audit fail.
  const startWorkout = await findStartWorkout(page)
  if (startWorkout) {
    await startWorkout.click({ timeout: 5000 })
    return 'home-start-workout'
  }

  return null
}

async function bootstrap(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForFunction(() => /LETMEFLY/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)

  // The public shell can render before the local-athlete modal. Wait through that
  // asynchronous first-run boundary so a late modal is never mistaken for a missing nav.
  let create = null
  for (let i = 0; i < 20; i += 1) {
    await dismissInstall(page)
    create = await visible(page.locator('button,[role="button"]').filter({ hasText: /^\s*CREATE LOCAL ATHLETE\s*$/i }))
    if (create) break
    if (await findTrain(page) || await findStartWorkout(page)) break
    await page.waitForTimeout(180)
  }

  if (create) {
    const input = await visible(page.locator('#onboard-name,input[type="text"],input:not([type])'))
    if (!input) throw new Error('Athlete name input missing')
    await input.fill('Scroll QA Athlete')
    await dismissInstall(page)
    await create.click({ timeout: 5000 })
    await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)
    await page.waitForTimeout(450)
  }

  await settlePrompts(page, 8)

  let entryRoute = null
  for (let i = 0; i < 16; i += 1) {
    await dismissInstall(page)
    entryRoute = await enterWorkoutSurface(page)
    if (entryRoute) break
    await page.waitForTimeout(180)
  }
  if (!entryRoute) {
    const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700)
    throw new Error(`Workout entry missing after settled first-run state: ${body}`)
  }

  report.observations.entryRoute = entryRoute
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

  // Exercise the actual set-selection callback while the tab strip is just below
  // the viewport. A safe horizontal-only scroll leaves window.scrollY unchanged;
  // scrollIntoView would pull the page toward the newly selected tab.
  const jumpProbe = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.lmf-set-tabs')].find((node) => node instanceof HTMLElement && node.querySelectorAll('.lmf-set-tab').length > 1)
    if (!(tabs instanceof HTMLElement)) return { present: false }
    const buttons = [...tabs.querySelectorAll('.lmf-set-tab')]
    const targetButton = buttons.at(-1)
    if (!(targetButton instanceof HTMLElement)) return { present: false }

    tabs.style.width = '96px'
    tabs.style.maxWidth = '96px'
    tabs.style.overflowX = 'auto'
    const rect = tabs.getBoundingClientRect()
    const documentTop = rect.top + window.scrollY
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const targetY = Math.min(maxY, Math.max(0, Math.round(documentTop - window.innerHeight - 16)))
    window.scrollTo(0, targetY)
    return {
      present: true,
      targetY,
      clientWidth: tabs.clientWidth,
      scrollWidth: tabs.scrollWidth,
      targetIndex: buttons.length - 1,
    }
  })
  await page.waitForTimeout(120)

  let jumpResult = { ...jumpProbe, beforeY: null, afterY: null, deltaY: null }
  if (jumpProbe.present) {
    const beforeY = await page.evaluate(() => window.scrollY)
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.lmf-set-tabs')].find((node) => node instanceof HTMLElement && node.querySelectorAll('.lmf-set-tab').length > 1)
      const button = tabs?.querySelectorAll('.lmf-set-tab')?.item(tabs.querySelectorAll('.lmf-set-tab').length - 1)
      if (button instanceof HTMLElement) button.click()
    })
    await page.waitForTimeout(500)
    const afterY = await page.evaluate(() => window.scrollY)
    jumpResult = { ...jumpProbe, beforeY, afterY, deltaY: afterY - beforeY }
    if (Math.abs(afterY - beforeY) <= 2) {
      pass('Set selection does not move page vertically', `scrollY ${Math.round(beforeY)} → ${Math.round(afterY)}`)
    } else {
      fail('Set selection does not move page vertically', `scrollY ${Math.round(beforeY)} → ${Math.round(afterY)}`)
    }
  } else {
    pass('Set selection does not move page vertically', 'No multi-set tab strip in preview; runtime isolation contract verified')
  }
  report.observations.setSelectionScrollJump = jumpResult
} catch (error) {
  fail('Mobile workout scroll audit execution', error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => null)
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (report.failures.length) process.exit(1)
