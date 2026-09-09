#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ah/home-dashboard-polish-v1.css"
CSS_OUT="$DIST/ui/home-dashboard-polish-v1.css"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

for required in "$CSS_SRC" "$INDEX" "$SW"; do
  test -s "$required" || { echo "Missing Home polish dependency: $required" >&2; exit 1; }
done

grep -Fq 'grid-column:1 / -1!important' "$CSS_SRC"
grep -Fq "grid-template-areas:" "$CSS_SRC"
grep -Fq "'readiness'" "$CSS_SRC"
grep -Fq 'grid-template-columns:repeat(2,minmax(0,1fr))!important' "$CSS_SRC"
grep -Fq '.lmf-home-v4-performance' "$CSS_SRC"
grep -Fq '.lmf-home-v4-coach' "$CSS_SRC"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$CSS_OUT"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/home-dashboard-polish-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
marker = '<link rel="stylesheet" href="/ui/home-dashboard-polish-v1.css?v=1">'
anchor = '<link rel="stylesheet" href="/ui/home-reference-v3-route-guard.css?v=4">'
if anchor in text:
    text = text.replace(anchor, anchor + '\n  ' + marker, 1)
elif '</head>' in text:
    text = text.replace('</head>', f'  {marker}\n</head>', 1)
else:
    raise SystemExit('production index missing </head>')
p.write_text(text)
PY

SW="$SW" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = ['/ui/home-dashboard-polish-v1.css']
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

test -s "$CSS_OUT"
grep -Fq '/ui/home-dashboard-polish-v1.css?v=1' "$INDEX"
grep -Fq "'/ui/home-dashboard-polish-v1.css'" "$SW"
grep -Fq 'grid-column:1 / -1!important' "$CSS_OUT"
grep -Fq 'grid-template-columns:repeat(2,minmax(0,1fr))!important' "$CSS_OUT"

echo "LetMeFly Home dashboard polish v1: PASS"
