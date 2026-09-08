#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const target = process.argv[2]
const manifestPath = process.argv[3]
if (!target || !manifestPath) {
  console.error('Usage: node ci/audit-black-crown-source.mjs <target-source-dir> <manifest>')
  process.exit(2)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const sourceDir = path.join(target, 'src/programs/black-crown/source-weeks')

const fail = (message) => {
  console.error(`Black Crown source audit: FAIL — ${message}`)
  process.exit(1)
}

if (manifest.totalBlocks !== 9 || manifest.totalWeeks !== 54 || manifest.totalSessions !== 270) {
  fail('manifest totals are not 9 blocks / 54 weeks / 270 sessions')
}

const expectedHashes = new Map()
for (const block of manifest.blocks) {
  for (const [week, hash] of Object.entries(block.weekSourceHashes ?? {})) {
    expectedHashes.set(Number(week), hash)
  }
}
if (expectedHashes.size !== 54) fail(`expected 54 source hashes, found ${expectedHashes.size}`)

let sessions = 0
let ohpExposures = 0
const testStatus = new Map([
  [12, 'VERIFIED 1RM TEST'],
  [18, 'NON-MAX CHECK'],
  [24, 'VERIFIED 1RM TEST'],
  [30, 'NON-MAX CHECK'],
  [36, 'VERIFIED 1RM TEST'],
  [42, 'NON-MAX CHECK'],
  [48, 'OPENER REHEARSAL'],
  [54, 'VERIFIED EXIT TEST'],
])
const ohpRemovedWeeks = new Set(testStatus.keys())
const weekBuffers = []

for (let week = 1; week <= 54; week += 1) {
  const file = path.join(sourceDir, `week-${String(week).padStart(2, '0')}.ts`)
  if (!fs.existsSync(file)) fail(`missing week ${week}`)
  const buffer = fs.readFileSync(file)
  const text = buffer.toString('utf8')
  weekBuffers.push(buffer)

  const weekMatch = text.match(/\n\s*week:\s*(\d+),/)
  const blockMatch = text.match(/\n\s*block:\s*(\d+),/)
  const sourceHashMatch = text.match(/sourceHash:\s*["']([a-f0-9]{64})["']/)
  if (!weekMatch || Number(weekMatch[1]) !== week) fail(`week number mismatch in week ${week}`)
  if (!blockMatch || Number(blockMatch[1]) !== Math.ceil(week / 6)) fail(`block mismatch in week ${week}`)
  if (!sourceHashMatch) fail(`missing source hash in week ${week}`)
  if (sourceHashMatch[1] !== expectedHashes.get(week)) fail(`source hash mismatch in week ${week}`)

  const dayCount = [...text.matchAll(/^\s+day:\s+\d+,/gm)].length
  if (dayCount !== 5) fail(`week ${week} has ${dayCount} sessions instead of 5`)
  sessions += dayCount

  if (/20\d\d-\d\d-\d\d/.test(text)) fail(`private calendar date found in week ${week}`)
  if (/\b\d+(?:\.\d+)?\s*lb\b/i.test(text)) fail(`athlete-derived exact pound load found in week ${week}`)

  const hasOHP = text.includes('PRIMARY — STRICT OHP')
  if (hasOHP) ohpExposures += 1
  if (ohpRemovedWeeks.has(week) && hasOHP) fail(`Strict OHP present in protected removal week ${week}`)

  const expectedStatus = testStatus.get(week)
  if (expectedStatus && !text.includes(`status: "${expectedStatus}"`) && !text.includes(`status: '${expectedStatus}'`)) {
    fail(`week ${week} is missing required status ${expectedStatus}`)
  }

  if (!testStatus.has(week)) {
    const day4 = text.match(/day:\s*4,\s*\n\s*title:\s*["']([^"']+)["']/)
    if (!day4 || !day4[1].includes('RECOVERY')) fail(`standard week ${week} Day 4 is not recovery/structural`)
  }

  if (!/priority:\s*["']mandatory["']/.test(text)) fail(`week ${week} has no mandatory work`)
}

if (sessions !== 270) fail(`session total is ${sessions}, expected 270`)
if (ohpExposures !== 42) fail(`Strict OHP exposure count is ${ohpExposures}, expected 42`)

const sourceIndex = path.join(sourceDir, 'index.ts')
if (!fs.existsSync(sourceIndex)) fail('missing unified source-weeks index')
const indexText = fs.readFileSync(sourceIndex, 'utf8')
const importCount = [...indexText.matchAll(/BLACK_CROWN_WEEK_\d{2}_SOURCE/g)].length
if (importCount < 108) fail('unified index does not import and list all 54 weeks')

const digest = crypto
  .createHash('sha256')
  .update(Buffer.concat(weekBuffers))
  .digest('hex')

console.log(`Black Crown source audit: PASS — 54 weeks / 270 sessions / 42 Strict OHP exposures / digest ${digest}`)
