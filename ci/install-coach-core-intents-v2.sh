#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
SRC="$ROOT_DIR/overlays/ui-command-v2/batch-au/coach-core-intents-v2.js"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"
for f in "$SRC" "$INDEX" "$SW"; do test -s "$f" || { echo "Missing Coach intent dependency: $f" >&2; exit 1; }; done
node --check "$SRC"
! grep -Eq 'localStorage\.setItem|indexedDB\.deleteDatabase|\.put\(|\.add\(|\.delete\(' "$SRC"
grep -Fq 'Progress check' "$SRC"
grep -Fq 'Training-max decision' "$SRC"
grep -Fq 'Readiness check' "$SRC"
grep -Fq 'Short-on-time decision' "$SRC"
grep -Fq 'Equipment decision' "$SRC"
mkdir -p "$DIST/ui"
cp "$SRC" "$DIST/ui/coach-core-intents-v2.js"
INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['INDEX']); text=p.read_text()
text=re.sub(r'\s*<script defer src="/ui/coach-core-intents-v2\.js(?:\?v=\d+)?"></script>\s*','\n',text)
text=re.sub(r'</body>','  <script defer src="/ui/coach-core-intents-v2.js?v=1"></script>\n</body>',text,count=1,flags=re.I)
p.write_text(text.rstrip()+'\n')
PY
SW="$SW" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['SW']); text=p.read_text()
m=re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]",text)
if not m: raise SystemExit('service-worker.js PRECACHE declaration not found')
existing=re.findall(r"['\"]([^'\"]+)['\"]",m.group(1)); required=['/ui/coach-core-intents-v2.js','/ui/coach-core-intents-v2.js?v=1']
assets=[]
for value in [*existing,*required]:
  if value not in assets: assets.append(value)
replacement='const PRECACHE = ['+', '.join(repr(v) for v in assets)+']'
text=text[:m.start()]+replacement+text[m.end():]
p.write_text(text.rstrip()+'\n')
PY
grep -Fq '/ui/coach-core-intents-v2.js?v=1' "$INDEX"
grep -Fq "'/ui/coach-core-intents-v2.js'" "$SW"
node --check "$DIST/ui/coach-core-intents-v2.js"
echo 'LetMeFly expanded governed Coach intents v2: PASS'