#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aq/locked-art-fidelity-v1.css"
ART_SRC="$ROOT_DIR/overlays/ui-command-v2/static/raizen-black-crown-ascension-v1.jpg"
CSS_OUT="$DIST_DIR/ui/locked-art-fidelity-v1.css"
ART_OUT="$DIST_DIR/ui/raizen-black-crown-ascension-v1.jpg"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"

for required in "$CSS_SRC" "$ART_SRC" "$INDEX" "$SW"; do
  test -s "$required" || { echo "Missing locked-art dependency: $required" >&2; exit 1; }
done

# Presentation/art only. No state, network, exercise-art replacement, or program logic.
! grep -Eq 'localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setItem\(|workoutSessions|trainingMaxHistory|programInstances' "$CSS_SRC"
! grep -Eqi 'exercise[^}]*background-image|library-thumb[^}]*url\(' "$CSS_SRC"
grep -Fq -- "--lmf-raizen-fenrir-art:url('/ui/raizen-black-crown-ascension-v1.jpg')" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='progress'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='exercises'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='coach'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='profile'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='more'" "$CSS_SRC"

mkdir -p "$DIST_DIR/ui"
cp "$CSS_SRC" "$CSS_OUT"
cp "$ART_SRC" "$ART_OUT"
cmp -s "$ART_SRC" "$ART_OUT"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['INDEX'])
text=p.read_text()
text=re.sub(r'\s*<link rel="stylesheet" href="/ui/locked-art-fidelity-v1\.css(?:\?v=\d+)?">\s*','\n',text)
tag='<link rel="stylesheet" href="/ui/locked-art-fidelity-v1.css?v=2">'
if not re.search(r'</head>',text,re.I): raise SystemExit('index.html missing </head>')
text=re.sub(r'</head>',f'  {tag}\n</head>',text,count=1,flags=re.I)
# This must be the final visual fidelity layer after color harmonization.
if '/ui/color-harmonization-v1.css' in text and text.index('/ui/color-harmonization-v1.css') > text.index('/ui/locked-art-fidelity-v1.css'):
    raise SystemExit('locked-art-fidelity-v1.css must load after color-harmonization-v1.css')
p.write_text(text.rstrip()+'\n')
PY

SW="$SW" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['SW'])
text=p.read_text()
match=re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]",text)
if not match: raise SystemExit('service-worker.js PRECACHE declaration not found')
existing=re.findall(r"['\"]([^'\"]+)['\"]",match.group(1))
required=['/ui/locked-art-fidelity-v1.css','/ui/raizen-black-crown-ascension-v1.jpg']
assets=[]
for value in [*existing,*required]:
    if value not in assets: assets.append(value)
replacement='const PRECACHE = ['+', '.join(repr(v) for v in assets)+']'
text=text[:match.start()]+replacement+text[match.end():]
p.write_text(text.rstrip()+'\n')
PY

grep -Fq '/ui/locked-art-fidelity-v1.css?v=2' "$INDEX"
grep -Fq "'/ui/locked-art-fidelity-v1.css'" "$SW"
grep -Fq "'/ui/raizen-black-crown-ascension-v1.jpg'" "$SW"

echo "LetMeFly locked mockup Raizen/Fenrir art fidelity: PASS"
