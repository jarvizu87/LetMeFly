#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/inspect-progression-shadow-stage3-contracts.mjs <target-source-dir>')
  process.exit(2)
}

const focusedRanges = [
  ['src/db/local-db.ts', 205, 285],
  ['src/services/readiness-service.ts', 1, 60],
  ['src/services/workout-service.ts', 35, 165],
  ['src/services/workout-service.ts', 300, 370],
  ['src/services/workout-service.ts', 650, 735],
]

const recursiveTerms = [
  /coachingDecisions/i,
  /coaching_decision/i,
  /before_state/i,
  /after_state/i,
  /decision_type/i,
  /effective.*target/i,
  /effective.*prescri/i,
  /readiness_id/i,
  /prescription_snapshot/i,
]

function readLines(relative) {
  const full = path.join(target, relative)
  if (!fs.existsSync(full)) return null
  return fs.readFileSync(full, 'utf8').split(/\r?\n/)
}

function range(relative, start, end) {
  const lines = readLines(relative)
  if (!lines) return { file: relative, exists: false, start, end, text: '' }
  const from = Math.max(1, start)
  const to = Math.min(lines.length, end)
  return {
    file: relative,
    exists: true,
    start: from,
    end: to,
    text: lines.slice(from - 1, to).map((line, index) => `${from + index}: ${line}`).join('\n'),
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(?:ts|mjs|js)$/.test(entry.name)) out.push(full)
  }
  return out
}

function recursiveMatches() {
  const srcRoot = path.join(target, 'src')
  const results = []
  for (const full of walk(srcRoot)) {
    const relative = path.relative(target, full).replaceAll('\\', '/')
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/)
    const hits = []
    for (let i = 0; i < lines.length; i += 1) {
      if (!recursiveTerms.some((term) => term.test(lines[i]))) continue
      const start = Math.max(0, i - 3)
      const end = Math.min(lines.length, i + 4)
      hits.push({
        line: i + 1,
        excerpt: lines.slice(start, end).map((line, offset) => `${start + offset + 1}: ${line}`).join('\n'),
      })
    }
    if (hits.length) results.push({ file: relative, matches: hits.slice(0, 60) })
  }
  return results
}

const report = {
  focusedRanges: focusedRanges.map(([file, start, end]) => range(file, start, end)),
  recursiveMatches: recursiveMatches(),
}

console.log('PROGRESSION_SHADOW_STAGE3_CONTRACT_REPORT_BEGIN')
console.log(JSON.stringify(report, null, 2))
console.log('PROGRESSION_SHADOW_STAGE3_CONTRACT_REPORT_END')
