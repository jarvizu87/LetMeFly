#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const outDir = path.join(target, 'WORKOUT_DAY3_FIDELITY_AUDIT')
fs.mkdirSync(outDir, { recursive: true })
const requireFromTarget = createRequire(path.join(target, 'package.json'))
const { chromium } = requireFromTarget('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = { result: 'PASS', failures: [], passes: [], observations: {} }
const pass = (label, detail = '') => { report.passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const fail = (label, detail = '') => { report.result = 'FAIL'; report.failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
const esc = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function optionalInstallDismiss(page) {
  const candidates = [
    page.locator('.modal-backdrop button,.modal-backdrop a,.modal-backdrop [role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
    page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }),
  ]
  for (const locator of candidates) {
    const button = await firstVisible(locator)
    if (!button) continue
    const modalText = await button.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]').innerText().catch(() => '')
    if (modalText && !/Install LetMeFly|Install help|install LetMeFly/i.test(modalText)) continue
    if (await button.click({ timeout: 2500 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(180)
      return true
    }
  }
  return false
}

async function settlePrompts(page, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    if (await optionalInstallDismiss(page)) continue
    await page.waitForTimeout(180)
  }
}

async function clickable(page, label) {
  const pattern = label instanceof RegExp ? label : new RegExp(`\\b${esc(label)}\\b`, 'i')
  return await firstVisible(page.locator('nav button,nav a,nav [role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
}

async function clickLabel(page, label) {
  await optionalInstallDismiss(page)
  let item = await clickable(page, label)
  if (!item) {
    await settlePrompts(page, 4)
    item = await clickable(page, label)
  }
  if (!item) throw new Error(`Control not found: ${label}`)
  if (!(await item.click({ timeout: 5000 }).then(() => true).catch(() => false))) throw new Error(`Control click failed: ${label}`)
  await page.waitForTimeout(320)
  await optionalInstallDismiss(page)
}

async function bootstrapAthlete(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForFunction(() => /LETMEFLY/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)

  let create = null
  for (let i = 0; i < 18; i += 1) {
    await optionalInstallDismiss(page)
    create = await clickable(page, 'CREATE LOCAL ATHLETE')
    if (create) break
    await page.waitForTimeout(180)
  }
  if (create) {
    const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
    const input = await firstVisible(modal.locator('input[type="text"],input:not([type])'))
      || await firstVisible(page.locator('input[type="text"],input:not([type])'))
    if (!input) throw new Error('Athlete display-name input missing')
    await input.fill('Day 3 Fidelity QA')
    await create.click({ timeout: 5000 })
    await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 8000 })
  }
  await settlePrompts(page, 6)
  pass('Disposable athlete bootstrap')
}

async function selectDay3(page) {
  await clickLabel(page, 'TRAIN')
  await page.waitForTimeout(450)
  const pattern = /^\s*D3\b/i
  const day3 = await firstVisible(page.locator('[data-day],[data-day-key],[data-position],[data-date],button,[role="button"]').filter({ hasText: pattern }))
    || await firstVisible(page.getByText(pattern))
  if (!day3) throw new Error('Day 3 selector not visible')
  await day3.click({ timeout: 5000 })
  await page.waitForTimeout(500)

  const body = await page.locator('body').innerText()
  if (!/Preview position|Preview only/i.test(body)) throw new Error('Day 3 did not enter preview state before intentional reposition')
  const makeCurrent = await firstVisible(page.locator('[data-action="make-current-position"]'))
    || await clickable(page, 'MAKE CURRENT POSITION')
  if (!makeCurrent) throw new Error('Make Current Position control missing for Day 3')

  page.once('dialog', dialog => dialog.accept())
  await makeCurrent.click({ timeout: 5000 })
  await page.waitForFunction(() => !/Preview position/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => null)
  await page.waitForTimeout(650)
  const after = await page.locator('body').innerText()
  if (!/Day\s*3|D3/i.test(after)) throw new Error('Day 3 was not retained after intentional reposition')
  pass('Week 1 Day 3 becomes the governed current position')
}

async function startWorkout(page) {
  const selected = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.readiness-field input[type="radio"][value="4"]')]
    for (const node of inputs) {
      if (!(node instanceof HTMLInputElement)) continue
      node.checked = true
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return inputs.length
  })
  if (selected < 4) throw new Error(`Expected four readiness groups, found ${selected}`)
  const start = await firstVisible(page.locator('[data-action="start-workout"]'))
  if (!start) throw new Error('Start Workout control missing on current Day 3')
  await start.click({ timeout: 5000 })
  await page.waitForSelector('.set-row[data-set-id]', { timeout: 10000 })
  await page.waitForFunction(() => document.querySelector('.workout-panel[data-group-type="round"] .lmf-sequence-active'), null, { timeout: 10000 })
  await page.waitForTimeout(500)
  pass('Day 3 Workout Mode starts in mobile browser')
}

async function navigateToPage(page, index) {
  const control = page.locator(`[data-session-step="${index}"]`).first()
  if (await control.count()) {
    await control.click({ timeout: 5000 })
  } else {
    await page.evaluate(step => {
      const viewport = document.querySelector('#swipe-viewport')
      const pages = viewport ? [...viewport.querySelectorAll(':scope > .swipe-page')] : []
      const target = pages[step]
      if (!(viewport instanceof HTMLElement) || !(target instanceof HTMLElement)) return
      pages.forEach((item, idx) => item.classList.toggle('active-page', idx === step))
      viewport.scrollTo({ left: target.offsetLeft, behavior: 'auto' })
    }, index)
  }
  await page.waitForTimeout(350)
}

async function roundState(page) {
  return page.evaluate(() => {
    const pages = [...document.querySelectorAll('#swipe-viewport > .swipe-page')]
    const panel = pages.find(node => node.matches('.workout-panel[data-group-type="round"]') && node.querySelectorAll('.exercise-stack > .active-exercise').length > 1)
    if (!(panel instanceof HTMLElement)) return null
    const cards = [...panel.querySelectorAll('.exercise-stack > .active-exercise')]
    const active = panel.querySelector('.active-exercise.lmf-sequence-active')
    const activeRow = active?.querySelector('.set-row.lmf-set-active') || active?.querySelector('.set-row[data-set-id]')
    return {
      pageIndex: pages.indexOf(panel),
      heading: (panel.querySelector('.workout-panel-head h2')?.textContent || '').trim(),
      titles: cards.map(card => (card.querySelector('.exercise-title h3')?.textContent || '').trim()),
      activeTitle: (active?.querySelector('.exercise-title h3')?.textContent || '').trim(),
      setNumber: (activeRow?.querySelector('.set-label strong')?.textContent || '').trim(),
      prescription: (activeRow?.querySelector('.lmf-prescription-cell strong')?.textContent || '').trim(),
      prescriptionVisible: activeRow instanceof HTMLElement && activeRow.querySelector('.lmf-prescription-cell') instanceof HTMLElement
        ? getComputedStyle(activeRow.querySelector('.lmf-prescription-cell')).display !== 'none'
        : false,
      groupType: panel.dataset.groupType || '',
      restGate: Boolean(panel.querySelector('[data-lmf-rest-continue]')),
    }
  })
}

async function clickActiveRoundSet(page) {
  const result = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.workout-panel[data-group-type="round"]')].find(node => node.querySelectorAll('.exercise-stack > .active-exercise').length > 1)
    const active = panel?.querySelector('.active-exercise.lmf-sequence-active')
    const row = active?.querySelector('.set-row.lmf-set-active') || active?.querySelector('.set-row[data-set-id]')
    const button = row?.querySelector('.set-check[data-action="toggle-set"]')
    if (!(button instanceof HTMLButtonElement)) return { ok: false, title: '' }
    const title = (active?.querySelector('.exercise-title h3')?.textContent || '').trim()
    button.click()
    return { ok: true, title }
  })
  if (!result.ok) throw new Error('Active round set control missing')
  return result.title
}

async function auditRoundFlow(page) {
  let state = await roundState(page)
  if (!state) throw new Error('No structured multi-exercise round panel found on Day 3')
  await navigateToPage(page, state.pageIndex)
  await page.waitForTimeout(300)
  state = await roundState(page)
  if (!state) throw new Error('Round panel disappeared after navigation')
  report.observations.roundPanel = { heading: state.heading, titles: state.titles, groupType: state.groupType }
  if (state.groupType !== 'round') fail('Day 3 structured round metadata', `group=${state.groupType}`)
  else pass('Day 3 structured round metadata', `${state.heading}: ${state.titles.length} exercises`)
  if (state.titles.length < 2 || state.titles.some(title => !title)) throw new Error(`Invalid Day 3 round exercise order: ${JSON.stringify(state.titles)}`)

  const expected = state.titles
  const observed = []
  let sawOneSide = false
  for (let i = 0; i < expected.length; i += 1) {
    state = await roundState(page)
    if (!state) throw new Error(`Round state missing before exercise ${i + 1}`)
    observed.push(state.activeTitle)
    if (state.activeTitle !== expected[i]) {
      fail('Round 1 exercise-to-exercise order', `expected ${expected[i]}, saw ${state.activeTitle || 'none'} at position ${i + 1}`)
      break
    }
    if (/1\s*\/\s*side/i.test(state.prescription)) {
      sawOneSide = true
      if (state.prescriptionVisible) pass('1/side prescription remains visible', `${state.activeTitle}: ${state.prescription}`)
      else fail('1/side prescription remains visible', `${state.activeTitle}: prescription cell hidden`)
    }
    const previous = state.activeTitle
    await clickActiveRoundSet(page)
    await page.waitForFunction(({ previous, final }) => {
      const panel = [...document.querySelectorAll('.workout-panel[data-group-type="round"]')].find(node => node.querySelectorAll('.exercise-stack > .active-exercise').length > 1)
      if (!panel) return false
      if (final && panel.querySelector('[data-lmf-rest-continue]')) return true
      const current = (panel.querySelector('.active-exercise.lmf-sequence-active .exercise-title h3')?.textContent || '').trim()
      return current && current !== previous
    }, { previous, final: i === expected.length - 1 }, { timeout: 8000 }).catch(() => null)
    await page.waitForTimeout(250)
  }
  report.observations.round1Observed = observed
  if (observed.length === expected.length && observed.every((title, i) => title === expected[i])) {
    pass('Round 1 exercise-to-exercise order', observed.join(' → '))
  }
  if (!sawOneSide) fail('1/side prescription remains visible', 'No visible 1/side prescription encountered during Day 3 Round 1')

  const rest = await firstVisible(page.locator('.workout-panel[data-group-type="round"] [data-lmf-rest-continue]'))
  report.observations.roundTransition = { restGate: Boolean(rest) }
  if (rest) {
    await rest.click({ timeout: 5000 })
    await page.waitForTimeout(350)
  } else {
    await page.waitForTimeout(350)
  }
  const round2 = await roundState(page)
  report.observations.round2 = round2
  if (round2?.activeTitle === expected[0] && /2/.test(round2.setNumber)) {
    pass('Round 2 returns to exercise 1', `${round2.activeTitle} • set ${round2.setNumber}${rest ? ' after governed rest gate' : ' by direct round transition'}`)
  } else {
    fail('Round 2 returns to exercise 1', JSON.stringify(round2))
  }
}

async function findMetricCard(page, pattern) {
  return page.evaluate(source => {
    const regex = new RegExp(source, 'i')
    const pages = [...document.querySelectorAll('#swipe-viewport > .swipe-page')]
    for (const panel of pages) {
      const cards = [...panel.querySelectorAll('.exercise-stack > .active-exercise')]
      for (const card of cards) {
        const title = (card.querySelector('.exercise-title h3')?.textContent || '').trim()
        if (!regex.test(title)) continue
        const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
        const row = rows.find(candidate => !candidate.querySelector('.set-check')?.classList.contains('done')) || rows[0]
        if (!(row instanceof HTMLElement)) return null
        return { pageIndex: pages.indexOf(panel), title, setId: row.dataset.setId || '' }
      }
    }
    return null
  }, pattern.source)
}

async function exposeMetricCard(page, targetInfo) {
  await navigateToPage(page, targetInfo.pageIndex)
  await page.evaluate(setId => {
    const row = document.querySelector(`[data-set-id="${setId}"]`)
    const card = row?.closest('.active-exercise')
    const summary = card?.querySelector(':scope > .lmf-compact-summary')
    if (summary instanceof HTMLButtonElement) summary.click()
  }, targetInfo.setId)
  await page.waitForTimeout(250)
}

async function metricState(page, setId) {
  return page.evaluate(id => {
    const row = document.querySelector(`[data-set-id="${id}"]`)
    if (!(row instanceof HTMLElement)) return null
    const loadField = row.querySelector('.load-field')
    const prescription = (row.querySelector('.lmf-prescription-cell strong')?.textContent || '').trim()
    const metricLabel = (row.querySelector('.lmf-metric-field label')?.textContent || '').trim()
    return {
      kind: row.dataset.prescriptionKind || '',
      unit: row.dataset.metricUnit || '',
      hasLoad: row.dataset.hasLoad || '',
      prescription,
      metricLabel,
      loadVisible: loadField instanceof HTMLElement ? getComputedStyle(loadField).display !== 'none' : false,
      metricVisible: row.querySelector('.metric-input') instanceof HTMLElement ? getComputedStyle(row.querySelector('.metric-input')).display !== 'none' : false,
    }
  }, setId)
}

async function dbSet(page, setId) {
  return page.evaluate(async id => {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : []
    for (const entry of databases) {
      if (!entry.name) continue
      const record = await new Promise(resolve => {
        const request = indexedDB.open(entry.name)
        request.onerror = () => resolve(null)
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('workoutSets')) { db.close(); resolve(null); return }
          const tx = db.transaction('workoutSets', 'readonly')
          const get = tx.objectStore('workoutSets').get(id)
          get.onerror = () => { db.close(); resolve(null) }
          get.onsuccess = () => { const value = get.result || null; db.close(); resolve(value) }
        }
      })
      if (record) return record
    }
    return null
  }, setId)
}

async function saveMetricSet(page, setId, metricValue, loadValue = null) {
  const triggered = await page.evaluate(({ id, metricValue, loadValue }) => {
    const row = document.querySelector(`[data-set-id="${id}"]`)
    if (!(row instanceof HTMLElement)) return false
    const metric = row.querySelector('.metric-input')
    const load = row.querySelector('.load-input')
    const check = row.querySelector('.set-check[data-action="toggle-set"]')
    if (!(metric instanceof HTMLInputElement) || !(check instanceof HTMLButtonElement)) return false
    metric.value = String(metricValue)
    metric.dispatchEvent(new Event('input', { bubbles: true }))
    metric.dispatchEvent(new Event('change', { bubbles: true }))
    if (loadValue != null && load instanceof HTMLInputElement) {
      load.value = String(loadValue)
      load.dispatchEvent(new Event('input', { bubbles: true }))
      load.dispatchEvent(new Event('change', { bubbles: true }))
    }
    check.click()
    return true
  }, { id: setId, metricValue, loadValue })
  if (!triggered) throw new Error(`Could not save metric set ${setId}`)
  for (let i = 0; i < 20; i += 1) {
    const record = await dbSet(page, setId)
    if (record?.completed === true) return record
    await page.waitForTimeout(200)
  }
  return dbSet(page, setId)
}

async function auditSled(page) {
  const sled = await findMetricCard(page, /Backward Sled Drag/)
  if (!sled) throw new Error('Backward Sled Drag card not found on Day 3')
  await exposeMetricCard(page, sled)
  const state = await metricState(page, sled.setId)
  report.observations.sled = { ...sled, ...state }
  if (state?.kind === 'distance' && state.unit === 'm' && /20\s*m/i.test(state.prescription)) pass('Sled prescription is meter-aware', state.prescription)
  else fail('Sled prescription is meter-aware', JSON.stringify(state))
  if (state?.hasLoad === 'true' && state.loadVisible) pass('Loaded sled retains Load control', state.prescription)
  else fail('Loaded sled retains Load control', JSON.stringify(state))

  const saved = await saveMetricSet(page, sled.setId, 20, 25)
  report.observations.sledSaved = saved
  const perf = saved?.performance_data || {}
  if (saved?.completed === true && saved?.load_value === 25 && perf.actualMetricKind === 'distance' && perf.actualMetricValue === 20 && perf.actualMetricUnit === 'm') {
    pass('Sled logs meters + load through native persistence', '20 m • 25 lb')
  } else fail('Sled logs meters + load through native persistence', JSON.stringify(saved))
}

async function auditBike(page) {
  const bike = await findMetricCard(page, /Walk\s*(?:or|\/)\s*Bike|Walk or Bike|Bike/)
  if (!bike) throw new Error('Walk/Bike card not found on Day 3')
  await exposeMetricCard(page, bike)
  const state = await metricState(page, bike.setId)
  report.observations.bike = { ...bike, ...state }
  if (state?.kind === 'duration' && state.unit === 'min' && /20\s*[–-]\s*30\s*min/i.test(state.prescription)) pass('Walk/Bike prescription is time-aware', state.prescription)
  else fail('Walk/Bike prescription is time-aware', JSON.stringify(state))
  if (state?.hasLoad === 'false' && !state.loadVisible) pass('Walk/Bike removes meaningless Load control')
  else fail('Walk/Bike removes meaningless Load control', JSON.stringify(state))

  const saved = await saveMetricSet(page, bike.setId, 25, null)
  report.observations.bikeSaved = saved
  const perf = saved?.performance_data || {}
  if (saved?.completed === true && saved?.load_value == null && perf.actualMetricKind === 'duration' && perf.actualMetricValue === 25 && perf.actualMetricUnit === 'min') {
    pass('Walk/Bike logs minutes without fake load', '25 min')
  } else fail('Walk/Bike logs minutes without fake load', JSON.stringify(saved))
}

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const page = await context.newPage()

try {
  await bootstrapAthlete(page)
  await selectDay3(page)
  await startWorkout(page)
  await auditRoundFlow(page)
  await auditSled(page)
  await auditBike(page)
} catch (error) {
  fail('Day 3 browser audit execution', error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => null)
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(outDir, 'report.md'), [
  '# LetMeFly Day 3 Workout Fidelity Browser Audit',
  '',
  `Result: **${report.result}**`,
  '',
  '## Passes',
  ...(report.passes.length ? report.passes.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
  '## Failures',
  ...(report.failures.length ? report.failures.map(item => `- ${item.label}${item.detail ? ` — ${item.detail}` : ''}`) : ['- None']),
  '',
].join('\n'))

if (report.failures.length) process.exit(1)
console.log('LetMeFly real Day 3 workout fidelity browser audit: PASS')
