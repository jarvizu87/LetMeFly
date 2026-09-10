#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'DESKTOP_WORKSPACE_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result: 'PASS', failures: [], passes: [], observations: {} }
const pass = (label, detail = '') => { report.passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const fail = (label, detail = '') => { report.result = 'FAIL'; report.failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }

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
  return await candidate.click({ timeout: 2500 }).then(async () => {
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
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForFunction(() => /LETMEFLY/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)

  let create = null
  for (let i = 0; i < 20; i += 1) {
    await dismissInstall(page)
    create = await clickable(page, /^\s*CREATE LOCAL ATHLETE\s*$/i)
    if (create) break
    if (await clickable(page, /\bTRAIN\b/i)) break
    await page.waitForTimeout(160)
  }

  if (create) {
    const input = await firstVisible(page.locator('#onboard-name,input[type="text"],input:not([type])'))
    if (!input) throw new Error('Athlete name input missing')
    await input.fill(name)
    await dismissInstall(page)
    await create.click({ timeout: 5000 })
    await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)
    await page.waitForTimeout(450)
  }

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

async function startSyntheticWorkout(page) {
  if (await page.locator('.exercise-stack > .active-exercise').count()) return true

  const readiness = page.locator('.readiness-panel input[type="radio"][value="3"]')
  const readinessCount = await readiness.count()
  for (let i = 0; i < readinessCount; i += 1) {
    await readiness.nth(i).check({ force: true }).catch(() => null)
  }

  const start = await firstVisible(page.locator('button[data-action="start-workout"]'))
  if (!start) return false
  await start.click({ timeout: 5000 }).catch(() => null)
  await page.waitForTimeout(900)
  return (await page.locator('.exercise-stack > .active-exercise').count()) > 0
}

async function probeExerciseSection(page) {
  if (!(await page.locator('.exercise-stack > .active-exercise').count())) {
    await startSyntheticWorkout(page)
  }

  if (await page.locator('.lmf-desktop-flow-item').count()) return true
  const sectionButtons = page.locator('[data-session-step]')
  for (let i = 0; i < await sectionButtons.count(); i += 1) {
    const button = sectionButtons.nth(i)
    if (!(await button.isVisible().catch(() => false))) continue
    await button.click({ timeout: 3500 }).catch(() => null)
    await page.waitForTimeout(420)
    if (await page.locator('.lmf-desktop-flow-item').count()) return true
  }
  return false
}

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

try {
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
    return { position: style.position, left: style.left, width: nav.getBoundingClientRect().width, height: nav.getBoundingClientRect().height }
  })
  report.observations.desktopRail = rail
  if (rail && rail.position === 'fixed' && rail.width >= 155 && rail.width <= 205 && rail.height >= 850) pass('Desktop navigation rail', `${Math.round(rail.width)}×${Math.round(rail.height)}px fixed rail`)
  else fail('Desktop navigation rail', JSON.stringify(rail))

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
    const flowRect = flow?.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
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
    await desktop.waitForTimeout(250)
    const liveReuse = await desktop.evaluate(() => {
      const item = document.querySelector('.lmf-desktop-flow-item')
      const thumb = item?.querySelector('.lmf-desktop-flow-thumb')
      const shell = document.querySelector('[data-lmf-desktop-workspace="true"]')
      const card = shell?.querySelector('#swipe-viewport .active-exercise')
      const input = card?.querySelector('.load-input,.reps-input,.rpe-input')
      const media = card?.querySelector('.lmf-exercise-media')
      const art = card?.getAttribute('data-exercise-art') || thumb?.getAttribute('data-exercise-art') || ''
      const image = thumb instanceof HTMLElement ? getComputedStyle(thumb).backgroundImage : ''
      const toolLabels = [...document.querySelectorAll('.lmf-desktop-v2-tool')].map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      return {
        itemPresent: !!item,
        originalCardInsideCenter: !!card && !!card.closest('#swipe-viewport'),
        originalSetControlInsideCenter: !!input && !!input.closest('#swipe-viewport'),
        art,
        image,
        mediaHeight: media instanceof HTMLElement ? media.getBoundingClientRect().height : 0,
        v2Panel: !!document.querySelector('.lmf-desktop-context-panel-v2'),
        tabsVisible: !!document.querySelector('.lmf-desktop-context-tabs') && getComputedStyle(document.querySelector('.lmf-desktop-context-tabs')).display !== 'none',
        toolLabels,
      }
    })
    report.observations.liveReuse = liveReuse
    if (liveReuse.itemPresent && liveReuse.originalCardInsideCenter) pass('Workout Flow mirrors authoritative exercise cards')
    else fail('Workout Flow mirrors authoritative exercise cards', JSON.stringify(liveReuse))
    if (liveReuse.originalSetControlInsideCenter) pass('Original live set controls remain in center column')
    else fail('Original live set controls remain in center column', JSON.stringify(liveReuse))
    if (liveReuse.art || (liveReuse.image && liveReuse.image !== 'none')) pass('Desktop workspace reuses exercise artwork hook', liveReuse.art || 'resolved background image')
    else fail('Desktop workspace reuses exercise artwork hook', JSON.stringify(liveReuse))

    if (liveReuse.mediaHeight >= 120 && liveReuse.mediaHeight <= 195) pass('Desktop exercise artwork is compact', `${Math.round(liveReuse.mediaHeight)}px tall`)
    else fail('Desktop exercise artwork is compact', JSON.stringify(liveReuse))

    const toolText = liveReuse.toolLabels.join(' | ').toUpperCase()
    const requiredTools = ['WATCH EXERCISE', 'EXERCISE INFO', 'SUBSTITUTE', 'ASK COACH']
    const missingTools = requiredTools.filter((label) => !toolText.includes(label))
    if (liveReuse.v2Panel && !liveReuse.tabsVisible && !missingTools.length) pass('Option 3 live tool rail is populated', liveReuse.toolLabels.join(' | '))
    else fail('Option 3 live tool rail is populated', JSON.stringify({ v2Panel: liveReuse.v2Panel, tabsVisible: liveReuse.tabsVisible, toolLabels: liveReuse.toolLabels, missingTools }))
  } else {
    fail('Exercise-card desktop reuse probe', 'Synthetic workout could not reach an exercise section')
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
    v2Panel: !!document.querySelector('.lmf-desktop-context-panel-v2'),
    width: window.innerWidth,
  }))
  report.observations.mobileIsolation = mobileState
  if (!mobileState.desktopFlag && !mobileState.workspace && !mobileState.railBrand && !mobileState.v2Panel) pass('Mobile UI remains isolated from desktop layer', `${mobileState.width}px viewport`)
  else fail('Mobile UI remains isolated from desktop layer', JSON.stringify(mobileState))
  await mobileContext.close()
} catch (error) {
  fail('Desktop workspace audit execution', error instanceof Error ? error.message : String(error))
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (report.failures.length) process.exit(1)
