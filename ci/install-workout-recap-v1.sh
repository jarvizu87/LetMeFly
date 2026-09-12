#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
node --test "$ROOT_DIR/ci/audit-workout-recap.mjs"
mkdir -p "$DIST_DIR/ui/workout-recap-v1"
cp "$ROOT_DIR"/overlays/workout-recap-v1/* "$DIST_DIR/ui/workout-recap-v1/"

# Keep the tracked overlay immutable during reconstruction. Apply the release
# completion-await behavior only to the generated dist copy after installation.
RECAP_UI="$DIST_DIR/ui/workout-recap-v1/workout-recap-ui.mjs"
RECAP_UI="$RECAP_UI" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['RECAP_UI']);s=p.read_text()
old="""    dialog.addEventListener('click',e=>{
      const button=e.target.closest('button,a')
      if (button?.hasAttribute('data-recap-history')) pendingHistorySession=sessionId
      if (button?.matches('[data-recap-close],[data-recap-history]')) close()
      if (button?.hasAttribute('data-recap-correct')) { const set=button.dataset.recapCorrect;close();bridge()?.reviewSet(set) }
      if (button?.hasAttribute('data-recap-finish')) {close();bridge()?.finish(sessionId)}
    })"""
new="""    dialog.addEventListener('click',async e=>{
      const button=e.target.closest('button,a')
      if (button?.hasAttribute('data-recap-history')) pendingHistorySession=sessionId
      if (button?.matches('[data-recap-close],[data-recap-history]')) close()
      if (button?.hasAttribute('data-recap-correct')) { const set=button.dataset.recapCorrect;close();bridge()?.reviewSet(set) }
      if (button?.hasAttribute('data-recap-finish')) {
        const finishingDialog=dialog
        button.disabled=true
        try { await bridge()?.finish(sessionId) }
        finally {
          if (dialog===finishingDialog && finishingDialog) {
            finishingDialog.close()
            finishingDialog.remove()
            dialog=null
            returnFocus?.focus?.()
          }
          if (button.isConnected) button.disabled=false
        }
      }
    })"""
if s.count(old)!=1: raise SystemExit(f'Expected one installed recap finish listener, found {s.count(old)}')
p.write_text(s.replace(old,new,1))
PY

node --check "$RECAP_UI"
grep -Fq "dialog.addEventListener('click',async e=>" "$RECAP_UI"
grep -Fq 'try { await bridge()?.finish(sessionId) }' "$RECAP_UI"
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
