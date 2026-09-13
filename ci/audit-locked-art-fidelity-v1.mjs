import fs from 'node:fs'
import path from 'node:path'
import { validateLockedArt } from './validate-locked-art-source.mjs'
import { validateMockupScenes } from './validate-mockup-scenes.mjs'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const read = (relative) => fs.readFileSync(path.join(dist, relative), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const required = [
  'index.html',
  'service-worker.js',
  'ui/locked-art-fidelity-v1.css',
  'ui/raizen-black-crown-ascension-v1.svg',
  'ui/home-train-reference-v1.css',
  'ui/home-train-reference-v1.js',
  'ui/train-block-cards-v1.css',
  'ui/brand-display-v1.css',
]
for (const relative of required) {
  assert(fs.existsSync(path.join(dist, relative)), `Missing locked-art fidelity asset: ${relative}`)
  assert(fs.statSync(path.join(dist, relative)).size > 0, `Empty locked-art fidelity asset: ${relative}`)
}

const index = read('index.html')
const sw = read('service-worker.js')
const css = read('ui/locked-art-fidelity-v1.css')
const art = read('ui/raizen-black-crown-ascension-v1.svg')
assert(index.includes('/ui/brand-display-v1.css?v=3') && sw.includes('/ui/brand-display-v1.css?v=3'), 'Larger official logo presentation is installed and cached')
assert(index.includes('/ui/home-reference-v3.js?v=5') && sw.includes('/ui/home-reference-v3.js?v=5'), 'Home loads the direct approved logo reference')
assert(index.includes('class="lmf-app-opening"'), 'Native boot root contains the larger opening logo')

assert(index.includes('/ui/locked-art-fidelity-v1.css?v=10'), 'index missing current locked art fidelity stylesheet')
assert(index.indexOf('/ui/color-harmonization-v1.css') < index.indexOf('/ui/locked-art-fidelity-v1.css'), 'locked art fidelity must load after color harmonization')
for (const asset of ['/ui/locked-art-fidelity-v1.css','/ui/raizen-black-crown-ascension-v1.svg']) {
  assert(sw.includes(asset), `service worker missing ${asset}`)
}
assert(art.includes('data:image/jpeg;base64,'), 'canonical Raizen art wrapper is not self-contained')
validateLockedArt(path.join(dist, 'ui/raizen-black-crown-ascension-v1.svg'))
assert(css.includes("--lmf-raizen-fenrir-art:url('/ui/raizen-black-crown-ascension-v1.svg?v=2')"), 'current Raizen/Fenrir art variable missing')
assert(sw.includes('/ui/raizen-black-crown-ascension-v1.svg?v=2'), 'service worker missing repaired identity image revision')
assert(sw.includes('-locked-ui-v23'), 'service worker must refresh the previously cached UI assets')
for (const extension of ['js','css']) {
  const asset = `/ui/home-train-reference-v1.${extension}?v=${extension === 'js' ? 5 : 4}`
  assert(index.includes(asset) && sw.includes(asset), `Home and Train correction is installed and cached: ${asset}`)
}
assert(index.indexOf('/ui/home-train-reference-v1.css') > index.indexOf('/ui/locked-art-fidelity-v1.css'), 'Home and Train correction follows the earlier visual layers')
assert(index.includes('/ui/train-block-cards-v1.css?v=3') && sw.includes('/ui/train-block-cards-v1.css?v=3'), 'The block-card layout is installed and cached')
assert(index.indexOf('/ui/train-block-cards-v1.css') > index.indexOf('/ui/home-train-reference-v1.css'), 'The final block-card composition follows the earlier card layout')
const trainBlocks = read('ui/train-block-cards-v1.css')
assert(!/url\(/.test(trainBlocks), 'Block styling must reuse the existing exercise pictures')
assert(trainBlocks.includes('mask-image:linear-gradient'), 'Existing pictures blend into the block card')
const homeTrain = read('ui/home-train-reference-v1.js')
for (const forbidden of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','setItem(']) assert(!homeTrain.includes(forbidden), 'Home/Train presentation does not write athlete state or call external services')
for(const item of validateMockupScenes(path.join(dist,'ui/mockup-scenes'))){
  const asset=`/ui/mockup-scenes/${item.scene}.svg`
  assert(css.includes(asset),`Scene is connected to the UI: ${asset}`)
  assert(sw.includes(asset),`Scene is available offline: ${asset}`)
}
for (const route of ['progress','exercises','coach','profile','more']) {
  assert(css.includes(`data-lmf-approved-route='${route}'`), `locked art layer missing ${route} route`)
}
for (const marker of ['.lmf-progress-worldbar-v1::after','.lmf-approved-exercises-hero-v1::after','.coach-banner::before','.lmf-profile-character-visual-v1','.lmf-more-brand-v1']) {
  assert(css.includes(marker), `locked art layer missing marker: ${marker}`)
}
for (const forbidden of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','setItem(','workoutSessions','trainingMaxHistory','programInstances']) {
  assert(!css.includes(forbidden), `locked art presentation layer contains forbidden state/data API: ${forbidden}`)
}
assert(!/library-thumb[^}]*url\(/i.test(css), 'locked art layer must not replace governed exercise thumbnails')
assert(!css.includes("data-lmf-approved-route='home'"), 'locked art layer must not override the authoritative Home mockup treatment')
assert(!css.includes("data-lmf-approved-route='train'"), 'locked art layer must not override governed Train exercise art')

console.log('Locked mockup Raizen + Fenrir art fidelity audit: PASS')
