#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3.css"
POLISH_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3-mobile-polish.css"
GUARD_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3-route-guard.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ac/home-reference-v3.js"
BRAND_EXTRACTOR="$ROOT_DIR/ci/extract-authoritative-brand-v1.sh"
INDEX="$DIST_DIR/index.html"
MANIFEST="$DIST_DIR/manifest.webmanifest"
SW="$DIST_DIR/service-worker.js"

ICON_192_SHA="978b556783eeeaa4f0d87b8d929fcc22b91f0cbb05f61c8d29f1869d83e87e39"
ICON_512_SHA="864067cda8175f18919ca038c4b1d9bf82a865fceb4438ebe777bb0c1ac4c743"
ICON_MASKABLE_SHA="0e0262a8600d3fe62e45b645731264ea930ca4fd70ac28f91e1f671bf0d0fd5f"

for f in "$INDEX" "$MANIFEST" "$SW" "$CSS_SRC" "$POLISH_SRC" "$GUARD_SRC" "$JS_SRC" "$BRAND_EXTRACTOR"; do
  test -s "$f" || { echo "Missing required Home/brand asset: $f" >&2; exit 1; }
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

# Authoritative LetMeFly brand v1 runtime assets. The text transport was created
# from deterministic derivatives of the user-approved 1536x1536 master. Rebuild
# it locally, verify the gzip/tar container, then enforce the exact derivative
# SHA-256 hashes. No redraw, simplification, recolor, alternate mascot, or legacy
# Cloudinary logo is allowed through this layer.
BRAND_TMP="$(mktemp -d)"
trap 'rm -rf "$BRAND_TMP"' EXIT
bash "$BRAND_EXTRACTOR" "$BRAND_TMP"

ICON_192="$BRAND_TMP/letmefly-app-icon-192-v1.png"
ICON_512="$BRAND_TMP/letmefly-app-icon-512-v1.png"
ICON_MASKABLE="$BRAND_TMP/letmefly-app-icon-512-maskable-v1.png"
for f in "$ICON_192" "$ICON_512" "$ICON_MASKABLE"; do
  test -s "$f" || { echo "Authoritative brand transport is incomplete: $f" >&2; exit 1; }
done

echo "$ICON_192_SHA  $ICON_192" | sha256sum -c -
echo "$ICON_512_SHA  $ICON_512" | sha256sum -c -
echo "$ICON_MASKABLE_SHA  $ICON_MASKABLE" | sha256sum -c -

# Local, deterministic install assets. The 512 More-tab compatibility path is
# deliberately retained so any older compiled view receives the correct face.
cp "$ICON_192" "$DIST_DIR/app-icon-192.png"
cp "$ICON_512" "$DIST_DIR/app-icon-512.png"
cp "$ICON_MASKABLE" "$DIST_DIR/app-icon-512-maskable.png"
cp "$ICON_512" "$DIST_DIR/ui/letmefly-official-logo-512.png"

# Existing source bundles still reference app-icon-v4.svg in the header. Keep
# that stable path, but make it a compatibility wrapper around the approved
# raster artwork so the header, favicon, and PWA all show the same exact logo.
DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import base64, json, os, re

root = Path(os.environ['DIST_DIR'])
index = root / 'index.html'
manifest_path = root / 'manifest.webmanifest'
sw_path = root / 'service-worker.js'


def svg_from_png(png_path: Path, out_path: Path, size: int) -> None:
    data = base64.b64encode(png_path.read_bytes()).decode('ascii')
    out_path.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<image width="{size}" height="{size}" href="data:image/png;base64,{data}"/>'
        '</svg>\n'
    )

svg_from_png(root / 'app-icon-192.png', root / 'app-icon-v4.svg', 192)
svg_from_png(root / 'app-icon-512.png', root / 'app-icon-official-v6.svg', 512)
svg_from_png(root / 'app-icon-512-maskable.png', root / 'app-icon-official-maskable-v6.svg', 512)

manifest = json.loads(manifest_path.read_text())
manifest['name'] = 'LetMeFly'
manifest['short_name'] = 'LetMeFly'
manifest['background_color'] = '#090b10'
manifest['theme_color'] = '#090b10'
manifest['icons'] = [
    {'src':'/app-icon-192.png?v=8','sizes':'192x192','type':'image/png','purpose':'any'},
    {'src':'/app-icon-512.png?v=8','sizes':'512x512','type':'image/png','purpose':'any'},
    {'src':'/app-icon-512-maskable.png?v=8','sizes':'512x512','type':'image/png','purpose':'maskable'},
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
text = re.sub(r'<link rel="manifest" href="[^"]+"\s*/?>', '<link rel="manifest" href="/manifest.webmanifest?v=brand-v8" />', text, count=1)
text = re.sub(r'<link rel="icon" href="[^"]+"(?: type="[^"]+")?\s*/?>', '<link rel="icon" href="/app-icon-v4.svg?v=8" type="image/svg+xml" />', text, count=1)
text = re.sub(r'<link rel="apple-touch-icon" href="[^"]+"\s*/?>', '<link rel="apple-touch-icon" href="/app-icon-192.png?v=8" />', text)
if 'rel="apple-touch-icon"' not in text:
    text = text.replace('</head>', '  <link rel="apple-touch-icon" href="/app-icon-192.png?v=8" />\n</head>', 1)
for marker in (css, polish, guard):
    text = text.replace('</head>', f'  {marker}\n</head>', 1)
text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one document')
index.write_text(text)

# Move every compiled in-app brand reference to this cache generation. Also
# eliminate known broken legacy Cloudinary logo URLs if an older bundle kept one.
asset_replacements = {
    '/app-icon-v4.svg?v=4': '/app-icon-v4.svg?v=8',
    '/app-icon-v4.svg?v=6': '/app-icon-v4.svg?v=8',
    '/app-icon-official-v6.svg?v=6': '/app-icon-official-v6.svg?v=8',
    '/ui/letmefly-official-logo-512.png?v=6': '/ui/letmefly-official-logo-512.png?v=8',
}
cloudinary_rules = [
    (re.compile(r'https://res\.cloudinary\.com/extor5az/image/upload/[^\s"\'<>)]*letmefly/app-brand/letmefly-app-icon-192-v2\.png'), '/app-icon-192.png?v=8'),
    (re.compile(r'https://res\.cloudinary\.com/extor5az/image/upload/[^\s"\'<>)]*letmefly/app-brand/letmefly-app-icon-512-maskable-v2\.png'), '/app-icon-512-maskable.png?v=8'),
    (re.compile(r'https://res\.cloudinary\.com/extor5az/image/upload/[^\s"\'<>)]*letmefly/app-brand/letmefly-app-icon-512-v2\.png'), '/app-icon-512.png?v=8'),
]
for path in root.joinpath('assets').rglob('*'):
    if not path.is_file() or path.suffix not in {'.js', '.css', '.html'}:
        continue
    data = path.read_text(errors='ignore')
    original = data
    for old, new in asset_replacements.items():
        data = data.replace(old, new)
    for pattern, replacement in cloudinary_rules:
        data = pattern.sub(replacement, data)
    if data != original:
        path.write_text(data)

sw = sw_path.read_text()
sw = re.sub(r"const CACHE_NAME = '[^']+'", "const CACHE_NAME = 'letmefly-shell-v5-4-command-v2-11-brand-v8-home-v4'", sw, count=1)

# Preserve all non-brand precache entries installed by earlier feature layers,
# retire stale brand generations, then merge the authoritative local assets.
precache_match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", sw)
if not precache_match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing_precache = re.findall(r"['\"]([^'\"]+)['\"]", precache_match.group(1))

def stale_brand(asset: str) -> bool:
    return (
        asset.startswith('/manifest.webmanifest?v=brand-v')
        or asset.startswith('/app-icon-v4.svg?v=')
        or asset.startswith('/app-icon-official-v6.svg?v=')
        or asset.startswith('/app-icon-official-maskable-v6.svg?v=')
        or asset.startswith('/app-icon-192.png?v=')
        or asset.startswith('/app-icon-512.png?v=')
        or asset.startswith('/app-icon-512-maskable.png?v=')
        or asset.startswith('/ui/letmefly-official-logo-512.png?v=')
    )

preserved_precache = [asset for asset in existing_precache if not stale_brand(asset)]
required_brand_assets = [
    '/',
    '/manifest.webmanifest?v=brand-v8',
    '/app-icon-v4.svg?v=8',
    '/app-icon-192.png?v=8',
    '/app-icon-512.png?v=8',
    '/app-icon-512-maskable.png?v=8',
    '/ui/letmefly-official-logo-512.png?v=8',
]
merged_precache = []
for asset in [*preserved_precache, *required_brand_assets]:
    if asset not in merged_precache:
        merged_precache.append(asset)
for asset in preserved_precache:
    if asset not in merged_precache:
        raise SystemExit(f'Home branding update dropped existing PRECACHE asset: {asset}')
replacement = 'const PRECACHE = [' + ', '.join(repr(asset) for asset in merged_precache) + ']'
sw = sw[:precache_match.start()] + replacement + sw[precache_match.end():]
sw_path.write_text(sw)
PY

# Exact-fidelity gates: the approved derivatives must be the files that ship.
# These hashes make accidental replacement or corruption impossible to miss.
echo "$ICON_192_SHA  $DIST_DIR/app-icon-192.png" | sha256sum -c -
echo "$ICON_512_SHA  $DIST_DIR/app-icon-512.png" | sha256sum -c -
echo "$ICON_MASKABLE_SHA  $DIST_DIR/app-icon-512-maskable.png" | sha256sum -c -
echo "$ICON_512_SHA  $DIST_DIR/ui/letmefly-official-logo-512.png" | sha256sum -c -

node --check "$DIST_DIR/ui/home-reference-v3.js"
for f in \
  "$DIST_DIR/ui/home-reference-v3.css" \
  "$DIST_DIR/ui/home-reference-v3-mobile-polish.css" \
  "$DIST_DIR/ui/home-reference-v3-route-guard.css" \
  "$DIST_DIR/app-icon-v4.svg" \
  "$DIST_DIR/app-icon-official-v6.svg" \
  "$DIST_DIR/app-icon-official-maskable-v6.svg" \
  "$DIST_DIR/app-icon-192.png" \
  "$DIST_DIR/app-icon-512.png" \
  "$DIST_DIR/app-icon-512-maskable.png" \
  "$DIST_DIR/ui/letmefly-official-logo-512.png"; do
  test -s "$f"
done

grep -Fq '/ui/home-reference-v3.css?v=4' "$INDEX"
grep -Fq '/ui/home-reference-v3-mobile-polish.css?v=2' "$INDEX"
grep -Fq '/ui/home-reference-v3-route-guard.css?v=4' "$INDEX"
grep -Fq '/ui/home-reference-v3.js?v=4' "$INDEX"
grep -Fq '/manifest.webmanifest?v=brand-v8' "$INDEX"
grep -Fq '/app-icon-v4.svg?v=8' "$INDEX"
grep -Fq '/app-icon-192.png?v=8' "$INDEX"
grep -Fq 'app-icon-192.png?v=8' "$MANIFEST"
grep -Fq 'app-icon-512.png?v=8' "$MANIFEST"
grep -Fq 'app-icon-512-maskable.png?v=8' "$MANIFEST"
grep -Fq '"sizes": "192x192"' "$MANIFEST"
grep -Fq '"sizes": "512x512"' "$MANIFEST"
grep -Fq '"purpose": "maskable"' "$MANIFEST"
! grep -Fq 'letmefly-app-icon-192-v2.png' "$MANIFEST"
! grep -Fq 'letmefly-app-icon-512-v2.png' "$MANIFEST"
! grep -Fq 'letmefly-app-icon-512-maskable-v2.png' "$MANIFEST"
grep -Fq 'letmefly-shell-v5-4-command-v2-11-brand-v8-home-v4' "$SW"
grep -Fq '/manifest.webmanifest?v=brand-v8' "$SW"
grep -Fq '/app-icon-192.png?v=8' "$SW"
grep -Fq '/app-icon-512-maskable.png?v=8' "$SW"
! grep -Rq 'letmefly-app-icon-192-v2.png\|letmefly-app-icon-512-v2.png\|letmefly-app-icon-512-maskable-v2.png' "$DIST_DIR"

echo "LetMeFly structural Home v4 + verified authoritative logo derivatives brand v8: PASS"
