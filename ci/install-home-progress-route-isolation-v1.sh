#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
BASE_JS="$DIST_DIR/ui/progress-dashboard-v1.js"
GUARD_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-mount-guard.js"
GUARD_OUT="$DIST_DIR/ui/progress-dashboard-mount-guard.js"
INDEX="$DIST_DIR/index.html"

for required in "$BASE_JS" "$GUARD_SRC" "$INDEX"; do
  test -s "$required" || { echo "Missing Home/Progress route-isolation prerequisite: $required" >&2; exit 1; }
done

node --check "$GUARD_SRC"
grep -Fq 'function unmountProgressSurface()' "$GUARD_SRC"
grep -Fq 'Any explicit non-Progress hash wins over stale click intent' "$GUARD_SRC"
grep -Fq 'if (!surface) {' "$GUARD_SRC"
grep -Fq 'unmountProgressSurface()' "$GUARD_SRC"

cp "$GUARD_SRC" "$GUARD_OUT"

BASE_JS="$BASE_JS" INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os, re

base = Path(os.environ['BASE_JS'])
text = base.read_text()
old = '''function progressHeading() { const visibleHeading=[...document.querySelectorAll('h1,h2,h3')].find(el=>/^progress$/i.test((el.textContent||'').trim())&&isVisible(el)); if(visibleHeading)return visibleHeading; const visibleLabel=[...document.querySelectorAll('main *,[role="main"] *,#app *')].find(el=>/^progress$/i.test((el.textContent||'').trim())&&isVisible(el)&&!el.closest('nav,button,a,[role="button"],[role="tab"]')&&el.getBoundingClientRect().width>=24); if(visibleLabel)return visibleLabel; const native=document.querySelector('#progress-content'); const nativeVisible=Boolean(native&&(isVisible(native)||[...native.querySelectorAll(':scope > *')].some(isVisible))); const nativeMarker=[...document.querySelectorAll('.progress-score-grid,.strength-progress-card,.tm-board,.history-list')].find(isVisible); const activeNav=[...document.querySelectorAll('nav a[href],nav button,nav [role="button"]')].find(el=>isVisible(el)&&(el.classList.contains('active')||el.getAttribute('aria-current')==='page'||el.getAttribute('aria-selected')==='true')&&(/^#\\/progress(?:[/?#]|$)/i.test(el.getAttribute('href')||'')||/^progress$/i.test((el.textContent||'').trim()))); const onRoute=/^#\\/progress(?:[/?#]|$)/i.test(location.hash||'')||Boolean(activeNav); if(!nativeVisible&&!nativeMarker&&!onRoute)return null; let anchor=[...document.querySelectorAll('[data-lmf-progress-anchor="true"]')].find(el=>el?.isConnected); if(anchor)return anchor; const root=(nativeVisible?native?.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section'):null)||(nativeMarker?.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section'))||[document.querySelector('main'),document.querySelector('[role="main"]'),document.querySelector('#app'),document.body].find(el=>el&&isVisible(el)); if(!root)return null; anchor=document.createElement('h2'); anchor.setAttribute('data-lmf-progress-anchor','true'); anchor.setAttribute('aria-hidden','true'); anchor.textContent='PROGRESS'; Object.assign(anchor.style,{position:'absolute',width:'1px',height:'1px',padding:'0',margin:'0',overflow:'hidden',clipPath:'inset(50%)',whiteSpace:'nowrap',pointerEvents:'none'}); root.insertAdjacentElement('afterbegin',anchor); return anchor }'''
new = '''function progressHeading() { const activeNav=[...document.querySelectorAll('nav a[href],nav button,nav [role="button"]')].find(el=>isVisible(el)&&(el.classList.contains('active')||el.getAttribute('aria-current')==='page'||el.getAttribute('aria-selected')==='true')&&(/^#\\/progress(?:[/?#]|$)/i.test(el.getAttribute('href')||'')||/^progress$/i.test((el.textContent||'').trim()))); const onRoute=/^#\\/progress(?:[/?#]|$)/i.test(location.hash||'')||Boolean(activeNav); if(!onRoute)return null; const visibleHeading=[...document.querySelectorAll('h1,h2,h3')].find(el=>/^progress$/i.test((el.textContent||'').trim())&&isVisible(el)); if(visibleHeading)return visibleHeading; const visibleLabel=[...document.querySelectorAll('main *,[role="main"] *,#app *')].find(el=>/^progress$/i.test((el.textContent||'').trim())&&isVisible(el)&&!el.closest('nav,button,a,[role="button"],[role="tab"]')&&el.getBoundingClientRect().width>=24); if(visibleLabel)return visibleLabel; const native=document.querySelector('#progress-content'); const nativeVisible=Boolean(native&&(isVisible(native)||[...native.querySelectorAll(':scope > *')].some(isVisible))); const nativeMarker=[...document.querySelectorAll('.progress-score-grid,.strength-progress-card,.tm-board,.history-list')].find(isVisible); let anchor=[...document.querySelectorAll('[data-lmf-progress-anchor="true"]')].find(el=>el?.isConnected); if(anchor)return anchor; const root=(nativeVisible?native?.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section'):null)||(nativeMarker?.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section'))||[document.querySelector('main'),document.querySelector('[role="main"]'),document.querySelector('#app'),document.body].find(el=>el&&isVisible(el)); if(!root)return null; anchor=document.createElement('h2'); anchor.setAttribute('data-lmf-progress-anchor','true'); anchor.setAttribute('aria-hidden','true'); anchor.textContent='PROGRESS'; Object.assign(anchor.style,{position:'absolute',width:'1px',height:'1px',padding:'0',margin:'0',overflow:'hidden',clipPath:'inset(50%)',whiteSpace:'nowrap',pointerEvents:'none'}); root.insertAdjacentElement('afterbegin',anchor); return anchor }'''
if text.count(old) != 1:
    raise SystemExit(f'Expected one installed broad Progress heading function, found {text.count(old)}')
base.write_text(text.replace(old, new, 1))

index = Path(os.environ['INDEX'])
html = index.read_text()
html = re.sub(r'/ui/progress-dashboard-v1\.js\?v=\d+', '/ui/progress-dashboard-v1.js?v=9', html)
html = re.sub(r'/ui/progress-dashboard-mount-guard\.js\?v=\d+', '/ui/progress-dashboard-mount-guard.js?v=9', html)
index.write_text(html)
PY

node --check "$BASE_JS"
node --check "$GUARD_OUT"
grep -Fq 'if(!onRoute)return null' "$BASE_JS"
grep -Fq 'function unmountProgressSurface()' "$GUARD_OUT"
grep -Fq '/ui/progress-dashboard-v1.js?v=9' "$INDEX"
grep -Fq '/ui/progress-dashboard-mount-guard.js?v=9' "$INDEX"

echo "LetMeFly Home/Progress route isolation: PASS (Progress cannot mount or persist on Home)"
