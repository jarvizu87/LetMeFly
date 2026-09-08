#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v1.js"
JS_V3_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v3-polish.js"
JS_GUARD_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-mount-guard.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v1.css"
CSS_V2_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v2.css"
CSS_V3_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v3.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$JS_V3_SOURCE"
test -s "$JS_GUARD_SOURCE"
test -s "$CSS_SOURCE"
test -s "$CSS_V2_SOURCE"
test -s "$CSS_V3_SOURCE"
node --check "$JS_SOURCE"
node --check "$JS_V3_SOURCE"
node --check "$JS_GUARD_SOURCE"

grep -Fq 'PROGRESS DASHBOARD' "$JS_SOURCE"
grep -Fq "['overview', 'strength', 'body', 'conditioning', 'prs']" "$JS_SOURCE"
grep -Fq 'COACH INSIGHT' "$JS_SOURCE"
grep -Fq 'NEXT MILESTONE' "$JS_SOURCE"
grep -Fq 'letmefly_private_strength_maxes_v1' "$JS_SOURCE"
grep -Fq "const DB_NAME = 'letmefly-private'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'trainingMaxHistory'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'workoutSessions'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'bodyweightEntries'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'readinessEntries'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'personalRecords'" "$JS_SOURCE"
grep -Fq 'MANAGE TRAINING MAXES' "$JS_SOURCE"
grep -Fq '__LMF_PROGRESS_DASHBOARD__' "$JS_SOURCE"
grep -Fq '__LMF_PROGRESS_POLISH__' "$JS_V3_SOURCE"
grep -Fq 'strengthPoints(data)' "$JS_V3_SOURCE"
grep -Fq 'conditioningData(data)' "$JS_V3_SOURCE"
grep -Fq 'Keep programming unchanged' "$JS_V3_SOURCE"
grep -Fq 'data-lmf-progress-anchor' "$JS_GUARD_SOURCE"
grep -Fq 'progressRouteActive' "$JS_GUARD_SOURCE"
grep -Fq 'window.__LMF_PROGRESS_DASHBOARD__ || document.getElementById(DASHBOARD_ID)' "$JS_GUARD_SOURCE"
grep -Fq '.lmf-progress-dashboard' "$CSS_SOURCE"
grep -Fq '.lmf-pg-lift-card' "$CSS_SOURCE"
grep -Fq '.lmf-pg-native-tools' "$CSS_V2_SOURCE"
grep -Fq '.lmf-pg-readiness-grid' "$CSS_V2_SOURCE"
grep -Fq '.lmf-pg-conditioning-metrics' "$CSS_V3_SOURCE"
grep -Fq '@media(max-width:390px)' "$CSS_V3_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/progress-dashboard-v1.js"
cp "$JS_V3_SOURCE" "$DIST_DIR/ui/progress-dashboard-v3-polish.js"
cp "$JS_GUARD_SOURCE" "$DIST_DIR/ui/progress-dashboard-mount-guard.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/progress-dashboard-v1.css"
cp "$CSS_V2_SOURCE" "$DIST_DIR/ui/progress-dashboard-v2.css"
cp "$CSS_V3_SOURCE" "$DIST_DIR/ui/progress-dashboard-v3.css"

# The base Progress observer sees many legitimate DOM mutations from strength,
# PWA, and other presentation overlays. Its historical debounce cleared and
# restarted the same 160 ms render timer on every mutation, which could starve
# the first Progress mount indefinitely on a busy/fresh mobile route. Preserve
# the same render behavior but let an already-scheduled non-forced render fire.
#
# Tab changes are explicit athlete interactions, not background scans. Force
# those renders through the short path so a PWA/install or other route mutation
# cannot leave the newly tapped tab showing the previously selected panel.
#
# The rebuilt production shell no longer guarantees that the visible PROGRESS
# label is an h1/h2/h3 or that #progress-content exists. Make the base dashboard
# route-aware itself, and give the base runtime its own deterministic route
# pulse. This removes the remaining timing dependency on a heading mutation or
# on the secondary mount guard winning a race with the SPA route renderer.
PROGRESS_JS="$DIST_DIR/ui/progress-dashboard-v1.js" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['PROGRESS_JS'])
text = p.read_text()
old_queue = "function queueRender(force=false){if(force)vaultCache.at=0;clearTimeout(timer);timer=setTimeout(()=>void render(force),force?30:160)}"
new_queue = "function queueRender(force=false){if(force)vaultCache.at=0;if(timer&&!force)return;clearTimeout(timer);timer=setTimeout(()=>{timer=0;void render(force)},force?30:160)}"
if text.count(old_queue) != 1:
    raise SystemExit(f'Progress queueRender starvation patch expected one source block, found {text.count(old_queue)}')
text = text.replace(old_queue, new_queue, 1)

old_tab = "el.querySelectorAll('[data-pg-tab]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.pgTab;if(!TABS.includes(next)||next===activeTab)return;activeTab=next;writeSetting(TAB_KEY,next);queueRender(false)}))"
new_tab = "el.querySelectorAll('[data-pg-tab]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.pgTab;if(!TABS.includes(next)||next===activeTab)return;activeTab=next;writeSetting(TAB_KEY,next);queueRender(true)}))"
if text.count(old_tab) != 1:
    raise SystemExit(f'Progress explicit-tab render patch expected one source block, found {text.count(old_tab)}')
text = text.replace(old_tab, new_tab, 1)

old_heading = "function progressHeading() { return [...document.querySelectorAll('h1,h2,h3')].find(el => /^progress$/i.test((el.textContent||'').trim()) && isVisible(el)) || null }"
new_heading = "function progressHeading() { const visibleHeading=[...document.querySelectorAll('h1,h2,h3')].find(el => /^progress$/i.test((el.textContent||'').trim()) && isVisible(el)); if(visibleHeading)return visibleHeading; let anchor=document.querySelector('[data-lmf-progress-anchor=\"true\"]'); if(anchor?.isConnected)return anchor; if(!/^#\\/progress(?:[/?#]|$)/i.test(location.hash||''))return null; const root=[document.querySelector('main'),document.querySelector('[role=\"main\"]'),document.querySelector('#app'),document.body].find(el=>el&&isVisible(el)); if(!root)return null; anchor=document.createElement('h2'); anchor.setAttribute('data-lmf-progress-anchor','true'); anchor.setAttribute('aria-hidden','true'); anchor.textContent='PROGRESS'; Object.assign(anchor.style,{position:'absolute',width:'1px',height:'1px',padding:'0',margin:'0',overflow:'hidden',clipPath:'inset(50%)',whiteSpace:'nowrap',pointerEvents:'none'}); root.insertAdjacentElement('afterbegin',anchor); return anchor }"
if text.count(old_heading) != 1:
    raise SystemExit(f'Progress route-aware mount patch expected one source block, found {text.count(old_heading)}')
text = text.replace(old_heading, new_heading, 1)

old_boot = "  function boot(){\n    queueScan()"
new_boot = "  function boot(){\n    window.__LMF_PROGRESS_BOOT__={version:1,refresh:()=>queueRender(true),scan:()=>queueScan()}\n    const routePulse=()=>{queueRender(true);window.setTimeout(()=>queueRender(true),180);window.setTimeout(()=>queueRender(true),650)}\n    window.addEventListener('hashchange',routePulse)\n    window.addEventListener('popstate',routePulse)\n    queueScan()"
if text.count(old_boot) != 1:
    raise SystemExit(f'Progress deterministic route boot patch expected one source block, found {text.count(old_boot)}')
text = text.replace(old_boot, new_boot, 1)
p.write_text(text)
PY

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
# Always replace older Progress runtime/guard tags so both CI and installed PWAs
# receive the deterministic route-boot runtime rather than an unversioned cache.
text = re.sub(r'\s*<script defer src="/ui/progress-dashboard-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/progress-dashboard-mount-guard\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
css1 = '<link rel="stylesheet" href="/ui/progress-dashboard-v1.css">'
css2 = '<link rel="stylesheet" href="/ui/progress-dashboard-v2.css">'
css3 = '<link rel="stylesheet" href="/ui/progress-dashboard-v3.css">'
js1 = '<script defer src="/ui/progress-dashboard-v1.js?v=6"></script>'
js3 = '<script defer src="/ui/progress-dashboard-v3-polish.js"></script>'
jsg = '<script defer src="/ui/progress-dashboard-mount-guard.js?v=6"></script>'
for css in (css1, css2, css3):
    if css not in text:
        if '</head>' not in text:
            raise SystemExit('index.html is missing </head>')
        text = text.replace('</head>', f'  {css}\n</head>', 1)
for js in (js1, js3, jsg):
    if js not in text:
        if '</body>' not in text:
            raise SystemExit('index.html is missing </body>')
        text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one HTML document')
p.write_text(text)
PY

node --check "$DIST_DIR/ui/progress-dashboard-v1.js"
node --check "$DIST_DIR/ui/progress-dashboard-v3-polish.js"
node --check "$DIST_DIR/ui/progress-dashboard-mount-guard.js"
test -s "$DIST_DIR/ui/progress-dashboard-v1.css"
test -s "$DIST_DIR/ui/progress-dashboard-v2.css"
test -s "$DIST_DIR/ui/progress-dashboard-v3.css"
grep -Fq '/ui/progress-dashboard-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v2.css' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v3.css' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v1.js?v=6' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v3-polish.js' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-mount-guard.js?v=6' "$DIST_DIR/index.html"
grep -Fq 'PROGRESS DASHBOARD' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq 'Private vault data' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq 'never rewrite programming' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq 'if(timer&&!force)return' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq 'activeTab=next;writeSetting(TAB_KEY,next);queueRender(true)' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq "document.querySelector('[data-lmf-progress-anchor=\"true\"]')" "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq "location.hash||''" "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq '__LMF_PROGRESS_BOOT__' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq "window.addEventListener('hashchange',routePulse)" "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq 'progressRouteActive' "$DIST_DIR/ui/progress-dashboard-mount-guard.js"
grep -Fq '__LMF_PROGRESS_POLISH__' "$DIST_DIR/ui/progress-dashboard-v3-polish.js"
grep -Fq 'data-lmf-progress-anchor' "$DIST_DIR/ui/progress-dashboard-mount-guard.js"
grep -Fq 'window.__LMF_PROGRESS_DASHBOARD__ || document.getElementById(DASHBOARD_ID)' "$DIST_DIR/ui/progress-dashboard-mount-guard.js"

echo "LetMeFly Progress dashboard v3 polish + authoritative private-vault performance UI + deterministic route-boot runtime/tab guard: PASS"
