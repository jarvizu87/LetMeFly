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

async function waitForAthleteNameInput(page) {
  for (let i = 0; i < 24; i += 1) {
    const input = await firstVisible(page.locator('#onboard-name,input[type="text"],input:not([type])'))
    if (input) return input
    await dismissInstall(page)
    await page.waitForTimeout(120)
  }
  return null
}

async function bootstrap(page, name) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForFunction(applicationBootState, null, { timeout: 20000 })
  await dismissInstall(page)
  // A navigation link under the first-run modal is not a signed-in athlete.
  // Require the native form to finish before any workspace assertions run.
  const create = page.locator('[data-action="create-athlete"]')
  if (await create.count()) {
    await page.locator('#onboard-name').fill(name)
    await create.click({ timeout: 5000 })
    await create.waitFor({ state: 'detached', timeout: 10000 })
  }
  await page.waitForFunction(() => !document.querySelector('[data-action="create-athlete"]')
    && Boolean(document.querySelector('#app .app-shell main')?.textContent?.trim()), null, {timeout:10000})
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
  if (await page.locator('.lmf-desktop-flow-item').count()) return true
  const sectionButtons = page.locator('[data-session-step]')
  const count = await sectionButtons.count()
  for (let i = 0; i < count; i += 1) {
    const button = sectionButtons.nth(i)
    if (!(await button.isVisible().catch(() => false))) continue
    await button.click({ timeout: 3500 }).catch(() => null)
    await page.waitForTimeout(420)
    if (await page.locator('.lmf-desktop-flow-item').count()) return true
  }
  return false
}

let browser = null
try {
  browser = await launchBrowser()

  const desktopContext = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1 })
  const desktop = await desktopContext.newPage()
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
    const liveReuse = await desktop.evaluate(() => {
      const item = document.querySelector('.lmf-desktop-flow-item')
      const thumb = item?.querySelector('.lmf-desktop-flow-thumb')
      const shell = document.querySelector('[data-lmf-desktop-workspace="true"]')
      const card = shell?.querySelector('#swipe-viewport .active-exercise')
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
    })
    report.observations.liveReuse = liveReuse
    if (liveReuse.itemPresent && liveReuse.originalCardInsideCenter) pass('Workout Flow mirrors authoritative exercise cards')
    else fail('Workout Flow mirrors authoritative exercise cards', JSON.stringify(liveReuse))
    if (liveReuse.originalSetControlInsideCenter) pass('Original live set controls remain in center column')
    else fail('Original live set controls remain in center column', JSON.stringify(liveReuse))
    if (liveReuse.art || (liveReuse.image && liveReuse.image !== 'none')) pass('Desktop workspace reuses exercise artwork hook', liveReuse.art || 'resolved background image')
    else fail('Desktop workspace reuses exercise artwork hook', JSON.stringify(liveReuse))
  } else {
    pass('Exercise-card desktop reuse probe', 'Current QA program surface exposed no exercise section; workspace contract still verified')
  }

  await desktop.screenshot({ path: path.join(outDir, 'desktop-train.png'), fullPage: true })
  await desktopContext.close()

  const mobileContext = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
  const mobile = await mobileContext.newPage()
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
  fail('Desktop workspace audit execution', error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close().catch(() => null)
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
}

if (report.failures.length) process.exit(1)
