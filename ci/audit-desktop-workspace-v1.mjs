#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { applicationBootState } from './browser-boot-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'DESKTOP_WORKSPACE_AUDIT')
fs.mkdirSync(outDir, { recursive: true })

const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result: 'PASS', failures: [], passes: [], observations: {} }
const pass = (label, detail = '') => {
  report.passes.push({ label, detail })
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}
const fail = (label, detail = '') => {
  report.result = 'FAIL'
  report.failures.push({ label, detail })
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function launchBrowser() {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const browser = await chromium.launch({
        headless: true,
        executablePath: chromeBin,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      })
      report.observations.browserLaunchAttempt = attempt
      return browser
    } catch (error) {
      lastError = error
      console.warn(`Desktop audit Chromium launch attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`)
      if (attempt < 3) await sleep(attempt * 900)
    }
  }
  throw lastError || new Error('Desktop audit Chromium launch failed')
}

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function dismissInstall(page) {
  const candidate = await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }))
  if (!candidate) return false
  return candidate.click({ timeout: 2500 }).then(async () => {
    await page.waitForTimeout(140)
    return true
  }).catch(() => false)
}

async function clickable(page, pattern) {
  return await firstVisible(page.locator('nav button,nav a,nav [role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
}

async function bootstrap(page, name) {
  // This audit owns the Train workspace. Enter that native route directly;
  // Home is independently mounted and is covered by its own browser audit.
  await page.goto('http://127.0.0.1:4173/#/train', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForFunction(applicationBootState, null, { timeout: 20000 })
  await dismissInstall(page)
  const create = page.locator('[data-action="create-athlete"]')
  await page.locator('#onboard-name').fill(name)
  await create.click({ timeout: 5000 })
  await create.waitFor({ state: 'detached', timeout: 10000 })

  // A dismissed form or a navigation link alone cannot prove onboarding.
  // Read the record written by the actual button handler; never seed a fixture.
  const savedNames = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('letmefly-private')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const records = await new Promise((resolve, reject) => {
        const request = db.transaction('athletes', 'readonly').objectStore('athletes').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return records.filter(record => !record.deleted_at).map(record => record.display_name)
    } finally { db.close() }
  })
  if (savedNames.length !== 1 || savedNames[0] !== name) {
    throw new Error('Native onboarding did not persist the requested disposable athlete')
  }
  await page.waitForFunction(() => !document.querySelector('[data-action="create-athlete"]')
    && Boolean(document.querySelector('#swipe-viewport .swipe-page h2')?.textContent?.trim()), null, { timeout: 10000 })
  for (let i = 0; i < 6; i += 1) {
    await dismissInstall(page)
    await page.waitForTimeout(140)
  }
}

async function enterTrain(page) {
  const train = await clickable(page, /\bTRAIN\b/i)
  if (!train) throw new Error('Train navigation missing')
  await train.click({ timeout: 5000 })
  await page.waitForTimeout(650)
  await dismissInstall(page)
  await page.waitForSelector('#swipe-viewport', { timeout: 8000 })
}

async function probeExerciseSection(page) {
  // Complete readiness and start a real governed W1D1 workout, rather than
  // reporting an exercise-reuse pass when only a preview was available.
  const readiness = page.locator('.swipe-page.active-page .readiness-field input[type="radio"][value="3"]')
  if (await readiness.count() < 4) throw new Error('Native readiness choices missing')
  for (const input of await readiness.all()) {
    await input.locator('..').click({ timeout: 5000 })
    if (!(await input.isChecked())) throw new Error('Native readiness label did not select its input')
  }
  await dismissInstall(page)
  await page.locator('.swipe-page.active-page [data-action="start-workout"]').click({ timeout: 5000 })
  await page.waitForSelector('.exercise-stack > .active-exercise', { state: 'attached', timeout: 10000 })
  await page.locator('[data-session-index="2"]').click({ timeout: 5000 })
  await page.waitForFunction(() => /Main Strength Circuit/i.test(
    document.querySelector('.swipe-page.active-page .workout-panel-head h2')?.textContent || ''), null, { timeout: 10000 })
  await page.waitForSelector('.lmf-desktop-flow-item', { timeout: 10000 })
  await page.waitForTimeout(1250)
  return true
}

let browser = null
let currentPage = null
try {
  browser = await launchBrowser()

  // Audit this build directly. The PWA controllerchange handler reloads on first
  // install and can replace the onboarding form between fill() and click().
  // Match the polish audit's isolation; keep native creation and DB verification.
  const desktopContext = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
  const desktop = await desktopContext.newPage()
  currentPage = desktop
  await bootstrap(desktop, 'Desktop QA Athlete')

  const desktopFlag = await desktop.locator('html').getAttribute('data-lmf-desktop-ui')
  if (desktopFlag === 'true') pass('Desktop breakpoint activation', '1536px viewport')
  else fail('Desktop breakpoint activation', `data-lmf-desktop-ui=${desktopFlag}`)

  const rail = await desktop.evaluate(() => {
    const nav = document.querySelector('.navbar')
    if (!(nav instanceof HTMLElement)) return null
    const style = getComputedStyle(nav)
    const rect = nav.getBoundingClientRect()
    return { position: style.position, left: style.left, width: rect.width, height: rect.height }
  })
  report.observations.desktopRail = rail
  if (rail && rail.position === 'fixed' && rail.width >= 155 && rail.width <= 205 && rail.height >= 850) {
    pass('Desktop navigation rail', `${Math.round(rail.width)}×${Math.round(rail.height)}px fixed rail`)
  } else {
    fail('Desktop navigation rail', JSON.stringify(rail))
  }

  if (await desktop.locator('.lmf-desktop-brand').isVisible().catch(() => false)) pass('Desktop LetMeFly brand reuse')
  else fail('Desktop LetMeFly brand reuse', 'desktop rail brand missing')

  await enterTrain(desktop)
  await desktop.waitForSelector('[data-lmf-desktop-workspace="true"]', { timeout: 5000 })

  const workspace = await desktop.evaluate(() => {
    const shell = document.querySelector('[data-lmf-desktop-workspace="true"]')
    const viewport = document.querySelector('#swipe-viewport')
    const flow = document.querySelector('.lmf-desktop-flow-panel')
    const context = document.querySelector('.lmf-desktop-context-panel')
    if (!(shell instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return null
    const style = getComputedStyle(shell)
    const shellRect = shell.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    const flowRect = flow?.getBoundingClientRect()
    const contextRect = context?.getBoundingClientRect()
    return {
      display: style.display,
      columns: style.gridTemplateColumns,
      width: shellRect.width,
      left: shellRect.left,
      right: shellRect.right,
      flowWidth: flowRect?.width || 0,
      viewportWidth: viewportRect.width,
      contextWidth: contextRect?.width || 0,
      viewportDirectChild: viewport.parentElement === shell,
      order: flowRect && contextRect ? [flowRect.left, viewportRect.left, contextRect.left] : null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })
  report.observations.workspace = workspace

  if (workspace?.display === 'grid' && workspace.viewportDirectChild && workspace.order && workspace.order[0] < workspace.order[1] && workspace.order[1] < workspace.order[2]) {
    pass('Option 3 three-column Train workspace', workspace.columns)
  } else {
    fail('Option 3 three-column Train workspace', JSON.stringify(workspace))
  }

  const usableWidth = workspace ? workspace.innerWidth - (rail?.width || 0) : 0
  if (workspace && usableWidth > 0 && workspace.width >= usableWidth * .82) {
    pass('Desktop Train uses the browser work area', `${Math.round(workspace.width)}px / ${Math.round(usableWidth)}px usable`)
  } else {
    fail('Desktop Train uses the browser work area', JSON.stringify({ workspaceWidth: workspace?.width, usableWidth, railWidth: rail?.width, innerWidth: workspace?.innerWidth }))
  }

  if (workspace && workspace.flowWidth >= 220 && workspace.viewportWidth >= 500 && workspace.contextWidth >= 250) {
    pass('Desktop Train columns are materially desktop-sized', `${Math.round(workspace.flowWidth)} / ${Math.round(workspace.viewportWidth)} / ${Math.round(workspace.contextWidth)}px`)
  } else {
    fail('Desktop Train columns are materially desktop-sized', JSON.stringify(workspace))
  }

  if (workspace && workspace.scrollWidth <= workspace.innerWidth + 3) pass('Desktop page has no horizontal overflow', `${workspace.scrollWidth}/${workspace.innerWidth}px`)
  else fail('Desktop page has no horizontal overflow', JSON.stringify(workspace))

  const foundExercises = await probeExerciseSection(desktop)
  if (foundExercises) {
    const liveReuseHandle = await desktop.waitForFunction(() => {
      const item = document.querySelector('.lmf-desktop-flow-item')
      const thumb = item?.querySelector('.lmf-desktop-flow-thumb')
      const shell = document.querySelector('[data-lmf-desktop-workspace="true"]')
      const panel = shell?.querySelector('#swipe-viewport .swipe-page.active-page')
      if (!/Main Strength Circuit/i.test(panel?.querySelector('h2')?.textContent || '')) return false
      const cards = panel.querySelectorAll('.exercise-stack > .active-exercise')
      const items = document.querySelectorAll('.lmf-desktop-flow-item')
      if (!cards.length || items.length !== cards.length) return false
      const card = cards[0]
      const title = card.querySelector('.exercise-title h3')?.textContent.trim()
      if (!title || item?.querySelector('b')?.textContent.trim() !== title) return false
      const input = card?.querySelector('.load-input,.reps-input,.rpe-input')
      const art = card?.getAttribute('data-exercise-art') || thumb?.getAttribute('data-exercise-art') || ''
      const image = thumb instanceof HTMLElement ? getComputedStyle(thumb).backgroundImage : ''
      return {
        itemPresent: !!item,
        originalCardInsideCenter: !!card && !!card.closest('#swipe-viewport'),
        originalSetControlInsideCenter: !!input && !!input.closest('#swipe-viewport'),
        art,
        image,
      }
    }, null, { timeout: 10000 })
    const liveReuse = await liveReuseHandle.jsonValue()
    await liveReuseHandle.dispose()
    report.observations.liveReuse = liveReuse
    if (liveReuse.itemPresent && liveReuse.originalCardInsideCenter) pass('Workout Flow mirrors authoritative exercise cards')
    else fail('Workout Flow mirrors authoritative exercise cards', JSON.stringify(liveReuse))
    if (liveReuse.originalSetControlInsideCenter) pass('Original live set controls remain in center column')
    else fail('Original live set controls remain in center column', JSON.stringify(liveReuse))
    if (liveReuse.art || (liveReuse.image && liveReuse.image !== 'none')) pass('Desktop workspace reuses exercise artwork hook', liveReuse.art || 'resolved background image')
    else fail('Desktop workspace reuses exercise artwork hook', JSON.stringify(liveReuse))
  } else {
    fail('Exercise-card desktop reuse probe', 'Native workout could not reach its governed exercise section')
  }

  await desktop.screenshot({ path: path.join(outDir, 'desktop-train.png'), fullPage: true })
  await desktopContext.close()

  const mobileContext = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const mobile = await mobileContext.newPage()
  currentPage = mobile
  await bootstrap(mobile, 'Mobile QA Athlete')
  const mobileState = await mobile.evaluate(() => ({
    desktopFlag: document.documentElement.getAttribute('data-lmf-desktop-ui'),
    workspace: !!document.querySelector('[data-lmf-desktop-workspace="true"]'),
    railBrand: !!document.querySelector('.lmf-desktop-brand'),
    width: window.innerWidth,
  }))
  report.observations.mobileIsolation = mobileState
  if (!mobileState.desktopFlag && !mobileState.workspace && !mobileState.railBrand) pass('Mobile UI remains isolated from desktop layer', `${mobileState.width}px viewport`)
  else fail('Mobile UI remains isolated from desktop layer', JSON.stringify(mobileState))
  await mobileContext.close()
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    report.observations.failureSnapshot = await currentPage.evaluate(() => ({
      url: location.href, width: innerWidth, body: document.body.innerText.slice(0, 6000),
      athleteForm: Boolean(document.querySelector('[data-action="create-athlete"]')),
      trainViewport: Boolean(document.querySelector('#swipe-viewport')),
    })).catch(() => null)
    await currentPage.screenshot({ path: path.join(outDir, 'failure-viewport.png'), fullPage: false }).catch(() => null)
  }
  fail('Desktop workspace audit execution', error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close().catch(() => null)
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
}

if (report.failures.length) process.exit(1)
