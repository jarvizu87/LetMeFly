#!/usr/bin/env node
import fs from 'node:fs'

const tomlPath = process.argv[2] ?? 'netlify.toml'
const source = fs.readFileSync(tomlPath, 'utf8')
const commandMatch = source.match(/command\s*=\s*"([\s\S]*?)"\n\s*publish\s*=/)
if (!commandMatch) {
  console.error('Progression Shadow production wiring audit: Netlify build command not found')
  process.exit(1)
}

const command = commandMatch[1]
const steps = [
  'bash ci/build-command-v2-v2-1.sh',
  'bash ci/apply-skip-day-v1.sh .build-src/letmefly_app',
  'bash ci/apply-unskip-day-v1.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-current-v1.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-review-engine-v2.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-read-adapter-v3.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-pilot-journal-v4.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-provenance-review-v5.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-pilot-operations-v6.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-restore-authorization-v7.sh .build-src/letmefly_app',
  'bash ci/apply-progression-shadow-hidden-pilot-integration.sh .build-src/letmefly_app',
  'node ci/audit-progression-shadow-hidden-pilot-integration.mjs .build-src/letmefly_app',
  'npm --prefix .build-src/letmefly_app run typecheck',
  'npm --prefix .build-src/letmefly_app run build',
  'bash ci/install-smart-names-bar-loader.sh',
]

const failures = []
let previousIndex = -1
for (const step of steps) {
  const count = command.split(step).length - 1
  if (count !== 1) failures.push(`${step}: expected exactly once, found ${count}`)
  const index = command.indexOf(step)
  if (index < 0) failures.push(`${step}: missing`)
  if (index >= 0 && index <= previousIndex) failures.push(`${step}: out of order`)
  if (index >= 0) previousIndex = index
}

const forbidden = [
  '[release netlify]',
  'visibilityEnabled: true',
  'autoApplyAllowed: true',
]
for (const marker of forbidden) {
  if (command.includes(marker)) failures.push(`forbidden production command marker: ${marker}`)
}

if (!source.includes('publish = ".build-src/letmefly_app/dist"')) {
  failures.push('publish directory changed unexpectedly')
}

if (failures.length) {
  console.error('Progression Shadow production wiring audit: FAIL')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Progression Shadow production wiring audit: PASS')
console.log('- base production reconstruction precedes governed Skip and Unskip recovery overlays')
console.log('- Skip and Unskip each appear exactly once before Shadow')
console.log('- Stages 1–7 and hidden integration appear exactly once and in order')
console.log('- hidden integration is audited, typechecked, and rebuilt before UI installers')
console.log('- Netlify publish directory remains unchanged')
