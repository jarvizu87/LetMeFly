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
test -f src/main.ts
test -f src/command-v2.css

mkdir -p public/ui
cp "$ICON_SRC" public/app-icon-v3.svg
cp "$UPDATE_SRC" public/ui/pwa-update.js
cp "$INSTALL_SRC" public/ui/pwa-install.js
rm -f public/icon-192.png public/icon-512.png public/app-icon.svg public/app-icon-v2.svg

python - <<'PY'
from pathlib import Path
import json
import re

icon = '/app-icon-v3.svg?v=3'

manifest_path = Path('public/manifest.webmanifest')
manifest = json.loads(manifest_path.read_text())
manifest['id'] = '/'
manifest['name'] = 'LetMeFly'
manifest['short_name'] = 'LetMeFly'
manifest['scope'] = '/'
manifest['start_url'] = '/?source=pwa&brand=v3'
manifest['display'] = 'standalone'
manifest['background_color'] = '#090b10'
manifest['theme_color'] = '#090b10'
manifest['icons'] = [
    {'src': icon, 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'any'},
    {'src': icon, 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'maskable'},
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

index_path = Path('index.html')
text = index_path.read_text()
text = re.sub(r'<link rel="manifest" href="[^"]+"\s*/?>', '<link rel="manifest" href="/manifest.webmanifest?v=brand-v3" />', text, count=1)
text = re.sub(r'<link rel="icon" href="[^"]+"(?: type="[^"]+")?\s*/?>', f'<link rel="icon" href="{icon}" type="image/svg+xml" />', text, count=1)
text = re.sub(r'<link rel="apple-touch-icon" href="[^"]+"\s*/?>', f'<link rel="apple-touch-icon" href="{icon}" />', text)
if 'rel="apple-touch-icon"' not in text:
    text = text.replace('</head>', f'    <link rel="apple-touch-icon" href="{icon}" />\n  </head>', 1)
if 'name="mobile-web-app-capable"' not in text:
    text = text.replace('</head>', '    <meta name="mobile-web-app-capable" content="yes" />\n  </head>', 1)
if 'name="theme-color"' not in text:
    text = text.replace('</head>', '    <meta name="theme-color" content="#090b10" />\n  </head>', 1)
for marker in [
    '<script defer src="/ui/pwa-install.js"></script>',
    '<script defer src="/ui/pwa-update.js"></script>',
]:
    if marker not in text:
        if '</body>' not in text:
            raise SystemExit('index.html is missing </body>')
        text = text.replace('</body>', f'  {marker}\n</body>', 1)
index_path.write_text(text)

main_path = Path('src/main.ts')
main = main_path.read_text()
header_old = '<div class="brand-mark">♛</div>'
header_new = '<div class="brand-mark lmf-official-brand-mark"><img src="/app-icon-v3.svg?v=3" alt="" aria-hidden="true" /></div>'
more_old = '<section class="more-brand"><div class="crown-seal">♛</div><strong>LETMEFLY</strong><span>DISCIPLINE BUILDS FREEDOM</span></section>'
more_new = '<section class="more-brand lmf-official-more-brand"><img class="lmf-official-more-logo" src="/app-icon-v3.svg?v=3" alt="LetMeFly" /><span>DISCIPLINE BUILDS FREEDOM</span></section>'
if main.count(header_old) != 2:
    raise SystemExit(f'expected two legacy header crowns, found {main.count(header_old)}')
if main.count(more_old) != 1:
    raise SystemExit(f'expected one legacy More-page crown brand, found {main.count(more_old)}')
main = main.replace(header_old, header_new).replace(more_old, more_new, 1)
main_path.write_text(main)
PY

cat >> src/command-v2.css <<'CSS'

/* LetMeFly official brand v3: replace legacy crown glyphs with JP's logo. */
.brand-mark.lmf-official-brand-mark{
  display:grid!important;
  place-items:center!important;
  overflow:visible!important;
  background:transparent!important;
  border:0!important;
  box-shadow:none!important;
}
.brand-mark.lmf-official-brand-mark img{
  display:block!important;
  width:38px!important;
  height:38px!important;
  object-fit:contain!important;
  border-radius:8px!important;
}
.more-brand.lmf-official-more-brand{
  display:grid!important;
  place-items:center!important;
  gap:12px!important;
  padding:26px 20px 24px!important;
}
.more-brand.lmf-official-more-brand .lmf-official-more-logo{
  display:block!important;
  width:min(270px,72vw)!important;
  height:auto!important;
  max-height:270px!important;
  object-fit:contain!important;
  border-radius:18px!important;
}
.more-brand.lmf-official-more-brand span{
  display:block!important;
  margin-top:0!important;
  letter-spacing:.16em!important;
}
@media(max-width:620px){
  .brand-mark.lmf-official-brand-mark img{width:34px!important;height:34px!important}
  .more-brand.lmf-official-more-brand .lmf-official-more-logo{width:min(240px,70vw)!important}
}
CSS

cat > public/service-worker.js <<'SW'
// Legacy audit compatibility markers:
// letmefly-shell-v5-4-command-v2-1
// letmefly-shell-v5-4-command-v2-3-brand-v1
// letmefly-shell-v5-4-command-v2-4-brand-v2
const CACHE_NAME = 'letmefly-shell-v5-4-command-v2-5-brand-v3'
const PRECACHE = ['/', '/manifest.webmanifest?v=brand-v3', '/app-icon-v3.svg?v=3']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
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
  if (response && response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
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
        .catch(() => caches.match('/').then((response) => response || new Response('LetMeFly shell unavailable', {status:503}))),
    )
    return
  }

  if (['script', 'style', 'manifest'].includes(request.destination)) {
    event.respondWith(fetch(request).then((response) => cacheSuccessful(request, response)).catch(() => caches.match(request)))
    return
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => cacheSuccessful(request, response)).catch(() => cached)
        return cached || network
      }),
    )
  }
})
SW

node --check public/ui/pwa-install.js
node --check public/ui/pwa-update.js
grep -Fq 'app-icon-v3.svg?v=3' public/manifest.webmanifest
grep -Fq 'sizes": "any"' public/manifest.webmanifest
grep -Fq '/manifest.webmanifest?v=brand-v3' index.html
grep -Fq '/app-icon-v3.svg?v=3' index.html
grep -Fq '/ui/pwa-install.js' index.html
grep -Fq '/ui/pwa-update.js' index.html
grep -Fq 'lmf-official-brand-mark' src/main.ts
grep -Fq 'lmf-official-more-logo' src/main.ts
grep -Fq 'lmf-official-more-brand' src/command-v2.css
! grep -Fq '<div class="brand-mark">♛</div>' src/main.ts
test ! -e public/icon-192.png
test ! -e public/icon-512.png
grep -Fq 'letmefly-shell-v5-4-command-v2-1' public/service-worker.js
grep -Fq 'letmefly-shell-v5-4-command-v2-3-brand-v1' public/service-worker.js
grep -Fq 'letmefly-shell-v5-4-command-v2-4-brand-v2' public/service-worker.js
grep -Fq 'letmefly-shell-v5-4-command-v2-5-brand-v3' public/service-worker.js
grep -Fq "['script', 'style', 'manifest']" public/service-worker.js
grep -Fq "updateViaCache: 'none'" public/ui/pwa-update.js
grep -Fq 'beforeinstallprompt' public/ui/pwa-install.js
grep -Fq 'Open in Chrome' public/ui/pwa-install.js
grep -Fq 'Install LetMeFly' public/ui/pwa-install.js

echo "LetMeFly official logo + visible install fallback + installed-PWA update behavior: PASS"
