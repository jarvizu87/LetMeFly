import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const read = (relative) => fs.readFileSync(path.join(dist, relative), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const required = [
  'index.html',
  'service-worker.js',
  'ui/more-workspace-v1.js',
  'ui/more-workspace-v1.css',
  'ui/app-consistency-v1.css',
]
for (const relative of required) {
  assert(fs.existsSync(path.join(dist, relative)), `Missing More/consistency asset: ${relative}`)
  assert(fs.statSync(path.join(dist, relative)).size > 0, `Empty More/consistency asset: ${relative}`)
}

const index = read('index.html')
const sw = read('service-worker.js')
const js = read('ui/more-workspace-v1.js')
const moreCss = read('ui/more-workspace-v1.css')
const consistencyCss = read('ui/app-consistency-v1.css')

for (const asset of [
  '/ui/more-workspace-v1.js',
  '/ui/more-workspace-v1.css',
  '/ui/app-consistency-v1.css',
]) {
  assert(index.includes(asset), `index.html missing ${asset}`)
  assert(sw.includes(asset), `service-worker PRECACHE missing ${asset}`)
}
assert(index.indexOf('/ui/more-workspace-v1.css') < index.indexOf('/ui/app-consistency-v1.css'), 'Consistency CSS must load after More CSS')

for (const title of ['Calendar','Nutrition','Readiness','Testing','Utilities','Resources','Data & Backup','Settings','Help & Support']) {
  assert(js.includes(`title: '${title}'`), `More workspace missing card: ${title}`)
}
for (const deadRoute of ['#/nutrition','#/readiness','#/testing','#/utilities','#/resources','#/data','#/support']) {
  assert(!js.includes(`route: '${deadRoute}'`), `More workspace points to unsupported route ${deadRoute}`)
}
for (const forbidden of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','setItem(']) {
  assert(!js.includes(forbidden), `More presentation layer contains forbidden state/network API: ${forbidden}`)
}

assert(moreCss.includes('--lmf-more-accent:#a855f7'), 'More approved purple accent missing')
assert(moreCss.includes('.lmf-more-grid-v1.command-menu-grid'), 'More desktop/mobile card grid missing')
assert(moreCss.includes('@media(max-width:720px)'), 'More mobile behavior missing')
assert(moreCss.includes("url('/ui/home-mountain-cinematic-v2.webp')"), 'More hero must reuse the canonical Home mountain asset')
assert(!moreCss.includes("url('/ui/mountain-command-cinematic-v2.webp')"), 'More hero references obsolete/nonexistent mountain asset path')
assert(consistencyCss.includes('--lmf-ui-accent:#a855f7'), 'Shared purple theme token missing')
assert(consistencyCss.includes('.nav-item.active'), 'Shared active navigation treatment missing')
assert(consistencyCss.includes('[data-exercise-art]'), 'Exercise-art consistency guard missing')
assert(consistencyCss.includes('.danger'), 'Safety/destructive semantic guard missing')
assert(!consistencyCss.includes('background-image:var(--exercise-art'), 'Consistency layer must not replace governed exercise art')

console.log('More workspace + final LetMeFly consistency audit: PASS')
