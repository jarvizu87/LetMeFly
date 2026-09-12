#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ap/color-harmonization-v1.css"
OUT="$DIST_DIR/ui/color-harmonization-v1.css"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"

for required in "$SOURCE" "$INDEX" "$SW"; do test -s "$required"; done

# Presentation-only guard.
! grep -Eq 'localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setItem\(|workoutSessions|trainingMaxHistory|programInstances' "$SOURCE"
grep -Fq -- '--lmf-brand-red:#e31b2f' "$SOURCE"
grep -Fq -- '--lmf-energy-purple:#a855f7' "$SOURCE"
grep -Fq "data-lmf-approved-route='program'" "$SOURCE"
grep -Fq "data-lmf-approved-route='progress'" "$SOURCE"
grep -Fq "data-lmf-approved-route='exercises'" "$SOURCE"
grep -Fq "data-lmf-approved-route='coach'" "$SOURCE"
grep -Fq "data-lmf-approved-route='profile'" "$SOURCE"
grep -Fq "data-lmf-approved-route='more'" "$SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$SOURCE" "$OUT"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['INDEX'])
text=p.read_text()
tag='<link rel="stylesheet" href="/ui/color-harmonization-v1.css">'
if tag not in text:
    if not re.search(r'</head>',text,re.I): raise SystemExit('index.html missing </head>')
    text=re.sub(r'</head>','  '+tag+'\n</head>',text,count=1,flags=re.I)
p.write_text(text.rstrip()+'\n')
PY

SW="$SW" python - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['SW'])
text=p.read_text()
match=re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]",text)
if not match: raise SystemExit('service-worker.js PRECACHE declaration not found')
existing=re.findall(r"['\"]([^'\"]+)['\"]",match.group(1))
asset='/ui/color-harmonization-v1.css'
if asset not in existing: existing.append(asset)
replacement='const PRECACHE = ['+', '.join(repr(v) for v in existing)+']'
text=text[:match.start()]+replacement+text[match.end():]
p.write_text(text.rstrip()+'\n')
PY

grep -Fq '/ui/color-harmonization-v1.css' "$INDEX"
grep -Fq "'/ui/color-harmonization-v1.css'" "$SW"

echo "LetMeFly color harmonization v1: PASS"
