#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const out = path.join(app, 'EXERCISE_LIBRARY_ART_KEY_AUDIT')
fs.mkdirSync(out, { recursive: true })
const finalCases = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database/exercise-art-final-display-cases.json'), 'utf8'))
const intentionalNoArt = new Set(finalCases.nonExerciseEntries || [])
const requireApp = createRequire(path.join(app, 'package.json'))
const { chromium } = requireApp('playwright-core')
const chromeBin = process.env.CHROME_BIN
const baseUrl = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4175'
if (!chromeBin) throw new Error('CHROME_BIN is required')

const AUDIT_ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
const approved = new Map()
const report = {
  result: 'RUNNING',
  canonicalExercises: 0,
  exerciseCards: 0,
  uniqueCanonicalIds: 0,
  trainCards: 0,
  trainResolvedCards: 0,
  approvedFixtureKeys: 0,
  intentionalNoArt: [...intentionalNoArt].sort(),
  mismatches: [],
  trainMismatches: [],
  missingArtNodes: [],
  missingSyncMarkers: [],
  approvedFallbacks: [],
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
  await input.fill('QA Art Runtime Athlete')
  await create.click({ timeout: 5000 })
  await page.waitForFunction(() => !/CREATE LOCAL ATHLETE/i.test(document.body.innerText), null, { timeout: 12000 })
  await dismissOptionalInstall(page)
}

function rememberApproved(items) {
  for (const item of items) {
    const key = String(item?.key || '').trim()
    if (key && !intentionalNoArt.has(key)) approved.set(key, String(item?.label || key).trim().slice(0, 100) || key)
  }
}

async function collectRenderedArtKeys(page, cardSelector) {
  return page.evaluate((selector) => [...document.querySelectorAll(selector)].flatMap(card => {
    const title = card.querySelector('.exercise-title h3, h3')?.textContent?.trim() || 'Exercise'
    const nodes = [
      ...(card.matches('[data-exercise-art]') ? [card] : []),
      ...card.querySelectorAll('[data-exercise-art]'),
    ]
    return nodes.map(node => ({ key: node.getAttribute('data-exercise-art') || '', label: title }))
  }), cardSelector)
}

async function publishApprovedRows(page) {
  const entries = [...approved.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label }))
  report.approvedFixtureKeys = entries.length
  await page.evaluate(({ athleteId, entries }) => {
    window.__LMF_APPROVED_KEYS = entries.map(({ key }) => key)
    window.__LMF_ART_ROWS = entries.map(({ key, label }, index) => {
      const token = (index + 1).toString(16)
      return {
        id: `22222222-2222-4222-8222-${token.padStart(12, '0')}`,
        athlete_id: athleteId,
        exercise_key: key,
        status: 'approved',
        is_active: true,
        deleted_at: null,
        metadata: {
          delivery: {
            kind: 'supabase-private',
            bucket: 'athlete-exercise-art',
            parts: [{
              path: `${athleteId}/${token.padStart(64, '0')}.png`,
              label,
            }],
          },
        },
      }
    })
    window.dispatchEvent(new Event('lmf:exercise-art-overrides-updated'))
  }, { athleteId: AUDIT_ATHLETE_ID, entries })
}

async function waitForApprovedArt(page, cardSelector, timeout = 25000) {
  await page.waitForFunction((selector) => {
    const approvedKeys = new Set(window.__LMF_APPROVED_KEYS || [])
    const nodes = [...document.querySelectorAll(selector)].flatMap(card => [
      ...(card.matches('[data-exercise-art]') ? [card] : []),
      ...card.querySelectorAll('[data-exercise-art]'),
    ]).filter(node => approvedKeys.has(node.getAttribute('data-exercise-art') || ''))
    if (!nodes.length) return false
    return nodes.every(node => {
      const source = node.getAttribute('data-exercise-art-source') || ''
      const art = node.style.getPropertyValue('--exercise-art') || ''
      const multipart = Boolean(node.querySelector(':scope > .lmf-art-pair'))
      return Boolean(source) && (art.includes('blob:') || multipart)
    })
  }, cardSelector, { timeout }).catch(() => {})
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

// Make every art surface immediately observable so the audit proves complete
// rendered coverage instead of only the cards currently near the viewport.
await context.addInitScript(() => {
  class ImmediateIntersectionObserver {
    constructor(callback) { this.callback = callback }
    observe(target) { queueMicrotask(() => this.callback([{ target, isIntersecting: true }], this)) }
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = ImmediateIntersectionObserver

  const athleteId = '11111111-1111-4111-8111-111111111111'
  window.__LMF_ART_ROWS = []
  window.__LMF_APPROVED_KEYS = []
  let goodBlob = null
  async function imageBlob() {
    if (goodBlob) return goodBlob
    goodBlob = await new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 800
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#17191f'
      ctx.fillRect(0, 0, 800, 800)
      ctx.fillStyle = '#b31925'
      ctx.fillRect(96, 96, 608, 608)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('fixture image encode failed')), 'image/png')
    })
    return goodBlob
  }
  const bridge = Object.freeze({
    version: 2,
    async context() { return { athleteId, configured: true, hasSession: true } },
    async readCloud(id) { return id === athleteId ? [...window.__LMF_ART_ROWS] : [] },
    async readAsset(id) { return id === athleteId ? imageBlob() : null },
  })
  Object.defineProperty(window, 'LetMeFlyExerciseArt', {
    configurable: true,
    get: () => bridge,
    set: () => {},
  })
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
  await page.waitForFunction(() => {
    const api = window.LetMeFlyExerciseIntelligence
    const cards = [...document.querySelectorAll('.exercise-library [data-library-card]')]
    const ids = new Set(cards.map(card => card.dataset.lmfIntelId).filter(Boolean))
    return api?.counts?.exercises === 112 && ids.size === 112
  }, null, { timeout: 15000 })
  await page.waitForTimeout(350)

  const exerciseSnapshot = await page.evaluate(() => {
    const api = window.LetMeFlyExerciseIntelligence
    const cards = [...document.querySelectorAll('.exercise-library [data-library-card]')]
    const rows = []
    for (const card of cards) {
      const id = card.dataset.lmfIntelId || ''
      if (!id) continue
      const exercise = api.getExercise(id) || api.getExercise(card.querySelector('h3')?.textContent || '')
      if (!exercise?.id) continue
      const expected = String(exercise?.thumbnail?.canonicalKey || exercise.id).trim()
      const nodes = [
        ...(card.matches('[data-exercise-art]') ? [card] : []),
        ...card.querySelectorAll('[data-exercise-art]'),
      ]
      rows.push({
        id: exercise.id,
        name: exercise.canonicalName || exercise.id,
        expected,
        actual: nodes[0]?.getAttribute('data-exercise-art') || '',
        actualKeys: nodes.map(node => node.getAttribute('data-exercise-art') || ''),
        marker: card.getAttribute('data-lmf-canonical-exercise-art') || '',
        hasArtNode: nodes.length > 0,
      })
    }
    return {
      canonicalExercises: api.counts?.exercises || api.getAllExercises().length,
      rows,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })

  report.canonicalExercises = exerciseSnapshot.canonicalExercises
  report.exerciseCards = await page.locator('.exercise-library [data-library-card]').count()
  report.uniqueCanonicalIds = new Set(exerciseSnapshot.rows.map(row => row.id)).size
  report.horizontalOverflow = { width: exerciseSnapshot.width, scrollWidth: exerciseSnapshot.scrollWidth }
  report.missingArtNodes = exerciseSnapshot.rows.filter(row => !row.hasArtNode)
  report.mismatches = exerciseSnapshot.rows.filter(row => row.hasArtNode && row.actualKeys.some(key => key !== row.expected))
  report.missingSyncMarkers = exerciseSnapshot.rows.filter(row => row.marker !== row.expected)

  assert.equal(report.canonicalExercises, 112, `expected 112 canonical Exercise Intelligence records, got ${report.canonicalExercises}`)
  assert.equal(report.uniqueCanonicalIds, 112, `Exercise library represented ${report.uniqueCanonicalIds}/112 canonical exercises`)
  assert.equal(report.missingArtNodes.length, 0, `${report.missingArtNodes.length} resolved Exercise cards are missing an art node`)
  assert.equal(report.mismatches.length, 0, `${report.mismatches.length} Exercise cards use a non-canonical art key`)
  assert.equal(report.missingSyncMarkers.length, 0, `${report.missingSyncMarkers.length} Exercise cards were not normalized by the canonical art-key sync`)
  assert.ok(exerciseSnapshot.scrollWidth <= exerciseSnapshot.width + 3, `Exercise library horizontal overflow ${exerciseSnapshot.scrollWidth}px > ${exerciseSnapshot.width}px`)

  const exerciseArtKeys = await collectRenderedArtKeys(page, '.exercise-library [data-library-card]')
  rememberApproved(exerciseArtKeys)
  await publishApprovedRows(page)
  await waitForApprovedArt(page, '.exercise-library [data-library-card]')

  const exerciseFallbacks = await page.evaluate(() => {
    const approvedKeys = new Set(window.__LMF_APPROVED_KEYS || [])
    return [...document.querySelectorAll('.exercise-library [data-library-card]')].flatMap(card => {
      const title = card.querySelector('h3')?.textContent?.trim() || 'Exercise'
      const nodes = [
        ...(card.matches('[data-exercise-art]') ? [card] : []),
        ...card.querySelectorAll('[data-exercise-art]'),
      ]
      return nodes.filter(node => {
        const key = node.getAttribute('data-exercise-art') || ''
        if (!approvedKeys.has(key)) return false
        const source = node.getAttribute('data-exercise-art-source') || ''
        const art = node.style.getPropertyValue('--exercise-art') || ''
        const multipart = Boolean(node.querySelector(':scope > .lmf-art-pair'))
        return !source || (!art.includes('blob:') && !multipart)
      }).map(node => ({ route: 'Exercises', title, key: node.getAttribute('data-exercise-art') || '', source: node.getAttribute('data-exercise-art-source') || '', inlineArt: node.style.getPropertyValue('--exercise-art') || '' }))
    })
  })
  report.approvedFallbacks.push(...exerciseFallbacks)

  // Stay in the same document so the authenticated private-art fixture remains
  // active while proving Train cards and Workout Flow child surfaces.
  await page.evaluate(() => { location.hash = '#/train' })
  await page.waitForSelector('.train-shell', { timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.train-shell .exercise-card[data-exercise-art]').length > 0, null, { timeout: 15000 })
  await page.waitForTimeout(500)

  // Give the canonical sync a chance to normalize Train parent + child media keys.
  await page.waitForFunction(() => {
    const api = window.LetMeFlyExerciseIntelligence
    if (!api?.getExercise) return false
    const cards = [...document.querySelectorAll('.train-shell .exercise-card[data-exercise-art]')]
    if (!cards.length) return false
    return cards.every(card => {
      const title = card.querySelector('.exercise-title h3, h3')?.textContent?.trim() || ''
      const exercise = api.getExercise(card.dataset.lmfIntelId || '') || api.getExercise(title) || api.getExercise(card.getAttribute('data-exercise-art') || '')
      if (!exercise?.id) return true
      const expected = String(exercise?.thumbnail?.canonicalKey || exercise.id).trim()
      const nodes = [card, ...card.querySelectorAll('[data-exercise-art]')]
      return card.getAttribute('data-lmf-canonical-exercise-art') === expected
        && nodes.every(node => node.getAttribute('data-exercise-art') === expected)
    })
  }, null, { timeout: 15000 })

  const trainSnapshot = await page.evaluate(() => {
    const api = window.LetMeFlyExerciseIntelligence
    return [...document.querySelectorAll('.train-shell .exercise-card[data-exercise-art]')].map(card => {
      const title = card.querySelector('.exercise-title h3, h3')?.textContent?.trim() || ''
      const exercise = api.getExercise(card.dataset.lmfIntelId || '') || api.getExercise(title) || api.getExercise(card.getAttribute('data-exercise-art') || '')
      const expected = exercise?.id ? String(exercise?.thumbnail?.canonicalKey || exercise.id).trim() : ''
      const nodes = [card, ...card.querySelectorAll('[data-exercise-art]')]
      return {
        title,
        resolved: Boolean(exercise?.id),
        expected,
        marker: card.getAttribute('data-lmf-canonical-exercise-art') || '',
        actualKeys: nodes.map(node => node.getAttribute('data-exercise-art') || ''),
      }
    })
  })

  report.trainCards = trainSnapshot.length
  report.trainResolvedCards = trainSnapshot.filter(row => row.resolved).length
  report.trainMismatches = trainSnapshot.filter(row => row.resolved && (row.marker !== row.expected || row.actualKeys.some(key => key !== row.expected)))
  assert.ok(report.trainCards > 0, 'Train rendered no exercise cards for private-art verification')
  assert.ok(report.trainResolvedCards > 0, 'Train rendered no Exercise Intelligence-resolved exercise cards')
  assert.equal(report.trainMismatches.length, 0, `${report.trainMismatches.length} Train cards or child art surfaces use a non-canonical art key`)

  const trainArtKeys = await collectRenderedArtKeys(page, '.train-shell .exercise-card[data-exercise-art]')
  rememberApproved(trainArtKeys)
  await publishApprovedRows(page)
  await waitForApprovedArt(page, '.train-shell .exercise-card[data-exercise-art]')

  const trainFallbacks = await page.evaluate(() => {
    const approvedKeys = new Set(window.__LMF_APPROVED_KEYS || [])
    return [...document.querySelectorAll('.train-shell .exercise-card[data-exercise-art]')].flatMap(card => {
      const title = card.querySelector('.exercise-title h3, h3')?.textContent?.trim() || 'Exercise'
      const nodes = [card, ...card.querySelectorAll('[data-exercise-art]')]
      return nodes.filter(node => {
        const key = node.getAttribute('data-exercise-art') || ''
        if (!approvedKeys.has(key)) return false
        const source = node.getAttribute('data-exercise-art-source') || ''
        const art = node.style.getPropertyValue('--exercise-art') || ''
        const multipart = Boolean(node.querySelector(':scope > .lmf-art-pair'))
        return !source || (!art.includes('blob:') && !multipart)
      }).map(node => ({ route: 'Train', title, key: node.getAttribute('data-exercise-art') || '', source: node.getAttribute('data-exercise-art-source') || '', inlineArt: node.style.getPropertyValue('--exercise-art') || '' }))
    })
  })
  report.approvedFallbacks.push(...trainFallbacks)

  assert.equal(report.approvedFallbacks.length, 0, `${report.approvedFallbacks.length} art surfaces fell back despite an approved private mapping`)
  assert.equal(report.errors.length, 0, `Browser errors: ${report.errors.join(' | ')}`)

  report.result = 'PASS'
  write()
  await page.screenshot({ path: path.join(out, 'exercise-art-runtime-pass.png'), fullPage: true })
  console.log(JSON.stringify(report, null, 2))
  console.log('LetMeFly Train + Exercises canonical private-art render audit: PASS')
} catch (error) {
  report.result = 'FAIL'
  report.errors.push(error?.stack || String(error))
  write()
  await page.screenshot({ path: path.join(out, 'exercise-art-runtime-failure.png'), fullPage: true }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close().catch(() => {})
}
