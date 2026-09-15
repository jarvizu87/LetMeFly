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
    await page.waitForTimeout(120)
    return true
  }).catch(() => false)
}

async function bootstrap(page, name) {
  await page.goto('http://127.0.0.1:4173/#/train', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForFunction(applicationBootState, null, { timeout: 20000 })
  await dismissInstall(page)

  const create = page.locator('[data-action="create-athlete"]')
  if (await create.count()) {
    await page.locator('#onboard-name').fill(name)
    await create.click({ timeout: 5000 })
    await create.waitFor({ state: 'detached', timeout: 10000 })
  }

  for (let i = 0; i < 5; i += 1) {
    await dismissInstall(page)
    await page.waitForTimeout(100)
  }

  const trainNav = await firstVisible(page.locator('.navbar .nav-item, nav button, nav a').filter({ hasText: /^\s*Train\s*$/i }))
  if (trainNav) await trainNav.click({ timeout: 5000 }).catch(() => null)

  await page.waitForFunction(() => document.documentElement.dataset.lmfApprovedRoute === 'train', null, { timeout: 10000 })
  await page.locator('.lmf-train-reference-final').waitFor({ state: 'visible', timeout: 10000 })
}

async function inspectApprovedDesktopTrain(page) {
  return await page.evaluate(() => {
    const train = document.querySelector('.lmf-train-reference-final')
    const workspace = train?.querySelector('[data-lmf-desktop-workspace="true"]')
    const viewport = train?.querySelector('#swipe-viewport')
    const flow = workspace?.querySelector('.lmf-desktop-flow-panel')
    const context = workspace?.querySelector('.lmf-desktop-context-panel')
    const hero = train?.querySelector('.lmf-reference-train-hero')
    const readiness = train?.querySelector('.lmf-reference-train-readiness')
    const rect = node => node instanceof HTMLElement ? node.getBoundingClientRect() : null
    const display = node => node instanceof HTMLElement ? getComputedStyle(node).display : null
    return {
      width: innerWidth,
      desktopFlag: document.documentElement.getAttribute('data-lmf-desktop-ui'),
      route: document.documentElement.dataset.lmfApprovedRoute || '',
      trainPresent: Boolean(train),
      heroPresent: Boolean(hero),
      readinessCount: readiness?.querySelectorAll(':scope > button').length || 0,
      workspacePresent: Boolean(workspace),
      workspaceDisplay: display(workspace),
      flowDisplay: display(flow),
      contextDisplay: display(context),
      workspaceRect: rect(workspace),
      viewportRect: rect(viewport),
      trainRect: rect(train),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })
}

async function openDay4(page) {
  const buttons = page.locator('.lmf-train-reference-final .day-strip button')
  const count = await buttons.count()
  if (count < 4) throw new Error(`Expected at least four governed day buttons; found ${count}`)

  let day4 = null
  for (let i = 0; i < count; i += 1) {
    const candidate = buttons.nth(i)
    const label = (await candidate.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    if (/\bD\s*4\b|\bDay\s*4\b/i.test(label)) {
      day4 = candidate
      break
    }
  }
  day4 ||= buttons.nth(3)
  const label = (await day4.innerText()).replace(/\s+/g, ' ').trim()
  await day4.click({ timeout: 5000 })
  await page.waitForTimeout(600)
  await page.waitForFunction(() => document.documentElement.classList.contains('lmf-preview-mode'), null, { timeout: 10000 })
  await page.locator('.lmf-train-reference-final .preview-card[data-exercise-art]').first().waitFor({ state: 'visible', timeout: 10000 })
  return label
}

async function inspectDay4(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.lmf-train-reference-final .preview-card[data-exercise-art]')
    if (!(card instanceof HTMLElement)) return null
    const media = card.querySelector(':scope > .lmf-exercise-media')
    const title = card.querySelector(':scope > .exercise-title')
    const actions = card.querySelector(':scope > .exercise-actions')
    const prescription = card.querySelector(':scope > .prescription-block')
    const summary = card.querySelector(':scope > .lmf-reference-preview-summary')
    const visible = node => node instanceof HTMLElement && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0
    const style = getComputedStyle(card)
    return {
      cardDisplay: style.display,
      columns: style.gridTemplateColumns,
      mediaVisible: visible(media),
      titleVisible: visible(title),
      actionsVisible: visible(actions),
      prescriptionVisible: visible(prescription),
      summaryHidden: !visible(summary),
      previewMode: document.documentElement.classList.contains('lmf-preview-mode'),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }
  })
}

let browser = null
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: chromeBin,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const desktopContext = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  })
  const desktop = await desktopContext.newPage()
  await bootstrap(desktop, 'Desktop Locked Mockup QA')

  const state = await inspectApprovedDesktopTrain(desktop)
  report.observations.desktopTrain = state

  if (state.desktopFlag === 'true' && state.route === 'train') pass('Desktop breakpoint and Train route activation', '1536px')
  else fail('Desktop breakpoint and Train route activation', JSON.stringify(state))

  if (state.trainPresent && state.heroPresent && state.readinessCount === 4) pass('Approved Train mockup owns desktop route', 'hero + four readiness controls')
  else fail('Approved Train mockup owns desktop route', JSON.stringify(state))

  if (!state.workspacePresent || (state.workspaceDisplay !== 'grid' && state.flowDisplay === 'none' && state.contextDisplay === 'none')) {
    pass('Legacy Option 3 workspace no longer owns Train', state.workspacePresent ? 'wrapper neutralized; side panels hidden' : 'wrapper absent')
  } else {
    fail('Legacy Option 3 workspace no longer owns Train', JSON.stringify(state))
  }

  const viewportFullWidth = state.viewportRect && state.trainRect
    ? state.viewportRect.width >= state.trainRect.width * 0.94
    : false
  if (viewportFullWidth) pass('Authoritative workout viewport uses approved desktop width', `${Math.round(state.viewportRect.width)}px`)
  else fail('Authoritative workout viewport uses approved desktop width', JSON.stringify({ viewport: state.viewportRect, train: state.trainRect }))

  if (state.scrollWidth <= state.innerWidth + 2) pass('Desktop Train has no horizontal page overflow', `${state.scrollWidth}/${state.innerWidth}px`)
  else fail('Desktop Train has no horizontal page overflow', `${state.scrollWidth}/${state.innerWidth}px`)

  await desktop.screenshot({ path: path.join(outDir, 'desktop-train-approved.png'), fullPage: true })

  const day4Label = await openDay4(desktop)
  const day4 = await inspectDay4(desktop)
  report.observations.day4 = { label: day4Label, ...day4 }

  if (day4?.previewMode) pass('Day 4 uses governed read-only preview mode', day4Label)
  else fail('Day 4 uses governed read-only preview mode', JSON.stringify(day4))

  if (day4 && day4.cardDisplay === 'grid' && day4.columns && day4.columns !== 'none') {
    pass('Day 4 uses premium desktop exercise-card hierarchy', day4.columns)
  } else {
    fail('Day 4 uses premium desktop exercise-card hierarchy', JSON.stringify(day4))
  }

  if (day4?.mediaVisible && day4.titleVisible && day4.actionsVisible && day4.prescriptionVisible && day4.summaryHidden) {
    pass('Day 4 full-card content is visible', 'exercise art + title + actions + prescription')
  } else {
    fail('Day 4 full-card content is visible', JSON.stringify(day4))
  }

  if ((day4?.overflow || 0) <= 2) pass('Day 4 has no horizontal page overflow')
  else fail('Day 4 has no horizontal page overflow', String(day4?.overflow))

  await desktop.screenshot({ path: path.join(outDir, 'desktop-day4-approved.png'), fullPage: true })
  await desktopContext.close()

  const mobileContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  })
  const mobile = await mobileContext.newPage()
  await bootstrap(mobile, 'Mobile Isolation QA')
  const mobileState = await mobile.evaluate(() => ({
    width: innerWidth,
    desktopFlag: document.documentElement.getAttribute('data-lmf-desktop-ui'),
    workspace: Boolean(document.querySelector('[data-lmf-desktop-workspace="true"]')),
    hero: Boolean(document.querySelector('.lmf-train-reference-final .lmf-reference-train-hero')),
    readiness: document.querySelectorAll('.lmf-train-reference-final .lmf-reference-train-readiness > button').length,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }))
  report.observations.mobileIsolation = mobileState

  if (!mobileState.desktopFlag && !mobileState.workspace && mobileState.hero && mobileState.readiness === 4) {
    pass('Phone Train UI remains isolated and unchanged', `${mobileState.width}px`) 
  } else {
    fail('Phone Train UI remains isolated and unchanged', JSON.stringify(mobileState))
  }
  if (mobileState.overflow <= 2) pass('Phone Train retains no horizontal overflow')
  else fail('Phone Train retains no horizontal overflow', String(mobileState.overflow))

  await mobileContext.close()
} catch (error) {
  fail('Desktop locked-mockup audit execution', error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close().catch(() => null)
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
}

if (report.failures.length) process.exit(1)
