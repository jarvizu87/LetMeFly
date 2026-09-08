#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/audit-black-crown-privacy.mjs <target-source-dir>')
  process.exit(2)
}

const sourceDir = path.join(target, 'src/programs/black-crown/source-weeks')
const findings = []

const patterns = [
  { key: 'calendar-date', re: /\b20\d\d-\d\d-\d\d\b/g },
  { key: 'explicit-pound-load', re: /\b\d+(?:\.\d+)?\s*(?:lb|lbs|pounds?)\b/gi },
  { key: 'percent-plus-rendered-number', re: /(?:@|•)\s*\d+(?:\.\d+)?%\s*\(\s*\d{2,3}(?:\.\d+)?\s*\)/g },
  { key: 'hash-pound-load', re: /\b\d{2,3}\s*#\b/g },
]

for (let week = 1; week <= 54; week += 1) {
  const file = path.join(sourceDir, `week-${String(week).padStart(2, '0')}.ts`)
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0
      if (pattern.re.test(lines[i])) {
        findings.push({ week, line: i + 1, type: pattern.key, text: lines[i].trim() })
      }
    }
  }
}

if (findings.length) {
  console.error(JSON.stringify({ result: 'FAIL', findings }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ result: 'PASS', weeksScanned: 54, athleteDerivedExactLoads: 0, calendarDates: 0 }, null, 2))
