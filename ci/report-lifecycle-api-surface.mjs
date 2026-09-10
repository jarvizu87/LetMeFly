#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const files = [
  'src/services/athlete-service.ts',
  'src/services/workout-service.ts',
  'src/services/program-progression-service.ts',
  'src/db/local-db.ts',
  'src/db/local-mutations.ts',
]

const rows = []
for (const relative of files) {
  const absolute = path.join(target, relative)
  if (!fs.existsSync(absolute)) {
    rows.push({ file: relative, missing: true, exports: [] })
    continue
  }
  const source = fs.readFileSync(absolute, 'utf8')
  const exports = []
  const pattern = /^export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/gm
  let match
  while ((match = pattern.exec(source))) exports.push(match[1])
  rows.push({ file: relative, missing: false, exports })
}

const report = { generatedAt: new Date().toISOString(), files: rows }
const outJson = path.join(target, 'LIFECYCLE_API_SURFACE.json')
const outMd = path.join(target, 'LIFECYCLE_API_SURFACE.md')
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(outMd, [
  '# LetMeFly Lifecycle API Surface',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  ...rows.flatMap(row => [
    `## ${row.file}`,
    row.missing ? '- MISSING' : (row.exports.length ? row.exports.map(name => `- ${name}`).join('\n') : '- No named exports detected'),
    '',
  ]),
].join('\n'))

for (const row of rows) {
  console.log(`${row.file}: ${row.missing ? 'MISSING' : row.exports.join(', ')}`)
}
if (rows.some(row => row.missing)) process.exitCode = 1
