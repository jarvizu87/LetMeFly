#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
PROGRESS_JS="$DIST_DIR/ui/progress-dashboard-v1.js"
INDEX_HTML="$DIST_DIR/index.html"

if [[ ! -f "$PROGRESS_JS" || ! -f "$INDEX_HTML" ]]; then
  echo "LetMeFly Progress production assets are missing. Run install-progress-dashboard-v1.sh first." >&2
  exit 1
fi

# Progress tabs used to rebuild the entire dashboard on every click. Because the
# Conditioning panel can be much shorter/taller than the previously selected
# panel, replacing the header + tab rail + body let the browser clamp/recalculate
# page scroll and produced a visible jump. Keep the shell mounted and replace only
# the tabpanel. Preserve the current vertical position while the replacement panel
# and additive analytics settle so a temporary height reduction cannot clamp the
# browser scroll position. This is presentation-only and never writes athlete or
# program data.
PROGRESS_JS="$PROGRESS_JS" python3 - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['PROGRESS_JS'])
text = p.read_text()

old_handler = "el.querySelectorAll('[data-pg-tab]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.pgTab;if(!TABS.includes(next)||next===activeTab)return;activeTab=next;writeSetting(TAB_KEY,next);queueRender(true)}))"
new_handler = "el.querySelectorAll('[data-pg-tab]').forEach(button=>button.addEventListener('click',()=>switchTabInPlace(el,root,button.dataset.pgTab,vault,rows)))"
if text.count(old_handler) != 1:
    raise SystemExit(f'Progress scroll-safety tab handler expected one production block, found {text.count(old_handler)}')

old_api = "window.__LMF_PROGRESS_DASHBOARD__={version:2,source:vault.source,refresh:()=>queueRender(true),getTab:()=>activeTab,setTab:next=>{if(TABS.includes(next)){activeTab=next;writeSetting(TAB_KEY,next);queueRender(false)}}}"
new_api = "window.__LMF_PROGRESS_DASHBOARD__={version:3,source:vault.source,refresh:()=>queueRender(true),getTab:()=>activeTab,setTab:next=>switchTabInPlace(el,root,next,vault,rows)}"
if text.count(old_api) != 1:
    raise SystemExit(f'Progress scroll-safety API block expected one production block, found {text.count(old_api)}')

marker = "  async function render(force=false) {"
helper = """  function switchTabInPlace(el,root,next,vault,rows) {\n    if(!TABS.includes(next)||next===activeTab)return\n    const savedScrollY=window.scrollY\n    activeTab=next;writeSetting(TAB_KEY,next)\n    el.querySelectorAll('[data-pg-tab]').forEach(button=>button.setAttribute('aria-selected',button.dataset.pgTab===next?'true':'false'))\n    const panel=el.querySelector('.lmf-pg-tabbody')\n    if(!panel)return\n    const previousMinHeight=panel.style.minHeight\n    const previousHeight=Math.ceil(panel.getBoundingClientRect().height)\n    if(previousHeight>0)panel.style.minHeight=`${previousHeight}px`\n    panel.dataset.pgPanel=next\n    panel.innerHTML=next==='overview'?overview(vault,rows):next==='strength'?strengthView(rows):next==='body'?bodyView(vault):next==='conditioning'?conditioningView(vault):prView(vault.events)\n    el.querySelector('[data-pg-manage-tms]')?.addEventListener('click',()=>openNativeTools(root))\n    window.__LMF_PROGRESS_POLISH__?.refresh?.()\n    window.__LMF_PROGRESS_FINALIZE__?.refresh?.()\n    const restoreScroll=()=>{if(Math.abs(window.scrollY-savedScrollY)>1)window.scrollTo(0,savedScrollY)}\n    requestAnimationFrame(restoreScroll)\n    window.setTimeout(restoreScroll,90)\n    window.setTimeout(()=>{panel.style.minHeight=previousMinHeight;restoreScroll()},260)\n    window.setTimeout(restoreScroll,360)\n  }\n\n"""
if marker not in text:
    raise SystemExit('Progress scroll-safety render marker missing')
if 'function switchTabInPlace(' in text:
    raise SystemExit('Progress scroll-safety helper already present unexpectedly')

text = text.replace(marker, helper + marker, 1)
text = text.replace(old_handler, new_handler, 1)
text = text.replace(old_api, new_api, 1)
p.write_text(text)
PY

# Bust the base Progress runtime URL so installed/PWA clients do not keep the
# pre-fix v8 script after deployment. The mount guard is unchanged.
INDEX_HTML="$INDEX_HTML" python3 - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ['INDEX_HTML'])
text = p.read_text()
text, count = re.subn(r'/ui/progress-dashboard-v1\.js\?v=8', '/ui/progress-dashboard-v1.js?v=9', text)
if count != 1:
    raise SystemExit(f'Progress scroll-safety cache-bust expected one v8 base script, found {count}')
p.write_text(text)
PY

node --check "$PROGRESS_JS"
grep -Fq 'function switchTabInPlace(el,root,next,vault,rows)' "$PROGRESS_JS"
grep -Fq "button.addEventListener('click',()=>switchTabInPlace(el,root,button.dataset.pgTab,vault,rows))" "$PROGRESS_JS"
grep -Fq 'setTab:next=>switchTabInPlace(el,root,next,vault,rows)' "$PROGRESS_JS"
grep -Fq 'version:3,source:vault.source' "$PROGRESS_JS"
grep -Fq 'const savedScrollY=window.scrollY' "$PROGRESS_JS"
grep -Fq 'panel.style.minHeight=`${previousHeight}px`' "$PROGRESS_JS"
grep -Fq 'window.__LMF_PROGRESS_FINALIZE__?.refresh?.()' "$PROGRESS_JS"
grep -Fq 'window.setTimeout(restoreScroll,360)' "$PROGRESS_JS"
! grep -Fq "activeTab=next;writeSetting(TAB_KEY,next);queueRender(true)" "$PROGRESS_JS"
grep -Fq '/ui/progress-dashboard-v1.js?v=9' "$INDEX_HTML"

echo "LetMeFly Progress tab scroll safety v1: PASS"
