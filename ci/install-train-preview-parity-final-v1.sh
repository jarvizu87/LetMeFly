#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
SRC="$ROOT_DIR/overlays/ui-command-v2/batch-au/train-preview-parity-final-v1.css"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"
for f in "$SRC" "$INDEX" "$SW"; do test -s "$f" || { echo "Missing Train preview parity dependency: $f" >&2; exit 1; }; done
mkdir -p "$DIST/ui"
cp "$SRC" "$DIST/ui/train-preview-parity-final-v1.css"
INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['INDEX']); text=p.read_text()
text=re.sub(r'\s*<link rel="stylesheet" href="/ui/train-preview-parity-final-v1\.css(?:\?v=\d+)?">\s*','\n',text)
text=re.sub(r'</head>','  <link rel="stylesheet" href="/ui/train-preview-parity-final-v1.css?v=2">\n</head>',text,count=1,flags=re.I)
p.write_text(text.rstrip()+'\n')
PY
SW="$SW" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['SW']); text=p.read_text()
m=re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]",text)
if not m: raise SystemExit('service-worker.js PRECACHE declaration not found')
existing=re.findall(r"['\"]([^'\"]+)['\"]",m.group(1)); required=['/ui/train-preview-parity-final-v1.css','/ui/train-preview-parity-final-v1.css?v=2']
assets=[]
for value in [*existing,*required]:
  if value not in assets: assets.append(value)
replacement='const PRECACHE = ['+', '.join(repr(v) for v in assets)+']'
text=text[:m.start()]+replacement+text[m.end():]
p.write_text(text.rstrip()+'\n')
PY
grep -Fq '/ui/train-preview-parity-final-v1.css?v=2' "$INDEX"
grep -Fq 'Locked-mockup desktop ownership correction' "$DIST/ui/train-preview-parity-final-v1.css"
grep -Fq 'Future governed days such as Day 4' "$DIST/ui/train-preview-parity-final-v1.css"
grep -Fq 'html.lmf-preview-mode' "$DIST/ui/train-preview-parity-final-v1.css"
grep -Fq '.lmf-preview-readonly-logger' "$DIST/ui/train-preview-parity-final-v1.css"
grep -Fq "'/ui/train-preview-parity-final-v1.css'" "$SW"
echo 'LetMeFly final Train preview parity + desktop locked-mockup ownership guard: PASS'