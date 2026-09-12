import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const read = (relative) => fs.readFileSync(path.join(dist, relative), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const required = [
  'index.html',
  'service-worker.js',
  'ui/locked-art-fidelity-v1.css',
  'ui/raizen-black-crown-ascension-v1.jpg',
]
for (const relative of required) {
  assert(fs.existsSync(path.join(dist, relative)), `Missing locked-art fidelity asset: ${relative}`)
  assert(fs.statSync(path.join(dist, relative)).size > 0, `Empty locked-art fidelity asset: ${relative}`)
}

const index = read('index.html')
const sw = read('service-worker.js')
const css = read('ui/locked-art-fidelity-v1.css')
const art = fs.readFileSync(path.join(dist, 'ui/raizen-black-crown-ascension-v1.jpg'))

assert(index.includes('/ui/locked-art-fidelity-v1.css?v=2'), 'index missing locked art fidelity stylesheet')
assert(index.indexOf('/ui/color-harmonization-v1.css') < index.indexOf('/ui/locked-art-fidelity-v1.css'), 'locked art fidelity must load after color harmonization')
for (const asset of ['/ui/locked-art-fidelity-v1.css','/ui/raizen-black-crown-ascension-v1.jpg']) {
  assert(sw.includes(asset), `service worker missing ${asset}`)
}

// Validate the binary as a JPEG without assuming its EOI marker is the final
// byte pair. Valid JPEGs may legally carry application metadata or harmless
// trailing bytes after the encoded image. The fidelity contract is the actual
// raster format and canonical payload, not a particular encoder's trailer.
assert(art.length > 1024, 'canonical Raizen/Fenrir raster is unexpectedly small')
assert(art[0] === 0xff && art[1] === 0xd8 && art[2] === 0xff, 'canonical Raizen/Fenrir art is missing the JPEG SOI/marker sequence')
const hasJfif = art.subarray(6, 10).toString('ascii') === 'JFIF'
const hasExif = art.includes(Buffer.from('Exif\0\0', 'binary'))
const eoi = art.lastIndexOf(Buffer.from([0xff, 0xd9]))
assert(hasJfif || hasExif, 'canonical Raizen/Fenrir art is missing a recognized JPEG application header')
assert(eoi > 16, 'canonical Raizen/Fenrir art is missing a JPEG EOI marker')

assert(css.includes("--lmf-raizen-fenrir-art:url('/ui/raizen-black-crown-ascension-v1.jpg')"), 'Raizen/Fenrir art variable missing')
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

console.log('Locked mockup canonical Raizen + Fenrir art fidelity audit: PASS')
