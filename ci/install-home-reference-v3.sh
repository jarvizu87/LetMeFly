#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}\")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3.css"
GUARD_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3-route-guard.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3.js"
ICON_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/letmefly-official-icon-v3.svg"
MASK_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/letmefly-official-icon-maskable-v3.svg"
INDEX="$DIST_DIR/index.html"
MANIFEST="$DIST_DIR/manifest.webmanifest"
SW="$DIST_DIR/service-worker.js"

for f in "$INDEX" "$MANIFEST" "$SW" "$CSS_SRC" "$GUARD_SRC" "$JS_SRC" "$ICON_SRC" "$MASK_SRC"; do
  test -s "$f" || { echo "Missing required Home reference asset: $f" >&2; exit 1; }
done

node --check "$JS_SRC"
grep -Fq 'lmf-home-ref3-active' "$JS_SRC"
grep -Fq 'lmf-home-stat-strip' "$JS_SRC"
grep -Fq 'letmefly-private' "$JS_SRC"
! grep -Eq 'localStorage\.setItem|indexedDB\.deleteDatabase|programInstances.*put|workoutSessions.*put' "$JS_SRC"
grep -Fq 'Approved mockup is the layout contract' "$CSS_SRC"
grep -Fq '.lmf-approved-command-copy' "$CSS_SRC"
grep -Fq '.lmf-home-stat-strip' "$CSS_SRC"
grep -Fq 'body:not(.lmf-home-ref3-active)' "$GUARD_SRC"

mkdir -p "$DIST_DIR/ui"
cp "$CSS_SRC" "$DIST_DIR/ui/home-reference-v3.css"
cp "$GUARD_SRC" "$DIST_DIR/ui/home-reference-v3-route-guard.css"
cp "$JS_SRC" "$DIST_DIR/ui/home-reference-v3.js"

# Use the original Let Me Fly bird logo everywhere the existing shell expects its app mark.
# app-icon-v4.svg is intentionally overwritten so older compiled header references also get
# the corrected official artwork without changing application logic.
cp "$ICON_SRC" "$DIST_DIR/app-icon-v4.svg"
cp "$ICON_SRC" "$DIST_DIR/app-icon-official-v6.svg"
cp "$MASK_SRC" "$DIST_DIR/app-icon-official-maskable-v6.svg"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import json, os, re

root = Path(os.environ['DIST_DIR'])
index = root / 'index.html'
manifest_path = root / 'manifest.webmanifest'
sw_path = root / 'service-worker.js'

# Manifest: keep the existing app identity/data boundary, but point installation metadata
# at brand-new icon URLs so Chromium has a real metadata change to ingest.
manifest = json.loads(manifest_path.read_text())
manifest['name'] = 'LetMeFly'
manifest['short_name'] = 'LetMeFly'
manifest['background_color'] = '#090b10'
manifest['theme_color'] = '#090b10'
manifest['icons'] = [
    {'src':'/app-icon-official-v6.svg?v=6','sizes':'any','type':'image/svg+xml','purpose':'any'},
    {'src':'/app-icon-official-maskable-v6.svg?v=6','sizes':'any','type':'image/svg+xml','purpose':'maskable'},
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

text = index.read_text()
css = '<link rel="stylesheet" href="/ui/home-reference-v3.css?v=3">'
guard = '<link rel="stylesheet" href="/ui/home-reference-v3-route-guard.css?v=3">'
js = '<script defer src="/ui/home-reference-v3.js?v=3"></script>'
text = re.sub(r'<link rel="manifest" href="[^"]+"\s*/?>', '<link rel="manifest" href="/manifest.webmanifest?v=brand-v6" />', text, count=1)
text = re.sub(r'<link rel="icon" href="[^"]+"(?: type="[^"]+")?\s*/?>', '<link rel="icon" href="/app-icon-official-v6.svg?v=6" type="image/svg+xml" />', text, count=1)
text = re.sub(r'<link rel="apple-touch-icon" href="[^"]+"\s*/?>', '<link rel="apple-touch-icon" href="/app-icon-official-v6.svg?v=6" />', text)
if 'rel="apple-touch-icon"' not in text:
    text = text.replace('</head>', '  <link rel="apple-touch-icon" href="/app-icon-official-v6.svg?v=6" />\n</head>', 1)
for marker in (css, guard):
    if marker not in text:
        text = text.replace('</head>', f'  {marker}\n</head>', 1)
if js not in text:
    text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one document')
index.write_text(text)

sw = sw_path.read_text()
sw = re.sub(r"const CACHE_NAME = '[^']+'", "const CACHE_NAME = 'letmefly-shell-v5-4-command-v2-8-brand-v6'", sw, count=1)
sw = re.sub(
    r"const PRECACHE = \[[^\n]+\]",
    "const PRECACHE = ['/', '/manifest.webmanifest?v=brand-v6', '/app-icon-v4.svg?v=4', '/app-icon-official-v6.svg?v=6', '/app-icon-official-maskable-v6.svg?v=6']",
    sw,
    count=1,
)
sw_path.write_text(sw)
PY

node --check "$DIST_DIR/ui/home-reference-v3.js"
test -s "$DIST_DIR/ui/home-reference-v3.css"
test -s "$DIST_DIR/ui/home-reference-v3-route-guard.css"
test -s "$DIST_DIR/app-icon-official-v6.svg"
test -s "$DIST_DIR/app-icon-official-maskable-v6.svg"
grep -Fq '/ui/home-reference-v3.css?v=3' "$INDEX"
grep -Fq '/ui/home-reference-v3-route-guard.css?v=3' "$INDEX"
grep -Fq '/ui/home-reference-v3.js?v=3' "$INDEX"
grep -Fq '/manifest.webmanifest?v=brand-v6' "$INDEX"
grep -Fq '/app-icon-official-v6.svg?v=6' "$INDEX"
grep -Fq 'app-icon-official-v6.svg?v=6' "$MANIFEST"
grep -Fq 'app-icon-official-maskable-v6.svg?v=6' "$MANIFEST"
grep -Fq '"purpose": "maskable"' "$MANIFEST"
grep -Fq 'letmefly-shell-v5-4-command-v2-8-brand-v6' "$SW"
grep -Fq '/app-icon-official-v6.svg?v=6' "$SW"

echo "LetMeFly approved Home reference v3 + official logo PWA icon brand v6: PASS"
