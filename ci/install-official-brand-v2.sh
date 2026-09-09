#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
RUNTIME_TRANSPORT_DIR="$ROOT_DIR/branding/source/runtime-master-v2"
MATERIALIZER="$ROOT_DIR/ci/materialize-official-brand-v2.py"
RUNTIME_SHA="e130ad7f388f9caab28d43a2fef731f9719275b79b527684b0fed9d43cb54e7b"

for f in "$DIST_DIR/index.html" "$DIST_DIR/manifest.webmanifest" "$DIST_DIR/service-worker.js" "$MATERIALIZER"; do
  test -s "$f" || { echo "Missing required brand/install input: $f" >&2; exit 1; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
RUNTIME_MASTER="$TMP/approved-runtime-master.webp"
PARTS=("$RUNTIME_TRANSPORT_DIR"/letmefly-logo-runtime-master-512-lossless-icc.webp.b64.*)
[[ ${#PARTS[@]} -eq 7 && -e "${PARTS[0]}" ]] || { echo "Official runtime-master transport must contain exactly 7 chunks" >&2; exit 1; }
for part in "${PARTS[@]}"; do
  bytes="$(wc -c < "$part" | tr -d '[:space:]')"
  (( bytes % 4 == 0 )) || { echo "Runtime transport chunk is not Base64-aligned: $part ($bytes bytes)" >&2; exit 1; }
done
cat "${PARTS[@]}" | base64 --decode > "$RUNTIME_MASTER"
echo "$RUNTIME_SHA  $RUNTIME_MASTER" | sha256sum -c -

if ! python3 - <<'PY' >/dev/null 2>&1
import PIL
raise SystemExit(0 if PIL.__version__ == '12.3.0' else 1)
PY
then
  python3 -m pip install --quiet --disable-pip-version-check --user 'Pillow==12.3.0' || \
  python3 -m pip install --quiet --disable-pip-version-check --break-system-packages 'Pillow==12.3.0'
fi

OUT="$TMP/runtime"
python3 "$MATERIALIZER" "$RUNTIME_MASTER" "$OUT"
mkdir -p "$DIST_DIR/brand" "$DIST_DIR/icons" "$DIST_DIR/ui"
cp "$OUT/brand/letmefly-logo-display-512.png" "$DIST_DIR/brand/letmefly-logo-display-512.png"
cp "$OUT/icons/"*.png "$DIST_DIR/icons/"
cp "$OUT/brand/letmefly-logo-display-512.png" "$DIST_DIR/ui/letmefly-official-logo-512.png"
cp "$OUT/official-brand-v2-materialization.json" "$DIST_DIR/brand/official-brand-v2-materialization.json"

DIST_DIR="$DIST_DIR" python3 - <<'PY'
from pathlib import Path
import json, os, re
root = Path(os.environ['DIST_DIR'])
index = root / 'index.html'
manifest_path = root / 'manifest.webmanifest'
sw_path = root / 'service-worker.js'

# Compatibility wrappers keep any un-rewritten historic in-app path inside the
# approved brand family without embedding another independent logo.
(root / 'app-icon-v4.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="/brand/letmefly-logo-display-512.png?v=9"/></svg>\n''')
(root / 'app-icon-official-v6.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="/icons/app-icon-512.png?v=9"/></svg>\n''')
(root / 'app-icon-official-maskable-v6.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="/icons/app-icon-512-maskable.png?v=9"/></svg>\n''')

manifest = json.loads(manifest_path.read_text())
manifest.update({'name':'LetMeFly','short_name':'LetMeFly','background_color':'#090b10','theme_color':'#090b10'})
manifest['icons'] = [
  {'src':'/icons/app-icon-192.png?v=9','sizes':'192x192','type':'image/png','purpose':'any'},
  {'src':'/icons/app-icon-512.png?v=9','sizes':'512x512','type':'image/png','purpose':'any'},
  {'src':'/icons/app-icon-512-maskable.png?v=9','sizes':'512x512','type':'image/png','purpose':'maskable'},
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

text = index.read_text()
text = re.sub(r'<link rel="manifest" href="[^"]+"\s*/?>', '<link rel="manifest" href="/manifest.webmanifest?v=brand-v9" />', text, count=1)
if re.search(r'<link rel="icon" href="[^"]+"(?: type="[^"]+")?\s*/?>', text):
    text = re.sub(r'<link rel="icon" href="[^"]+"(?: type="[^"]+")?\s*/?>', '<link rel="icon" href="/icons/favicon-32.png?v=9" type="image/png" />', text, count=1)
else:
    text = text.replace('</head>', '  <link rel="icon" href="/icons/favicon-32.png?v=9" type="image/png" />\n</head>', 1)
text = re.sub(r'<link rel="apple-touch-icon" href="[^"]+"\s*/?>', '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=9" />', text)
if 'rel="apple-touch-icon"' not in text:
    text = text.replace('</head>', '  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=9" />\n</head>', 1)
index.write_text(text)

# Rewrite only known brand references in compiled output. Program/workout/private
# data is untouched. Legacy aliases remain as compatibility fallbacks.
replacements = {
  '/app-icon-v4.svg?v=4': '/brand/letmefly-logo-display-512.png?v=9',
  '/app-icon-v4.svg?v=6': '/brand/letmefly-logo-display-512.png?v=9',
  '/app-icon-v4.svg?v=8': '/brand/letmefly-logo-display-512.png?v=9',
  '/app-icon-official-v6.svg?v=6': '/icons/app-icon-512.png?v=9',
  '/app-icon-official-v6.svg?v=8': '/icons/app-icon-512.png?v=9',
  '/ui/letmefly-official-logo-512.png?v=6': '/brand/letmefly-logo-display-512.png?v=9',
  '/ui/letmefly-official-logo-512.png?v=8': '/brand/letmefly-logo-display-512.png?v=9',
}
legacy_cloudinary = [
  (re.compile(r'https://res\.cloudinary\.com/extor5az/image/upload/[^\s"\'<>)]*letmefly/app-brand/letmefly-app-icon-192-v2\.png'), '/icons/app-icon-192.png?v=9'),
  (re.compile(r'https://res\.cloudinary\.com/extor5az/image/upload/[^\s"\'<>)]*letmefly/app-brand/letmefly-app-icon-512-maskable-v2\.png'), '/icons/app-icon-512-maskable.png?v=9'),
  (re.compile(r'https://res\.cloudinary\.com/extor5az/image/upload/[^\s"\'<>)]*letmefly/app-brand/letmefly-app-icon-512-v2\.png'), '/icons/app-icon-512.png?v=9'),
]
for path in [index, *root.joinpath('assets').rglob('*')]:
    if not path.is_file() or path.suffix not in {'.js','.css','.html'}: continue
    data = path.read_text(errors='ignore'); original = data
    for old,new in replacements.items(): data = data.replace(old,new)
    for pattern,new in legacy_cloudinary: data = pattern.sub(new,data)
    if data != original: path.write_text(data)

sw = sw_path.read_text()
sw = re.sub(r"const CACHE_NAME = '[^']+'", "const CACHE_NAME = 'letmefly-shell-v5-4-command-v2-12-brand-v9-home-v4'", sw, count=1)
m = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", sw)
if not m: raise SystemExit('service-worker PRECACHE declaration missing')
existing = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))
def stale(a):
    return (a.startswith('/manifest.webmanifest?v=brand-v') or a.startswith('/app-icon-v4.svg?v=') or
            a.startswith('/app-icon-official-v6.svg?v=') or a.startswith('/app-icon-official-maskable-v6.svg?v=') or
            a.startswith('/app-icon-192.png?v=') or a.startswith('/app-icon-512.png?v=') or
            a.startswith('/app-icon-512-maskable.png?v=') or a.startswith('/ui/letmefly-official-logo-512.png?v=') or
            a.startswith('/brand/letmefly-logo-display-512.png?v=') or a.startswith('/icons/app-icon-') or
            a.startswith('/icons/favicon-32.png?v=') or a.startswith('/icons/apple-touch-icon.png?v='))
preserved=[a for a in existing if not stale(a)]
required=['/','/manifest.webmanifest?v=brand-v9','/brand/letmefly-logo-display-512.png?v=9',
          '/icons/app-icon-192.png?v=9','/icons/app-icon-512.png?v=9','/icons/app-icon-512-maskable.png?v=9',
          '/icons/favicon-32.png?v=9','/icons/apple-touch-icon.png?v=9']
merged=[]
for a in preserved+required:
    if a not in merged: merged.append(a)
new='const PRECACHE = [' + ', '.join(repr(a) for a in merged) + ']'
sw=sw[:m.start()] + new + sw[m.end():]
sw_path.write_text(sw)
PY

grep -Fq '/manifest.webmanifest?v=brand-v9' "$DIST_DIR/index.html"
grep -Fq '/icons/favicon-32.png?v=9' "$DIST_DIR/index.html"
grep -Fq '/icons/apple-touch-icon.png?v=9' "$DIST_DIR/index.html"
grep -Fq '/icons/app-icon-512-maskable.png?v=9' "$DIST_DIR/manifest.webmanifest"
grep -Fq 'letmefly-shell-v5-4-command-v2-12-brand-v9-home-v4' "$DIST_DIR/service-worker.js"
! grep -Rqs 'letmefly/app-brand/letmefly-app-icon-.*-v2.png' "$DIST_DIR"

echo "LetMeFly official brand v2 final production layer: PASS"
