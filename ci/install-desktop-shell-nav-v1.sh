#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aw/desktop-shell-nav-v1.css"
OUT="$DIST/ui/desktop-shell-nav-v1.css"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

for required in "$SRC" "$INDEX" "$SW"; do
  test -s "$required" || { echo "Missing desktop shell navigation dependency: $required" >&2; exit 1; }
done

grep -Fq '@media (min-width: 1100px)' "$SRC"
grep -Fq 'display: flex !important' "$SRC"
grep -Fq 'width: var(--lmf-desktop-rail) !important' "$SRC"
grep -Fq 'inset: 0 auto 0 0 !important' "$SRC"
grep -Fq '.navbar .nav-item' "$SRC"
grep -Fq 'Phone/tablet navigation is intentionally untouched' "$SRC"
! grep -Fq 'data-lmf-desktop-workspace' "$SRC"

mkdir -p "$DIST/ui"
cp "$SRC" "$OUT"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['INDEX'])
text=p.read_text()
text=re.sub(r'\s*<link\b[^>]*href=["\']/ui/desktop-shell-nav-v1\.css(?:\?v=\d+)?["\'][^>]*>\s*','\n',text,flags=re.I)
if not re.search(r'</head>', text, re.I):
    raise SystemExit('index.html missing </head>')
tag='<link rel="stylesheet" href="/ui/desktop-shell-nav-v1.css?v=1">'
text=re.sub(r'</head>',f'  {tag}\n</head>',text,count=1,flags=re.I)
p.write_text(text.rstrip()+'\n')
PY

SW="$SW" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['SW'])
text=p.read_text()
match=re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]",text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing=re.findall(r"['\"]([^'\"]+)['\"]",match.group(1))
required=['/ui/desktop-shell-nav-v1.css','/ui/desktop-shell-nav-v1.css?v=1']
assets=[]
for value in [*existing,*required]:
    if value not in assets:
        assets.append(value)
replacement='const PRECACHE = ['+', '.join(repr(value) for value in assets)+']'
text=text[:match.start()]+replacement+text[match.end():]
cache=re.search(r"const\s+CACHE_NAME\s*=\s*['\"]([^'\"]+)['\"]",text)
if not cache:
    raise SystemExit('service-worker.js CACHE_NAME declaration not found')
name=re.sub(r'-desktop-shell-nav-v1$','',cache.group(1))+'-desktop-shell-nav-v1'
text=text[:cache.start(1)]+name+text[cache.end(1):]
p.write_text(text.rstrip()+'\n')
PY

test -s "$OUT"
grep -Fq '/ui/desktop-shell-nav-v1.css?v=1' "$INDEX"
test "$(grep -o '/ui/desktop-shell-nav-v1.css?v=1' "$INDEX" | wc -l)" = "1"
grep -Fq "'/ui/desktop-shell-nav-v1.css'" "$SW"
grep -Fq "'/ui/desktop-shell-nav-v1.css?v=1'" "$SW"
grep -Fq 'desktop-shell-nav-v1' "$SW"

echo 'LetMeFly corrective desktop shell navigation install: PASS'
