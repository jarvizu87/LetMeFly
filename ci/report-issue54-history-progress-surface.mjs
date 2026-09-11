#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const files = [
  'src/main.ts',
  'src/services/workout-service.ts',
  'src/services/pr-service.ts',
  'src/services/personal-record-service.ts',
  'src/services/progress-service.ts',
].map(relative => ({ relative, absolute: path.join(target, relative) }))
const needles = [
  'history',
  'History',
  'personalRecord',
  'personalRecords',
  'PR',
  'workoutExercises',
  'exercise_name_snapshot',
  'substituted_from_exercise_key',
  'recentPerformance',
  'completed_at',
]

function excerpt(source, index, radius = 900) {
  const start = Math.max(0, index - radius)
  const end = Math.min(source.length, index + radius)
  return source.slice(start, end)
}

const blocks = []
for (const file of files) {
  if (!fs.existsSync(file.absolute)) continue
  const source = fs.readFileSync(file.absolute, 'utf8')
  const seen = new Set()
  for (const needle of needles) {
    let from = 0
    let count = 0
    while (count < 12) {
      const index = source.indexOf(needle, from)
      if (index < 0) break
      const line = source.slice(0, index).split('\n').length
      const key = `${file.relative}:${Math.floor(line / 12)}`
      if (!seen.has(key)) {
        seen.add(key)
        blocks.push({ file: file.relative, needle, line, code: excerpt(source, index) })
      }
      count += 1
      from = index + needle.length
    }
  }
}

const out = path.join(target, 'ISSUE54_HISTORY_PROGRESS_SURFACE.md')
const md = [
  '# Issue #54 History / Progress Integration Surface',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `Found ${blocks.length} relevant source excerpts.`,
  '',
  ...blocks.flatMap(block => [
    `## ${block.file}:${block.line} — ${block.needle}`,
    '',
    '```ts',
    block.code,
    '```',
    '',
  ]),
]
fs.writeFileSync(out, md.join('\n'))
console.log(`Issue #54 history/progress surface report: ${blocks.length} excerpt(s) -> ${out}`)
for (const block of blocks) console.log(`${block.file}:${block.line} ${block.needle}`)
