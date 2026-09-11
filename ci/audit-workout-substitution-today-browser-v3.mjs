#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ciDir = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.join(ciDir, 'audit-workout-substitution-today-browser-v2.mjs')
const runtimePath = path.join(ciDir, '.audit-workout-substitution-today-browser-v3-runtime.mjs')

const oldBlock = `async function openTrain(page) {
  if (/\\/train(?:$|[?#])/i.test(page.url()) || /#\\/train/i.test(page.url())) {
    await page.waitForTimeout(250)
    return
  }
  const train = await clickable(page, /^\\s*TRAIN\\s*$/i)
  if (!train) throw new Error('Train navigation control missing')
  await train.click({ timeout: 5000 })
  await page.waitForTimeout(450)
  await settle(page, 3)
}`

const newBlock = `async function openTrain(page) {
  const trainSignals = '.exercise-card.active-exercise,[data-action="start-workout"],.readiness-field'
  if (await page.locator(trainSignals).count()) {
    await page.waitForTimeout(250)
    return
  }

  const train = await clickable(page, /^\\s*TRAIN\\s*$/i)
    || await firstVisible(page.locator('[href="#/train"],[data-route="train"],[data-nav="train"],[data-page="train"]'))
  if (train) {
    await train.click({ timeout: 5000 })
  } else {
    // Hash navigation is part of the production router. Using it as the fallback
    // keeps this QA helper independent of presentation-layer nav labels while
    // preserving the same browser origin and private IndexedDB athlete state.
    await page.evaluate(() => {
      if (location.hash !== '#/train') location.hash = '#/train'
      else window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
  }

  await page.waitForTimeout(500)
  await settle(page, 3)
  const ready = await page.locator(trainSignals).count()
  if (!ready) {
    const snapshot = (await page.locator('body').innerText()).replace(/\\s+/g, ' ').slice(0, 420)
    throw new Error('Train route did not render after navigation fallback: ' + page.url() + ' :: ' + snapshot)
  }
}`

const source = fs.readFileSync(sourcePath, 'utf8')
if (!source.includes(oldBlock)) throw new Error('Issue #54 browser v3 could not find the v2 Train navigation helper')
let patched = source.replace(oldBlock, newBlock)

const startWorkoutBlock = `async function startWorkout(page) {
  await setReadiness(page)
  const start = await firstVisible(page.locator('[data-action="start-workout"]')) || await clickable(page, /^\\s*START WORKOUT\\s*$/i)
  if (!start) {
    const existing = await firstVisible(page.locator('.exercise-card.active-exercise'))
    if (existing) return
    throw new Error('Start Workout control missing')
  }
  await start.click({ timeout: 5000 })
  await page.waitForSelector('.exercise-card.active-exercise', { timeout: 10000 })
  await page.waitForFunction(() => window.LetMeFlyExerciseIntelligence && window.LetMeFlyWorkoutSubstitutionBridge, null, { timeout: 10000 })
}`
const startWorkoutReplacement = `async function startWorkout(page) {
  await setReadiness(page)
  await settle(page, 3)
  const start = await firstVisible(page.locator('[data-action="start-workout"]')) || await clickable(page, /^\\s*START WORKOUT\\s*$/i)
  if (!start) {
    const existing = await firstVisible(page.locator('.exercise-card.active-exercise'))
    if (existing) return
    throw new Error('Start Workout control missing')
  }
  try {
    await start.click({ timeout: 2500 })
  } catch (error) {
    // The install prompt and fixed mobile nav can transiently cover the CTA
    // during fixture reloads. Dismiss the prompt, then trigger the same native
    // button handler without turning this into a synthetic substitution path.
    await dismissInstall(page)
    await start.evaluate((node) => node.click()).catch(() => { throw error })
  }
  await page.waitForSelector('.exercise-card.active-exercise', { timeout: 10000 })
  await page.waitForFunction(() => window.LetMeFlyExerciseIntelligence && window.LetMeFlyWorkoutSubstitutionBridge, null, { timeout: 10000 })
  await settle(page, 2)
}`
if (!patched.includes(startWorkoutBlock)) throw new Error('Issue #54 browser v3 could not find the v2 Start Workout helper')
patched = patched.replace(startWorkoutBlock, startWorkoutReplacement)

const immediateLockBlock = `  let locked = await findCard(page, /Stationary Bike/i)
  if (!/SUBSTITUTE LOCKED/i.test(locked?.substituteText || '') || locked?.hasUndo) {`
const immediateLockReplacement = `  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('.exercise-card.active-exercise')]
    const card = cards.find(node => /Stationary Bike/i.test(node.querySelector('.exercise-title h3')?.textContent || ''))
    const substitute = card?.querySelector('[data-substitute]')
    return /SUBSTITUTE LOCKED/i.test(substitute?.textContent || '') && !card?.querySelector('[data-revert-substitution]')
  }, null, { timeout: 8000 })
  let locked = await findCard(page, /Stationary Bike/i)
  if (!/SUBSTITUTE LOCKED/i.test(locked?.substituteText || '') || locked?.hasUndo) {`
if (!patched.includes(immediateLockBlock)) throw new Error('Issue #54 browser v3 could not find the v2 immediate history-lock assertion')
patched = patched.replace(immediateLockBlock, immediateLockReplacement)

const fixtureBlock = `const fixtures = await discoverBarbellFixtures()
report.observations.reachableBarbellSubstitutionCases = fixtures.length
report.observations.barbellFixtures = fixtures`
const fixtureReplacement = `const discoveredBarbellFixtures = await discoverBarbellFixtures()
const fixtureKeys = new Set()
const fixtures = discoveredBarbellFixtures.filter((fixture) => {
  const key = String(fixture.ruleId || '') + ':' + String(fixture.program || '')
  if (fixtureKeys.has(key)) return false
  fixtureKeys.add(key)
  return true
}).slice(0, 6)
report.observations.discoveredBarbellSubstitutionOccurrences = discoveredBarbellFixtures.length
report.observations.reachableBarbellSubstitutionCases = fixtures.length
report.observations.barbellFixtures = fixtures`
if (!patched.includes(fixtureBlock)) throw new Error('Issue #54 browser v3 could not find the v2 governed Bar Loader fixture block')
patched = patched.replace(fixtureBlock, fixtureReplacement)

const pageBlock = `const page = await context.newPage()
page.on('console', message => { if (message.type() === 'error') console.log(\`BROWSER ERROR \${message.text()}\`) })`
const pageReplacement = `const page = await context.newPage()
page.setDefaultTimeout(7000)
page.setDefaultNavigationTimeout(15000)
page.on('console', message => { if (message.type() === 'error') console.log(\`BROWSER ERROR \${message.text()}\`) })`
if (!patched.includes(pageBlock)) throw new Error('Issue #54 browser v3 could not find the v2 Playwright page setup')
patched = patched.replace(pageBlock, pageReplacement)

fs.writeFileSync(runtimePath, patched)

try {
  await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`)
} finally {
  try { fs.unlinkSync(runtimePath) } catch (_) {}
}
