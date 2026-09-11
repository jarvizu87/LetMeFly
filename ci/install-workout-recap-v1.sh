#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
node --test "$ROOT_DIR/ci/audit-workout-recap.mjs"
mkdir -p "$DIST_DIR/ui/workout-recap-v1"
cp "$ROOT_DIR"/overlays/workout-recap-v1/* "$DIST_DIR/ui/workout-recap-v1/"
node --check "$DIST_DIR/ui/workout-recap-v1/workout-recap-ui.mjs"
DIST_DIR="$DIST_DIR" python3 - <<'PY'
import os,re
from pathlib import Path
d=Path(os.environ['DIST_DIR']);p=d/'index.html';s=p.read_text()
for tag,anchor in [('<link rel="stylesheet" href="/ui/workout-recap-v1/workout-recap.css">','</head>'),('<script type="module" src="/ui/workout-recap-v1/workout-recap-ui.mjs"></script>','</body>')]:
    if tag not in s:s=s.replace(anchor,tag+'\n'+anchor,1)
p.write_text(s)
p=d/'service-worker.js';s=p.read_text();m=re.search(r'const\s+PRECACHE\s*=\s*\[([^\]]*)\]',s);assert m
assets=re.findall(r"['\"]([^'\"]+)['\"]",m.group(1))+['/ui/workout-recap-v1/'+f for f in ['workout-recap.mjs','workout-recap-ui.mjs','workout-recap.css']]
s=s[:m.start()]+'const PRECACHE = ['+', '.join(repr(a) for a in dict.fromkeys(assets))+']'+s[m.end():];p.write_text(s)
PY
