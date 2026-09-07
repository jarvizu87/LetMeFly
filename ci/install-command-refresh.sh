#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HTML="$ROOT_DIR/overlays/ui-command-v2/refresh/refresh.html"
JS="$ROOT_DIR/overlays/ui-command-v2/refresh/refresh.js"
DIST="$ROOT_DIR/.build-src/letmefly_app/dist"
INDEX="$DIST/index.html"

EXPECTED_HTML_SHA="60b88da7193ca19b99de5f81cc9a9b3173c44981bddb081410224a8ecc5b3d67"
EXPECTED_JS_SHA="d9ae39d28555bb4724de6126f78eef0cfc9414a25335ba874bb34d4879b229bc"

echo "$EXPECTED_HTML_SHA  $HTML" | sha256sum -c -
echo "$EXPECTED_JS_SHA  $JS" | sha256sum -c -

test -d "$DIST"
test -s "$INDEX"

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

test -s "$DIST/refresh.html"
test -s "$DIST/refresh.js"
grep -Fq "Your profile, workout history, and other athlete data are not being deleted" "$DIST/refresh.html"
grep -Fq "navigator.serviceWorker.getRegistrations" "$DIST/refresh.js"
grep -Fq "caches.keys" "$DIST/refresh.js"
! grep -Eq "localStorage\.clear|indexedDB\.deleteDatabase|Clear-Site-Data" "$DIST/refresh.js"

echo "LetMeFly production shell sanitation + safe cache refresh utility: PASS"
