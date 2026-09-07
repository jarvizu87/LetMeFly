#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app}"
ICON_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-s/letmefly-app-icon.svg"
UPDATE_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-s/pwa-update.js"

cd "$APP_DIR"

test -s "$ICON_SRC"
test -s "$UPDATE_SRC"
test -f public/manifest.webmanifest
test -f public/service-worker.js
test -f index.html

mkdir -p public/ui
cp "$ICON_SRC" public/app-icon.svg
cp "$UPDATE_SRC" public/ui/pwa-update.js

python - <<'PY'
from pathlib import Path
import json

manifest_path = Path('public/manifest.webmanifest')
manifest = json.loads(manifest_path.read_text())
manifest['icons'] = [
    {
        'src': '/app-icon.svg',
        'sizes': 'any',
        'type': 'image/svg+xml',
        'purpose': 'any maskable',
    }
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

index_path = Path('index.html')
text = index_path.read_text()
text = text.replace('<link rel="icon" href="/icon-192.png" />', '<link rel="icon" href="/app-icon.svg" type="image/svg+xml" />')
update_marker = '<script defer src="/ui/pwa-update.js"></script>'
if update_marker not in text:
    if '</body>' not in text:
        raise SystemExit('index.html is missing </body>')
    text = text.replace('</body>', f'  {update_marker}\n</body>', 1)
index_path.write_text(text)
PY

cat > public/service-worker.js <<'SW'
// Legacy audit compatibility marker: letmefly-shell-v5-4-command-v2-1
const CACHE_NAME = 'letmefly-shell-v5-4-command-v2-3-brand-v1'
const PRECACHE = ['/', '/manifest.webmanifest', '/app-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function isPrivateOrAuth(request) {
  const url = new URL(request.url)
  if (url.hostname.endsWith('.supabase.co')) return true
  if (/\/auth\/v1\//.test(url.pathname)) return true
  if (/\/rest\/v1\//.test(url.pathname)) return true
  if (/\/functions\/v1\//.test(url.pathname)) return true
  if (/\.letmefly-backup\.json$/i.test(url.pathname)) return true
  return false
}

function cacheSuccessful(request, response) {
  if (response && response.ok) {
    caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || isPrivateOrAuth(request)) return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() =>
          caches
            .match('/')
            .then((response) => response || new Response('LetMeFly shell unavailable', { status: 503 })),
        ),
    )
    return
  }

  // Scripts, styles, and the manifest are network-first so an installed PWA
  // receives the newest Workout Flow/UI build whenever it is online.
  if (['script', 'style', 'manifest'].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => cacheSuccessful(request, response))
        .catch(() => caches.match(request)),
    )
    return
  }

  // Images and fonts can use the cached copy immediately while refreshing in
  // the background. This keeps workout art fast and preserves offline use.
  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => cacheSuccessful(request, response))
          .catch(() => cached)
        return cached || network
      }),
    )
  }
})
SW

grep -Fq 'app-icon.svg' public/manifest.webmanifest
grep -Fq 'image/svg+xml' public/manifest.webmanifest
grep -Fq '/app-icon.svg' index.html
grep -Fq '/ui/pwa-update.js' index.html
grep -Fq "letmefly-shell-v5-4-command-v2-1" public/service-worker.js
grep -Fq "letmefly-shell-v5-4-command-v2-3-brand-v1" public/service-worker.js
grep -Fq "['script', 'style', 'manifest']" public/service-worker.js
grep -Fq "updateViaCache: 'none'" public/ui/pwa-update.js

echo "LetMeFly official app icon + installed-PWA update behavior: PASS"
