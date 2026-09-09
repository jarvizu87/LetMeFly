#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3.css"
POLISH_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3-mobile-polish.css"
GUARD_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3-route-guard.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3.js"
ICON_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/letmefly-official-icon-v3.svg"
MASK_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/letmefly-official-icon-maskable-v3.svg"
INDEX="$DIST_DIR/index.html"
MANIFEST="$DIST_DIR/manifest.webmanifest"
SW="$DIST_DIR/service-worker.js"

for f in "$INDEX" "$MANIFEST" "$SW" "$CSS_SRC" "$POLISH_SRC" "$GUARD_SRC" "$JS_SRC" "$ICON_SRC" "$MASK_SRC"; do
  test -s "$f" || { echo "Missing required Home reference asset: $f" >&2; exit 1; }
done

node --check "$JS_SRC"
grep -Fq 'lmf-home-ref3-active' "$JS_SRC"
grep -Fq 'lmf-home-command-v4' "$JS_SRC"
grep -Fq 'lmf-home-source-v4' "$JS_SRC"
grep -Fq 'letmefly-private' "$JS_SRC"
! grep -Eq 'localStorage\.setItem|indexedDB\.deleteDatabase|programInstances.*put|workoutSessions.*put' "$JS_SRC"
grep -Fq 'Approved mockup is the layout contract' "$CSS_SRC"
grep -Fq '.lmf-home-v4-command' "$CSS_SRC"
grep -Fq '.lmf-home-v4-stats' "$CSS_SRC"
grep -Fq 'mobile hierarchy polish' "$POLISH_SRC"
grep -Fq 'grid-column: 1 / -1' "$POLISH_SRC"
grep -Fq 'body:not(.lmf-home-ref3-active)' "$GUARD_SRC"

mkdir -p "$DIST_DIR/ui"
cp "$CSS_SRC" "$DIST_DIR/ui/home-reference-v3.css"
cp "$POLISH_SRC" "$DIST_DIR/ui/home-reference-v3-mobile-polish.css"
cp "$GUARD_SRC" "$DIST_DIR/ui/home-reference-v3-route-guard.css"
cp "$JS_SRC" "$DIST_DIR/ui/home-reference-v3.js"

# Keep the official LetMeFly shell mark unchanged. Launcher/install icons use
# rasterized Cloudinary derivatives of the exact same official logo with a
# full-bleed #090b10 background so Android/Samsung never supplies a white tile.
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

icon_192 = 'https://res.cloudinary.com/extor5az/image/upload/e_trim/c_fit,h_172,w_172/b_rgb:090b10,c_pad,h_192,w_192/f_png/v1788815215/letmefly/app-brand/letmefly-app-icon-512-v2.png'
icon_512 = 'https://res.cloudinary.com/extor5az/image/upload/e_trim/c_fit,h_460,w_460/b_rgb:090b10,c_pad,h_512,w_512/f_png/v1788815215/letmefly/app-brand/letmefly-app-icon-512-v2.png'
icon_512_maskable = 'https://res.cloudinary.com/extor5az/image/upload/e_trim/c_fit,h_390,w_390/b_rgb:090b10,c_pad,h_512,w_512/f_png/v1788815215/letmefly/app-brand/letmefly-app-icon-512-v2.png'

manifest = json.loads(manifest_path.read_text())
manifest['name'] = 'LetMeFly'
manifest['short_name'] = 'LetMeFly'
manifest['background_color'] = '#090b10'
manifest['theme_color'] = '#090b10'
manifest['icons'] = [
    {'src':icon_192,'sizes':'192x192','type':'image/png','purpose':'any'},
    {'src':icon_512,'sizes':'512x512','type':'image/png','purpose':'any'},
    {'src':icon_512_maskable,'sizes':'512x512','type':'image/png','purpose':'maskable'},
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

text = index.read_text()
# Remove stale Home asset tags first so the structural rebuild never loads beside an older Home runtime.
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/home-reference-v3(?:-mobile-polish|-route-guard)?\.css\?v=[^"]+">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/home-reference-v3\.js\?v=[^"]+"></script>\s*', '\n', text)

css = '<link rel="stylesheet" href="/ui/home-reference-v3.css?v=4">'
polish = '<link rel="stylesheet" href="/ui/home-reference-v3-mobile-polish.css?v=2">'
guard = '<link rel="stylesheet" href="/ui/home-reference-v3-route-guard.css?v=4">'
js = '<script defer src="/ui/home-reference-v3.js?v=4"></script>'
text = re.sub(r'<link rel="manifest" href="[^"]+"\s*/?>', '<link rel="manifest" href="/manifest.webmanifest?v=brand-v7" />', text, count=1)
text = re.sub(r'<link rel="icon" href="[^"]+"(?: type="[^"]+")?\s*/?>', '<link rel="icon" href="/app-icon-official-v6.svg?v=6" type="image/svg+xml" />', text, count=1)
text = re.sub(r'<link rel="apple-touch-icon" href="[^"]+"\s*/?>', f'<link rel="apple-touch-icon" href="{icon_192}" />', text)
if 'rel="apple-touch-icon"' not in text:
    text = text.replace('</head>', f'  <link rel="apple-touch-icon" href="{icon_192}" />\n</head>', 1)
for marker in (css, polish, guard):
    text = text.replace('</head>', f'  {marker}\n</head>', 1)
text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one document')
index.write_text(text)

sw = sw_path.read_text()
sw = re.sub(r"const CACHE_NAME = '[^']+'", "const CACHE_NAME = 'letmefly-shell-v5-4-command-v2-10-brand-v7-home-v4'", sw, count=1)
sw = re.sub(
    r"const PRECACHE = \[[^\n]+\]",
    "const PRECACHE = ['/', '/manifest.webmanifest?v=brand-v7', '/app-icon-v4.svg?v=4', '/app-icon-official-v6.svg?v=6']",
    sw,
    count=1,
)
sw_path.write_text(sw)
PY

node --check "$DIST_DIR/ui/home-reference-v3.js"
test -s "$DIST_DIR/ui/home-reference-v3.css"
test -s "$DIST_DIR/ui/home-reference-v3-mobile-polish.css"
test -s "$DIST_DIR/ui/home-reference-v3-route-guard.css"
test -s "$DIST_DIR/app-icon-official-v6.svg"
test -s "$DIST_DIR/app-icon-official-maskable-v6.svg"
grep -Fq '/ui/home-reference-v3.css?v=4' "$INDEX"
grep -Fq '/ui/home-reference-v3-mobile-polish.css?v=2' "$INDEX"
grep -Fq '/ui/home-reference-v3-route-guard.css?v=4' "$INDEX"
grep -Fq '/ui/home-reference-v3.js?v=4' "$INDEX"
! grep -Fq '/ui/home-reference-v3.js?v=3' "$INDEX"
grep -Fq '/manifest.webmanifest?v=brand-v7' "$INDEX"
grep -Fq '/app-icon-official-v6.svg?v=6' "$INDEX"
grep -Fq 'e_trim/c_fit,h_172,w_172/b_rgb:090b10,c_pad,h_192,w_192/f_png' "$MANIFEST"
grep -Fq 'e_trim/c_fit,h_460,w_460/b_rgb:090b10,c_pad,h_512,w_512/f_png' "$MANIFEST"
grep -Fq 'e_trim/c_fit,h_390,w_390/b_rgb:090b10,c_pad,h_512,w_512/f_png' "$MANIFEST"
grep -Fq '"sizes": "192x192"' "$MANIFEST"
grep -Fq '"sizes": "512x512"' "$MANIFEST"
grep -Fq '"purpose": "maskable"' "$MANIFEST"
grep -Fq 'letmefly-shell-v5-4-command-v2-10-brand-v7-home-v4' "$SW"
grep -Fq '/manifest.webmanifest?v=brand-v7' "$SW"

echo "LetMeFly structural Home v4 + Android-safe raster PWA icon brand v7: PASS"
