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
const patched = source.replace(oldBlock, newBlock)
fs.writeFileSync(runtimePath, patched)

try {
  await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`)
} finally {
  try { fs.unlinkSync(runtimePath) } catch (_) {}
}
