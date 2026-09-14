#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HTML="$ROOT_DIR/overlays/ui-command-v2/refresh/refresh.html"
JS="$ROOT_DIR/overlays/ui-command-v2/refresh/refresh.js"
PWA_UPDATE_JS="$ROOT_DIR/overlays/ui-command-v2/refresh/pwa-update-v1.js"
DIST="$ROOT_DIR/.build-src/letmefly_app/dist"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

EXPECTED_HTML_SHA="60b88da7193ca19b99de5f81cc9a9b3173c44981bddb081410224a8ecc5b3d67"
EXPECTED_JS_SHA="d9ae39d28555bb4724de6126f78eef0cfc9414a25335ba874bb34d4879b229bc"
EXPECTED_PWA_UPDATE_JS_SHA="93bfbd295be1bb827156906325f5d08bdaaa5eadf2e903123f19fcc3f1473b2c"

echo "$EXPECTED_HTML_SHA  $HTML" | sha256sum -c -
echo "$EXPECTED_JS_SHA  $JS" | sha256sum -c -
echo "$EXPECTED_PWA_UPDATE_JS_SHA  $PWA_UPDATE_JS" | sha256sum -c -
node --check "$PWA_UPDATE_JS"

test -d "$DIST"
test -s "$INDEX"
test -s "$SW"

# Some legacy source layers left a complete second HTML document appended after
# the real Vite document. Browsers can still discover favicon/manifest links in
# that stale tail, which allowed retired branding to survive. Keep only the
# first complete document in the production shell.
INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['INDEX'])
text = p.read_text()
end = text.lower().find('</html>')
if end < 0:
    raise SystemExit('production index is missing </html>')
clean = text[: end + len('</html>')].rstrip() + '\n'
p.write_text(clean)
PY

# The shipping shell must contain one document and only the current LetMeFly
# PWA identity. Fail the release if any old crown path leaks back in.
[[ "$(grep -Eic '<!doctype html>' "$INDEX")" -eq 1 ]]
[[ "$(grep -Eic '</html>' "$INDEX")" -eq 1 ]]
grep -Fq '/manifest.webmanifest?v=brand-v5' "$INDEX"
grep -Fq '/app-icon-v4.svg?v=4' "$INDEX"
! grep -Fq '/icon-192.png' "$INDEX"
! grep -Fq '/icon-512.png' "$INDEX"
! grep -Fq 'app-icon-v3.svg' "$INDEX"

cp "$HTML" "$DIST/refresh.html"
cp "$JS" "$DIST/refresh.js"
mkdir -p "$DIST/ui"
cp "$PWA_UPDATE_JS" "$DIST/ui/pwa-update-v1.js"

test -s "$DIST/refresh.html"
test -s "$DIST/refresh.js"
test -s "$DIST/ui/pwa-update-v1.js"
grep -Fq "Your profile, workout history, and other athlete data are not being deleted" "$DIST/refresh.html"
grep -Fq "navigator.serviceWorker.getRegistrations" "$DIST/refresh.js"
grep -Fq "caches.keys" "$DIST/refresh.js"
! grep -Eq "localStorage\.clear|indexedDB\.deleteDatabase|Clear-Site-Data" "$DIST/refresh.js"

# Make every deployed commit produce a byte-distinct service worker. That gives
# installed PWAs a reliable update signal even when the static service-worker
# source itself did not otherwise change between releases.
RELEASE_TOKEN="${COMMIT_REF:-${GITHUB_SHA:-}}"
if [[ -z "$RELEASE_TOKEN" ]]; then
  RELEASE_TOKEN="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || printf 'local')"
fi

INDEX="$INDEX" SW="$SW" RELEASE_TOKEN="$RELEASE_TOKEN" python - <<'PY'
from pathlib import Path
import json
import os
import re

index = Path(os.environ['INDEX'])
sw_path = Path(os.environ['SW'])
release_token = os.environ['RELEASE_TOKEN']

index_text = index.read_text()
script = '<script defer src="/ui/pwa-update-v1.js?v=1"></script>'
if script not in index_text:
    if '</body>' not in index_text:
        raise SystemExit('production index is missing </body> for PWA update control')
    index_text = index_text.replace('</body>', f'  {script}\n</body>', 1)
index.write_text(index_text)

sw = sw_path.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", sw, re.S)
if not match:
    raise SystemExit('service worker PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
for asset in ['/ui/pwa-update-v1.js', '/ui/pwa-update-v1.js?v=1']:
    if asset not in existing:
        existing.append(asset)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in existing) + ']'
sw = sw[:match.start()] + replacement + sw[match.end():]

marker = '// LetMeFly PWA Update Control v1'
token_line = f"const LMF_RELEASE_TOKEN = {json.dumps(release_token)}"
if marker in sw:
    sw, count = re.subn(r"const LMF_RELEASE_TOKEN = .*", token_line, sw, count=1)
    if count != 1:
        raise SystemExit('existing PWA update block is missing release token')
else:
    block = f'''\n\n{marker}\n{token_line}\nself.addEventListener('install', () => {{\n  void self.skipWaiting()\n}})\nself.addEventListener('message', (event) => {{\n  if (event.data && event.data.type === 'LMF_SKIP_WAITING') void self.skipWaiting()\n}})\nself.addEventListener('activate', (event) => {{\n  event.waitUntil(self.clients.claim())\n}})\n'''
    sw = sw.rstrip() + block

sw_path.write_text(sw.rstrip() + '\n')
PY

node --check "$DIST/ui/pwa-update-v1.js"
grep -Fq '/ui/pwa-update-v1.js?v=1' "$INDEX"
grep -Fq 'data-lmf-update-control' "$DIST/ui/pwa-update-v1.js"
grep -Fq 'CHECK NOW' "$DIST/ui/pwa-update-v1.js"
grep -Fq 'UPDATE NOW' "$DIST/ui/pwa-update-v1.js"
grep -Fq 'reg.update()' "$DIST/ui/pwa-update-v1.js"
grep -Fq 'controllerchange' "$DIST/ui/pwa-update-v1.js"
grep -Fq 'LMF_SKIP_WAITING' "$DIST/ui/pwa-update-v1.js"
grep -Fq "'/ui/pwa-update-v1.js'" "$SW"
grep -Fq "'/ui/pwa-update-v1.js?v=1'" "$SW"
grep -Fq 'const LMF_RELEASE_TOKEN = ' "$SW"
grep -Fq "event.data.type === 'LMF_SKIP_WAITING'" "$SW"
grep -Fq 'self.skipWaiting()' "$SW"
grep -Fq 'self.clients.claim()' "$SW"
! grep -Eq "localStorage\.clear|indexedDB\.deleteDatabase|caches\.delete|Clear-Site-Data" "$DIST/ui/pwa-update-v1.js"

echo "LetMeFly production shell sanitation + safe cache refresh utility + in-app PWA update control: PASS"
