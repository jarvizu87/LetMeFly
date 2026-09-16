#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/inspect-progression-shadow-stage3-contracts.mjs <target-source-dir>')
  process.exit(2)
}

const candidates = [
  'src/db/local-db.ts',
  'src/db/local-mutations.ts',
  'src/services/readiness-service.ts',
  'src/services/workout-service.ts',
  'src/main.ts',
]

const terms = [
  /readiness/i,
  /coachingDecision/i,
  /before_state/i,
  /after_state/i,
  /workoutSessions/i,
  /workoutExercises/i,
  /workoutSets/i,
  /prescription_snapshot/i,
]

function excerpt(relative) {
  const full = path.join(target, relative)
  if (!fs.existsSync(full)) return { file: relative, exists: false, matches: [] }
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/)
  const found = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!terms.some((term) => term.test(lines[i]))) continue
    const start = Math.max(0, i - 2)
    const end = Math.min(lines.length, i + 3)
    found.push({
      line: i + 1,
      excerpt: lines.slice(start, end).map((line, offset) => `${start + offset + 1}: ${line}`).join('\n'),
    })
  }
  return { file: relative, exists: true, matches: found.slice(0, 80) }
}

const report = candidates.map(excerpt)
console.log('PROGRESSION_SHADOW_STAGE3_CONTRACT_REPORT_BEGIN')
console.log(JSON.stringify(report, null, 2))
console.log('PROGRESSION_SHADOW_STAGE3_CONTRACT_REPORT_END')
