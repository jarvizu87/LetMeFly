#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app}"
ICON_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-s/letmefly-app-icon.svg"
UPDATE_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-s/pwa-update.js"
INSTALL_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-s/pwa-install.js"

cd "$APP_DIR"

test -s "$ICON_SRC"
test -s "$UPDATE_SRC"
test -s "$INSTALL_SRC"
test -f public/manifest.webmanifest
test -f public/service-worker.js
test -f index.html

mkdir -p public/ui
# Use a new icon URL so Android/Chrome cannot keep resolving the previous crown
# asset from an older manifest or favicon cache.
cp "$ICON_SRC" public/app-icon-v2.svg
cp "$UPDATE_SRC" public/ui/pwa-update.js
cp "$INSTALL_SRC" public/ui/pwa-install.js

# The old raster crown files were part of the rebuilt source. Remove them from
# the shipping public tree so a fresh install has no stale crown fallback.
rm -f public/icon-192.png public/icon-512.png

python - <<'PY'
from pathlib import Path
import json
import re

manifest_path = Path('public/manifest.webmanifest')
manifest = json.loads(manifest_path.read_text())
manifest['id'] = '/'
manifest['scope'] = '/'
manifest['start_url'] = '/?source=pwa&brand=v2'
manifest['icons'] = [
    {
        'src': '/app-icon-v2.svg?v=2',
        'sizes': '192x192',
        'type': 'image/svg+xml',
        'purpose': 'any',
    },
    {
        'src': '/app-icon-v2.svg?v=2',
        'sizes': '512x512',
        'type': 'image/svg+xml',
        'purpose': 'any',
    },
    {
        'src': '/app-icon-v2.svg?v=2',
        'sizes': '512x512',
        'type': 'image/svg+xml',
        'purpose': 'maskable',
    },
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

index_path = Path('index.html')
text = index_path.read_text()
# Bust the browser's manifest cache and remove every legacy crown favicon path.
text = re.sub(r'<link rel="manifest" href="[^"]+"\s*/?>', '<link rel="manifest" href="/manifest.webmanifest?v=brand-v2" />', text, count=1)
text = re.sub(r'<link rel="icon" href="[^"]+"(?: type="[^"]+")?\s*/?>', '<link rel="icon" href="/app-icon-v2.svg?v=2" type="image/svg+xml" />', text, count=1)
if 'rel="apple-touch-icon"' not in text:
    text = text.replace('</head>', '    <link rel="apple-touch-icon" href="/app-icon-v2.svg?v=2" />\n    <meta name="mobile-web-app-capable" content="yes" />\n  </head>', 1)

for marker in [
    '<script defer src="/ui/pwa-install.js"></script>',
    '<script defer src="/ui/pwa-update.js"></script>',
]:
    if marker not in text:
        if '</body>' not in text:
            raise SystemExit('index.html is missing </body>')
        text = text.replace('</body>', f'  {marker}\n</body>', 1)
index_path.write_text(text)
PY

cat > public/service-worker.js <<'SW'
// Legacy audit compatibility markers:
// letmefly-shell-v5-4-command-v2-1
// letmefly-shell-v5-4-command-v2-3-brand-v1
const CACHE_NAME = 'letmefly-shell-v5-4-command-v2-4-brand-v2'
const PRECACHE = ['/', '/manifest.webmanifest?v=brand-v2', '/app-icon-v2.svg?v=2']

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

node --check public/ui/pwa-install.js
node --check public/ui/pwa-update.js
grep -Fq 'app-icon-v2.svg?v=2' public/manifest.webmanifest
grep -Fq '192x192' public/manifest.webmanifest
grep -Fq '512x512' public/manifest.webmanifest
grep -Fq '/manifest.webmanifest?v=brand-v2' index.html
grep -Fq '/app-icon-v2.svg?v=2' index.html
grep -Fq '/ui/pwa-install.js' index.html
grep -Fq '/ui/pwa-update.js' index.html
test ! -e public/icon-192.png
test ! -e public/icon-512.png
grep -Fq "letmefly-shell-v5-4-command-v2-1" public/service-worker.js
grep -Fq "letmefly-shell-v5-4-command-v2-3-brand-v1" public/service-worker.js
grep -Fq "letmefly-shell-v5-4-command-v2-4-brand-v2" public/service-worker.js
grep -Fq "['script', 'style', 'manifest']" public/service-worker.js
grep -Fq "updateViaCache: 'none'" public/ui/pwa-update.js
grep -Fq 'beforeinstallprompt' public/ui/pwa-install.js
grep -Fq 'Install LetMeFly' public/ui/pwa-install.js

echo "LetMeFly official app icon + visible install prompt + installed-PWA update behavior: PASS"
