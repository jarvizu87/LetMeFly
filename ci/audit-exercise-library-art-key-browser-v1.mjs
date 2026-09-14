#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const out = path.join(app, 'EXERCISE_LIBRARY_ART_KEY_AUDIT')
fs.mkdirSync(out, { recursive: true })
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const chromeBin = process.env.CHROME_BIN
const baseUrl = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4175'
if (!chromeBin) throw new Error('CHROME_BIN is required')

const report = {
  result: 'RUNNING',
  canonicalExercises: 0,
  resolvedCards: 0,
  uniqueCanonicalIds: 0,
  mismatches: [],
  missingArtNodes: [],
  missingSyncMarkers: [],
  horizontalOverflow: null,
  errors: [],
}
const write = () => fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

async function firstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) return item
  }
  return null
}

async function dismissOptionalInstall(page) {
  for (let i = 0; i < 5; i += 1) {
    const button = await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: /^\s*Not now\s*$/i }))
    if (!button) return
    const modalText = await button.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]').innerText().catch(() => '')
    if (modalText && !/install LetMeFly|install help/i.test(modalText)) return
    await button.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(120)
  }
}

async function bootstrapLocalAthlete(page) {
  let create = null
  for (let i = 0; i < 80; i += 1) {
    await dismissOptionalInstall(page)
    create = await firstVisible(page.locator('button,a,[role="button"]').filter({ hasText: /CREATE LOCAL ATHLETE/i }))
    if (create) break
    if (await page.locator('.lmf-home-command-v4').count().catch(() => 0)) return
    await page.waitForTimeout(150)
  }
  if (!create) return

  const modal = create.locator('xpath=ancestor::*[contains(@class,"modal-backdrop")][1]')
  let input = null
  for (let i = 0; i < 30; i += 1) {
    input = await firstVisible(modal.locator('input[type="text"],input:not([type])'))
      || await firstVisible(page.locator('input[type="text"],input:not([type])'))
    if (input) break
    await page.waitForTimeout(120)
  }
  assert.ok(input, 'first-run display-name input was not available')
  await input.fill('QA Art Key Athlete')
  await create.click({ timeout: 5000 })
  await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 12000 })
  await dismissOptionalInstall(page)
}

const browser = await chromium.launch({
  executablePath: chromeBin,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
})
const page = await context.newPage()
page.on('pageerror', error => report.errors.push(`pageerror: ${error.message}`))

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await bootstrapLocalAthlete(page)

  await page.goto(`${baseUrl}/#/exercises`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForFunction(() => {
    const api = window.LetMeFlyExerciseIntelligence
    const library = document.querySelector('.exercise-library')
    return Boolean(api?.getAllExercises && api?.getExercise && library?.dataset?.lmfIntelCatalog)
  }, null, { timeout: 20000 })

  // Let the library enhancer append missing canonical cards and the art-key sync
  // normalize pre-existing program-driven cards after their lmfIntelId is assigned.
  await page.waitForFunction(() => {
    const api = window.LetMeFlyExerciseIntelligence
    const cards = [...document.querySelectorAll('.exercise-library [data-library-card]')]
    const ids = new Set(cards.map(card => card.dataset.lmfIntelId).filter(Boolean))
    return api?.counts?.exercises === 112 && ids.size === 112
  }, null, { timeout: 15000 })
  await page.waitForTimeout(350)

  const snapshot = await page.evaluate(() => {
    const api = window.LetMeFlyExerciseIntelligence
    const cards = [...document.querySelectorAll('.exercise-library [data-library-card]')]
    const rows = []
    for (const card of cards) {
      const id = card.dataset.lmfIntelId || ''
      if (!id) continue
      const exercise = api.getExercise(id) || api.getExercise(card.querySelector('h3')?.textContent || '')
      if (!exercise?.id) continue
      const expected = String(exercise?.thumbnail?.canonicalKey || exercise.id).trim()
      const art = card.matches('[data-exercise-art]') ? card : card.querySelector('[data-exercise-art]')
      rows.push({
        id: exercise.id,
        name: exercise.canonicalName || exercise.id,
        expected,
        actual: art?.getAttribute('data-exercise-art') || '',
        marker: card.getAttribute('data-lmf-canonical-exercise-art') || '',
        hasArtNode: Boolean(art),
      })
    }
    return {
      canonicalExercises: api.counts?.exercises || api.getAllExercises().length,
      rows,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })

  report.canonicalExercises = snapshot.canonicalExercises
  report.resolvedCards = snapshot.rows.length
  report.uniqueCanonicalIds = new Set(snapshot.rows.map(row => row.id)).size
  report.horizontalOverflow = { width: snapshot.width, scrollWidth: snapshot.scrollWidth }
  report.missingArtNodes = snapshot.rows.filter(row => !row.hasArtNode)
  report.mismatches = snapshot.rows.filter(row => row.hasArtNode && row.actual !== row.expected)
  report.missingSyncMarkers = snapshot.rows.filter(row => row.marker !== row.expected)

  assert.equal(report.canonicalExercises, 112, `expected 112 canonical Exercise Intelligence records, got ${report.canonicalExercises}`)
  assert.equal(report.uniqueCanonicalIds, 112, `Exercise library represented ${report.uniqueCanonicalIds}/112 canonical exercises`)
  assert.equal(report.missingArtNodes.length, 0, `${report.missingArtNodes.length} resolved Exercise cards are missing an art node`)
  assert.equal(report.mismatches.length, 0, `${report.mismatches.length} Exercise cards use a non-canonical art key`)
  assert.equal(report.missingSyncMarkers.length, 0, `${report.missingSyncMarkers.length} Exercise cards were not normalized by the canonical art-key sync`)
  assert.ok(snapshot.scrollWidth <= snapshot.width + 3, `Exercise library horizontal overflow ${snapshot.scrollWidth}px > ${snapshot.width}px`)
  assert.equal(report.errors.length, 0, `Browser errors: ${report.errors.join(' | ')}`)

  report.result = 'PASS'
  write()
  await page.screenshot({ path: path.join(out, 'exercise-library-art-key-pass.png'), fullPage: true })
  console.log(JSON.stringify(report, null, 2))
  console.log('LetMeFly Exercise library canonical private-art key browser audit: PASS')
} catch (error) {
  report.result = 'FAIL'
  report.errors.push(error?.stack || String(error))
  write()
  await page.screenshot({ path: path.join(out, 'exercise-library-art-key-failure.png'), fullPage: true }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close().catch(() => {})
}
