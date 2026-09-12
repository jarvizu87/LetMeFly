import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const read = (relative) => fs.readFileSync(path.join(dist, relative), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const required = [
  'index.html',
  'service-worker.js',
  'ui/approved-tab-redesigns-v1.js',
  'ui/approved-tab-redesigns-v1.css',
]
for (const relative of required) {
  assert(fs.existsSync(path.join(dist, relative)), `Missing approved-tab redesign asset: ${relative}`)
  assert(fs.statSync(path.join(dist, relative)).size > 0, `Empty approved-tab redesign asset: ${relative}`)
}

const index = read('index.html')
const sw = read('service-worker.js')
const js = read('ui/approved-tab-redesigns-v1.js')
const css = read('ui/approved-tab-redesigns-v1.css')

for (const asset of ['/ui/approved-tab-redesigns-v1.js','/ui/approved-tab-redesigns-v1.css']) {
  assert(index.includes(asset), `index.html missing ${asset}`)
  assert(sw.includes(asset), `service-worker PRECACHE missing ${asset}`)
}
assert(index.indexOf('/ui/app-consistency-v1.css') < index.indexOf('/ui/approved-tab-redesigns-v1.css'), 'Approved tab CSS must load after app consistency CSS')

for (const route of ['program','progress','exercises','profile']) {
  assert(js.includes(`'${route}'`), `Approved redesign layer missing route: ${route}`)
}
for (const marker of [
  'lmf-approved-program-tabs-v1',
  'lmf-progress-worldbar-v1',
  'lmf-approved-exercises-layout-v1',
  'lmf-profile-character-sheet-v1',
  'GOAL TRACKER',
]) {
  assert(js.includes(marker), `Approved redesign JS missing marker: ${marker}`)
}
for (const marker of [
  '.lmf-approved-program-hero-v1',
  '.lmf-approved-progress-v1',
  '.lmf-approved-exercises-layout-v1',
  '.lmf-profile-character-sheet-v1',
  '.lmf-profile-v2-avatar{display:none!important}',
  '@media(max-width:720px)',
]) {
  assert(css.includes(marker), `Approved redesign CSS missing marker: ${marker}`)
}

for (const forbidden of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','setItem(','programInstances','trainingMaxHistory','workoutSessions','personalRecords','bodyweightEntries']) {
  assert(!js.includes(forbidden), `Approved redesign presentation layer contains forbidden data/state API: ${forbidden}`)
}
assert(!/background-image:[^;]*exercise-art/.test(css), 'Approved redesign layer must not replace governed exercise art')
assert(!/url\([^)]*exercise[^)]*\)/i.test(css), 'Approved redesign CSS must not introduce alternate exercise image sources')

console.log('Approved Program + Progress + Exercises + Profile redesign audit: PASS')
