#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HTML="$ROOT_DIR/overlays/ui-command-v2/refresh/refresh.html"
JS="$ROOT_DIR/overlays/ui-command-v2/refresh/refresh.js"
DIST="$ROOT_DIR/.build-src/letmefly_app/dist"

EXPECTED_HTML_SHA="60b88da7193ca19b99de5f81cc9a9b3173c44981bddb081410224a8ecc5b3d67"
EXPECTED_JS_SHA="d9ae39d28555bb4724de6126f78eef0cfc9414a25335ba874bb34d4879b229bc"

echo "$EXPECTED_HTML_SHA  $HTML" | sha256sum -c -
echo "$EXPECTED_JS_SHA  $JS" | sha256sum -c -

test -d "$DIST"
cp "$HTML" "$DIST/refresh.html"
cp "$JS" "$DIST/refresh.js"

test -s "$DIST/refresh.html"
test -s "$DIST/refresh.js"
grep -Fq "Your profile, workout history, and other athlete data are not being deleted" "$DIST/refresh.html"
grep -Fq "navigator.serviceWorker.getRegistrations" "$DIST/refresh.js"
grep -Fq "caches.keys" "$DIST/refresh.js"
! grep -Eq "localStorage\.clear|indexedDB\.deleteDatabase|Clear-Site-Data" "$DIST/refresh.js"

echo "LetMeFly safe cache refresh utility: PASS"
