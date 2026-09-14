import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] || '.build-src/letmefly_app'
const dist = path.join(root, 'dist')
const indexPath = path.join(dist, 'index.html')
const swPath = path.join(dist, 'service-worker.js')
const updatePath = path.join(dist, 'ui', 'pwa-update-v1.js')

const requireFile = (file) => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
    throw new Error(`Missing required PWA update artifact: ${file}`)
  }
  return fs.readFileSync(file, 'utf8')
}

const index = requireFile(indexPath)
const sw = requireFile(swPath)
const update = requireFile(updatePath)

const checks = [
  ['index loads PWA update controller', index.includes('/ui/pwa-update-v1.js?v=1')],
  ['settings exposes App updates', update.includes('App updates') && update.includes('CHECK NOW')],
  ['update-ready action exists', update.includes('UPDATE NOW')],
  ['manual service-worker check exists', update.includes('reg.update()')],
  ['controllerchange reload boundary exists', update.includes('controllerchange')],
  ['waiting-worker activation message exists', update.includes('LMF_SKIP_WAITING')],
  ['update controller is precached', sw.includes("'/ui/pwa-update-v1.js'")],
  ['release token makes deployments byte-distinct', sw.includes('const LMF_RELEASE_TOKEN = ')],
  ['service worker can skip waiting', sw.includes('self.skipWaiting()')],
  ['service worker claims controlled clients', sw.includes('self.clients.claim()')],
  ['service worker handles update activation message', sw.includes("event.data.type === 'LMF_SKIP_WAITING'")],
  ['update controller does not clear localStorage', !/localStorage\.clear/.test(update)],
  ['update controller does not delete IndexedDB', !/indexedDB\.deleteDatabase/.test(update)],
  ['update controller does not clear Cache Storage', !/caches\.delete/.test(update)],
  ['update controller does not use Clear-Site-Data', !/Clear-Site-Data/.test(update)],
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`PWA update audit ${label}: ${ok ? 'PASS' : 'FAIL'}`)
  if (!ok) failed += 1
}

if (failed) {
  throw new Error(`PWA update audit failed ${failed} check(s)`)
}

console.log('LetMeFly PWA Update Control v1 audit: PASS')
